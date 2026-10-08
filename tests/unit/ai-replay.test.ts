import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProjection, replay, parseAction, STARTER_ID, type SourceAction, type JournalEvent } from '../../src/lib/domain.ts';
import { makeRequest, buildContext } from '../../src/lib/ai/context.ts';
const time = '2026-10-01T04:31:07.000Z';
const choices: SourceAction = { eventId: 'choices', type: 'AIChoicesConfirmed', schemaVersion: 1, payload: { previousEventId: null, enabled: true, useJournal: true, useFeedback: true, guidance: 'Everyday kindness' } };
function events(actions: SourceAction[]): JournalEvent[] { return actions.map((action, index) => ({ ...action, recordedAt: time, sequence: index + 1 })); }

test('exact AI output and prompt identity survive full/cached replay and edits without an AI dependency', () => {
  const request = makeRequest(replay(events([choices])), '2026-10-01', 'personal', 'request');
  const actions: SourceAction[] = [choices, request,
    { eventId: 'request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: 'request', text: ' What small kindness did you notice?\n', model: 'gemini-recorded-version', finishReason: 'STOP' } },
    { eventId: 'save', type: 'ReflectionWritten', schemaVersion: 2, payload: { entryId: 'entry', text: 'A cup of tea.', expectedRevision: 0, promptId: 'request_response' } },
    { eventId: 'edit', type: 'ReflectionWritten', schemaVersion: 2, payload: { entryId: 'entry', text: 'A shared cup of tea.', expectedRevision: 1, promptId: 'request_response' } }
  ];
  const log = events(actions); const full = replay(log);
  assert.equal(full.entries[0].prompt, ' What small kindness did you notice?\n');
  for (let cut = 0; cut <= log.length; cut++) assert.deepEqual(replay(log.slice(cut), replay(log.slice(0, cut))), full);
  assert.equal(replay(log.slice(0, 2)).ai.control.requestId, 'request');
  assert.throws(() => replay(events([...actions, { eventId: 'bad-edit', type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId: 'entry', text: 'Changed prompt', expectedRevision: 2, starterId: STARTER_ID } }])));
});

test('context is opt-in, bounded, referenced and never includes drafts or unapproved sources', () => {
  const actions: SourceAction[] = [choices];
  for (let i = 0; i < 8; i++) actions.push({ eventId: `save${i}`, type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId: `entry${i}`, text: 'x'.repeat(10000), expectedRevision: 0, starterId: STARTER_ID } });
  let state = replay(events(actions));
  const request = makeRequest(state, '2026-10-01', 'personal', 'request');
  assert.equal(request.payload.entryRefs.length, 5);
  const context = JSON.parse(buildContext(state, request));
  assert.equal(context.recentReflections.length, 5); assert.ok(context.recentReflections.every((text: string) => text.length === 1000));
  const generic = makeRequest(state, '2026-10-01', 'generic', 'generic');
  assert.deepEqual(generic.payload.entryRefs, []); assert.deepEqual(generic.payload.feedbackIds, []);
  assert.ok(!buildContext(state, generic).includes('Everyday kindness'));
  state = { ...state, ai: { ...state.ai, choices: { ...state.ai.choices, useJournal: false, useFeedback: false } } };
  assert.deepEqual(makeRequest(state, '2026-10-01', 'personal', 'off').payload.entryRefs, []);
});

test('revoking consent invalidates a late response; unexpected fields and versions fail closed', () => {
  const request = makeRequest(replay(events([choices])), '2026-10-01', 'personal', 'request');
  const revoked: SourceAction = { ...choices, eventId: 'revoked', payload: { ...choices.payload, previousEventId: 'request', enabled: false } };
  const state = replay(events([choices, request, revoked])); assert.equal(state.ai.control.requestId, null);
  assert.throws(() => replay(events([choices, request, revoked, { eventId: 'request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: 'request', text: 'Too late?', model: 'model', finishReason: 'STOP' } }])));
  assert.throws(() => parseAction({ ...request, payload: { ...request.payload, projectedMemory: 'computed' } }));
  assert.throws(() => parseAction({ ...choices, schemaVersion: 99 }));
  assert.deepEqual(emptyProjection().ai.responses, {});
});
