// Provision dedicated Web Push signing credentials. Never print private material.
import{readFile,writeFile}from'node:fs/promises';import{createRequire}from'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));const auth=require('firebase-tools/lib/auth.js');
const backendRequire=createRequire(new URL('../functions/package.json',import.meta.url));const webPush=backendRequire('web-push');
const target=process.argv[2];if(!['preview','production'].includes(target))throw Error('Choose preview or production.');
const path=new URL(`../config/firebase-${target}.json`,import.meta.url),config=JSON.parse(await readFile(path,'utf8')),project=config.projectId;
const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Firebase administrative login is required.');
const token=(await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform'])).access_token;
async function api(url,method='GET',body){
 for(let attempt=0;;attempt++){
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();
  if(response.ok)return data;
  const propagating=response.status===403&&data.error?.details?.some(detail=>detail.reason==='SERVICE_DISABLED');
  if(attempt<8&&(propagating||method==='GET'&&[429,500,503].includes(response.status))){console.log(project,'waiting for cloud API activation');await new Promise(resolve=>setTimeout(resolve,Math.min(3000*2**attempt,20000)));continue;}
  throw Object.assign(Error(`Cloud setup failed (${response.status}): ${data.error?.message??'unknown error'}`),{status:response.status});
 }
}
const billing=await api(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`);if(!billing.billingEnabled)throw Error('The notification sender requires the Firebase Blaze plan.');
const info=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);const number=info.projectNumber;
for(const service of ['cloudfunctions.googleapis.com','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','eventarc.googleapis.com','pubsub.googleapis.com','secretmanager.googleapis.com','iam.googleapis.com']){
 const name=`projects/${number}/services/${service}`,current=await api(`https://serviceusage.googleapis.com/v1/${name}`);
 if(current.state!=='ENABLED'){
  const operation=await api(`https://serviceusage.googleapis.com/v1/${name}:enable`,'POST',{});
  for(let attempt=0;!operation.done&&attempt<60;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));Object.assign(operation,await api(`https://serviceusage.googleapis.com/v1/${operation.name}`));}
  if(operation.error)throw Error('Service activation failed: '+service);
 }
 console.log(project,service,'enabled');
}
const secret=`projects/${project}/secrets/GRATITUDE_WEB_PUSH_KEYS`;let keys;
try{const existing=await api(`https://secretmanager.googleapis.com/v1/${secret}/versions/latest:access`);keys=JSON.parse(Buffer.from(existing.payload.data,'base64').toString('utf8'));}
catch(error){if(error.status!==404)throw error;keys=webPush.generateVAPIDKeys();
 try{await api(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=GRATITUDE_WEB_PUSH_KEYS`,'POST',{replication:{automatic:{}}});}catch(error){if(error.status!==409)throw error;}
 await api(`https://secretmanager.googleapis.com/v1/${secret}:addVersion`,'POST',{payload:{data:Buffer.from(JSON.stringify(keys)).toString('base64')}});
}
if(config.webPushPublicKey&&config.webPushPublicKey!==keys.publicKey)throw Error('Existing public configuration differs from the active signing key; review rotation before updating.');
config.webPushPublicKey=keys.publicKey;await writeFile(path,JSON.stringify(config,null,2)+'\n');
console.log(project,'Web Push public configuration saved; private key stays in Secret Manager.');

const email=`gratitude-push@${project}.iam.gserviceaccount.com`,principal=`serviceAccount:${email}`;
try{await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`);}catch(error){if(error.status!==404)throw error;await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,'POST',{accountId:'gratitude-push',serviceAccount:{displayName:'Gratitude hug notification sender'}});}
const policy=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,'POST',{options:{requestedPolicyVersion:3}});policy.bindings??=[];let changed=false;
for(const role of ['roles/datastore.user','roles/firebaseauth.viewer','roles/eventarc.eventReceiver']){let binding=policy.bindings.find(binding=>binding.role===role&&!binding.condition);if(!binding){binding={role,members:[]};policy.bindings.push(binding);}if(!binding.members.includes(principal)){binding.members.push(principal);changed=true;}}
if(changed)await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:setIamPolicy`,'POST',{policy});
const secretPolicy=await api(`https://secretmanager.googleapis.com/v1/${secret}:getIamPolicy?options.requestedPolicyVersion=3`);secretPolicy.bindings??=[];let accessor=secretPolicy.bindings.find(binding=>binding.role==='roles/secretmanager.secretAccessor');
if(!accessor){accessor={role:'roles/secretmanager.secretAccessor',members:[]};secretPolicy.bindings.push(accessor);}
if(!accessor.members.includes(principal)){accessor.members.push(principal);await api(`https://secretmanager.googleapis.com/v1/${secret}:setIamPolicy`,'POST',{policy:secretPolicy});}
console.log(project,'dedicated keyless sender identity configured; access is limited to Firestore, account checks and its signing secret.');

try{
 const fn=await api(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/australia-southeast1/functions/sendHugNotification`);
 if(fn.state==='ACTIVE'){
  if(fn.serviceConfig.serviceAccountEmail!==email||fn.eventTrigger.serviceAccountEmail!==email)throw Error('Unexpected sender or trigger identity; review before changing invocation access.');
  const service=fn.serviceConfig.service,runPolicy=await api(`https://run.googleapis.com/v2/${service}:getIamPolicy?options.requestedPolicyVersion=3`);
  runPolicy.bindings??=[];let invoker=runPolicy.bindings.find(binding=>binding.role==='roles/run.invoker'&&!binding.condition);
  if(!invoker){invoker={role:'roles/run.invoker',members:[]};runPolicy.bindings.push(invoker);}
  if(!invoker.members.includes(principal)){invoker.members.push(principal);await api(`https://run.googleapis.com/v2/${service}:setIamPolicy`,'POST',{policy:runPolicy});}
  if(runPolicy.bindings.some(binding=>binding.members?.some(member=>['allUsers','allAuthenticatedUsers'].includes(member))))throw Error('Unexpected public invocation access on the private sender.');
  console.log(project,'only the event receiver has been granted invocation of this sender service.');
  console.log(project,'sender active; maxInstances:',fn.serviceConfig.maxInstanceCount,'minInstances:',fn.serviceConfig.minInstanceCount??0);
 }
}catch(error){if(error.status!==404)throw error;}
