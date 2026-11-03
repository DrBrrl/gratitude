import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAnswers, answersInput, TOPICS, validAnswers, selectedDescriptions } from '../../src/lib/onboarding.ts';
import { parseAction, replay, type JournalEvent } from '../../src/lib/domain.ts';

const event = (eventId: string, type: string, payload: unknown, sequence = 1) => ({ eventId, type, schemaVersion: 1, payload, sequence, recordedAt: '2026-10-01T04:31:07.000Z' }) as JournalEvent;
const confirmed = (eventId = 'answers', previousEventId: string | null = null, sequence = 1) => event(eventId, 'OnboardingAnswersConfirmed', { ...answersInput(defaultAnswers()), preferredName: 'Sam', pronouns: 'they/them', selectedTopics: ['music'], useAnswers: true, previousEventId }, sequence);

test('new questionnaires have independent empty choices and the full original topic catalogue', () => {
  const a = defaultAnswers(), b = defaultAnswers();
  assert.equal(TOPICS.length, 17); assert.deepEqual(a.selectedTopics, []); assert.equal(a.useAnswers, false);
  assert.equal(a.wordLimit, 80); assert.equal(a.scope, 'narrow');
  a.descriptions.music = 'A different description'; assert.notEqual(a.descriptions.music, b.descriptions.music);
  assert.equal(b.descriptions.family, 'Any form of familial connections, blood family ties, chosen family, close friends, other loved ones.');
  assert.equal(b.descriptions.movement, 'Moving (sports, dancing, walking, ...), resting (medidation, breathing, leisure time, passively existing, ...).');
  assert.equal(validAnswers(b), true);
});

test('source confirmations restore exact private answers without creating entries or AI calls', () => {
  const state = replay([confirmed()]);
  assert.equal(state.onboarding.answers.preferredName, 'Sam'); assert.equal(state.onboarding.answers.pronouns, 'they/them');
  assert.equal(state.onboarding.answersId, 'answers'); assert.equal(state.onboarding.version, 0);
  assert.deepEqual(state.entries, []); assert.deepEqual(state.ai.requests, {}); assert.equal(state.ai.choices.enabled, false);
  assert.throws(() => parseAction({ eventId:'bad',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...confirmed().payload, computedSummary:'Sam likes music'} }));
});

test('built-in descriptions are under 150; custom descriptions allow 150 and need unique identities', () => {
  const answers = defaultAnswers();
  answers.descriptions.music = 'x'.repeat(149); assert.equal(validAnswers(answers), true);
  answers.descriptions.music += 'x'; assert.equal(validAnswers(answers), false);
  answers.descriptions.music = 'Music';
  answers.customTopics = [{id:'custom_one',label:'A hobby',description:'x'.repeat(150),selected:true}];
  assert.equal(validAnswers(answers), true);
  answers.customTopics[0].description += 'x'; assert.equal(validAnswers(answers), false);
  answers.customTopics[0].description = 'A hobby'; answers.customTopics.push({...answers.customTopics[0]});
  assert.equal(validAnswers(answers), false);
  answers.customTopics[1].id = 'custom_two'; assert.equal(validAnswers(answers), true);
  answers.selectedTopics = ['music','music']; assert.equal(validAnswers(answers), false);
});

test('clearing answers and permission is one replayable action; completion and journal stay intact', () => {
  const log = [confirmed(), event('finish','OnboardingFinished',{version:1,outcome:'completed'},2), event('clear','OnboardingAnswersCleared',{previousEventId:'answers'},3)];
  const state = replay(log);
  assert.deepEqual(state.onboarding.answers, defaultAnswers());
  assert.equal(state.onboarding.answersId, 'clear'); assert.equal(state.onboarding.version, 1); assert.equal(state.onboarding.outcome, 'completed');
  assert.deepEqual(replay(log.slice(1), replay(log.slice(0,1))), state);
  assert.throws(() => replay([event('stale','OnboardingAnswersCleared',{previousEventId:'answers'})]));
});

test('skip acknowledges this rollout once without clearing already saved answers', () => {
  const log = [confirmed(), event('skip','OnboardingFinished',{version:1,outcome:'skipped'},2)];
  assert.equal(replay(log).onboarding.answers.preferredName, 'Sam');
  assert.throws(() => replay([...log,event('again','OnboardingFinished',{version:1,outcome:'completed'},3)]));
  assert.throws(() => parseAction({eventId:'future',type:'OnboardingFinished',schemaVersion:1,payload:{version:2,outcome:'skipped'}}));
});

test('selection contains edited descriptions, never built-in labels, deselected rows or custom IDs', () => {
  const answers = defaultAnswers(); answers.selectedTopics = ['music']; answers.descriptions.music = 'Playing piano.';
  answers.customTopics = [{id:'custom_yes',label:'My hobby',description:'Making paper birds.',selected:true},{id:'custom_no',label:'Other',description:'Do not share.',selected:false}];
  assert.deepEqual(selectedDescriptions(answers), ['Playing piano.','Making paper birds.']);
  assert.equal(JSON.stringify(selectedDescriptions(answers)).includes('custom_'),false);
});

test('finite prompt choices reject malformed values rather than coercing them', () => {
  for (const wordLimit of [0,49,51,201,Infinity,NaN,'80']) assert.equal(validAnswers({...defaultAnswers(),wordLimit}),false);
  for (const wordLimit of [50,80,200]) assert.equal(validAnswers({...defaultAnswers(),wordLimit}),true);
  assert.equal(validAnswers({...defaultAnswers(),scope:'anything'}),false);
  assert.equal(validAnswers({...defaultAnswers(),scope:new String('narrow')}),false);
  assert.equal(validAnswers({...defaultAnswers(),preferredName:' Sam '}),false);
  assert.equal(validAnswers({...defaultAnswers(),catalogueVersion:2}),false);
});
