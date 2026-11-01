import {createHash,createECDH} from 'node:crypto';
export const HUG_TTL_MS=86_400_000;
const providerOrigins=new Set(['https://updates.push.services.mozilla.com','https://fcm.googleapis.com','https://web.push.apple.com']);
export function validSubscription(value){
 try{
  const url=new URL(value.endpoint);
  if(!providerOrigins.has(url.origin)||url.username||url.password||url.hash||value.endpoint.length>4096||url.pathname.length<2||!/^[A-Za-z0-9_-]{87}$/.test(value.keys.p256dh)||!/^[A-Za-z0-9_-]{22}$/.test(value.keys.auth))return false;
  // OpenSSL validates the uncompressed P-256 point before it reaches web-push.
  const point=Buffer.from(value.keys.p256dh,'base64url');const curve=createECDH('prime256v1');curve.setPublicKey(point);
  return point.length===65&&point[0]===4&&Buffer.from(value.keys.auth,'base64url').length===16;
 }catch{return false;}
}
export function validScope(scope,project){
 if(project==='demo-gratitude')return /^http:\/\/(127\.0\.0\.1|localhost):[0-9]{2,5}\/(gratitude\/pr-preview\/firebase-check\/)?$/.test(scope)||/^https:\/\/drbrrl\.github\.io\/gratitude\/pr-preview\/pr-[0-9]+\/$/.test(scope);
 return project==='gratitude-drbrrl'?scope==='https://drbrrl.github.io/gratitude/':project==='gratitude-drbrrl-dev'&&/^https:\/\/drbrrl\.github\.io\/gratitude\/pr-preview\/pr-[0-9]+\/$/.test(scope);
}
function accepted(pair,source){const a=pair?.members?.[0]===source.actorUid;return pair?.status==='accepted'&&!pair.blockedA&&!pair.blockedB&&pair.members?.includes(source.actorUid)&&pair.members?.includes(source.targetUid)&&source.actorUid!==source.targetUid&&(a?pair.hugsB:pair.hugsA);}
const millis=value=>typeof value?.toMillis==='function'?value.toMillis():NaN;
/** Only immutable HugSent source creation calls this. Projection rebuilds never do. */
export async function deliverHug({db,pairId,eventId,project,publicKey,send,recipientAllowed=async()=>true,now=()=>Date.now()}){
 const pairRef=db.doc(`friendPairs/${pairId}`),sourceRef=pairRef.collection('events').doc(eventId);
 const [sourceSnapshot,pairSnapshot]=await Promise.all([sourceRef.get(),pairRef.get()]);
 const source=sourceSnapshot.data(),pair=pairSnapshot.data(),at=millis(source?.recordedAt),current=now();
 if(source?.type!=='HugSent'||source.eventId!==eventId||!Number.isFinite(at)||at>current+60_000||at+HUG_TTL_MS<=current||!accepted(pair,source)||!await recipientAllowed(source.targetUid))return;
 // An old, delayed hug must not survive a removed/blocked/re-established relationship.
 const tail=await pairRef.collection('events').where('sequence','>',source.sequence).orderBy('sequence').limit(101).get();
 if(tail.size>100||tail.docs.some(doc=>['FriendRemoved','FriendBlocked','FriendRequestSent'].includes(doc.get('type'))))return;
 const sender=await db.doc(`friendProfiles/${source.actorUid}`).get();const senderName=sender.get('displayName');
 if(typeof senderName!=='string'||!senderName.trim()||senderName.length>60)return;
 const devices=await db.collection(`users/${source.targetUid}/pushDevices`).orderBy('updatedAt','desc').limit(20).get();
 const results=await Promise.allSettled(devices.docs.map(async device=>{
  const receiptRef=db.doc(`hugPushDeliveries/${pairId}/events/${eventId}/devices/${device.id}`),choiceRef=db.doc(`users/${source.targetUid}/pushChoices/${device.id}`);
  const claim=await db.runTransaction(async tx=>{
   const [receipt,currentDevice,choice,currentPair]=await Promise.all([tx.get(receiptRef),tx.get(device.ref),tx.get(choiceRef),tx.get(pairRef)]);
   const stored=receipt.data(),registration=currentDevice.data(),state=choice.data(),clock=now();
   if(stored?.status==='sent'||stored?.status==='suppressed'||stored?.status==='expired')return null;
   if(stored?.leaseUntil>clock)throw Error('Notification delivery is already in progress.');
   if(currentPair.get('lastEventId')!==pair.lastEventId)throw Error('Friendship changed while preparing delivery.');
   const choiceSource=state?.lastEventId?await tx.get(choiceRef.collection('events').doc(state.lastEventId)):null;
   const eligible=accepted(currentPair.data(),source)&&clock<at+HUG_TTL_MS&&registration&&state?.enabled&&registration.choiceEventId===state.lastEventId&&registration.choiceSequence===state.sequence
    &&millis(choiceSource?.get('recordedAt'))<=at&&millis(registration.createdAt)<=at&&Number.isFinite(millis(registration.updatedAt))&&registration.publicKey===publicKey&&validScope(registration.scope,project)&&validSubscription(registration.subscription);
   if(!eligible){tx.set(receiptRef,{status:'suppressed',leaseUntil:0,attempts:(stored?.attempts??0),updatedAt:clock});return null;}
   const attempt=(stored?.attempts??0)+1;
   tx.set(receiptRef,{status:'pending',leaseUntil:clock+120_000,attempts:attempt,updatedAt:clock});
   return{registration,attempt};
  });
  if(!claim)return;
  const {registration,attempt}=claim;
  const payload={version:1,type:'hug',uid:source.targetUid,deviceId:device.id,generation:registration.generation,choiceEventId:registration.choiceEventId,scope:registration.scope,pairId,eventId,senderName,expiresAt:at+HUG_TTL_MS};
  try{
   await send(registration.subscription,JSON.stringify(payload),{TTL:Math.max(1,Math.ceil((payload.expiresAt-now())/1000)),urgency:'normal',topic:createHash('sha256').update(`${pairId}:${eventId}`).digest('base64url').slice(0,32),timeout:8_000});
   await receiptRef.set({status:'sent',leaseUntil:0,attempts:attempt,updatedAt:now()});
  }catch(error){
   const permanent=[400,404,410,413].includes(error?.statusCode);
   await db.runTransaction(async tx=>{const currentDevice=await tx.get(device.ref);tx.set(receiptRef,{status:permanent?'expired':'pending',leaseUntil:0,attempts:attempt,updatedAt:now()});if(permanent&&currentDevice.get('generation')===registration.generation)tx.delete(device.ref);});
   if(!permanent)throw Error('Push service temporarily unavailable.');
  }
 }));
 if(results.some(result=>result.status==='rejected'))throw Error('Some hug deliveries need retrying.');
}
