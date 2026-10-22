import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, STARTER_ID, parseAction, type JournalEvent, type Action } from '../../src/lib/domain.ts';
import { searchEntries, todayReflection, localDateTime } from '../../src/lib/journal.ts';
import { exportJournal } from '../../src/lib/export.ts';

process.env.TZ = 'Australia/Hobart';
const saved = '2026-10-01T04:31:07.000Z';
function dated(id: string, entryAt: string, expectedRevision = 0): Action {
  return { type: 'ReflectionWritten', schemaVersion: 3, eventId: `${id}-${expectedRevision}`, payload: { entryId: id, text: id, promptId: STARTER_ID, entryAt, expectedRevision } };
}
function log(actions: Action[]): JournalEvent[] { return actions.map((action, i) => ({ ...action, sequence: i + 1, recordedAt: saved })); }

test('backfills sort by chosen local time, multiple entries share a day, and replay preserves identity', () => {
  const events = log([dated('today', saved), dated('past', '2026-09-28T23:15:00.000Z'), dated('another', saved), dated('past', '2026-09-28T23:15:00.000Z', 1)]);
  const state = replay(events);
  assert.deepEqual(searchEntries(state.entries, '').map(e => e.id), ['another', 'today', 'past']);
  assert.deepEqual(state.entries.map(e => e.colour), [0, 1, 2]);
  assert.equal(todayReflection(state.entries, '2026-10-01').entry?.id, 'today');
  assert.equal(todayReflection(state.entries, '2026-09-29').entry?.id, 'past');
  assert.equal(todayReflection(replay(log([dated('past-only', '2026-09-28T23:15:00.000Z')])).entries, '2026-10-01').entry, undefined);
  assert.equal(localDateTime('2026-09-28T23:15:00.000Z'), '2026-09-29T09:15:00');
  assert.equal(localDateTime('2026-10-05T00:15:00.000Z'), '2026-10-05T11:15:00');
  for (let split = 0; split <= events.length; split++) assert.deepEqual(replay(events.slice(split), replay(events.slice(0, split))), state);
  const markdown = exportJournal(state, 'markdown').content;
  assert.deepEqual(markdown.match(/^## .+$/gm), ['## 2026-10-01 14:31:07', '## 2026-10-01 14:31:07', '## 2026-09-29 09:15:00']);
  const archive = JSON.parse(exportJournal(state, 'json').content);
  assert.equal(archive.version, 2);
  assert.equal(archive.entries[2].entryAt, '2026-09-28T23:15:00.000Z');
  assert.equal(archive.entries[2].createdAt, saved);
});

test('legacy source schemas retain date immutability and reject future dates', () => {
  const old: Action = { eventId: 'old', type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId: 'old', text: 'Old', expectedRevision: 0, starterId: STARTER_ID } };
  assert.equal(replay(log([old])).entries[0].recordedAt, saved);
  const sameSecond = replay([{ ...old, sequence: 1, recordedAt: '2026-10-01T04:31:07.900Z' }, { ...dated('next', saved), sequence: 2, recordedAt: '2026-10-01T04:31:07.999Z' }]);
  assert.deepEqual(searchEntries(sameSecond.entries, '').map(entry => entry.id), ['next', 'old']);
  assert.throws(() => parseAction(dated('bad-date', '2026-02-30T00:00:00.000Z')), /Invalid action/);
  assert.throws(() => replay(log([dated('future', '2026-10-02T00:00:00.000Z')])), /future/);
  assert.throws(() => replay(log([dated('entry', saved), dated('entry', '2026-09-30T00:00:00.000Z', 1)])), /original entry date/);
  assert.throws(() => replay(log([dated('entry', saved), { ...old, payload: { ...old.payload, entryId: 'entry', expectedRevision: 1 } } as Action])), /original entry date/);
});

test('schema 6 date edits update ordering and Today while preserving identity, creation time, colour and replay', () => {
  const first = dated('entry', '2026-09-28T23:15:00.000Z');
  const other = dated('other', '2026-09-29T23:15:00.000Z');
  const changed: Action = { type: 'ReflectionWritten', schemaVersion: 6, eventId: 'date-edit', payload: { entryId: 'entry', expectedRevision: 1, text: 'entry', promptId: STARTER_ID, promptText: null, entryAt: '2026-09-30T23:15:00.000Z', photoSlot: null } };
  const events = log([first, other, changed]); const state = replay(events);
  assert.equal(todayReflection(state.entries, '2026-10-01').entry?.id, 'entry');
  assert.deepEqual(searchEntries(state.entries, '').map(entry => entry.id), ['entry', 'other']);
  assert.equal(state.entries[0].recordedAt, saved); assert.equal(state.entries[0].colour, 0); assert.equal(state.entries[0].revision, 2);
  for (let split = 0; split <= events.length; split++) assert.deepEqual(replay(events.slice(split), replay(events.slice(0, split))), state);
  const movedBack = replay([...events, { ...changed, eventId: 'move-back', sequence: 4, recordedAt: saved, payload: { ...changed.payload, expectedRevision: 2, entryAt: '2026-09-28T23:15:00.000Z' } } as JournalEvent]);
  assert.equal(todayReflection(movedBack.entries, '2026-10-01').entry, undefined);
  assert.deepEqual(searchEntries(movedBack.entries, '').map(entry => entry.id), ['other', 'entry']);
  const archive = JSON.parse(exportJournal(state, 'json').content);
  assert.equal(archive.entries[0].entryAt, changed.payload.entryAt); assert.equal(archive.entries[0].createdAt, saved);
  assert.throws(() => replay(log([first, { ...changed, payload: { ...changed.payload, expectedRevision: 0 } }])), /revision/);
  assert.throws(() => replay(log([first, { ...changed, payload: { ...changed.payload, entryAt: '2026-10-02T00:00:00.000Z' } }])), /future/);
});
