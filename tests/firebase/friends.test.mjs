import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, orderBy, where, setDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { saveFriendProfile, appendFriendAction, acknowledgeHug } from '../../src/lib/friends/repository.ts';
import { applyInbox, applyReadState, emptyInbox } from '../../src/lib/friends/inbox.ts';
import { applyPair, emptyPair, pairHead } from '../../src/lib/friends/domain.ts';
let env;
const db = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const profile = (username, displayName = username, discoverable = true) => ({ username, displayName, discoverable });
const command = (eventId, type, targetUid, extra = {}) => ({ eventId, type, targetUid, ...extra });
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gratitude', firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') } }); });
after(async () => { await env?.cleanup(); });

test('atomic username claims are case insensitive; profile history is private and names can change without changing identity', async () => {
  const a = db('social-a'), b = db('social-b');
  const results = await Promise.allSettled([saveFriendProfile(a, 'social-a', profile(' @Jamie ', 'Jamie'), 'claim-a'), saveFriendProfile(b, 'social-b', profile('JAMIE', 'Other'), 'claim-b')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const winner = results[0].status === 'fulfilled' ? 'social-a' : 'social-b', owner = db(winner), other = winner === 'social-a' ? b : a;
  await saveFriendProfile(owner, winner, winner === 'social-a' ? profile(' @Jamie ', 'Jamie') : profile('JAMIE', 'Other'), winner === 'social-a' ? 'claim-a' : 'claim-b');
  await assertSucceeds(getDoc(doc(other, 'friendUsernames/jamie')));
  await assertFails(getDocs(collection(other, 'friendUsernames')));
  await assertFails(getDocs(collection(other, `friendProfiles/${winner}/events`)));
  await assertFails(getDocs(collection(other, 'friendProfiles')));
  await saveFriendProfile(owner, winner, profile('new_name', 'New name'), 'rename');
  assert.equal((await getDoc(doc(owner, `friendProfiles/${winner}`))).get('uid'), winner);
  assert.equal((await getDoc(doc(owner, 'friendUsernames/jamie'))).exists(), false);
  await assertFails(setDoc(doc(other, 'friendUsernames/new_name'), { uid: winner }));
  await assertFails(deleteDoc(doc(owner, 'friendUsernames/new_name')));
  await assertFails(setDoc(doc(owner, `friendProfiles/${winner}`), { uid: winner, username: 'forged', displayName: 'Forged', discoverable: true, sequence: 99, lastEventId: 'rename' }));
});

test('requests, hugs, private acknowledgements and revocation are enforced independently of the client; source replay reproduces state', async () => {
  const a = db('friends-alice'), b = db('friends-bob'), outsider = db('friends-mallory');
  await saveFriendProfile(a, 'friends-alice', profile('alice_friend'), 'profile-alice'); await saveFriendProfile(b, 'friends-bob', profile('bob_friend'), 'profile-bob');
  const pair = await appendFriendAction(a, 'friends-alice', command('request', 'FriendRequestSent', 'friends-bob'));
  assert.equal(await appendFriendAction(a, 'friends-alice', command('request', 'FriendRequestSent', 'friends-bob')), pair);
  await assert.rejects(appendFriendAction(a, 'friends-alice', command('self-accept', 'FriendRequestAccepted', 'friends-bob')));
  await assertFails(getDoc(doc(outsider, `friendPairs/${pair}`)));
  await assertFails(getDocs(collection(outsider, `friendPairs/${pair}/events`)));
  await assertFails(getDocs(collection(b, 'users/friends-alice/streams/v1/events')));
  const pending = (await getDoc(doc(a, `friendPairs/${pair}`))).data();
  const forged = writeBatch(a);
  forged.set(doc(a, `friendPairs/${pair}`), {...pending, sequence:pending.sequence+1,lastEventId:'forged-accept',status:'accepted',requesterUid:null});
  forged.set(doc(a, `friendPairs/${pair}/events/forged-accept`),{eventId:'forged-accept',type:'FriendRequestAccepted',actorUid:'friends-alice',targetUid:'friends-bob',schemaVersion:1,sequence:pending.sequence+1,recordedAt:serverTimestamp(),payload:{previousEventId:pending.lastEventId}});
  await assertFails(forged.commit());
  await appendFriendAction(b, 'friends-bob', command('accept', 'FriendRequestAccepted', 'friends-alice'));
  // Acceptance grants social contact, never access to a journal or credentials.
  await assertFails(getDocs(collection(b, 'users/friends-alice/streams/v1/events')));
  await assertFails(getDoc(doc(b, 'users/friends-alice/privateSettings/lmStudio')));
  await appendFriendAction(b, 'friends-bob', command('pause', 'HugPreferencesChosen', 'friends-alice', { allowHugs: false }));
  await assert.rejects(appendFriendAction(a, 'friends-alice', command('paused-hug', 'HugSent', 'friends-bob')));
  await appendFriendAction(b, 'friends-bob', command('resume', 'HugPreferencesChosen', 'friends-alice', { allowHugs: true }));
  await appendFriendAction(a, 'friends-alice', command('hug', 'HugSent', 'friends-bob'));
  await assert.rejects(appendFriendAction(a, 'friends-alice', command('second-hug', 'HugSent', 'friends-bob')));
  await acknowledgeHug(b,'friends-bob',pair,'hug','read');
  await assertFails(getDocs(collection(a,'friendInboxes/friends-bob/events')));
  await assertFails(getDoc(doc(a,'friendInboxes/friends-bob')));
  await assert.rejects(acknowledgeHug(a,'friends-alice',pair,'hug','forged-own-read'));
  const log = await getDocs(query(collection(a, `friendPairs/${pair}/events`), orderBy('sequence')));
  const events = log.docs.map(d => ({ ...d.data(), recordedAt: d.get('recordedAt').toDate().toISOString() }));
  const replayed = events.reduce(applyPair, emptyPair('friends-alice', 'friends-bob'));
  assert.equal(replayed.status, 'accepted'); assert.equal(replayed.hugs.length, 1); assert.equal(replayed.hugs[0].read, false);
  const readLog=await getDocs(query(collection(b,'friendInboxes/friends-bob/events'),orderBy('sequence')));
  const privateInbox=readLog.docs.map(d=>({...d.data(),recordedAt:d.get('recordedAt').toDate().toISOString()})).reduce((state,e)=>applyInbox(state,e,'friends-bob'),emptyInbox());
  assert.equal(applyReadState({[pair]:replayed},privateInbox,'friends-bob')[pair].hugs[0].read,true);
  // A forged head cannot reset the server-enforced cooldown or source pointer.
  const stored = (await getDoc(doc(a, `friendPairs/${pair}`))).data();
  await assertFails(setDoc(doc(a, `friendPairs/${pair}`), { ...stored, lastHugA: null }));
  const bypass = writeBatch(a);
  bypass.set(doc(a, `friendPairs/${pair}`), {...stored,sequence:stored.sequence+1,lastEventId:'bypass-hug',lastHugA:serverTimestamp()});
  bypass.set(doc(a, `friendPairs/${pair}/events/bypass-hug`),{eventId:'bypass-hug',type:'HugSent',actorUid:'friends-alice',targetUid:'friends-bob',schemaVersion:1,sequence:stored.sequence+1,recordedAt:serverTimestamp(),payload:{previousEventId:stored.lastEventId}});
  await assertFails(bypass.commit());
  await assertFails(setDoc(doc(a, `friendPairs/${pair}/events/hug`), { ...events.find(e => e.eventId === 'hug'), recordedAt: serverTimestamp() }));
  await appendFriendAction(b, 'friends-bob', command('block', 'FriendBlocked', 'friends-alice'));
  await assert.rejects(appendFriendAction(a, 'friends-alice', command('after-block', 'HugSent', 'friends-bob')));
  await assert.rejects(appendFriendAction(a, 'friends-alice', command('wrong-unblock', 'FriendUnblocked', 'friends-bob')));
  await appendFriendAction(b, 'friends-bob', command('unblock', 'FriendUnblocked', 'friends-alice'));
  assert.equal((await getDoc(doc(a, `friendPairs/${pair}`))).get('status'), 'none');
});

test('hidden profiles, anonymous discovery and pair aliases cannot be used to bypass friendship consent', async () => {
  const a = db('hidden-a'), b = db('hidden-b');
  await saveFriendProfile(a, 'hidden-a', profile('hidden_one', 'Hidden', false), 'hidden-profile');
  await saveFriendProfile(b, 'hidden-b', profile('visible_two'), 'visible-profile');
  await assertFails(getDoc(doc(b, 'friendProfiles/hidden-a')));
  await assertFails(getDoc(doc(b, 'friendUsernames/hidden_one')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'friendUsernames/visible_two')));
  await assert.rejects(appendFriendAction(b, 'hidden-b', command('hidden-request', 'FriendRequestSent', 'hidden-a')));
  await assertFails(setDoc(doc(b, 'friendLinks/hidden-b/peers/hidden-a'), { pairId: 'invented' }));
  await assertFails(setDoc(doc(b, 'friendPairs/invented'), { members: ['hidden-b','hidden-a'], status: 'accepted' }));
  await saveFriendProfile(a, 'hidden-a', profile('hidden_one', 'Hidden', true), 'show-profile');
  const ids = await Promise.allSettled([appendFriendAction(a, 'hidden-a', command('cross-a', 'FriendRequestSent', 'hidden-b')), appendFriendAction(b, 'hidden-b', command('cross-b', 'FriendRequestSent', 'hidden-a'))]);
  assert.equal(ids.filter(r => r.status === 'fulfilled').length, 1);
  const pairs = await getDocs(query(collection(a, 'friendPairs'), where('members','array-contains','hidden-a')));
  assert.equal(pairs.size, 1);
});


test('unrelated friendship actions preserve sub-millisecond canonical timestamp precision', async () => {
  const a = db('precision-a'), b = db('precision-b');
  await saveFriendProfile(a,'precision-a',profile('precision_alice'),'precision-profile-a');
  await saveFriendProfile(b,'precision-b',profile('precision_bob'),'precision-profile-b');
  const id=await appendFriendAction(a,'precision-a',command('precision-request','FriendRequestSent','precision-b'));
  await appendFriendAction(b,'precision-b',command('precision-accept','FriendRequestAccepted','precision-a'));
  await appendFriendAction(a,'precision-a',command('precision-hug','HugSent','precision-b'));
  const canonical=(await getDoc(doc(a,`friendPairs/${id}`))).data();
  const requestAt=new Timestamp(canonical.requestedAt.seconds-172800,123456000);
  const hugAt=new Timestamp(canonical.lastHugA.seconds-3600,987654000);
  // Historical source fixtures retain real Firestore microseconds, unlike the
  // whole-second emulator clock. Derive their matching operational head fields.
  await env.withSecurityRulesDisabled(async context=>{
    const fixture=context.firestore(), batch=writeBatch(fixture);
    const request=(await getDoc(doc(fixture,`friendPairs/${id}/events/precision-request`))).data();
    const hug=(await getDoc(doc(fixture,`friendPairs/${id}/events/precision-hug`))).data();
    batch.set(doc(fixture,`friendPairs/${id}/events/precision-request`),{...request,recordedAt:requestAt});
    batch.set(doc(fixture,`friendPairs/${id}/events/precision-hug`),{...hug,recordedAt:hugAt});
    batch.set(doc(fixture,`friendPairs/${id}`),{...canonical,requestedAt:requestAt,lastHugA:hugAt});
    await batch.commit();
  });
  await appendFriendAction(b,'precision-b',command('precision-pause','HugPreferencesChosen','precision-a',{allowHugs:false}));
  await acknowledgeHug(b,'precision-b',id,'precision-hug','precision-read');
  const latest=await getDoc(doc(b,`friendPairs/${id}`));
  assert.ok(latest.get('requestedAt').isEqual(requestAt));assert.ok(latest.get('lastHugA').isEqual(hugAt));
});


test('blocking a discovered account needs no prior request and rejects path-like source references', async () => {
 const a=db('first-block-a'),b=db('first-block-b');
 await saveFriendProfile(a,'first-block-a',profile('block_first_a'),'block-profile-a');await saveFriendProfile(b,'first-block-b',profile('block_first_b'),'block-profile-b');
 const id=await appendFriendAction(a,'first-block-a',command('block-first','FriendBlocked','first-block-b'));
 const head=(await getDoc(doc(a,`friendPairs/${id}`))).data();assert.equal(head.status,'none');assert.equal(head.blockedA,true);
 await assert.rejects(appendFriendAction(b,'first-block-b',command('blocked-request','FriendRequestSent','first-block-a')));
 const forged=writeBatch(a);forged.set(doc(a,`friendPairs/${id}`),{...head,sequence:head.sequence+1,lastEventId:'path-read'});
 forged.set(doc(a,`friendPairs/${id}/events/path-read`),{eventId:'path-read',schemaVersion:1,type:'HugRead',actorUid:'first-block-a',targetUid:'first-block-b',sequence:head.sequence+1,recordedAt:serverTimestamp(),payload:{previousEventId:head.lastEventId,hugId:'../../other/events/hug'}});
 await assertFails(forged.commit());
});

test('a valid participant can choose an opaque pair ID that collides with JavaScript object inheritance', async()=>{
 const a=db('opaque-id-a'),b=db('opaque-id-b');
 await saveFriendProfile(a,'opaque-id-a',profile('opaque_sender'),'opaque-profile-a');await saveFriendProfile(b,'opaque-id-b',profile('opaque_recipient'),'opaque-profile-b');
 const event={eventId:'opaque-request',schemaVersion:1,type:'FriendRequestSent',actorUid:'opaque-id-a',targetUid:'opaque-id-b',sequence:1,recordedAt:'2026-10-01T04:31:07.000Z',payload:{previousEventId:null}};
 const head=pairHead(applyPair(emptyPair('opaque-id-a','opaque-id-b'),event));
 const batch=writeBatch(a);
 batch.set(doc(a,'friendPairs/constructor'),{...head,requestedAt:serverTimestamp()});
 batch.set(doc(a,'friendPairs/constructor/events/opaque-request'),{...event,recordedAt:serverTimestamp()});
 batch.set(doc(a,'friendLinks/opaque-id-a/peers/opaque-id-b'),{pairId:'constructor'});
 batch.set(doc(a,'friendLinks/opaque-id-b/peers/opaque-id-a'),{pairId:'constructor'});
 await assertSucceeds(batch.commit());
 assert.equal((await getDoc(doc(b,'friendPairs/constructor'))).get('status'),'pending');
});
