import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, parseAction, STARTER_ID, type Action, type SourceAction, type JournalEvent } from '../../src/lib/domain.ts';
import { makeRequest } from '../../src/lib/ai/context.ts';
import { exportJournal } from '../../src/lib/export.ts';
const at = '2026-10-01T04:31:07.000Z';
const log = (actions: SourceAction[]): JournalEvent[] => actions.map((action, index) => ({ ...action, sequence: index + 1, recordedAt: at }));
function reflection(eventId: string, promptId: string, promptText: string | null, expectedRevision = 0): Extract<Action, { schemaVersion: 5 }> {
  return { eventId, type: 'ReflectionWritten', schemaVersion: 5, payload: { entryId: 'entry', text: 'A quiet moment.', expectedRevision, promptId, promptText, entryAt: null, photoSlot: null } };
}
test('manual questions are literal source input, revisioned with reflections and replayed exactly', () => {
  const original = reflection('original', STARTER_ID, null);
  const manual = reflection('manual', 'manual', ' What colour brightened my afternoon?\n', 1);
  const later = reflection('later', 'manual', null, 2);
  const events = log([original, manual, later]); const state = replay(events);
  assert.equal(state.entries[0].prompt, manual.payload.promptText);
  assert.equal(state.entries[0].colour, 0); assert.equal(state.entries[0].recordedAt, at);
  for (let cut = 0; cut <= events.length; cut++) assert.deepEqual(replay(events.slice(cut), replay(events.slice(0, cut))), state);
  assert.ok(exportJournal(state, 'markdown').content.includes('What colour brightened my afternoon?'));
  assert.throws(() => parseAction(reflection('bad', 'manual', 'Copied prompt snapshot', 3)));
  assert.throws(() => parseAction(reflection('bad', 'bad', '   ', 3)));
  assert.throws(() => parseAction(reflection('bad', 'bad', 'x'.repeat(601), 3)));
  assert.throws(() => replay(log([original, reflection('bad', 'missing', null, 1)])), /Missing prompt/);
});
test('editor AI requests keep Today selection separate and exact responses can replace saved prompts', () => {
  const choices: SourceAction = { eventId: 'choices', type: 'AIChoicesConfirmed', schemaVersion: 1, payload: { previousEventId: null, enabled: true, useJournal: false, useFeedback: false, guidance: '' } };
  const base = replay(log([choices, reflection('original', STARTER_ID, null)]));
  const request = makeRequest(base, '2026-10-01', 'generic', 'editor-request', 'entry');
  assert.equal(request.schemaVersion, 2);
  const response: SourceAction = { eventId: 'editor-request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: request.eventId, text: 'What sound brought you comfort?', model: 'fictional-model', finishReason: 'STOP' } };
  const events = log([choices, reflection('original', STARTER_ID, null), request, response, reflection('edited', response.eventId, null, 1)]);
  const state = replay(events);
  assert.deepEqual(state.ai.days, {}); assert.equal(state.entries[0].prompt, response.payload.text);
  assert.deepEqual(replay(events.slice(3), replay(events.slice(0, 3))), state);
  assert.throws(() => parseAction({ ...request, payload: { ...request.payload, computedPrompt: 'A snapshot' } }));
});
