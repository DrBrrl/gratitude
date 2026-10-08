import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, todayReflection } from '../../src/lib/journal.ts';
import { replay, STARTER_ID, type JournalEvent } from '../../src/lib/domain.ts';

process.env.TZ = 'Australia/Hobart';
function event(sequence: number, entryId: string, recordedAt: string, expectedRevision = 0): JournalEvent {
  return { sequence, recordedAt, eventId: `event-${sequence}`, type: 'ReflectionWritten', schemaVersion: 1,
    payload: { entryId, expectedRevision, starterId: STARTER_ID, text: `Reflection ${sequence}` } };
}

test('Today uses local calendar dates, including the UTC boundary', () => {
  assert.equal(localDay('2026-09-30T15:00:00Z'), '2026-10-01');
  assert.equal(localDay('2026-09-30T13:59:00Z'), '2026-09-30');
});

test('Today keeps its colour through saving, continuing and historical edits', () => {
  const history = [event(1, 'yesterday', '2026-09-30T04:00:00Z')];
  const before = todayReflection(replay(history).entries, '2026-10-01');
  assert.equal(before.entry, undefined);
  assert.equal(before.colour, 1);
  history.push(event(2, 'today', '2026-10-01T04:00:00Z'));
  const saved = todayReflection(replay(history).entries, '2026-10-01');
  assert.equal(saved.entry?.id, 'today');
  assert.equal(saved.colour, before.colour);
  history.push(event(3, 'yesterday', '2026-10-01T04:01:00Z', 1));
  history.push(event(4, 'today', '2026-10-01T04:02:00Z', 1));
  const edited = todayReflection(replay(history).entries, '2026-10-01');
  assert.equal(edited.entry?.id, 'today');
  assert.equal(edited.entry?.revision, 2);
  assert.equal(edited.colour, before.colour);
  assert.equal(todayReflection(replay(history).entries, '2026-10-02').entry, undefined);
  assert.equal(todayReflection(replay(history).entries, '2026-10-02').colour, 2);
});
