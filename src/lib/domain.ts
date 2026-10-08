/** Pure source-event contract. Replay never imports Firebase or an AI adapter. */
export const GENERATION = 'v1';
export const PROJECTION_VERSION = 2;
export const STARTER_ID = 'small-moment-v1';
export const STARTER_PROMPT = 'What is one small thing you appreciated today?';
export const TEMPLATE_VERSION = 'gratitude-v1';
type Envelope<T extends string, P, V extends number = 1> = { eventId: string; type: T; schemaVersion: V; payload: P };
type ReflectionPayload = { entryId: string; text: string; expectedRevision: number };
export type Action = Envelope<'ReflectionWritten', ReflectionPayload & { starterId: typeof STARTER_ID }>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string }, 2>;
export type AIChoices = { enabled: boolean; useJournal: boolean; useFeedback: boolean; guidance: string };
type Previous = { previousEventId: string | null };
export type ChoicesAction = Envelope<'AIChoicesConfirmed', Previous & AIChoices>;
export type RequestAction = Envelope<'PromptRequested', Previous & { choicesId: string; day: string; templateVersion: typeof TEMPLATE_VERSION;
  contextMode: 'generic' | 'personal'; entryRefs: { entryId: string; revision: number }[]; feedbackIds: string[] }>;
export type ResponseAction = Envelope<'PromptResponseReceived', { requestId: string; text: string; model: string; finishReason: 'STOP' }>;
export type FailureAction = Envelope<'AIRequestFailed', { requestId: string; reason: 'unavailable' | 'blocked' | 'invalid-response' }>;
export type FeedbackAction = Envelope<'PromptFeedbackSubmitted', Previous & { promptId: string; text: string }>;
export type StarterAction = Envelope<'StarterPromptChosen', Previous & { day: string; starterId: typeof STARTER_ID }>;
export type AIAction = ChoicesAction | RequestAction | ResponseAction | FailureAction | FeedbackAction | StarterAction;
export type SourceAction = Action | AIAction;
export type JournalEvent = SourceAction & { sequence: number; recordedAt: string };
export type Entry = { id: string; text: string; prompt: string; promptId?: string; revision: number; colour: number; recordedAt: string };
export type AIControl = { lastEventId: string | null; choicesId: string | null; requestId: string | null };
export type Projection = { version: 2; cursor: number; lastEventId: string | null; entries: Entry[];
  ai: { control: AIControl; choices: AIChoices; requests: Record<string, RequestAction>; responses: Record<string, ResponseAction>;
    days: Record<string, string>; feedback: FeedbackAction[]; failure: FailureAction | null } };
export function emptyControl(): AIControl { return { lastEventId: null, choicesId: null, requestId: null }; }
export function emptyProjection(): Projection { return { version: PROJECTION_VERSION, cursor: 0, lastEventId: null, entries: [], ai: {
  control: emptyControl(), choices: { enabled: false, useJournal: false, useFeedback: false, guidance: '' },
  requests: {}, responses: {}, days: {}, feedback: [], failure: null
} }; }
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
function id(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value); }
function string(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || !!value.trim());
}
function keys(object: Record<string, unknown>, expected: string[]) {
  return Object.keys(object).length === expected.length && expected.every(key => Object.hasOwn(object, key));
}
export function promptId(action: Action) { return action.schemaVersion === 1 ? action.payload.starterId : action.payload.promptId; }
export function parseAction(input: unknown): SourceAction {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action');
  const v = input as Record<string, unknown>;
  if (!keys(v, ['eventId', 'type', 'schemaVersion', 'payload']) || !id(v.eventId) || !v.payload || typeof v.payload !== 'object' || Array.isArray(v.payload)) throw new Error('Invalid action');
  const p = v.payload as Record<string, unknown>;
  let valid = false;
  if (v.type === 'ReflectionWritten') {
    valid = (v.schemaVersion === 1 && keys(p, ['entryId', 'text', 'expectedRevision', 'starterId']) && p.starterId === STARTER_ID
      || v.schemaVersion === 2 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId']) && id(p.promptId))
      && id(p.entryId) && string(p.text, 10_000) && Number.isSafeInteger(p.expectedRevision) && Number(p.expectedRevision) >= 0;
  } else if (v.schemaVersion === 1) {
    const previous = p.previousEventId === null || id(p.previousEventId);
    const day = typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) && !isNaN(Date.parse(p.day));
    switch (v.type) {
      case 'AIChoicesConfirmed': valid = keys(p, ['previousEventId', 'enabled', 'useJournal', 'useFeedback', 'guidance']) && previous
        && typeof p.enabled === 'boolean' && typeof p.useJournal === 'boolean' && typeof p.useFeedback === 'boolean' && string(p.guidance, 500, true); break;
      case 'PromptRequested': valid = keys(p, ['previousEventId', 'choicesId', 'day', 'templateVersion', 'contextMode', 'entryRefs', 'feedbackIds']) && previous
        && id(p.choicesId) && day && p.templateVersion === TEMPLATE_VERSION && ['generic', 'personal'].includes(String(p.contextMode))
        && Array.isArray(p.entryRefs) && p.entryRefs.length <= 5 && p.entryRefs.every(ref => ref && keys(ref, ['entryId', 'revision']) && id(ref.entryId) && Number.isSafeInteger(ref.revision) && ref.revision > 0)
        && Array.isArray(p.feedbackIds) && p.feedbackIds.length <= 20 && p.feedbackIds.every(id) && new Set(p.feedbackIds).size === p.feedbackIds.length
        && (p.contextMode !== 'generic' || p.entryRefs.length === 0 && p.feedbackIds.length === 0); break;
      case 'PromptResponseReceived': valid = keys(p, ['requestId', 'text', 'model', 'finishReason']) && id(p.requestId)
        && string(p.text, 600) && string(p.model, 100) && p.finishReason === 'STOP' && v.eventId === `${p.requestId}_response`; break;
      case 'AIRequestFailed': valid = keys(p, ['requestId', 'reason']) && id(p.requestId)
        && ['unavailable', 'blocked', 'invalid-response'].includes(String(p.reason)) && v.eventId === `${p.requestId}_failure`; break;
      case 'PromptFeedbackSubmitted': valid = keys(p, ['previousEventId', 'promptId', 'text']) && previous && id(p.promptId) && string(p.text, 500, true); break;
      case 'StarterPromptChosen': valid = keys(p, ['previousEventId', 'day', 'starterId']) && previous && day && p.starterId === STARTER_ID; break;
    }
  }
  if (!valid) throw new Error('Invalid action input');
  // Recursively sort keys for stable idempotency regardless of Firestore map ordering.
  return canonical(input) as SourceAction;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function nextControl(control: AIControl, action: AIAction): AIControl {
  if ('previousEventId' in action.payload && action.payload.previousEventId !== control.lastEventId) throw new Error('AI choices or prompt changed on another device. Please try again.');
  if ((action.type === 'PromptResponseReceived' || action.type === 'AIRequestFailed') && action.payload.requestId !== control.requestId) throw new Error('This AI request is no longer current.');
  return { lastEventId: action.eventId,
    choicesId: action.type === 'AIChoicesConfirmed' ? action.eventId : control.choicesId,
    requestId: action.type === 'PromptRequested' ? action.eventId : action.type === 'PromptFeedbackSubmitted' ? control.requestId : null };
}
export function applyEvent(state: Projection, event: JournalEvent): Projection {
  const action = parseAction({ eventId: event.eventId, type: event.type, schemaVersion: event.schemaVersion, payload: event.payload });
  if (event.sequence !== state.cursor + 1 || !Number.isFinite(Date.parse(event.recordedAt))) throw new Error('Incomplete or invalid event stream');
  const next = { ...state, cursor: event.sequence, lastEventId: event.eventId };
  if (action.type === 'ReflectionWritten') {
    const existing = state.entries.find(entry => entry.id === action.payload.entryId);
    if ((existing?.revision ?? 0) !== action.payload.expectedRevision) throw new Error('Conflicting reflection revision');
    const chosen = promptId(action);
    if (existing && chosen !== (existing.promptId ?? STARTER_ID)) throw new Error('A saved reflection keeps its original prompt.');
    const prompt = chosen === STARTER_ID ? STARTER_PROMPT : state.ai.responses[chosen]?.payload.text;
    if (!prompt) throw new Error('Missing prompt response');
    const entry: Entry = { id: action.payload.entryId, text: action.payload.text, prompt, promptId: chosen,
      revision: action.payload.expectedRevision + 1, colour: existing?.colour ?? state.entries.length % 7, recordedAt: existing?.recordedAt ?? event.recordedAt };
    return { ...next, entries: existing ? state.entries.map(old => old.id === entry.id ? entry : old) : [...state.entries, entry] };
  }
  const ai = { ...state.ai, control: nextControl(state.ai.control, action) };
  switch (action.type) {
    case 'AIChoicesConfirmed': {
      const { enabled, useJournal, useFeedback, guidance } = action.payload;
      ai.choices = { enabled, useJournal, useFeedback, guidance }; ai.failure = null; break;
    }
    case 'PromptRequested': {
      const p = action.payload;
      if (!ai.choices.enabled || p.choicesId !== ai.control.choicesId) throw new Error('AI consent is no longer current.');
      if (p.contextMode === 'generic' && (p.entryRefs.length || p.feedbackIds.length)
        || p.entryRefs.length && !ai.choices.useJournal || p.feedbackIds.length && !ai.choices.useFeedback) throw new Error('Unapproved AI context');
      for (const ref of p.entryRefs) if (!state.entries.some(e => e.id === ref.entryId && e.revision === ref.revision)) throw new Error('Stale AI context');
      for (const ref of p.feedbackIds) if (!state.ai.feedback.some(f => f.eventId === ref && !!f.payload.text)) throw new Error('Missing feedback context');
      ai.requests = { ...ai.requests, [action.eventId]: action }; ai.failure = null; break;
    }
    case 'PromptResponseReceived': {
      const request = ai.requests[action.payload.requestId];
      if (!request || request.payload.choicesId !== ai.control.choicesId || !ai.choices.enabled) throw new Error('AI consent is no longer current.');
      ai.responses = { ...ai.responses, [action.eventId]: action };
      ai.days = { ...ai.days, [request.payload.day]: action.eventId }; ai.failure = null; break;
    }
    case 'AIRequestFailed': ai.failure = action; break;
    case 'StarterPromptChosen': ai.days = { ...ai.days, [action.payload.day]: STARTER_ID }; ai.failure = null; break;
    case 'PromptFeedbackSubmitted':
      if (action.payload.promptId !== STARTER_ID && !ai.responses[action.payload.promptId]) throw new Error('Missing feedback prompt');
      ai.feedback = [...ai.feedback.filter(f => f.payload.promptId !== action.payload.promptId), action]; break;
  }
  return { ...next, ai };
}
export function replay(events: JournalEvent[], start = emptyProjection()): Projection { return events.reduce(applyEvent, start); }
