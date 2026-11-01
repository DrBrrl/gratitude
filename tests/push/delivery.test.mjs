import{test,before,after,beforeEach}from'node:test';import assert from'node:assert/strict';
import{createRequire}from'node:module';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const{initializeApp,deleteApp}=require('firebase-admin/app');
const{getFirestore,Timestamp}=require('firebase-admin/firestore');
import{deliverHug,validSubscription,validScope,HUG_TTL_MS}from'../../functions/src/delivery.mjs';
import{subscription,publicKey}from'./fixtures.mjs';
const at=Date.parse('2026-10-01T04:31:07Z');let app,db;
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Delivery integration tests require the emulator.');app=initializeApp({projectId:'demo-gratitude'},'push-delivery-tests');db=getFirestore(app);});after(async()=>{await db?.terminate();if(app)await deleteApp(app);});
async function fixture(suffix,overrides={}){
 const pairId=`push-delivery-${suffix}`,eventId='hug',uid=`push-recipient-${suffix}`,sender=`push-sender-${suffix}`,scope='https://drbrrl.github.io/gratitude/pr-preview/pr-20/';
 const source={eventId,type:'HugSent',schemaVersion:2,actorUid:sender,targetUid:uid,sequence:3,recordedAt:Timestamp.fromMillis(at),payload:{previousEventId:'accepted',utcOffsetMinutes:0}};
 await db.doc(`friendProfiles/${sender}`).set({displayName:'A fictional friend'});
 await db.doc(`friendPairs/${pairId}`).set({members:[sender,uid],status:'accepted',blockedA:false,blockedB:false,hugsA:true,hugsB:true,sequence:3,lastEventId:eventId,...overrides});
 await db.doc(`friendPairs/${pairId}/events/${eventId}`).set(source);
 await db.doc(`users/${uid}/pushChoices/device`).set({sequence:1,lastEventId:'enabled',enabled:true});await db.doc(`users/${uid}/pushChoices/device/events/enabled`).set({recordedAt:Timestamp.fromMillis(at-1000)});
 await db.doc(`users/${uid}/pushDevices/device`).set({subscription,publicKey,scope,generation:'generation-first',choiceEventId:'enabled',choiceSequence:1,createdAt:Timestamp.fromMillis(at-1000),updatedAt:Timestamp.fromMillis(at-1000)});
 return{pairId,eventId,uid,scope,db,project:'demo-gratitude',publicKey,now:()=>at+500};
}
test('provider allowlist rejects internal URLs, credentials, fragments and invalid encryption points',()=>{
 assert.equal(validSubscription(subscription),true);for(const endpoint of ['https://127.0.0.1/x','http://updates.push.services.mozilla.com/x','https://updates.push.services.mozilla.com.evil.example/x','https://user:pass@updates.push.services.mozilla.com/x','https://updates.push.services.mozilla.com/x#secret'])assert.equal(validSubscription({...subscription,endpoint}),false);
 assert.equal(validSubscription({...subscription,keys:{...subscription.keys,p256dh:'A'.repeat(87)}}),false);assert.equal(validScope('https://drbrrl.github.io/gratitude/','gratitude-drbrrl-dev'),false);assert.equal(validScope('https://drbrrl.github.io/gratitude/pr-preview/pr-20/','gratitude-drbrrl'),false);
});
test('send current consented hug once, with private device binding and no journal access',async()=>{
 const f=await fixture('once'),sent=[];const guardedDb={doc:path=>{assert.ok(!path.includes('/streams/')&&!path.includes('/privateSettings/'),'push must not read journals or model credentials');return db.doc(path);},collection:path=>db.collection(path),runTransaction:work=>db.runTransaction(work)};await deliverHug({...f,db:guardedDb,send:async(...args)=>sent.push(args)});await deliverHug({...f,send:async(...args)=>sent.push(args)});assert.equal(sent.length,1);const payload=JSON.parse(sent[0][1]);assert.equal(payload.senderName,'A fictional friend');assert.equal(payload.uid,f.uid);assert.equal(payload.scope,f.scope);assert.equal(payload.expiresAt,at+HUG_TTL_MS);assert.equal('reflection'in payload,false);assert.equal((await db.doc(`hugPushDeliveries/${f.pairId}/events/hug/devices/device`).get()).get('status'),'sent');
});
test('friendship, recipient preference, consent, registration age and expiry are checked before sending',async()=>{
 const cases=['blocked','paused','removed','off','later-opt-in','wrong-choice','later-device','wrong-key','expired','disabled-account'];
 for(const kind of cases){const f=await fixture(kind);const pair=db.doc(`friendPairs/${f.pairId}`),device=db.doc(`users/${f.uid}/pushDevices/device`),choice=db.doc(`users/${f.uid}/pushChoices/device`);
 if(kind==='blocked')await pair.update({blockedB:true});if(kind==='paused')await pair.update({hugsB:false});if(kind==='removed')await pair.update({status:'none'});if(kind==='off')await choice.update({enabled:false});if(kind==='later-opt-in')await db.doc(`${choice.path}/events/enabled`).update({recordedAt:Timestamp.fromMillis(at+1)});if(kind==='wrong-choice')await device.update({choiceEventId:'other'});if(kind==='later-device')await device.update({createdAt:Timestamp.fromMillis(at+1)});if(kind==='wrong-key')await device.update({publicKey:'different'});
 let count=0;await deliverHug({...f,now:kind==='expired'?()=>at+HUG_TTL_MS:f.now,recipientAllowed:async()=>kind!=='disabled-account',send:async()=>{count++;}});assert.equal(count,0,kind);}
});
test('a retried old hug does not cross a removed and re-established friendship',async()=>{
 const f=await fixture('new-friendship');await db.doc(`friendPairs/${f.pairId}`).update({lastEventId:'accepted-again',sequence:6});await db.doc(`friendPairs/${f.pairId}/events/removed`).set({type:'FriendRemoved',sequence:4});await db.doc(`friendPairs/${f.pairId}/events/accepted-again`).set({type:'FriendRequestAccepted',sequence:6});let sent=0;await deliverHug({...f,send:async()=>{sent++;}});assert.equal(sent,0);
});
test('expired subscriptions retire without deleting a renewed device; transient sends retry idempotently',async()=>{
 const f=await fixture('retry');let calls=0;await assert.rejects(deliverHug({...f,send:async()=>{calls++;throw Object.assign(Error('Temporary'),{statusCode:503});}}));await deliverHug({...f,send:async()=>{calls++;}});assert.equal(calls,2);
 const expired=await fixture('gone');await deliverHug({...expired,send:async()=>{throw Object.assign(Error('Gone'),{statusCode:410});}});assert.equal((await db.doc(`users/${expired.uid}/pushDevices/device`).get()).exists,false);
 const renewed=await fixture('renewed');await deliverHug({...renewed,send:async()=>{await db.doc(`users/${renewed.uid}/pushDevices/device`).update({generation:'generation-new'});throw Object.assign(Error('Gone'),{statusCode:410});}});assert.equal((await db.doc(`users/${renewed.uid}/pushDevices/device`).get()).get('generation'),'generation-new');
});
