import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexCalendarDays } from '../../src/lib/calendar.ts';
import { indexCalendarPhotos } from '../../src/lib/calendar-photos.ts';
import { replay, STARTER_ID, type JournalEvent, type Photo } from '../../src/lib/domain.ts';

const events: JournalEvent[] = ['first', 'later', 'text-only'].map((id, i) => ({
  eventId: id, type: 'ReflectionWritten', schemaVersion: 3, sequence: i + 1,
  recordedAt: '2026-10-01T04:31:07Z',
  payload: { entryId: id, expectedRevision: 0, text: id, promptId: STARTER_ID, entryAt: `2026-09-30T0${i}:00:00.000Z` }
}));
const photo = (entryId: string, photoId: string, slot: number, removed = false): Photo => ({ entryId, photoId, slot, removed, lastEventId: photoId, summary: '', origin: 'none', status: 'idle' });
test('calendar photos choose the newest dated entry with live pictures and its first occupied slot', () => {
  const entries = replay(events).entries;
  const photos = [photo('first', 'old', 0), photo('later', 'second-slot', 2), photo('later', 'removed', 0, true), photo('later', 'chosen', 1), photo('unsaved', 'draft', 0)];
  const index = indexCalendarDays(entries, 'UTC');
  assert.deepEqual([...indexCalendarPhotos(index, photos)], [['2026-09-30', 'chosen']]);
  assert.deepEqual([...indexCalendarPhotos(index, photos.map(p => p.entryId === 'later' ? { ...p, removed: true } : p))], [['2026-09-30', 'old']]);
  assert.equal(indexCalendarPhotos(index, photos.map(p => ({ ...p, removed: true }))).size, 0);
  const moved = entries.map(entry => entry.id === 'later' ? { ...entry, entryAt: '2026-09-29T23:30:00Z' } : entry);
  assert.deepEqual([...indexCalendarPhotos(indexCalendarDays(moved, 'UTC'), photos)].sort(), [['2026-09-29', 'chosen'], ['2026-09-30', 'old']]);
  assert.deepEqual([...indexCalendarPhotos(indexCalendarDays(moved, 'Australia/Hobart'), photos)], [['2026-09-30', 'old']]);
});
