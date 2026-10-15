import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, emptyProjection, STARTER_ID, entryPhotos, parseAction, type SourceAction, type JournalEvent, type PhotoAction } from '../../src/lib/domain.ts';
import { searchEntries } from '../../src/lib/journal.ts';
import { exportArchive } from '../../src/lib/export.ts';
import { unzipSync, strFromU8 } from 'fflate';
const at = '2026-10-01T04:31:07.000Z';
const attached: PhotoAction = { eventId: 'attach', type: 'PhotoAttached', schemaVersion: 1, payload: { entryId: 'entry', slot: 0, photoId: 'photo', previousEventId: null } };
const requested: PhotoAction = { eventId: 'request', type: 'PhotoSummaryRequested', schemaVersion: 1, payload: { ...attached.payload, previousEventId: 'attach' } };
const received: PhotoAction = { eventId: 'request_response', type: 'PhotoSummaryResponseReceived', schemaVersion: 1, payload: { ...requested.payload, previousEventId: 'request', text: 'A yellow mug beside a window.', model: 'fixture-model', finishReason: 'STOP' } };
const written: SourceAction = { eventId: 'write', type: 'ReflectionWritten', schemaVersion: 4, payload: { entryId: 'entry', text: '', promptId: STARTER_ID, entryAt: at, photoSlot: 0, expectedRevision: 0 } };
const edited: PhotoAction = { eventId: 'manual', type: 'PhotoSummaryEdited', schemaVersion: 1, payload: { ...requested.payload, previousEventId: 'request_response', text: 'A turquoise café cup.' } };
function log(actions: SourceAction[]): JournalEvent[] { return actions.map((action, i) => ({ ...action, sequence: i + 1, recordedAt: at })); }

test('photo-only reflections replay exact AI output, manual corrections and searchable descriptions', async () => {
  const events = log([attached, requested, received, written, edited]);
  const state = replay(events);
  assert.equal(state.entries[0].text, '');
  assert.equal(entryPhotos(state, 'entry')[0].summary, 'A turquoise café cup.');
  assert.equal(searchEntries(state.entries, 'cafe turquoise', Object.values(state.photos)).length, 1);
  assert.equal(searchEntries(state.entries, 'yellow', Object.values(state.photos)).length, 0);
  const cleared = replay(log([attached, requested, received, written, edited, { ...edited, eventId: 'clear', payload: { ...edited.payload, previousEventId: 'manual', text: '' } }]));
  assert.equal(searchEntries(cleared.entries, 'turquoise', Object.values(cleared.photos)).length, 0);
  assert.equal(entryPhotos(cleared, 'entry').length, 1);
  for (let i = 0; i <= events.length; i++) assert.deepEqual(replay(events.slice(i), replay(events.slice(0, i))), state);
  let reads = 0;
  const archive = await exportArchive(state, 'markdown', async () => { reads++; return new Blob(['photo bytes']); });
  assert.equal(archive.type, 'application/zip'); assert.equal(reads, 1);
  const files = unzipSync(archive.content as Uint8Array);
  assert.equal(strFromU8(files['attachments/photo.jpg']), 'photo bytes');
  assert.match(strFromU8(files['gratitude-journal.md']), /Image summary\*\*: A turquoise café cup/);
  await assert.rejects(exportArchive(state, 'json', async () => { throw new Error('Photo unavailable'); }), /Photo unavailable/);
});

test('late image results cannot overwrite manual text, removed photos or replacement photos', () => {
  const correction = { ...edited, payload: { ...edited.payload, previousEventId: 'request' } };
  assert.throws(() => replay(log([attached, requested, correction, received])), /photo changed/);
  assert.throws(() => replay(log([written])), /attach a photo/);
  assert.throws(() => replay(log([attached, written, { eventId: 'remove', type: 'PhotoRemoved', schemaVersion: 1, payload: { ...requested.payload, previousEventId: 'attach' } }])), /last photo/);
  const text: SourceAction = { eventId: 'text', type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId: 'entry', text: 'My cup', starterId: STARTER_ID, expectedRevision: 0 } };
  const remove: PhotoAction = { eventId: 'remove', type: 'PhotoRemoved', schemaVersion: 1, payload: { ...requested.payload, previousEventId: 'request' } };
  const state = replay(log([text, attached, requested, remove]));
  assert.equal(entryPhotos(state, 'entry').length, 0);
  assert.equal(searchEntries(state.entries, 'yellow', Object.values(state.photos)).length, 0);

  assert.throws(() => replay(log([text, attached, requested, remove, received])), /photo changed/);
  assert.throws(() => parseAction({ ...attached, payload: { ...attached.payload, slot: 4 } }), /Invalid action/);
  assert.throws(() => parseAction({ ...received, payload: { ...received.payload, text: 'x'.repeat(1001) } }), /Invalid action/);
  assert.throws(() => parseAction({ ...attached, payload: { ...attached.payload, colour: 2 } }), /Invalid action/);
  assert.deepEqual(emptyProjection().photos, {});
});
