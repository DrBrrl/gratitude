import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,query,where,orderBy,limit,startAfter,setDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {saveFriendProfile,appendFriendAction,FriendsRepository} from '../../src/lib/friends/repository.ts';
import {saveGratitudeSharing,publishGratitude} from '../../src/lib/friends/sharing.ts';
import {applySharing,emptySharing} from '../../src/lib/friends/streaks.ts';
import {emptyProjection} from '../../src/lib/domain.ts';
let env;
const db=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const command=(eventId,type,targetUid,extra={})=>({eventId,type,targetUid,...extra});
const profile=(username,discoverable=true)=>({username,displayName:username,discoverable});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});

test('substring discovery is bounded, paged, canonical and removed atomically when hidden or renamed',async()=>{
 const reader=db('search-reader');
 for(let i=0;i<12;i++){const uid=`search-person-${i}`;await saveFriendProfile(db(uid),uid,profile(`testing_jam_${String(i).padStart(2,'0')}`),`search-profile-${i}`);}
 const matches=after=>getDocs(query(collection(reader,'friendSearch'),where('terms','array-contains','jam'),orderBy('username'),...(after?[startAfter(after)]:[]),limit(10)));
 const first=await assertSucceeds(matches());assert.equal(first.size,10);
 const discovery=new FriendsRepository(reader,'search-reader','demo-test',()=>{});
 const pageOne=await discovery.find('jam');assert.equal(pageOne.profiles.length,10);assert.equal((await discovery.find('jam',pageOne.next)).profiles.length,2);
 const second=await assertSucceeds(matches(first.docs.at(-1).get('username')));assert.equal(second.size,2);
 await assertFails(getDocs(query(collection(reader,'friendSearch'),where('terms','array-contains','jam'),orderBy('username'),limit(11))));
 await assertFails(getDocs(collection(reader,'friendSearch')));
 await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),'friendSearch'),where('terms','array-contains','jam'),limit(10))));
 await assertFails(setDoc(doc(reader,'friendSearch/search-person-0'),{uid:'search-person-0',username:'testing_jam_00',displayName:'Forged',profileEventId:'search-profile-0',terms:['jam','testing_jam_00']}));
 await saveFriendProfile(db('search-person-0'),'search-person-0',profile('renamed_person'), 'rename-search');
 assert.equal((await matches()).docs.some(d=>d.id==='search-person-0'),false);
 await saveFriendProfile(db('search-person-1'),'search-person-1',profile('testing_jam_01',false), 'hide-search');
 assert.equal((await matches()).docs.some(d=>d.id==='search-person-1'),false);
 assert.equal((await getDoc(doc(reader,'friendSearch/search-person-1'))).exists(),false);
 await saveFriendProfile(db('search-legacy'),'search-legacy',profile('jam'),'legacy-profile');
 await env.withSecurityRulesDisabled(async context=>{const {deleteDoc}=await import('firebase/firestore');await deleteDoc(doc(context.firestore(),'friendSearch/search-legacy'));});
 const withLegacy=await discovery.find('jam');assert.equal(withLegacy.profiles.length,10);assert.equal(withLegacy.profiles[0].uid,'search-legacy');
 assert.equal((await discovery.find('jam',withLegacy.next)).profiles.length,1);
 const source=await getDocs(collection(db('search-person-0'),'friendProfiles/search-person-0/events'));
 assert.ok(source.docs.every(d=>!Object.hasOwn(d.get('payload'),'terms')));
});

test('explicit sharing publishes only dates; receipts and actions stay private; withdrawal and revocation remove access',async()=>{
 const uid='streak-alice',peer='streak-bob',a=db(uid),b=db(peer),stranger=db('streak-stranger');
 await saveFriendProfile(a,uid,profile('streak_alice'),'streak-profile-a');await saveFriendProfile(b,peer,profile('streak_bob'),'streak-profile-b');
 const pair=await appendFriendAction(a,uid,command('streak-request','FriendRequestSent',peer));
 await assertFails(getDoc(doc(b,`friendSharing/${uid}`)));
 await appendFriendAction(b,peer,command('streak-accept','FriendRequestAccepted',uid));
 const shared=await saveGratitudeSharing(a,uid,{enabled:true,timeZone:'Australia/Hobart'},null,'streak-share');
 assert.equal((await getDoc(doc(b,`friendSharing/${uid}`))).get('enabled'),true);
 await assertSucceeds(getDoc(doc(b,`friendGratitude/${uid}`))); // subscription is safe before initial publication
 // Profile confirmation and its listener can request the initial snapshot together.
 assert.deepEqual(await Promise.all([
  publishGratitude(a,uid,shared,emptyProjection()),
  publishGratitude(a,uid,shared,emptyProjection()),
  publishGratitude(a,uid,shared,emptyProjection())
 ]),[true,true,true]);
 const snapshot=await getDoc(doc(b,`friendGratitude/${uid}`));assert.deepEqual(snapshot.get('days'),[]);
 assert.deepEqual(Object.keys(snapshot.data()).sort(),['days','publicationId','schemaVersion','sharingEventId','timeZone']);
 await assertFails(getDoc(doc(stranger,`friendGratitude/${uid}`)));
 await assertFails(getDocs(collection(b,'friendGratitude')));
 await assertFails(getDoc(doc(b,`users/${uid}/privateProjections/gratitudeDays`)));
 await assertFails(getDocs(collection(b,`friendSharing/${uid}/events`)));
 await assertFails(setDoc(doc(b,`friendGratitude/${uid}`),snapshot.data()));
 await assertFails(setDoc(doc(a,`friendGratitude/${uid}`),{...snapshot.data(),days:['2026-10-31']})); // must publish with fresh private receipt
 const forged=writeBatch(a);forged.set(doc(a,`friendGratitude/${uid}`),{...snapshot.data(),publicationId:'forged'});forged.set(doc(a,`users/${uid}/privateProjections/gratitudeDays`),{publicationId:'forged',sharingEventId:'streak-share',sourceSequence:999,sourceEventId:'made-up'});await assertFails(forged.commit());
 await assert.rejects(saveGratitudeSharing(a,uid,{enabled:false,timeZone:'UTC'},null,'stale-sharing'));
 const hidden=await saveGratitudeSharing(a,uid,{enabled:false,timeZone:'Australia/Hobart'},'streak-share','streak-hide');
 assert.equal(hidden.timeZone,null);assert.equal((await getDoc(doc(a,`friendGratitude/${uid}`))).exists(),false);
 await assertFails(getDoc(doc(b,`friendGratitude/${uid}`)));
 const events=await getDocs(query(collection(a,`friendSharing/${uid}/events`),orderBy('sequence')));
 assert.deepEqual(events.docs.map(d=>({...d.data(),recordedAt:d.get('recordedAt').toDate().toISOString()})).reduce(applySharing,emptySharing(uid)),hidden);
 const again=await saveGratitudeSharing(a,uid,{enabled:true,timeZone:'Australia/Hobart'},'streak-hide','streak-again');
 await publishGratitude(a,uid,again,emptyProjection());await assertSucceeds(getDoc(doc(b,`friendGratitude/${uid}`)));
 await appendFriendAction(b,peer,command('streak-block','FriendBlocked',uid));
 await assertFails(getDoc(doc(b,`friendGratitude/${uid}`)));await assertFails(getDoc(doc(b,`friendSharing/${uid}`)));
 assert.equal((await getDoc(doc(a,`friendPairs/${pair}`))).get('status'),'none');
});

test('Rules permit a hug after local midnight within 24h and reject repeats, offset forgery and source downgrades',async()=>{
 const uid='daily-alice',peer='daily-bob',a=db(uid),b=db(peer);
 await saveFriendProfile(a,uid,profile('daily_alice'),'daily-profile-a');await saveFriendProfile(b,peer,profile('daily_bob'),'daily-profile-b');
 const id=await appendFriendAction(a,uid,command('daily-request','FriendRequestSent',peer));await appendFriendAction(b,peer,command('daily-accept','FriendRequestAccepted',uid));
 await appendFriendAction(a,uid,command('daily-first','HugSent',peer,{utcOffsetMinutes:-0}));
 assert.equal(Object.is((await getDoc(doc(a,`friendPairs/${id}/events/daily-first`))).get('payload.utcOffsetMinutes'),-0),false);
 await assert.rejects(appendFriendAction(a,uid,command('daily-first','HugSent',peer,{utcOffsetMinutes:60})));
 await assert.rejects(appendFriendAction(a,uid,command('daily-repeat','HugSent',peer,{utcOffsetMinutes:0})));
 // Seed the last real action in the immediately preceding local day, <24 hours ago.
 const now=(await getDoc(doc(a,`friendPairs/${id}`))).get('lastHugA').toMillis(),offset=840,day=Math.floor((now+offset*60000)/86400000),prior=day*86400000-offset*60000-60_000;
 assert.ok(now-prior<86_400_000);
 await env.withSecurityRulesDisabled(async context=>{const fixture=context.firestore(),head=doc(fixture,`friendPairs/${id}`),snap=await getDoc(head),batch=writeBatch(fixture),source=doc(fixture,`friendPairs/${id}/events/daily-first`),event=await getDoc(source);for(const [eventId,at] of [['daily-request',prior-120_000],['daily-accept',prior-60_000]]){const ref=doc(fixture,`friendPairs/${id}/events/${eventId}`),value=await getDoc(ref);batch.set(ref,{...value.data(),recordedAt:Timestamp.fromMillis(at)});}
 batch.set(source,{...event.data(),recordedAt:Timestamp.fromMillis(prior),payload:{...event.get('payload'),utcOffsetMinutes:offset}});batch.set(head,{...snap.data(),requestedAt:Timestamp.fromMillis(prior-120_000),lastHugA:Timestamp.fromMillis(prior),lastHugOffsetA:offset});await batch.commit();});
 await appendFriendAction(a,uid,command('daily-midnight','HugSent',peer,{utcOffsetMinutes:offset}));
 await assert.rejects(appendFriendAction(a,uid,command('daily-midnight-repeat','HugSent',peer,{utcOffsetMinutes:offset})));
 const head=(await getDoc(doc(a,`friendPairs/${id}`))).data();
 for(const [name,schema,extra] of [['offset',2,{utcOffsetMinutes:900}],['downgrade',1,{}]]){
   const eventId=`daily-forged-${name}`,batch=writeBatch(a);batch.set(doc(a,`friendPairs/${id}`),{...head,sequence:head.sequence+1,lastEventId:eventId,lastHugA:serverTimestamp(),lastHugOffsetA:schema===1?null:900});batch.set(doc(a,`friendPairs/${id}/events/${eventId}`),{eventId,schemaVersion:schema,sequence:head.sequence+1,type:'HugSent',actorUid:uid,targetUid:peer,recordedAt:serverTimestamp(),payload:{previousEventId:head.lastEventId,...extra}});await assertFails(batch.commit());
 }
});

test('independent devices can retry one sharing action without duplicating it or overriding a later choice',async()=>{
 const uid='sharing-concurrent',a=db(uid),b=db(uid),choice={enabled:true,timeZone:'Australia/Hobart'};
 const results=await Promise.all([saveGratitudeSharing(a,uid,choice,null,'sharing-once'),saveGratitudeSharing(b,uid,choice,null,'sharing-once')]);
 assert.ok(results.every(result=>result.lastEventId==='sharing-once'&&result.enabled));
 assert.equal((await getDocs(collection(a,`friendSharing/${uid}/events`))).size,1);
 await assert.rejects(saveGratitudeSharing(b,uid,{enabled:false,timeZone:'UTC'},null,'sharing-once'),/already used/);
 await saveGratitudeSharing(b,uid,{enabled:false,timeZone:'UTC'},'sharing-once','sharing-disabled');
 await assert.rejects(saveGratitudeSharing(a,uid,choice,null,'sharing-stale'),/changed on another device/);
 assert.equal((await getDoc(doc(a,`friendSharing/${uid}`))).get('enabled'),false);
 assert.equal((await getDocs(collection(a,`friendSharing/${uid}/events`))).size,2);
});
