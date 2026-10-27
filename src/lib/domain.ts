import { dayInZone } from './civil-date.ts';
import { SELECTOR_VERSION, validSelection } from './ai/selection.ts';
import { validImportInput, NO_PROMPT, type ImportInput, type ImportOrigin } from './import-source.ts';
/** Pure source-event contract. Replay never imports Firebase or an AI adapter. */
export const GENERATION = 'v1';
export const PROJECTION_VERSION = 7;
export const STARTER_ID = 'small-moment-v1';
export const STARTER_PROMPT = 'What is one small thing you appreciated today?';
export const TEMPLATE_VERSION = 'gratitude-v2';
export type PromptTemplateVersion = 'gratitude-v1' | typeof TEMPLATE_VERSION;
type Envelope<T extends string, P, V extends number = 1> = { eventId: string; type: T; schemaVersion: V; payload: P };
type ReflectionPayload = { entryId: string; text: string; expectedRevision: number };
export type Action = Envelope<'ReflectionWritten', ReflectionPayload & { starterId: typeof STARTER_ID }>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string }, 2>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; entryAt: string }, 3>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; entryAt: string | null; photoSlot: number | null }, 4>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; promptText: string | null; entryAt: string | null; photoSlot: number | null }, 5>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; promptText: string | null; entryAt: string | null; photoSlot: number | null }, 6>;
export type AIChoices = { enabled: boolean; useJournal: boolean; useFeedback: boolean; guidance: string };
type Previous = { previousEventId: string | null };
export type ChoicesAction = Envelope<'AIChoicesConfirmed', Previous & AIChoices>;
type RequestPayload = Previous & { choicesId: string; day: string; templateVersion: PromptTemplateVersion;
  contextMode: 'generic' | 'personal'; feedbackIds: string[] };
type LegacyRequestPayload = RequestPayload & { entryRefs: { entryId: string; revision: number }[] };
type SelectorPayload = RequestPayload & { entryRefs: Record<string, string>; selectorVersion: typeof SELECTOR_VERSION; timeZone: string; selectionSeed: string };
export type RequestAction = Envelope<'PromptRequested', LegacyRequestPayload> | Envelope<'PromptRequested', LegacyRequestPayload & { entryId: string; entryRevision: number }, 2>
  | Envelope<'PromptRequested', SelectorPayload, 3> | Envelope<'PromptRequested', SelectorPayload & { entryId: string; entryRevision: number }, 4>;
export function isEditorRequest(request: RequestAction): request is Extract<RequestAction, {schemaVersion: 2 | 4}> { return request.schemaVersion === 2 || request.schemaVersion === 4; }
export function isMixedRequest(request: RequestAction): request is Extract<RequestAction, {schemaVersion: 3 | 4}> { return request.schemaVersion === 3 || request.schemaVersion === 4; }
/** New wire maps enforce unique IDs and use canonical positive-decimal revision strings. */
export function requestEntryRefs(request: RequestAction): {entryId:string;revision:number}[] {
  return isMixedRequest(request) ? Object.entries(request.payload.entryRefs).map(([entryId,revision])=>({entryId,revision:Number(revision)})) : request.payload.entryRefs;
}
export type ResponseAction = Envelope<'PromptResponseReceived', { requestId: string; text: string; model: string; finishReason: 'STOP' }>;
export type FailureAction = Envelope<'AIRequestFailed', { requestId: string; reason: 'unavailable' | 'blocked' | 'invalid-response' }>;
export type FeedbackAction = Envelope<'PromptFeedbackSubmitted', Previous & { promptId: string; text: string }>;
export type StarterAction = Envelope<'StarterPromptChosen', Previous & { day: string; starterId: typeof STARTER_ID }>;
export type AIAction = ChoicesAction | RequestAction | ResponseAction | FailureAction | FeedbackAction | StarterAction;
export type PhotoAction = Envelope<'PhotoAttached', { entryId: string; slot: number; photoId: string; previousEventId: string | null }>
  | Envelope<'PhotoRemoved', PhotoTarget>
  | Envelope<'PhotoSummaryRequested', PhotoTarget>
  | Envelope<'PhotoSummaryEdited', PhotoTarget & { text: string }>
  | Envelope<'PhotoSummaryResponseReceived', PhotoTarget & { text: string; model: string; finishReason: 'STOP' }>
  | Envelope<'PhotoSummaryFailed', PhotoTarget & { reason: 'unavailable' | 'blocked' | 'invalid-response' }>;
type PhotoTarget = { entryId: string; slot: number; photoId: string; previousEventId: string };
export type Photo = { entryId: string; slot: number; photoId: string; lastEventId: string; summary: string; origin: 'none' | 'ai' | 'user'; status: 'idle' | 'pending' | 'failed'; removed: boolean };
export function photoKey(entryId: string, slot: number) { return `${entryId}_${slot}`; }
export function entryPhotos(state: Projection, entryId: string) { return Object.values(state.photos).filter(photo => photo.entryId === entryId && !photo.removed).sort((a,b) => a.slot - b.slot); }
export type ImportAction = Envelope<'ImportRecordConfirmed', ImportInput> | Envelope<'ReflectionImported', { sourceKey: string; confirmationId: string; entryId: string; expectedRevision: 0; photoSlot: number | null }>;
export type ImportReceipt = { confirmationId: string; input: ImportInput; completedId: string | null };
export type SourceAction = Action | AIAction | PhotoAction | ImportAction;
export function isPhotoAction(action: SourceAction): action is PhotoAction { return action.type.startsWith('Photo'); }
export type JournalEvent = SourceAction & { sequence: number; recordedAt: string };
/** colour is a legacy creation index for checkpoint compatibility; visible colour is date-derived. */
export type Entry = { id: string; text: string; prompt: string; promptId?: string; revision: number; colour: number; recordedAt: string; entryAt?: string; origin?: ImportOrigin };
export type AIControl = { lastEventId: string | null; choicesId: string | null; requestId: string | null };
export type Projection = { version: 7; imports: Record<string, ImportReceipt>; prompts: Record<string, string>; photos: Record<string, Photo>; cursor: number; lastEventId: string | null; entries: Entry[];
  ai: { control: AIControl; choices: AIChoices; requests: Record<string, RequestAction>; responses: Record<string, ResponseAction>;
    usage: Record<string, { count: number; lastSequence: number }>; days: Record<string, string>; feedback: FeedbackAction[]; failure: FailureAction | null } };
export function emptyControl(): AIControl { return { lastEventId: null, choicesId: null, requestId: null }; }
export function emptyProjection(): Projection { return { version: PROJECTION_VERSION, imports: {}, prompts: {}, photos: {}, cursor: 0, lastEventId: null, entries: [], ai: {
  control: emptyControl(), choices: { enabled: false, useJournal: false, useFeedback: false, guidance: '' },
  requests: {}, responses: {}, usage: {}, days: {}, feedback: [], failure: null
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
export function validEntryTime(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value)
    && value.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function parseAction(input: unknown): SourceAction {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action');
  const v = input as Record<string, unknown>;
  if (!keys(v, ['eventId', 'type', 'schemaVersion', 'payload']) || !id(v.eventId) || !v.payload || typeof v.payload !== 'object' || Array.isArray(v.payload)) throw new Error('Invalid action');
  const p = v.payload as Record<string, unknown>;
  let valid = false;
  if (v.type === 'ImportRecordConfirmed') {
    valid = v.schemaVersion === 1 && validImportInput(p) && v.eventId === `ic_${p.sourceKey}`;
  } else if (v.type === 'ReflectionImported') {
    valid = v.schemaVersion === 1 && keys(p, ['sourceKey','confirmationId','entryId','expectedRevision','photoSlot']) && typeof p.sourceKey === 'string' && /^[a-f0-9]{64}$/.test(p.sourceKey) && p.entryId === `e_${p.sourceKey}` && p.expectedRevision === 0 && v.eventId === `iw_${p.sourceKey}` && p.confirmationId === `ic_${p.sourceKey}` && (p.photoSlot === null || p.photoSlot === 0);
  } else if (v.type === 'ReflectionWritten') {
    valid = (v.schemaVersion === 1 && keys(p, ['entryId', 'text', 'expectedRevision', 'starterId']) && p.starterId === STARTER_ID
      || v.schemaVersion === 2 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId']) && id(p.promptId)
      || v.schemaVersion === 3 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'entryAt']) && id(p.promptId) && validEntryTime(p.entryAt)
      || (v.schemaVersion === 5 || v.schemaVersion === 6) && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'promptText', 'entryAt', 'photoSlot']) && id(p.promptId) && (p.promptText === null || p.promptId === v.eventId && string(p.promptText, 600)) && (p.entryAt === null || validEntryTime(p.entryAt)) && (p.photoSlot === null || Number.isInteger(p.photoSlot) && Number(p.photoSlot) >= 0 && Number(p.photoSlot) < 4)
      || v.schemaVersion === 4 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'entryAt', 'photoSlot']) && id(p.promptId) && (p.entryAt === null || validEntryTime(p.entryAt)) && (p.photoSlot === null || Number.isInteger(p.photoSlot) && Number(p.photoSlot) >= 0 && Number(p.photoSlot) < 4))
      && id(p.entryId) && string(p.text, 10_000, (v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === 6)) && Number.isSafeInteger(p.expectedRevision) && Number(p.expectedRevision) >= 0;
  } else if (v.schemaVersion === 1 || [2,3,4].includes(v.schemaVersion as number) && v.type === 'PromptRequested') {
    const previous = p.previousEventId === null || id(p.previousEventId);
    const day = typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) && !isNaN(Date.parse(p.day));
    switch (v.type) {
      case 'PhotoAttached': case 'PhotoRemoved': case 'PhotoSummaryRequested': case 'PhotoSummaryEdited': case 'PhotoSummaryResponseReceived': case 'PhotoSummaryFailed': {
        const extra = v.type === 'PhotoSummaryEdited' ? ['text'] : v.type === 'PhotoSummaryResponseReceived' ? ['text', 'model', 'finishReason'] : v.type === 'PhotoSummaryFailed' ? ['reason'] : [];
        valid = keys(p, ['entryId', 'slot', 'photoId', 'previousEventId', ...extra]) && id(p.entryId) && id(p.photoId)
          && Number.isInteger(p.slot) && Number(p.slot) >= 0 && Number(p.slot) < 4 && previous && (v.type === 'PhotoAttached' || id(p.previousEventId))
          && (v.type !== 'PhotoSummaryEdited' || string(p.text, 1000, true))
          && (v.type !== 'PhotoSummaryResponseReceived' || string(p.text, 1000) && string(p.model, 100) && p.finishReason === 'STOP' && v.eventId === `${p.previousEventId}_response`)
          && (v.type !== 'PhotoSummaryFailed' || ['unavailable','blocked','invalid-response'].includes(String(p.reason)) && v.eventId === `${p.previousEventId}_failure`); break;
      }
      case 'AIChoicesConfirmed': valid = keys(p, ['previousEventId', 'enabled', 'useJournal', 'useFeedback', 'guidance']) && previous
        && typeof p.enabled === 'boolean' && typeof p.useJournal === 'boolean' && typeof p.useFeedback === 'boolean' && string(p.guidance, 500, true); break;
      case 'PromptRequested': {
        const mixed = v.schemaVersion === 3 || v.schemaVersion === 4;
        const editor = v.schemaVersion === 2 || v.schemaVersion === 4;
        valid = keys(p, ['previousEventId', 'choicesId', 'day', 'templateVersion', 'contextMode', 'entryRefs', 'feedbackIds', ...(editor ? ['entryId', 'entryRevision'] : []), ...(mixed ? ['selectorVersion','timeZone','selectionSeed'] : [])])
          && (!editor || id(p.entryId) && Number.isSafeInteger(p.entryRevision) && Number(p.entryRevision) >= 0) && previous
          && (!mixed || p.selectorVersion === SELECTOR_VERSION && validSelection(p as unknown as Parameters<typeof validSelection>[0]))
          && id(p.choicesId) && day && ['gratitude-v1', TEMPLATE_VERSION].includes(String(p.templateVersion)) && ['generic', 'personal'].includes(String(p.contextMode))
          && (mixed ? !!p.entryRefs && typeof p.entryRefs === 'object' && !Array.isArray(p.entryRefs) && Object.keys(p.entryRefs).length <= 20
            && Object.entries(p.entryRefs).every(([key,value])=>id(key) && typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value) && Number.isSafeInteger(Number(value)))
            : Array.isArray(p.entryRefs) && p.entryRefs.length <= 5 && p.entryRefs.every(ref => ref && keys(ref, ['entryId', 'revision']) && id(ref.entryId) && Number.isSafeInteger(ref.revision) && ref.revision > 0))
          && Array.isArray(p.feedbackIds) && p.feedbackIds.length <= 20 && p.feedbackIds.every(id) && new Set(p.feedbackIds).size === p.feedbackIds.length
          && (p.contextMode !== 'generic' || Object.keys(p.entryRefs as object).length === 0 && p.feedbackIds.length === 0); break;
      }
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
  if (action.type === 'ImportRecordConfirmed') {
    const p = action.payload;
    if (state.imports[p.sourceKey] || state.entries.some(e => e.id === p.entryId) || Object.values(state.imports).some(r => r.input.entryId === p.entryId)) throw new Error('Import identity already claimed');
    if (p.source.updatedOn > Date.parse(event.recordedAt)) throw new Error('An import cannot be dated in the future');
    return { ...next, imports: { ...state.imports, [p.sourceKey]: { confirmationId: action.eventId, input: p, completedId: null } }, prompts: { ...state.prompts, [action.eventId]: p.source.prompt ?? NO_PROMPT } };
  }
  if (action.type === 'ReflectionImported') {
    const p = action.payload; const receipt = state.imports[p.sourceKey];
    if (!receipt || receipt.confirmationId !== p.confirmationId || receipt.completedId || receipt.input.entryId !== p.entryId || state.entries.some(e => e.id === p.entryId)) throw new Error('Invalid import completion');
    const input = receipt.input;
    if (p.photoSlot !== (input.source.noteText.trim() ? null : 0) || input.attachments.some((a, slot) => !entryPhotos(state,p.entryId).some(photo => photo.slot === slot && photo.photoId === a.photoId))) throw new Error('Import photos are not attached');
    const entry: Entry = { id: p.entryId, text: input.source.noteText, prompt: input.source.prompt ?? NO_PROMPT, promptId: receipt.confirmationId, entryAt: new Date(input.source.createdOn).toISOString(), recordedAt: event.recordedAt, revision: 1, colour: state.entries.length % 7, origin: { ...input, confirmationId: receipt.confirmationId } };
    return { ...next, entries: [...state.entries, entry], imports: { ...state.imports, [p.sourceKey]: { ...receipt, completedId: action.eventId } } };
  }
  if (isPhotoAction(action)) return applyPhoto(next, action);
  if (action.type === 'ReflectionWritten') {
    const existing = state.entries.find(entry => entry.id === action.payload.entryId);
    if ((existing?.revision ?? 0) !== action.payload.expectedRevision) throw new Error('Conflicting reflection revision');
    if (!action.payload.text.trim() && !((action.schemaVersion === 4 || action.schemaVersion === 5 || action.schemaVersion === 6) && entryPhotos(state, action.payload.entryId).some(photo => photo.slot === action.payload.photoSlot))) throw new Error('Write a reflection or attach a photo.');
    if (existing?.origin && action.schemaVersion !== 6) throw new Error('Use the current editor for imported reflections');
    const chosen = promptId(action);
    if (existing && action.schemaVersion !== 5 && action.schemaVersion !== 6 && chosen !== (existing.promptId ?? STARTER_ID)) throw new Error('A saved reflection keeps its original prompt.');
    const chosenAt = action.schemaVersion === 3 || action.schemaVersion === 4 || action.schemaVersion === 5 || action.schemaVersion === 6 ? action.payload.entryAt ?? undefined : undefined;
    if (existing && action.schemaVersion !== 6 && existing.entryAt !== chosenAt) throw new Error('A saved reflection keeps its original entry date.');
    if (chosenAt && chosenAt > new Date(event.recordedAt).toISOString()) throw new Error('An entry cannot be dated in the future.');
    const manual = action.schemaVersion === 5 || action.schemaVersion === 6 ? action.payload.promptText : null;
    const prompt = manual ?? resolvePrompt(state, chosen);
    if (!prompt) throw new Error('Missing prompt response');
    const entry: Entry = { id: action.payload.entryId, text: action.payload.text, prompt, promptId: chosen,
      revision: action.payload.expectedRevision + 1, colour: existing?.colour ?? state.entries.length % 7, recordedAt: existing?.recordedAt ?? event.recordedAt,
      ...(chosenAt ? { entryAt: chosenAt } : {}), ...(existing?.origin ? { origin: existing.origin } : {}) };
    return { ...next, prompts: manual === null ? state.prompts : { ...state.prompts, [action.eventId]: manual }, entries: existing ? state.entries.map(old => old.id === entry.id ? entry : old) : [...state.entries, entry] };
  }
  const ai = { ...state.ai, control: nextControl(state.ai.control, action) };
  switch (action.type) {
    case 'AIChoicesConfirmed': {
      const { enabled, useJournal, useFeedback, guidance } = action.payload;
      ai.choices = { enabled, useJournal, useFeedback, guidance }; ai.failure = null; break;
    }
    case 'PromptRequested': {
      const p = action.payload, refs = requestEntryRefs(action);
      if (isEditorRequest(action) && (state.entries.find(entry => entry.id === action.payload.entryId)?.revision ?? 0) !== action.payload.entryRevision) throw new Error('This reflection changed before the prompt request.');
      if (!ai.choices.enabled || p.choicesId !== ai.control.choicesId) throw new Error('AI consent is no longer current.');
      if (p.contextMode === 'generic' && (refs.length || p.feedbackIds.length)
        || refs.length && !ai.choices.useJournal || p.feedbackIds.length && !ai.choices.useFeedback) throw new Error('Unapproved AI context');
      for (const ref of refs) {
        const entry = state.entries.find(e => e.id === ref.entryId && e.revision === ref.revision);
        if (!entry) throw new Error('Stale AI context');
        if (isMixedRequest(action) && (!entry.text.trim() || dayInZone(entry.entryAt ?? entry.recordedAt,action.payload.timeZone) >= p.day || isEditorRequest(action) && ref.entryId === action.payload.entryId)) throw new Error('Ineligible AI context');
      }
      for (const ref of p.feedbackIds) if (!state.ai.feedback.some(f => f.eventId === ref && !!f.payload.text)) throw new Error('Missing feedback context');
      ai.requests = { ...ai.requests, [action.eventId]: action }; ai.failure = null; break;
    }
    case 'PromptResponseReceived': {
      const request = ai.requests[action.payload.requestId];
      if (!request || request.payload.choicesId !== ai.control.choicesId || !ai.choices.enabled) throw new Error('AI consent is no longer current.');
      ai.responses = { ...ai.responses, [action.eventId]: action };
      const usage = Object.fromEntries([...new Set(requestEntryRefs(request).map(ref=>ref.entryId))].map(entryId=>[entryId, {count:(ai.usage[entryId]?.count??0)+1,lastSequence:event.sequence}]));
      ai.usage = { ...ai.usage, ...usage };
      if (!isEditorRequest(request)) ai.days = { ...ai.days, [request.payload.day]: action.eventId }; ai.failure = null; break;
    }
    case 'AIRequestFailed': ai.failure = action; break;
    case 'StarterPromptChosen': ai.days = { ...ai.days, [action.payload.day]: STARTER_ID }; ai.failure = null; break;
    case 'PromptFeedbackSubmitted':
      if (!resolvePrompt(state, action.payload.promptId)) throw new Error('Missing feedback prompt');
      ai.feedback = [...ai.feedback.filter(f => f.payload.promptId !== action.payload.promptId), action]; break;
  }
  return { ...next, ai };
}
export function replay(events: JournalEvent[], start = emptyProjection()): Projection { return events.reduce(applyEvent, start); }

function applyPhoto(state: Projection, action: PhotoAction): Projection {
  const p = action.payload;
  const key = photoKey(p.entryId, p.slot);
  const old = state.photos[key];
  if ((old?.lastEventId ?? null) !== p.previousEventId) throw new Error('This photo changed on another device. Reload before trying again.');
  let photo: Photo;
  if (action.type === 'PhotoAttached') {
    if (old && !old.removed) throw new Error('This photo position is occupied.');
    if (Object.values(state.photos).some(photo => photo.photoId === p.photoId)) throw new Error('Photo ID already used.');
    photo = { entryId: p.entryId, slot: p.slot, photoId: p.photoId, lastEventId: action.eventId, summary: '', origin: 'none', status: 'idle', removed: false };
  } else {
    if (!old || old.removed || old.photoId !== p.photoId) throw new Error('This photo was removed or replaced.');
    photo = { ...old, lastEventId: action.eventId };
    if (action.type === 'PhotoRemoved') photo.removed = true;
    if (action.type === 'PhotoSummaryRequested') photo.status = 'pending';
    if (action.type === 'PhotoSummaryEdited') { photo.summary = action.payload.text; photo.origin = 'user'; photo.status = 'idle'; }
    if (action.type === 'PhotoSummaryResponseReceived' || action.type === 'PhotoSummaryFailed') {
      if (old.status !== 'pending') throw new Error('This photo request is no longer current.');
      if (action.type === 'PhotoSummaryResponseReceived') { photo.summary = action.payload.text; photo.origin = 'ai'; photo.status = 'idle'; }
      else photo.status = 'failed';
    }
  }
  // A saved photo-only entry must keep at least one attachment.
  if (action.type === 'PhotoRemoved' && state.entries.some(entry => entry.id === p.entryId && !entry.text.trim()) && entryPhotos(state, p.entryId).length === 1) throw new Error('Write a reflection before removing the last photo.');
  return { ...state, photos: { ...state.photos, [key]: photo } };
}

/** Resolve an immutable AI response or a user-written prompt from source history. */
export function resolvePrompt(state: Projection, id: string): string | undefined { return id === STARTER_ID ? STARTER_PROMPT : state.prompts[id] ?? state.ai.responses[id]?.payload.text; }
