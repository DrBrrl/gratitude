// Provision the optional personal-key relay. Never print or write the encryption keyring.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
const require=createRequire(new URL('../package.json',import.meta.url)),auth=require('firebase-tools/lib/auth.js');
const target=process.argv[2];if(!['preview','production'].includes(target))throw Error('Choose preview or production.');
const {projectId:project}=JSON.parse(await readFile(new URL(`../config/firebase-${target}.json`,import.meta.url),'utf8'));
const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Firebase administrative login is required.');
const token=(await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform'])).access_token;
async function api(url,method='GET',body){
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();
 if(!response.ok)throw Object.assign(Error(`Cloud relay setup failed (${response.status}, ${data.error?.status??'unknown'}).`),{status:response.status});return data;
}
if(!(await api(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`)).billingEnabled)throw Error('The optional relay requires this Firebase project’s Blaze plan.');
const secret=`projects/${project}/secrets/GRATITUDE_AI_KEYRING`;
try{
 const stored=await api(`https://secretmanager.googleapis.com/v1/${secret}/versions/latest:access`),ring=JSON.parse(Buffer.from(stored.payload.data,'base64').toString('utf8'));
 if(!ring.active||Buffer.from(ring.keys?.[ring.active]??'','base64').length!==32)throw Error('Review the existing encryption keyring before making changes.');
}catch(error){
 if(error.status!==404)throw error;
 try{await api(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=GRATITUDE_AI_KEYRING`,'POST',{replication:{automatic:{}}});}catch(error){if(error.status!==409)throw error;}
 const keyring={active:'v1',keys:{v1:randomBytes(32).toString('base64')}};
 await api(`https://secretmanager.googleapis.com/v1/${secret}:addVersion`,'POST',{payload:{data:Buffer.from(JSON.stringify(keyring)).toString('base64')}});
}
const email=`gratitude-ai-relay@${project}.iam.gserviceaccount.com`,principal=`serviceAccount:${email}`;
try{await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`);}catch(error){if(error.status!==404)throw error;await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,'POST',{accountId:'gratitude-ai-relay',serviceAccount:{displayName:'Gratitude owner-authenticated personal Gemini relay'}});}
const policy=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,'POST',{options:{requestedPolicyVersion:3}});policy.bindings??=[];let changed=false;
for(const role of ['roles/datastore.user','roles/firebaseauth.viewer']){let binding=policy.bindings.find(value=>value.role===role&&!value.condition);if(!binding){binding={role,members:[]};policy.bindings.push(binding);}if(!binding.members.includes(principal)){binding.members.push(principal);changed=true;}}
if(changed)await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:setIamPolicy`,'POST',{policy});
const access=await api(`https://secretmanager.googleapis.com/v1/${secret}:getIamPolicy?options.requestedPolicyVersion=3`);access.bindings??=[];let accessor=access.bindings.find(value=>value.role==='roles/secretmanager.secretAccessor'&&!value.condition);
if(!accessor){accessor={role:'roles/secretmanager.secretAccessor',members:[]};access.bindings.push(accessor);}if(!accessor.members.includes(principal)){accessor.members.push(principal);await api(`https://secretmanager.googleapis.com/v1/${secret}:setIamPolicy`,'POST',{policy:access});}
console.log(project,'relay identity and private keyring configured. No personal inference key was supplied or generated.');
