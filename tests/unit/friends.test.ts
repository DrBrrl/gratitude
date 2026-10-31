import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyInbox, applyReadState, emptyInbox } from '../../src/lib/friends/inbox.ts';
import { applyPair, applyProfile, cachedPairOrEmpty, emptyPair, emptyProfile, canHug, usernameKey, type PairEvent, type PairType } from '../../src/lib/friends/domain.ts';
const time = '2026-10-01T04:31:07.000Z';
function event(state: ReturnType<typeof emptyPair>, type: PairType, actor = 'alice', extra = {}): PairEvent {
  return { eventId: `event-${state.sequence + 1}`, schemaVersion: 1, sequence: state.sequence + 1, type, recordedAt: time, actorUid: actor, targetUid: actor === 'alice' ? 'bob' : 'alice', payload: { previousEventId: state.lastEventId, ...extra } };
}
test('friend profiles preserve literal inputs in source actions and normalize only the projection', () => {
  const source = { eventId: 'name', schemaVersion: 1 as const, sequence: 1, recordedAt: time, type: 'FriendProfileChosen' as const, actorUid: 'alice', payload: { username: ' @JaMie ', displayName: ' Jamie ', discoverable: true } };
  const projected = applyProfile(emptyProfile('alice'), source);
  assert.equal(projected.username, 'jamie'); assert.equal(projected.displayName, 'Jamie'); assert.equal(source.payload.username, ' @JaMie ');
  assert.equal(usernameKey('@JAMIE'), 'jamie');
  assert.throws(() => applyProfile(emptyProfile('alice'), { ...source, payload: { ...source.payload, username: '../../private' } }));
  assert.throws(() => applyProfile(emptyProfile('bob'), source));
});
test('only the recipient accepts; cached-tail application and complete replay produce the same friendship', () => {
  const initial = emptyPair('alice', 'bob');
  const request = event(initial, 'FriendRequestSent'); const pending = applyPair(initial, request);
  assert.throws(() => applyPair(pending, event(pending, 'FriendRequestAccepted')), /recipient/);
  const accepted = event(pending, 'FriendRequestAccepted', 'bob'); const friend = applyPair(pending, accepted);
  assert.equal(friend.status, 'accepted');
  const hugged = event(friend, 'HugSent'); const latest = applyPair(friend, hugged);
  assert.deepEqual([request, accepted, hugged].reduce(applyPair, emptyPair('alice', 'bob')), applyPair(structuredClone(friend), hugged));
  assert.equal(latest.hugs.length, 1); assert.throws(() => applyPair(latest, hugged));
  assert.throws(() => applyPair(pending, { ...accepted, targetUid: 'mallory' }));
});
test('hug permissions, a stable 24-hour limit and independent blocking are derived from actions', () => {
  let pair = emptyPair('alice', 'bob'); pair = applyPair(pair, event(pair, 'FriendRequestSent')); pair = applyPair(pair, event(pair, 'FriendRequestAccepted', 'bob'));
  pair = applyPair(pair, event(pair, 'HugPreferencesChosen', 'bob', { allowHugs: false }));
  assert.equal(canHug(pair, 'alice', Date.parse(time)), false); assert.throws(() => applyPair(pair, event(pair, 'HugSent')));
  pair = applyPair(pair, event(pair, 'HugPreferencesChosen', 'bob', { allowHugs: true })); pair = applyPair(pair, event(pair, 'HugSent'));
  assert.equal(canHug(pair, 'alice', Date.parse(time) + 86_399_999), false); assert.equal(canHug(pair, 'alice', Date.parse(time) + 86_400_000), true);
  const read={eventId:'private-read',schemaVersion:1 as const,type:'HugRead' as const,actorUid:'bob',sequence:1,recordedAt:time,payload:{pairId:'pair',hugId:pair.hugs[0].id}};
  assert.throws(()=>applyInbox(emptyInbox(),read,'alice'));
  const inbox=applyInbox(emptyInbox(),read,'bob');
  assert.equal(applyReadState({pair},inbox,'bob').pair.hugs[0].read,true);
  assert.equal(pair.hugs[0].read,false);
  pair = applyPair(pair, event(pair, 'FriendBlocked')); pair = applyPair(pair, event(pair, 'FriendBlocked', 'bob')); pair = applyPair(pair, event(pair, 'FriendUnblocked'));
  assert.equal(pair.blockedB, true); assert.equal(pair.status, 'none'); assert.throws(() => applyPair(pair, event(pair, 'FriendRequestSent')));
  assert.throws(() => applyPair(pair, event(pair, 'FriendUnblocked', 'alice', { status: 'accepted' })));
});

test('opaque stream IDs survive cache misses, source replay and private read-state joins without inherited object entries', () => {
 const initial=emptyPair('alice','bob'), request=event(initial,'FriendRequestSent'), canonical=applyPair(initial,request);
 const streams: Record<string,typeof canonical>=Object.create(null);
 for(const id of ['constructor','toString','__proto__']){
  const uncached=cachedPairOrEmpty({},id,canonical);
  assert.equal(uncached.sequence,0);
  streams[id]=applyPair(uncached,request);
 }
 const restored=applyReadState(JSON.parse(JSON.stringify(streams)),emptyInbox(),'bob');
 for(const id of Object.keys(streams)){
  assert.equal(Object.hasOwn(restored,id),true);
  assert.deepEqual(cachedPairOrEmpty(restored,id,canonical),canonical);
  assert.equal(cachedPairOrEmpty(restored,id,{...canonical,lastEventId:'different-source'}).sequence,0);
 }
 assert.equal(Object.hasOwn({},'status'),false);
});
