import { TOPICS, type OnboardingAnswers } from './onboarding.ts';

/** Literal user choice; frequency, display labels and eligibility remain projections. */
export type TopicAction = {
  eventId: string; type: 'ReflectionTopicChosen'; schemaVersion: 1;
  payload: { entryId: string; expectedRevision: number; previousEventId: string | null; topicId: string | null; answersId: string | null };
};
export type ReflectionTopic = { topicId: string | null; label: string; lastEventId: string; origin: 'user' };
export function topicChoices(answers: OnboardingAnswers) {
  return [...TOPICS.map(([id,label]) => ({ id: id as string, label })), ...answers.customTopics.map(({id,label}) => ({id,label})), {id:'unknown',label:'Unknown'}];
}
export function validTopicId(value: unknown): value is string | null {
  return value === null || value === 'unknown' || TOPICS.some(([id]) => value === id)
    || typeof value === 'string' && /^custom_[a-zA-Z0-9_-]{0,73}$/.test(value);
}
export function topicLabel(topic: ReflectionTopic | undefined, answers: OnboardingAnswers) {
  if (!topic?.topicId) return 'Not yet classified';
  return topicChoices(answers).find(option => option.id === topic.topicId)?.label ?? topic.label;
}
