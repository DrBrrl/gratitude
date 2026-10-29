import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardDateTime, searchEntries } from '../../src/lib/journal.ts';
import { replay, STARTER_ID, type Photo } from '../../src/lib/domain.ts';

test('multiword search spans prompts, full reflections and live photo summaries', () => {
  const state = replay(Array.from({ length: 701 }, (_, i) => ({
    eventId: `search-${i}`, sequence: i + 1, type: 'ReflectionWritten' as const, schemaVersion: 1 as const,
    recordedAt: new Date(Date.UTC(2024, 0, i + 1, 2)).toISOString(),
    payload: { entryId: `search-${i}`, text: i === 0 ? 'A café with a friend.' : `Fictional moment ${i}.`, expectedRevision: 0, starterId: STARTER_ID }
  })));
  const photos = [
    { entryId: 'search-0', summary: 'A colourful rainbow.', removed: false },
    { entryId: 'search-1', summary: 'A café rainbow.', removed: true },
    { entryId: 'search-700', summary: 'A rainbow.', removed: false }
  ] as Photo[];
  assert.deepEqual(searchEntries(state.entries, 'CAFE rainbow friend', photos).map(e => e.id), ['search-0']);
  assert.deepEqual(searchEntries(state.entries, 'rainbow', photos).map(e => e.id), ['search-700', 'search-0']);
  assert.equal(searchEntries(state.entries, '', photos).length, 701);
  assert.equal(searchEntries(state.entries, '   ', photos)[0].id, 'search-700');
  assert.equal(state.entries[0].id, 'search-0', 'Searching does not reorder the projection');
});

test('card timestamps retain the requested local date, twelve-hour time and daylight-saving boundary', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Australia/Hobart';
    assert.equal(cardDateTime('2026-09-30T04:31:07Z'), 'Wed 30 Sep 2026, 2:31 PM');
    assert.equal(cardDateTime('2026-10-03T16:30:00Z'), 'Sun 04 Oct 2026, 3:30 AM');
    process.env.TZ = 'UTC';
    assert.equal(cardDateTime('2026-10-03T16:30:00Z'), 'Sat 03 Oct 2026, 4:30 PM');
    assert.equal(cardDateTime('2026-10-04T00:05:00Z'), 'Sun 04 Oct 2026, 12:05 AM');
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
