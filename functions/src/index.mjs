import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {defineSecret} from 'firebase-functions/params';
import webPush from 'web-push';
import {deliverHug,HUG_TTL_MS} from './delivery.mjs';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createAIRelay,RelayError} from './ai-relay.mjs';
initializeApp();
const project=process.env.GCLOUD_PROJECT||JSON.parse(process.env.FIREBASE_CONFIG??'{}').projectId;
const keys=defineSecret('GRATITUDE_WEB_PUSH_KEYS');
const aiKeyring=defineSecret('GRATITUDE_AI_KEYRING');
export const personalGemini=onCall({region:'australia-southeast1',serviceAccount:`gratitude-ai-relay@${project}.iam.gserviceaccount.com`,memory:'256MiB',cpu:1,minInstances:0,maxInstances:2,concurrency:8,timeoutSeconds:120,secrets:[aiKeyring],cors:process.env.FUNCTIONS_EMULATOR==='true'?true:['https://drbrrl.github.io']},async request=>{
 try{if(request.auth){const user=await getAuth().getUser(request.auth.uid);if(user.disabled||Date.parse(user.tokensValidAfterTime??'')>Number(request.auth.token.auth_time??0)*1000)throw new HttpsError('unauthenticated','Sign in again to manage this private cloud connection.');}return await createAIRelay({db:getFirestore(),project,keyring:()=>JSON.parse(aiKeyring.value())})(request);}
 catch(error){if(error instanceof HttpsError)throw error;if(error instanceof RelayError)throw new HttpsError(error.code,error.message);throw new HttpsError('internal','The private cloud connection could not be completed. Reconnect and try again.');}
});
export const sendHugNotification=onDocumentCreated({document:'friendPairs/{pairId}/events/{eventId}',region:'australia-southeast1',serviceAccount:`gratitude-push@${project}.iam.gserviceaccount.com`,memory:'256MiB',cpu:1,minInstances:0,maxInstances:1,concurrency:8,timeoutSeconds:120,retry:true,secrets:[keys]},async event=>{
 if(event.data?.get('type')!=='HugSent')return;
 const at=event.data.get('recordedAt')?.toMillis?.();if(!Number.isFinite(at)||at+HUG_TTL_MS<=Date.now())return;
 let vapid;try{vapid=JSON.parse(keys.value());}catch{throw Error('Push signing configuration is unavailable.');}
 await deliverHug({db:getFirestore(),pairId:event.params.pairId,eventId:event.params.eventId,project:process.env.GCLOUD_PROJECT,publicKey:vapid.publicKey,
  recipientAllowed:async uid=>{try{return !(await getAuth().getUser(uid)).disabled;}catch(error){if(error.code==='auth/user-not-found')return false;throw error;}},
  send:(subscription,payload,options)=>webPush.sendNotification(subscription,payload,{...options,vapidDetails:{subject:'https://drbrrl.github.io/gratitude/',publicKey:vapid.publicKey,privateKey:vapid.privateKey}})});
});
