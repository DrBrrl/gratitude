/// <reference lib="webworker" />
import {readPushBinding,reserveHug,releaseHug} from './device-store.ts';
import {validHugPush,friendsNotificationURL,isAppWindow,type PushBinding} from './protocol.ts';
export async function receiveHugPush(registration:ServiceWorkerRegistration,value:unknown,now=Date.now()){
 const scope=registration.scope,binding=await readPushBinding(scope);
 if(!binding||!validHugPush(value,binding,scope,now)||!await reserveHug(scope,binding,value.pairId,value.eventId,now))return;
 if(JSON.stringify(await readPushBinding(scope))!==JSON.stringify(binding))return;
 try{await registration.showNotification('A hug for you 💛',{body:`${value.senderName} sent you a hug!`,icon:new URL('icons/gratitude-192.png',scope).href,badge:new URL('icons/gratitude-192.png',scope).href,tag:`gratitude-hug:${value.pairId}:${value.eventId}`,data:{...binding,url:friendsNotificationURL(scope)}});
  if(JSON.stringify(await readPushBinding(scope))!==JSON.stringify(binding)){for(const notification of await registration.getNotifications({tag:`gratitude-hug:${value.pairId}:${value.eventId}`}))notification.close();}
 }
 catch(cause){await releaseHug(scope,binding,value.pairId,value.eventId);throw cause;}
}
export async function openHugNotification(worker:ServiceWorkerGlobalScope,notification:Notification){
 notification.close();const data=notification.data as PushBinding|undefined,binding=await readPushBinding(worker.registration.scope);
 if(!data||!binding||data.uid!==binding.uid||data.deviceId!==binding.deviceId||data.generation!==binding.generation||data.choiceEventId!==binding.choiceEventId||data.scope!==binding.scope)return;
 const url=friendsNotificationURL(worker.registration.scope);
 for(const client of await worker.clients.matchAll({type:'window',includeUncontrolled:true})){
  const windowClient=client as WindowClient;
  if(isAppWindow(windowClient.url,worker.registration.scope)){await windowClient.focus();windowClient.postMessage({type:'OPEN_HUG_FRIENDS',uid:binding.uid,scope:binding.scope});return;}
 }
 await worker.clients.openWindow(url);
}
