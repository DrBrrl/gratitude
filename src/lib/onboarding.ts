/** Literal questionnaire inputs. No Firebase, model calls or computed event payloads. */
export const ONBOARDING_VERSION = 1;
export const TOPIC_CATALOGUE_VERSION = 1;
export const TOPICS = [
  ['nature', 'Nature & outdoors', 'Landscapes, geographical features, weather, plants, being outside.'],
  ['community', 'Community & kindness', 'Neighbours, groups, generosity, small kindnesses.'],
  ['art', 'Art & creativity', 'Making things, writing, composing, creating and appreciating art.'],
  ['books', 'Books & literature', 'Books, reading, poetry, the written word.'],
  ['music', 'Music', 'Music and sounds: listening, playing, singing.'],
  ['movies', 'Movies & TV', 'Movies, TV shows, other forms of visual storytelling.'],
  ['science', 'Science', 'Scientific advances, understanding the world.'],
  ['wildlife', 'Animals & wildlife', 'Encounters with wild animals or the appreciation for their existence.'],
  ['family', 'Family', 'Any form of familial connections, blood family ties, chosen family, close friends, other loved ones.'],
  ['pets', 'Pets', "Companion animals, be they yours or others'."],
  ['friends', 'Friends & connection', 'Friendship, moments of connection within your wider network.'],
  ['food', 'Food & drink', 'Meals, drinks, tastes, cooking, little treats.'],
  ['home', 'Home & everyday comforts', 'Home, familiar places, useful things, and ordinary comforts.'],
  ['movement', 'Movement & rest', 'Moving (sports, dancing, walking, ...), resting (medidation, breathing, leisure time, passively existing, ...).'],
  ['learning', 'Learning & small achievements', 'Curiosity, practice, small accomplishments.'],
  ['discovery', 'Discovery & adventure', 'Going on adventures, the discovery of new things.'],
  ['technology', 'Technology', 'Useful little gadgets, larger technological advances.']
] as const;
export type TopicId = typeof TOPICS[number][0];
export type PromptScope = 'narrow' | 'intermediate' | 'broad';
export type CustomTopic = { id: string; label: string; description: string; selected: boolean };
export type OnboardingAnswers = {
  catalogueVersion: 1; preferredName: string; pronouns: string; selectedTopics: TopicId[];
  descriptions: Record<TopicId, string>; customTopics: CustomTopic[];
  scope: PromptScope; wordLimit: number; useAnswers: boolean;
};
export type AnswersInput = Omit<OnboardingAnswers, 'customTopics'> & {
  customLabels: Record<string,string>; customDescriptions: Record<string,string>; selectedCustomTopics: string[]; customOrder: string[];
};
/** Structural encoding of literal form fields, not a computed summary. */
export function answersInput(answers: OnboardingAnswers): AnswersInput {
  const { customTopics, ...rest } = answers;
  return { ...rest, customLabels: Object.fromEntries(customTopics.map(row => [row.id,row.label])),
    customDescriptions: Object.fromEntries(customTopics.map(row => [row.id,row.description])),
    selectedCustomTopics: customTopics.filter(row => row.selected).map(row => row.id), customOrder: customTopics.map(row => row.id) };
}
export function answersFromInput(input: AnswersInput): OnboardingAnswers {
  const { customLabels, customDescriptions, selectedCustomTopics, customOrder, ...rest } = input;
  return { ...rest, customTopics: customOrder.map(id => ({ id, label:customLabels[id], description:customDescriptions[id], selected:selectedCustomTopics.includes(id) })) };
}
export const characterCount = (value: string) => Array.from(value).length;
export type OnboardingAction =
  { eventId: string; type: 'OnboardingAnswersConfirmed'; schemaVersion: 1; payload: AnswersInput & { previousEventId: string | null } }
  | { eventId: string; type: 'OnboardingAnswersCleared'; schemaVersion: 1; payload: { previousEventId: string | null } }
  | { eventId: string; type: 'OnboardingFinished'; schemaVersion: 1; payload: { version: 1; outcome: 'completed' | 'skipped' } };
export type OnboardingState = {
  answers: OnboardingAnswers; answersId: string | null; version: number;
  outcome: 'completed' | 'skipped' | null; outcomeId: string | null;
};
export function defaultAnswers(): OnboardingAnswers {
  return { catalogueVersion: TOPIC_CATALOGUE_VERSION, preferredName: '', pronouns: '', selectedTopics: [],
    descriptions: Object.fromEntries(TOPICS.map(([id, , description]) => [id, description])) as Record<TopicId, string>,
    customTopics: [], scope: 'narrow', wordLimit: 80, useAnswers: false };
}
export function emptyOnboarding(): OnboardingState {
  return { answers: defaultAnswers(), answersId: null, version: 0, outcome: null, outcomeId: null };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function text(value: unknown, max: number, optional = false): value is string {
  return typeof value === 'string' && characterCount(value) <= max && !value.includes('\u001f') && value === value.trim() && (optional || value.length > 0);
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function validAnswers(value: unknown): value is OnboardingAnswers {
  if (!object(value) || !keys(value, ['catalogueVersion','preferredName','pronouns','selectedTopics','descriptions','customTopics','scope','wordLimit','useAnswers'])) return false;
  const ids: string[] = TOPICS.map(([id]) => id);
  return value.catalogueVersion === TOPIC_CATALOGUE_VERSION && text(value.preferredName, 80, true) && text(value.pronouns, 80, true)
    && Array.isArray(value.selectedTopics) && value.selectedTopics.every(item => typeof item === 'string' && ids.includes(item)) && new Set(value.selectedTopics).size === value.selectedTopics.length
    && object(value.descriptions) && keys(value.descriptions, ids) && Object.values(value.descriptions).every(item => text(item, 149))
    && Array.isArray(value.customTopics) && value.customTopics.length <= 20 && value.customTopics.every(item => object(item)
      && keys(item, ['id','label','description','selected']) && id(item.id) && item.id.startsWith('custom_') && text(item.label, 60) && text(item.description, 150) && typeof item.selected === 'boolean')
    && new Set(value.customTopics.map(item => item.id)).size === value.customTopics.length
    && typeof value.scope==='string' && ['narrow','intermediate','broad'].includes(value.scope) && Number.isInteger(value.wordLimit) && Number(value.wordLimit) >= 50 && Number(value.wordLimit) <= 200 && Number(value.wordLimit) % 10 === 0
    && typeof value.useAnswers === 'boolean';
}
export function isOnboardingAction(value: { type: string }): value is OnboardingAction {
  return ['OnboardingAnswersConfirmed','OnboardingAnswersCleared','OnboardingFinished'].includes(value.type);
}
export function validOnboardingAction(value: Record<string, unknown>) {
  if (value.schemaVersion !== 1 || !object(value.payload)) return false;
  const p = value.payload;
  if (value.type === 'OnboardingFinished') return keys(p, ['version','outcome']) && p.version === ONBOARDING_VERSION && typeof p.outcome==='string' && ['completed','skipped'].includes(p.outcome);
  if (p.previousEventId !== null && !id(p.previousEventId)) return false;
  if (value.type === 'OnboardingAnswersCleared') return keys(p, ['previousEventId']);
  const { previousEventId: _, ...answers } = p;
  if (value.type !== 'OnboardingAnswersConfirmed' || !object(answers.customLabels) || !object(answers.customDescriptions)
    || !Array.isArray(answers.customOrder) || !Array.isArray(answers.selectedCustomTopics)) return false;
  const order = answers.customOrder;
  if (order.length > 20 || !order.every(item => id(item) && item.startsWith('custom_')) || new Set(order).size !== order.length
    || !keys(answers.customLabels, order as string[]) || !keys(answers.customDescriptions, order as string[])
    || !answers.selectedCustomTopics.every(item => order.includes(item)) || new Set(answers.selectedCustomTopics).size !== answers.selectedCustomTopics.length) return false;
  const input = answers as AnswersInput;
  const decoded = answersFromInput(input);
  return validAnswers(decoded) && keys(answers, [...Object.keys(defaultAnswers()).filter(key => key !== 'customTopics'), 'customLabels','customDescriptions','selectedCustomTopics','customOrder']);
}
export function applyOnboarding(state: OnboardingState, action: OnboardingAction): OnboardingState {
  if (action.type === 'OnboardingFinished') {
    if (action.payload.version <= state.version) throw new Error('This setup has already been acknowledged on another device.');
    return { ...state, version: action.payload.version, outcome: action.payload.outcome, outcomeId: action.eventId };
  }
  if (action.payload.previousEventId !== state.answersId) throw new Error('Your answers changed on another device. Your draft is kept; review the latest answers before saving.');
  if (action.type === 'OnboardingAnswersCleared') return { ...state, answersId: action.eventId, answers: defaultAnswers() };
  const { previousEventId: _, ...answers } = action.payload;
  return { ...state, answersId: action.eventId, answers: answersFromInput(answers) };
}
export function selectedDescriptions(answers: OnboardingAnswers): string[] {
  return [...TOPICS.filter(([id]) => answers.selectedTopics.includes(id)).map(([id]) => answers.descriptions[id]),
    ...answers.customTopics.filter(topic => topic.selected).map(topic => topic.description)];
}
export const SCOPE_OPTIONS = [
  ['narrow', 'Narrow', 'One specific thing to reflect on at a time.'],
  ['intermediate', 'Intermediate', 'A small number of options for things to reflect on.'],
  ['broad', 'Broad', 'A wider theme, with room to choose where to take it.']
] as const;
