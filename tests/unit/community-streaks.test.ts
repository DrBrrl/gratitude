import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usernameFragments, searchFragment } from '../../src/lib/friends/search.ts';
import { communityStreak, gratitudeDays, streakSummary, emptySharing, applySharing, type SharingAction } from '../../src/lib/friends/streaks.ts';
import type { Entry } from '../../src/lib/domain.ts';
test('username discovery indexes interior matches as well as prefixes, with bounded distinct fragments', () => {
  for (const name of ['jamie_spanou', 'testing_jamie']) assert.ok(usernameFragments(name).includes(searchFragment(' @JAM ')));
  assert.equal(usernameFragments('abcdefghijklmnopqrstuvwx').length, 253);
  assert.equal(new Set(usernameFragments('aaaaaa')).size, 4);
  assert.throws(() => searchFragment('ja')); assert.throws(() => searchFragment('jam friend'));
});
test('shared and community streaks follow logical entry dates, deduplicate entries and repair after backfill', () => {
  const entry = (id: string, day: string): Entry => ({ id, entryAt: `${day}T01:00:00Z`, recordedAt: '2026-11-01T12:00:00Z', text: 'Fictional reflection.', prompt: 'A fictional question.', revision: 1, colour: 0 });
  const own = gratitudeDays([entry('old', '2026-10-28'), entry('new', '2026-10-30'), entry('same', '2026-10-30'), entry('today', '2026-10-31')], 'Australia/Hobart');
  assert.deepEqual(own, ['2026-10-28', '2026-10-30', '2026-10-31']);
  const peer = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
  assert.equal(communityStreak(own, peer, '2026-11-01').current, 2);
  assert.equal(communityStreak([...own, '2026-10-29'], peer, '2026-11-01').current, 4);
  assert.equal(communityStreak(own, peer, '2026-11-02').current, 0);
  assert.equal(communityStreak(own, peer, '2026-11-02').longest, 2);
  assert.equal(streakSummary(peer, '2026-11-01').current, 4);
});
test('sharing consent is a literal action with replayable state; withdrawing it hides the shared timezone', () => {
  const input: SharingAction = { eventId: 'share', type: 'GratitudeSharingChosen', schemaVersion: 1, actorUid: 'alice', sequence: 1, recordedAt: '2026-11-01T10:00:00Z', payload: { previousEventId: null, enabled: true, timeZone: 'Australia/Hobart' } };
  const first = applySharing(emptySharing('alice'), input);
  assert.equal(first.enabled, true);
  const off = { ...input, eventId: 'hide', sequence: 2, payload: { ...input.payload, previousEventId: 'share', enabled: false } };
  assert.deepEqual(applySharing(first, off), [input, off].reduce(applySharing, emptySharing('alice')));
  assert.equal(applySharing(first, off).timeZone, null);
  assert.throws(() => applySharing(first, { ...off, payload: { ...off.payload, previousEventId: null } }));
  assert.throws(() => applySharing(emptySharing('alice'), { ...input, payload: { ...input.payload, timeZone: 'Not/A_Zone' } }));
});

import { applyPair, emptyPair, canHug, huggedToday, type PairEvent } from '../../src/lib/friends/domain.ts';
test('one hug per local calendar day resets at midnight, handles DST and cannot repeat a date', () => {
  let pair = emptyPair('alice','bob');
  const act = (type: PairEvent['type'], at: string, actor = 'alice', offset?: number) => {
    const event: PairEvent = {eventId:`step-${pair.sequence}`,schemaVersion:offset===undefined?1:2,sequence:pair.sequence+1,recordedAt:at,type,actorUid:actor,targetUid:actor==='alice'?'bob':'alice',payload:{previousEventId:pair.lastEventId,...(offset===undefined?{}:{utcOffsetMinutes:offset})}};
    pair=applyPair(pair,event);return event;
  };
  act('FriendRequestSent','2026-10-30T00:00:00Z');act('FriendRequestAccepted','2026-10-30T00:01:00Z','bob');
  const first=act('HugSent','2026-10-31T12:59:00Z','alice',660); // 23:59 Hobart
  assert.equal(canHug(pair,'alice',Date.parse('2026-10-31T12:59:59Z'),660),false);
  assert.equal(huggedToday(pair,'alice',Date.parse('2026-10-31T12:59:59Z'),660),true);
  assert.equal(canHug(pair,'alice',Date.parse('2026-10-31T13:00:00Z'),660),true);
  assert.equal(huggedToday(pair,'alice',Date.parse('2026-10-31T13:00:00Z'),660),false);
  act('HugSent','2026-10-31T13:00:00Z','alice',660);
  assert.equal(canHug(pair,'alice',Date.parse('2026-10-31T14:00:00Z'),660),false);
  assert.equal(canHug(pair,'alice',Date.parse('2026-11-01T13:00:00Z'),660),true);
  assert.throws(()=>applyPair(pair,{...first,eventId:'bad-offset',sequence:pair.sequence+1,recordedAt:'2026-11-02T13:00:00Z',payload:{previousEventId:pair.lastEventId,utcOffsetMinutes:900}}));
  assert.throws(()=>applyPair(pair,{...first,schemaVersion:1,eventId:'downgrade',sequence:pair.sequence+1,recordedAt:'2026-11-02T13:00:00Z',payload:{previousEventId:pair.lastEventId}}));
  const dst={...pair,lastHugA:'2026-11-01T04:59:00Z',lastHugOffsetA:-240}; // 00:59 before US fallback
  assert.equal(canHug(dst,'alice',Date.parse('2026-11-01T06:01:00Z'),-300),false);
  assert.equal(canHug(dst,'alice',Date.parse('2026-11-02T05:00:00Z'),-300),true);
});
