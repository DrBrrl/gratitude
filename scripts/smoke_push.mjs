// Live preview-only smoke test. Every Firebase/Auth record is a disposable fixture.
import{readFile}from'node:fs/promises';import{createRequire}from'node:module';import{randomUUID,randomBytes,createECDH}from'node:crypto';
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Run the live smoke test outside emulator environments.');
const root=process.cwd(),require=createRequire(root+'/package.json'),backend=createRequire(root+'/functions/package.json');
const cliAuth=require('firebase-tools/lib/auth.js'),{initializeApp,deleteApp}=backend('firebase-admin/app'),{getAuth}=backend('firebase-admin/auth'),ece=backend('http_ece');
const WebSocket=require('ws');
const config=JSON.parse(await readFile(root+'/config/firebase-preview.json','utf8')),project=config.projectId;if(project!=='gratitude-drbrrl-dev')throw Error('Live smoke tests are restricted to preview.');
const account=cliAuth.getGlobalDefaultAccount();async function token(){return(await cliAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform'])).access_token;}
const app=initializeApp({projectId:project,credential:{getAccessToken:async()=>({access_token:await token(),expires_in:120})}},'push-live-smoke');const admin=getAuth(app);
const run=randomUUID().replaceAll('-',''),sender=`push_smoke_sender_${run}`,uid=`push_smoke_recipient_${run}`,pairId=`push_smoke_${run}`,eventId='push_smoke_hug',deviceId='push_smoke_device',choiceId='push_smoke_opt_in';
const prefix=`projects/${project}/databases/(default)/documents/`,written=new Set(),createdUsers=[];let ws,channel;
async function api(path,method='GET',body){const response=await fetch('https://firestore.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+await token(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=response.status===204?{}:await response.json();if(!response.ok)throw Error('Preview smoke Firebase request failed: '+response.status+' '+(data.error?.status??''));return data;}
function value(x){if(x===null)return{nullValue:null};if(typeof x==='string')return{stringValue:x};if(typeof x==='boolean')return{booleanValue:x};if(typeof x==='number')return{integerValue:String(x)};if(Array.isArray(x))return{arrayValue:{values:x.map(value)}};return{mapValue:{fields:fields(x)}};}
function fields(x){return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]));}
async function commit(items){const writes=items.map(({path,data,timestamps=[],create=true})=>({update:{name:prefix+path,fields:fields(data)},currentDocument:{exists:!create},...(timestamps.length?{updateTransforms:timestamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))}:{})}));await api(`projects/${project}/databases/(default)/documents:commit`,'POST',{writes});items.forEach(item=>written.add(item.path));}
const messages=[],waiters=[];function waitFor(predicate,timeout=120_000){const found=messages.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Live push test timed out waiting for provider delivery.')),timeout);waiters.push({predicate,resolve:value=>{clearTimeout(timer);resolve(value);}});});}
try{
 ws=new WebSocket('wss://push.services.mozilla.com/');
 ws.on('unexpected-response',(_request,response)=>console.log('Mozilla handshake HTTP status:',response.statusCode));
 ws.addEventListener('message',event=>{try{const message=JSON.parse(String(event.data));messages.push(message);for(const waiter of [...waiters])if(waiter.predicate(message)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(message);}}catch{}});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Mozilla push connection timed out.')),20_000);ws.addEventListener('open',()=>{clearTimeout(timeout);ws.send(JSON.stringify({messageType:'hello',uaid:'',channelIDs:[],use_webpush:true}));resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('Mozilla push connection failed.')); },{once:true});});
 const hello=await waitFor(m=>m.messageType==='hello',20_000);if(hello.status!==200)throw Error('Mozilla push handshake failed.');
 channel=randomUUID();ws.send(JSON.stringify({messageType:'register',channelID:channel,key:config.webPushPublicKey}));const registered=await waitFor(m=>m.messageType==='register',20_000);if(registered.status!==200)throw Error('Mozilla push registration failed.');
 const receiver=createECDH('prime256v1');receiver.generateKeys();const auth=randomBytes(16);const subscription={endpoint:registered.pushEndpoint,keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}};
 for(const id of [sender,uid]){await admin.createUser({uid:id});createdUsers.push(id);}
 const profileEvent='push_smoke_profile',requestId='push_smoke_request',acceptId='push_smoke_accept';
 const initial=[];for(const [id,name,username]of[[sender,'Fictional push sender',`smoke_s_${run.slice(0,8)}`],[uid,'Fictional push recipient',`smoke_r_${run.slice(0,8)}`]]){const payload={username,displayName:name,discoverable:false};initial.push({path:`friendProfiles/${id}`,data:{...payload,uid:id,sequence:1,lastEventId:profileEvent}},{path:`friendProfiles/${id}/events/${profileEvent}`,data:{eventId:profileEvent,type:'FriendProfileChosen',schemaVersion:1,actorUid:id,sequence:1,payload},timestamps:['recordedAt']});}
 initial.push({path:`friendPairs/${pairId}`,data:{members:[sender,uid],sequence:2,lastEventId:acceptId,status:'accepted',requesterUid:null,blockedA:false,blockedB:false,hugsA:true,hugsB:true,lastHugA:null,lastHugB:null,lastHugOffsetA:null,lastHugOffsetB:null},timestamps:['requestedAt']},
 {path:`friendPairs/${pairId}/events/${requestId}`,data:{eventId:requestId,type:'FriendRequestSent',schemaVersion:1,actorUid:sender,targetUid:uid,sequence:1,payload:{previousEventId:null}},timestamps:['recordedAt']},
 {path:`friendPairs/${pairId}/events/${acceptId}`,data:{eventId:acceptId,type:'FriendRequestAccepted',schemaVersion:1,actorUid:uid,targetUid:sender,sequence:2,payload:{previousEventId:requestId}},timestamps:['recordedAt']},
 {path:`friendLinks/${sender}/peers/${uid}`,data:{pairId}},{path:`friendLinks/${uid}/peers/${sender}`,data:{pairId}},
 {path:`users/${uid}/pushChoices/${deviceId}`,data:{sequence:1,lastEventId:choiceId,enabled:true}},
 {path:`users/${uid}/pushChoices/${deviceId}/events/${choiceId}`,data:{eventId:choiceId,type:'HugNotificationsChosen',schemaVersion:1,actorUid:uid,deviceId,sequence:1,payload:{previousEventId:null,enabled:true,reason:'button'}},timestamps:['recordedAt']},
 {path:`users/${uid}/pushDevices/${deviceId}`,data:{subscription,publicKey:config.webPushPublicKey,scope:'https://drbrrl.github.io/gratitude/pr-preview/pr-20/',generation:run,choiceEventId:choiceId,choiceSequence:1},timestamps:['createdAt','updatedAt']});
 await commit(initial);
 const head=await api(prefix+`friendPairs/${pairId}`);
 // Preserve the server's request timestamp on the unrelated hug update.
 const rawHead={...fields({members:[sender,uid],sequence:3,lastEventId:eventId,status:'accepted',requesterUid:null,blockedA:false,blockedB:false,hugsA:true,hugsB:true,lastHugB:null,lastHugOffsetA:0,lastHugOffsetB:null}),requestedAt:head.fields.requestedAt};
 written.add(`hugPushDeliveries/${pairId}/events/${eventId}/devices/${deviceId}`);
 await api(`projects/${project}/databases/(default)/documents:commit`,'POST',{writes:[{update:{name:prefix+`friendPairs/${pairId}`,fields:rawHead},updateTransforms:[{fieldPath:'lastHugA',setToServerValue:'REQUEST_TIME'}]},{update:{name:prefix+`friendPairs/${pairId}/events/${eventId}`,fields:fields({eventId,type:'HugSent',schemaVersion:2,actorUid:sender,targetUid:uid,sequence:3,payload:{previousEventId:acceptId,utcOffsetMinutes:0}})},currentDocument:{exists:false},updateTransforms:[{fieldPath:'recordedAt',setToServerValue:'REQUEST_TIME'}]}]});written.add(`friendPairs/${pairId}/events/${eventId}`);
 console.log('Disposable preview fixture created; awaiting the deployed sender.');
 const notification=await waitFor(m=>m.messageType==='notification'&&m.channelID.replaceAll('-','')===channel.replaceAll('-',''));
 const decrypted=JSON.parse(ece.decrypt(Buffer.from(notification.data,'base64url'),{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString('utf8'));
 if(decrypted.type!=='hug'||decrypted.uid!==uid||decrypted.senderName!=='Fictional push sender'||decrypted.eventId!==eventId)throw Error('Unexpected decrypted fixture notification.');
 ws.send(JSON.stringify({messageType:'ack',updates:[{channelID:notification.channelID,version:notification.version,code:100}]}));
 for(let attempt=0;attempt<20;attempt++){try{const receipt=await api(prefix+`hugPushDeliveries/${pairId}/events/${eventId}/devices/${deviceId}`);if(receipt.fields?.status?.stringValue==='sent')break;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));if(attempt===19)throw Error('The sender did not confirm its delivery receipt.');}
 console.log('Live Firebase → Mozilla encrypted hug delivery and private receipt verified.');
}finally{
 if(ws?.readyState===WebSocket.OPEN){if(channel)ws.send(JSON.stringify({messageType:'unregister',channelID:channel}));ws.close();}
 if(written.size){const paths=[...written];if(paths.some(path=>!path.includes(run)))throw Error('Unsafe smoke fixture cleanup path.');await api(`projects/${project}/databases/(default)/documents:commit`,'POST',{writes:paths.map(path=>({delete:prefix+path}))});}
 for(const id of createdUsers)await admin.deleteUser(id);
 await deleteApp(app);console.log('Disposable preview fixture cleanup complete.');
}
