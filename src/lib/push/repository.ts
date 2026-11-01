import {doc,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import {applyPushChoice,emptyPushChoice,type PushChoice,type PushChoiceEvent} from './protocol.ts';
export type PushRegistration = {subscription:{endpoint:string;keys:{p256dh:string;auth:string}};scope:string;generation:string;publicKey:string};
export async function choosePush(db:Firestore,uid:string,deviceId:string,enabled:boolean,reason:'button'|'sign-out',registration?:PushRegistration,eventId=crypto.randomUUID()){
 const headRef=doc(db,`users/${uid}/pushChoices/${deviceId}`),source=doc(db,`${headRef.path}/events/${eventId}`),deviceRef=doc(db,`users/${uid}/pushDevices/${deviceId}`);
 return runTransaction(db,async tx=>{
  const [head,prior,device]=await Promise.all([tx.get(headRef),tx.get(source),tx.get(deviceRef)]);
  const before=head.exists()?head.data() as PushChoice:emptyPushChoice();
  if(prior.exists()){if(prior.get('payload.enabled')!==enabled||prior.get('payload.reason')!==reason)throw Error('Notification action ID already used.');return before;}
  const event:PushChoiceEvent={eventId,schemaVersion:1,type:'HugNotificationsChosen',actorUid:uid,deviceId,sequence:before.sequence+1,recordedAt:new Date().toISOString(),payload:{previousEventId:before.lastEventId,enabled,reason}};
  const next=applyPushChoice(before,event);
  tx.set(source,{...event,recordedAt:serverTimestamp()});tx.set(headRef,next);
  if(enabled){if(!registration)throw Error('Choose this browser’s notification subscription.');tx.set(deviceRef,{...registration,choiceEventId:eventId,choiceSequence:next.sequence,createdAt:device.get('createdAt')??serverTimestamp(),updatedAt:serverTimestamp()});}
  else tx.delete(deviceRef);
  return next;
 });
}
