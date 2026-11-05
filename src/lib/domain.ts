import {emptyRotation,starterPrompt,type RotationState} from './prompt-rotation.ts';
import {PROVIDERS,validExternalTarget,type AIProvider,type ExternalTarget} from './ai/connection-contract.ts';
import { emptyOnboarding, applyOnboarding, isOnboardingAction, validOnboardingAction, type OnboardingAction, type OnboardingState } from './onboarding.ts';
import { validLocalTarget, type LocalModelTarget } from './ai/local-contract.ts';
import { dayInZone } from './civil-date.ts';
import { SELECTOR_VERSION, validSelection } from './ai/selection.ts';
import { validImportInput, NO_PROMPT, type ImportInput, type ImportOrigin } from './import-source.ts';
/** Pure source-event contract. Replay never imports Firebase or an AI adapter. */
export const GENERATION = 'v1';
export const PROJECTION_VERSION = 15;
export const STARTER_ID = 'small-moment-v1';
export const STARTER_PROMPT = 'What is one small thing you appreciated today?';
export const TEMPLATE_VERSION = 'gratitude-v2';
export type PromptTemplateVersion = 'gratitude-v1' | typeof TEMPLATE_VERSION | 'gratitude-v3' | 'gratitude-v4';
type Envelope<T extends string, P, V extends number = 1> = { eventId: string; type: T; schemaVersion: V; payload: P };
type ReflectionPayload = { entryId: string; text: string; expectedRevision: number };
export type Action = Envelope<'ReflectionWritten', ReflectionPayload & { starterId: typeof STARTER_ID }>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string }, 2>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; entryAt: string }, 3>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; entryAt: string | null; photoSlot: number | null }, 4>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; promptText: string | null; entryAt: string | null; photoSlot: number | null }, 5>
  | Envelope<'ReflectionWritten', ReflectionPayload & { promptId: string; promptText: string | null; entryAt: string | null; photoSlot: number | null }, 6|7>;
type LegacyAIChoices = { enabled: boolean; useJournal: boolean; useFeedback: boolean; guidance: string };
type ProviderChoice = {provider:AIProvider};
export type AIChoices = LegacyAIChoices & ProviderChoice & { backupEnabled?: boolean; backupProvider?: AIProvider; photoProvider?: 'prompt'|AIProvider; promptConnectionId?:string|null; photoConnectionId?:string|null; backupConnectionId?:string|null };
type Previous = { previousEventId: string | null };
export type ChoicesAction = Envelope<'AIChoicesConfirmed', Previous & LegacyAIChoices> | Envelope<'AIChoicesConfirmed', Previous & LegacyAIChoices & ProviderChoice,2> | Envelope<'AIChoicesConfirmed', Previous & Required<Omit<AIChoices,'photoProvider'|'promptConnectionId'|'photoConnectionId'|'backupConnectionId'>>,3> | Envelope<'AIChoicesConfirmed', Previous & Required<Omit<AIChoices,'promptConnectionId'|'photoConnectionId'|'backupConnectionId'>>,4> | Envelope<'AIChoicesConfirmed', Previous & Required<AIChoices>,5>;
type RequestPayload = Previous & { choicesId: string; day: string; templateVersion: PromptTemplateVersion;
  contextMode: 'generic' | 'personal'; feedbackIds: string[] };
type LegacyRequestPayload = RequestPayload & { entryRefs: { entryId: string; revision: number }[] };
type SelectorPayload = RequestPayload & { entryRefs: Record<string, string>; selectorVersion: typeof SELECTOR_VERSION | 'mixed-v2' | 'weighted-v1' | 'weighted-v2'; timeZone: string; selectionSeed: string };
type LegacyRequestAction = Envelope<'PromptRequested', LegacyRequestPayload> | Envelope<'PromptRequested', LegacyRequestPayload & { entryId: string; entryRevision: number }, 2>
  | Envelope<'PromptRequested', SelectorPayload, 3> | Envelope<'PromptRequested', SelectorPayload & { entryId: string; entryRevision: number }, 4>
  | Envelope<'PromptRequested', SelectorPayload & LocalModelTarget, 5> | Envelope<'PromptRequested', SelectorPayload & LocalModelTarget & { entryId: string; entryRevision: number }, 6>
  | Envelope<'PromptRequested', SelectorPayload & {purpose:'backup'}, 7> | Envelope<'PromptRequested', SelectorPayload & LocalModelTarget & {purpose:'backup'}, 8>
  | Envelope<'PromptRequested', SelectorPayload & {differentFromPromptId:string},9> | Envelope<'PromptRequested', SelectorPayload & {differentFromPromptId:string;entryId:string;entryRevision:number},10>
  | Envelope<'PromptRequested', SelectorPayload & LocalModelTarget & {differentFromPromptId:string},11> | Envelope<'PromptRequested', SelectorPayload & LocalModelTarget & {differentFromPromptId:string;entryId:string;entryRevision:number},12>;

type ExternalPayload<V extends 5|6|8|11|12> = Omit<Extract<LegacyRequestAction,{schemaVersion:V}>['payload'],keyof LocalModelTarget> & ExternalTarget & {answersId:string|null};
type ExternalRequestAction = Envelope<'PromptRequested', ExternalPayload<5>,23> | Envelope<'PromptRequested', ExternalPayload<6>,24> | Envelope<'PromptRequested', ExternalPayload<8>,25> | Envelope<'PromptRequested', ExternalPayload<11>,26> | Envelope<'PromptRequested', ExternalPayload<12>,27>;
export type RequestAction = LegacyRequestAction | ExternalRequestAction
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:3}>, 'schemaVersion'|'payload'> & {schemaVersion:13;payload:Extract<LegacyRequestAction,{schemaVersion:3}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:4}>, 'schemaVersion'|'payload'> & {schemaVersion:14;payload:Extract<LegacyRequestAction,{schemaVersion:4}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:5}>, 'schemaVersion'|'payload'> & {schemaVersion:15;payload:Extract<LegacyRequestAction,{schemaVersion:5}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:6}>, 'schemaVersion'|'payload'> & {schemaVersion:16;payload:Extract<LegacyRequestAction,{schemaVersion:6}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:7}>, 'schemaVersion'|'payload'> & {schemaVersion:17;payload:Extract<LegacyRequestAction,{schemaVersion:7}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:8}>, 'schemaVersion'|'payload'> & {schemaVersion:18;payload:Extract<LegacyRequestAction,{schemaVersion:8}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:9}>, 'schemaVersion'|'payload'> & {schemaVersion:19;payload:Extract<LegacyRequestAction,{schemaVersion:9}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:10}>, 'schemaVersion'|'payload'> & {schemaVersion:20;payload:Extract<LegacyRequestAction,{schemaVersion:10}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:11}>, 'schemaVersion'|'payload'> & {schemaVersion:21;payload:Extract<LegacyRequestAction,{schemaVersion:11}>['payload'] & {answersId:string|null}})
  | (Omit<Extract<LegacyRequestAction,{schemaVersion:12}>, 'schemaVersion'|'payload'> & {schemaVersion:22;payload:Extract<LegacyRequestAction,{schemaVersion:12}>['payload'] & {answersId:string|null}})
;
export const requestSchema = (request: RequestAction) => request.schemaVersion >=23 ? ({23:5,24:6,25:8,26:11,27:12} as Record<number,number>)[request.schemaVersion] : request.schemaVersion >= 13 ? request.schemaVersion - 10 : request.schemaVersion;
export function isEditorRequest(request: RequestAction): request is Extract<RequestAction, {schemaVersion: 2|4|6|10|12|14|16|20|22|24|27}> { return [2,4,6,10,12].includes(requestSchema(request)); }
export function isMixedRequest(request: RequestAction): request is Exclude<RequestAction, {schemaVersion:1|2}> { return request.schemaVersion >= 3; }
export function isLocalRequest(request: RequestAction): request is Extract<RequestAction, {schemaVersion:5|6|8|11|12|15|16|18|21|22|23|24|25|26|27}> { return [5,6,8,11,12].includes(requestSchema(request)); }
export function requestProvider(request:RequestAction):AIProvider{return isLocalRequest(request)?request.payload.provider:'gemini';}
export function isBackupRequest(request: RequestAction) { return [7,8].includes(requestSchema(request)); }
/** New wire maps enforce unique IDs and use canonical positive-decimal revision strings. */
export function requestEntryRefs(request: RequestAction): {entryId:string;revision:number}[] {
  return isMixedRequest(request) ? Object.entries(request.payload.entryRefs).map(([entryId,revision])=>({entryId,revision:Number(revision)})) : request.payload.entryRefs;
}
export type ResponseAction = Envelope<'PromptResponseReceived', { requestId: string; text: string; model: string; finishReason: 'STOP' },1|2>;
export type FailureAction = Envelope<'AIRequestFailed', { requestId: string; reason: 'unavailable' | 'blocked' | 'invalid-response' }>;
export type FeedbackAction = Envelope<'PromptFeedbackSubmitted', Previous & { promptId: string; text: string }>;
export type StarterAction = Envelope<'StarterPromptChosen', Previous & { day: string; starterId: typeof STARTER_ID }>;
export type AIAction = ChoicesAction | RequestAction | ResponseAction | FailureAction | FeedbackAction | StarterAction;
export type PhotoAction = Envelope<'PhotoAttached', { entryId: string; slot: number; photoId: string; previousEventId: string | null }>
  | Envelope<'PhotoRemoved', PhotoTarget>
  | Envelope<'PhotoSummaryRequested', PhotoTarget>
  | Envelope<'PhotoSummaryRequested', PhotoTarget & LocalModelTarget, 2>
  | Envelope<'PhotoSummaryRequested', PhotoTarget & {choicesId:string;provider:'gemini'|'lm-studio';model:string|null;thinking:false}, 3>
  | Envelope<'PhotoSummaryRequested', PhotoTarget & ExternalTarget & {choicesId:string},4>
  | Envelope<'PhotoSummaryEdited', PhotoTarget & { text: string }>
  | Envelope<'PhotoSummaryResponseReceived', PhotoTarget & { text: string; model: string; finishReason: 'STOP' }>
  | Envelope<'PhotoSummaryFailed', PhotoTarget & { reason: 'unavailable' | 'blocked' | 'invalid-response' }>;
type PhotoTarget = { entryId: string; slot: number; photoId: string; previousEventId: string };
export type Photo = { entryId: string; slot: number; photoId: string; lastEventId: string; summary: string; origin: 'none' | 'ai' | 'user'; status: 'idle' | 'pending' | 'failed'; removed: boolean; requestChoicesId?:string };
export function photoKey(entryId: string, slot: number) { return `${entryId}_${slot}`; }
export function entryPhotos(state: Projection, entryId: string) { return Object.values(state.photos).filter(photo => photo.entryId === entryId && !photo.removed).sort((a,b) => a.slot - b.slot); }
export type ImportAction = Envelope<'ImportRecordConfirmed', ImportInput,1|2> | Envelope<'ReflectionImported', { sourceKey: string; confirmationId: string; entryId: string; expectedRevision: 0; photoSlot: number | null }>;
export type ImportReceipt = { confirmationId: string; input: ImportInput; completedId: string | null };
export type BackupAction = Envelope<'BackupPromptImported', {text:string},1|2> | Envelope<'BackupPromptRemoved', {promptId:string}>;
export function isBackupAction(action:SourceAction): action is BackupAction { return action.type==='BackupPromptImported' || action.type==='BackupPromptRemoved'; }
export type AppearanceAction = Envelope<'AccentColourChosen', Previous & { colourIndex: number }>;
export type RotationAction = Envelope<'PromptViewed', {day:string;promptId:string;surface:'today'|'editor'|'backup'}> | Envelope<'PromptAccepted',{day:string;promptId:string}>;
export function isRotationAction(action:SourceAction):action is RotationAction{return action.type==='PromptViewed'||action.type==='PromptAccepted';}
export type SourceAction = RotationAction | OnboardingAction | AppearanceAction | Action | AIAction | PhotoAction | ImportAction | BackupAction;
export function isPhotoAction(action: SourceAction): action is PhotoAction { return action.type.startsWith('Photo'); }
export type JournalEvent = SourceAction & { sequence: number; recordedAt: string };
/** colour is a legacy creation index for checkpoint compatibility; visible colour is date-derived. */
export type Entry = { id: string; text: string; prompt: string; promptId?: string; revision: number; colour: number; recordedAt: string; entryAt?: string; origin?: ImportOrigin };
export type AIControl = { lastEventId: string | null; choicesId: string | null; requestId: string | null };
export type Projection = { version: 15; rotation:RotationState; onboarding: OnboardingState; appearance: { colourIndex: number; lastEventId: string | null }; backups: Record<string, { text: string; removed: boolean; used?: boolean }>; imports: Record<string, ImportReceipt>; prompts: Record<string, string>; photos: Record<string, Photo>; cursor: number; lastEventId: string | null; entries: Entry[];
  ai: { control: AIControl; choices: AIChoices; requests: Record<string, RequestAction>; responses: Record<string, ResponseAction>;
    requestUnits: Record<string,number>; requestedAt: Record<string,string>; usage: Record<string, { count: number; lastSequence: number }>; days: Record<string, string>; feedback: FeedbackAction[]; failure: FailureAction | null } };
export function emptyControl(): AIControl { return { lastEventId: null, choicesId: null, requestId: null }; }
export function emptyProjection(): Projection { return { version: PROJECTION_VERSION, rotation:emptyRotation(), onboarding: emptyOnboarding(), appearance: { colourIndex: 0, lastEventId: null }, backups: {}, imports: {}, prompts: {}, photos: {}, cursor: 0, lastEventId: null, entries: [], ai: {
  control: emptyControl(), choices: { enabled: false, useJournal: false, useFeedback: false, guidance: '',provider:'gemini' },
  requests: {}, requestUnits:{}, requestedAt:{}, responses: {}, usage: {}, days: {}, feedback: [], failure: null
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
  if (isOnboardingAction(v as {type:string})) {
    valid = validOnboardingAction(v);
  } else if (v.type === 'AccentColourChosen') {
    valid = v.schemaVersion === 1 && keys(p, ['previousEventId', 'colourIndex']) && (p.previousEventId === null || id(p.previousEventId)) && Number.isInteger(p.colourIndex) && Number(p.colourIndex) >= 0 && Number(p.colourIndex) < 28 && Number(p.colourIndex) % 2 === 0;
  } else if (v.type==='BackupPromptImported') {
    valid=[1,2].includes(Number(v.schemaVersion)) && keys(p,['text']) && string(p.text,v.schemaVersion===2?4000:600) && /^bp_[a-f0-9]{64}$/.test(String(v.eventId));
  } else if (v.type==='BackupPromptRemoved') {
    valid=v.schemaVersion===1 && keys(p,['promptId']) && id(p.promptId);
  } else if (v.type === 'ImportRecordConfirmed') {
    valid = [1,2].includes(Number(v.schemaVersion)) && validImportInput(p,v.schemaVersion===2?4000:600) && v.eventId === `ic_${p.sourceKey}`;
  } else if (v.type === 'ReflectionImported') {
    valid = v.schemaVersion === 1 && keys(p, ['sourceKey','confirmationId','entryId','expectedRevision','photoSlot']) && typeof p.sourceKey === 'string' && /^[a-f0-9]{64}$/.test(p.sourceKey) && p.entryId === `e_${p.sourceKey}` && p.expectedRevision === 0 && v.eventId === `iw_${p.sourceKey}` && p.confirmationId === `ic_${p.sourceKey}` && (p.photoSlot === null || p.photoSlot === 0);
  } else if (v.type==='PromptViewed'||v.type==='PromptAccepted') {
    valid=v.schemaVersion===1&&keys(p,v.type==='PromptViewed'?['day','promptId','surface']:['day','promptId'])&&typeof p.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.day)&&Number.isFinite(Date.parse(p.day+'T12:00:00Z'))&&new Date(p.day+'T12:00:00Z').toISOString().slice(0,10)===p.day&&id(p.promptId)&&(v.type==='PromptViewed'?typeof p.surface==='string'&&['today','editor','backup'].includes(p.surface)&&v.eventId===`v${p.day}_${String(p.surface)[0]}${p.promptId}`:v.eventId===`a_${p.day}_${p.promptId}`);
  } else if (v.type === 'ReflectionWritten') {
    valid = (v.schemaVersion === 1 && keys(p, ['entryId', 'text', 'expectedRevision', 'starterId']) && p.starterId === STARTER_ID
      || v.schemaVersion === 2 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId']) && id(p.promptId)
      || v.schemaVersion === 3 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'entryAt']) && id(p.promptId) && validEntryTime(p.entryAt)
      || (v.schemaVersion === 5 || v.schemaVersion === 6 || v.schemaVersion === 7) && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'promptText', 'entryAt', 'photoSlot']) && id(p.promptId) && (p.promptText === null || p.promptId === v.eventId && string(p.promptText, v.schemaVersion===7?4000:600)) && (p.entryAt === null || validEntryTime(p.entryAt)) && (p.photoSlot === null || Number.isInteger(p.photoSlot) && Number(p.photoSlot) >= 0 && Number(p.photoSlot) < 4)
      || v.schemaVersion === 4 && keys(p, ['entryId', 'text', 'expectedRevision', 'promptId', 'entryAt', 'photoSlot']) && id(p.promptId) && (p.entryAt === null || validEntryTime(p.entryAt)) && (p.photoSlot === null || Number.isInteger(p.photoSlot) && Number(p.photoSlot) >= 0 && Number(p.photoSlot) < 4))
      && id(p.entryId) && string(p.text, 10_000, (v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === 6 || v.schemaVersion === 7)) && Number.isSafeInteger(p.expectedRevision) && Number(p.expectedRevision) >= 0;
  } else if (v.schemaVersion === 1 || [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27].includes(v.schemaVersion as number) && v.type === 'PromptRequested' || [2,3,4].includes(v.schemaVersion as number) && v.type==='PhotoSummaryRequested' || [2,3,4,5].includes(v.schemaVersion as number) && v.type==='AIChoicesConfirmed' || v.schemaVersion===2 && v.type==='PromptResponseReceived') {
    const previous = p.previousEventId === null || id(p.previousEventId);
    const day = typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) && !isNaN(Date.parse(p.day));
    switch (v.type) {
      case 'PhotoAttached': case 'PhotoRemoved': case 'PhotoSummaryRequested': case 'PhotoSummaryEdited': case 'PhotoSummaryResponseReceived': case 'PhotoSummaryFailed': {
        const extra = v.type === 'PhotoSummaryRequested' && Number(v.schemaVersion)>=2 ? ['provider','model','thinking',...(Number(v.schemaVersion)>=3?['choicesId']:[]),...(v.schemaVersion===4?['connectionId','connectionRevision']:[])] : v.type === 'PhotoSummaryEdited' ? ['text'] : v.type === 'PhotoSummaryResponseReceived' ? ['text', 'model', 'finishReason'] : v.type === 'PhotoSummaryFailed' ? ['reason'] : [];
        valid = keys(p, ['entryId', 'slot', 'photoId', 'previousEventId', ...extra]) && id(p.entryId) && id(p.photoId)
          && Number.isInteger(p.slot) && Number(p.slot) >= 0 && Number(p.slot) < 4 && previous && (v.type === 'PhotoAttached' || id(p.previousEventId))
          && (v.type !== 'PhotoSummaryRequested' || v.schemaVersion===1 || v.schemaVersion===2 && validLocalTarget(p) || v.schemaVersion===4 && id(p.choicesId) && validExternalTarget(p) || v.schemaVersion===3 && id(p.choicesId) && (p.provider==='gemini' && p.model===null && p.thinking===false || validLocalTarget(p)))
          && (v.type !== 'PhotoSummaryEdited' || string(p.text, 1000, true))
          && (v.type !== 'PhotoSummaryResponseReceived' || string(p.text, 1000) && string(p.model, 100) && p.finishReason === 'STOP' && v.eventId === `${p.previousEventId}_response`)
          && (v.type !== 'PhotoSummaryFailed' || ['unavailable','blocked','invalid-response'].includes(String(p.reason)) && v.eventId === `${p.previousEventId}_failure`); break;
      }
      case 'AIChoicesConfirmed': valid = keys(p, ['previousEventId', 'enabled', 'useJournal', 'useFeedback', 'guidance',...(Number(v.schemaVersion)>=2?['provider']:[]),...(Number(v.schemaVersion)>=3?['backupEnabled','backupProvider']:[]),...(Number(v.schemaVersion)>=4?['photoProvider']:[]),...(v.schemaVersion===5?['promptConnectionId','photoConnectionId','backupConnectionId']:[])]) && previous
        && (Number(v.schemaVersion)<2 || (v.schemaVersion===5?PROVIDERS:['gemini','lm-studio']).includes(String(p.provider) as AIProvider)) && (Number(v.schemaVersion)<3 || typeof p.backupEnabled==='boolean' && (v.schemaVersion===5?PROVIDERS:['gemini','lm-studio']).includes(String(p.backupProvider) as AIProvider)) && (Number(v.schemaVersion)<4 || (v.schemaVersion===5?['prompt',...PROVIDERS]:['prompt','gemini','lm-studio']).includes(String(p.photoProvider)))
        && (v.schemaVersion!==5 || typeof p.provider==='string'&&typeof p.backupProvider==='string'&&typeof p.photoProvider==='string')
        && (v.schemaVersion!==5 || ['promptConnectionId','photoConnectionId','backupConnectionId'].every(key=>p[key]===null||id(p[key])))
        && typeof p.enabled === 'boolean' && typeof p.useJournal === 'boolean' && typeof p.useFeedback === 'boolean' && string(p.guidance, 500, true); break;
      case 'PromptRequested': {
        const modern=Number(v.schemaVersion)>=13;
        const external=Number(v.schemaVersion)>=23;
        const schema=external?({23:5,24:6,25:8,26:11,27:12} as Record<number,number>)[Number(v.schemaVersion)]:modern?Number(v.schemaVersion)-10:Number(v.schemaVersion);
        const mixed = [3,4,5,6,7,8,9,10,11,12].includes(schema);
        const local = schema===5 || schema===6 || schema===8 || schema===11 || schema===12;
        const editor = schema === 2 || schema === 4 || schema===6 || schema===10 || schema===12;
        valid = keys(p, [...(modern?['answersId']:[]),...(external?['connectionId','connectionRevision']:[]),'previousEventId', 'choicesId', 'day', 'templateVersion', 'contextMode', 'entryRefs', 'feedbackIds', ...(editor ? ['entryId', 'entryRevision'] : []), ...(mixed ? ['selectorVersion','timeZone','selectionSeed'] : []), ...(local ? ['provider','model','thinking'] : []),...([7,8].includes(schema)?['purpose']:[]),...(schema>=9?['differentFromPromptId']:[])])
          && (!modern || (p.answersId===null||id(p.answersId)))
          && (schema<9 || id(p.differentFromPromptId))
          && (![7,8].includes(schema) || p.purpose==='backup')
          && (!local || (external?validExternalTarget(p):validLocalTarget(p)))
          && (!editor || id(p.entryId) && Number.isSafeInteger(p.entryRevision) && Number(p.entryRevision) >= 0) && previous
          && (!mixed || p.selectorVersion === (modern?(schema>=9?'weighted-v2':'weighted-v1'):(schema>=9?'mixed-v2':SELECTOR_VERSION)) && validSelection(p as unknown as Parameters<typeof validSelection>[0]))
          && id(p.choicesId) && day && (modern ? ['gratitude-v3','gratitude-v4'].includes(String(p.templateVersion)) : ['gratitude-v1', TEMPLATE_VERSION].includes(String(p.templateVersion))) && ['generic', 'personal'].includes(String(p.contextMode))
          && (mixed ? !!p.entryRefs && typeof p.entryRefs === 'object' && !Array.isArray(p.entryRefs) && Object.keys(p.entryRefs).length <= 20
            && Object.entries(p.entryRefs).every(([key,value])=>id(key) && typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value) && Number.isSafeInteger(Number(value)))
            : Array.isArray(p.entryRefs) && p.entryRefs.length <= 5 && p.entryRefs.every(ref => ref && keys(ref, ['entryId', 'revision']) && id(ref.entryId) && Number.isSafeInteger(ref.revision) && ref.revision > 0))
          && Array.isArray(p.feedbackIds) && p.feedbackIds.length <= 20 && p.feedbackIds.every(id) && new Set(p.feedbackIds).size === p.feedbackIds.length
          && (p.contextMode !== 'generic' || Object.keys(p.entryRefs as object).length === 0 && p.feedbackIds.length === 0); break;
      }
      case 'PromptResponseReceived': valid = keys(p, ['requestId', 'text', 'model', 'finishReason']) && id(p.requestId)
        && string(p.text, v.schemaVersion===2?4000:600) && string(p.model, 100) && p.finishReason === 'STOP' && v.eventId === `${p.requestId}_response`; break;
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
  const next = { ...state, cursor: event.sequence, lastEventId: event.eventId,rotation:action.type==='PromptRequested'?{...state.rotation,requests:{...state.rotation.requests,[action.eventId]:event.sequence}}:state.rotation };
  if(isRotationAction(action)){
    const {promptId,day}=action.payload,starter=starterPrompt(promptId),backup=state.backups[promptId];
    if(!starter&&!backup)throw new Error('Unknown rotation prompt.');
    if(action.type==='PromptViewed'){
      if(!!starter===(action.payload.surface==='backup'))throw new Error('Prompt source and surface disagree.');
      return {...next,ai:action.payload.surface==='today'?{...state.ai,days:{...state.ai.days,[day]:promptId}}:state.ai,rotation:{...state.rotation,offers:[...state.rotation.offers,{eventId:action.eventId,day,promptId,kind:starter?'starter':'backup',surface:action.payload.surface,sequence:event.sequence,text:starter?.text??backup!.text}]}};
    }
    return {...next,rotation:{...state.rotation,acceptedText:{...state.rotation.acceptedText,[promptId]:starter?.text??backup!.text},accepted:{...state.rotation.accepted,[promptId]:day> (state.rotation.accepted[promptId]??'')?day:state.rotation.accepted[promptId]}},backups:backup?{...state.backups,[promptId]:{...backup,used:true}}:state.backups};
  }
  if (isOnboardingAction(action)) return { ...next, onboarding: applyOnboarding(state.onboarding, action) };
  if (action.type === 'AccentColourChosen') {
    if (action.payload.previousEventId !== state.appearance.lastEventId) throw new Error('Your accent colour changed on another device. Please choose again.');
    return { ...next, appearance: { colourIndex: action.payload.colourIndex, lastEventId: action.eventId } };
  }
  if (action.type==='BackupPromptImported') return {...next,backups:{...state.backups,[action.eventId]:{text:action.payload.text,removed:false}},prompts:{...state.prompts,[action.eventId]:action.payload.text}};
  if (action.type==='BackupPromptRemoved') {
    const old=state.backups[action.payload.promptId]; if(!old) throw new Error('Unknown backup prompt');
    return {...next,backups:{...state.backups,[action.payload.promptId]:{...old,removed:true}}};
  }
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
  if(action.type==='PhotoSummaryRequested'&&action.schemaVersion===4&&action.payload.connectionId!==(state.ai.choices.photoProvider==='prompt'?state.ai.choices.promptConnectionId:state.ai.choices.photoConnectionId))throw new Error('AI photo connection changed.');
  if (action.type==='PhotoSummaryRequested' && ((action.schemaVersion===1?'gemini':action.payload.provider)!==photoProvider(state.ai.choices) || action.schemaVersion>=3 && 'choicesId' in action.payload && action.payload.choicesId!==state.ai.control.choicesId)) throw new Error('AI provider changed. Review your model settings.');
  if (isPhotoAction(action)) return applyPhoto(next, action);
  if (action.type === 'ReflectionWritten') {
    const existing = state.entries.find(entry => entry.id === action.payload.entryId);
    if ((existing?.revision ?? 0) !== action.payload.expectedRevision) throw new Error('Conflicting reflection revision');
    if (!action.payload.text.trim() && !((action.schemaVersion === 4 || action.schemaVersion === 5 || action.schemaVersion === 6 || action.schemaVersion === 7) && entryPhotos(state, action.payload.entryId).some(photo => photo.slot === action.payload.photoSlot))) throw new Error('Write a reflection or attach a photo.');
    if (existing?.origin && action.schemaVersion !== 6 && action.schemaVersion !== 7) throw new Error('Use the current editor for imported reflections');
    const chosen = promptId(action);
    if (existing && action.schemaVersion !== 5 && action.schemaVersion !== 6 && action.schemaVersion !== 7 && chosen !== (existing.promptId ?? STARTER_ID)) throw new Error('A saved reflection keeps its original prompt.');
    const chosenAt = action.schemaVersion === 3 || action.schemaVersion === 4 || action.schemaVersion === 5 || action.schemaVersion === 6 || action.schemaVersion === 7 ? action.payload.entryAt ?? undefined : undefined;
    if (existing && action.schemaVersion !== 6 && action.schemaVersion !== 7 && existing.entryAt !== chosenAt) throw new Error('A saved reflection keeps its original entry date.');
    if (chosenAt && chosenAt > new Date(event.recordedAt).toISOString()) throw new Error('An entry cannot be dated in the future.');
    const manual = action.schemaVersion === 5 || action.schemaVersion === 6 || action.schemaVersion === 7 ? action.payload.promptText : null;
    const prompt = manual ?? resolvePrompt(state, chosen);
    if (!prompt) throw new Error('Missing prompt response');
    const entry: Entry = { id: action.payload.entryId, text: action.payload.text, prompt, promptId: chosen,
      revision: action.payload.expectedRevision + 1, colour: existing?.colour ?? state.entries.length % 7, recordedAt: existing?.recordedAt ?? event.recordedAt,
      ...(chosenAt ? { entryAt: chosenAt } : {}), ...(existing?.origin ? { origin: existing.origin } : {}) };
    return { ...next, backups:state.backups[chosen]?{...state.backups,[chosen]:{...state.backups[chosen],used:true}}:state.backups, prompts: manual === null ? state.prompts : { ...state.prompts, [action.eventId]: manual }, entries: existing ? state.entries.map(old => old.id === entry.id ? entry : old) : [...state.entries, entry] };
  }
  const ai = { ...state.ai, control: nextControl(state.ai.control, action) };
  switch (action.type) {
    case 'AIChoicesConfirmed': {
      const { enabled, useJournal, useFeedback, guidance } = action.payload;
      ai.choices = { enabled, useJournal, useFeedback, guidance,provider:action.schemaVersion>=2?('provider' in action.payload?action.payload.provider:'gemini'):'gemini',...('backupEnabled' in action.payload?{backupEnabled:action.payload.backupEnabled,backupProvider:action.payload.backupProvider}:{}),...('photoProvider' in action.payload?{photoProvider:action.payload.photoProvider}:{}),...('promptConnectionId' in action.payload?{promptConnectionId:action.payload.promptConnectionId,photoConnectionId:action.payload.photoConnectionId,backupConnectionId:action.payload.backupConnectionId}:{}) }; ai.failure = null; break;
    }
    case 'PromptRequested': {
      const p = action.payload, refs = requestEntryRefs(action);
      if('answersId' in p && p.answersId!==state.onboarding.answersId)throw new Error('Questionnaire answers changed.');
      if('differentFromPromptId' in p&&!state.ai.responses[p.differentFromPromptId])throw new Error('Previous generated prompt is unavailable.');
      if (isEditorRequest(action) && (state.entries.find(entry => entry.id === action.payload.entryId)?.revision ?? 0) !== action.payload.entryRevision) throw new Error('This reflection changed before the prompt request.');
      if ('connectionId' in action.payload && action.payload.connectionId!==(isBackupRequest(action)?ai.choices.backupConnectionId:ai.choices.promptConnectionId))throw new Error('AI connection changed.');
      if (requestProvider(action)!==(isBackupRequest(action)?ai.choices.backupProvider:ai.choices.provider)) throw new Error('AI provider changed. Review your model settings.');
      if (isBackupRequest(action) && !ai.choices.backupEnabled) throw new Error('Backup generation is disabled.');
      if (!ai.choices.enabled || p.choicesId !== ai.control.choicesId) throw new Error('AI consent is no longer current.');
      if (p.contextMode === 'generic' && (refs.length || p.feedbackIds.length)
        || refs.length && !ai.choices.useJournal || p.feedbackIds.length && !ai.choices.useFeedback) throw new Error('Unapproved AI context');
      for (const ref of refs) {
        const entry = state.entries.find(e => e.id === ref.entryId && e.revision === ref.revision);
        if (!entry) throw new Error('Stale AI context');
        if (isMixedRequest(action) && (!entry.text.trim() || dayInZone(entry.entryAt ?? entry.recordedAt,action.payload.timeZone) >= p.day || isEditorRequest(action) && ref.entryId === action.payload.entryId)) throw new Error('Ineligible AI context');
      }
      for (const ref of p.feedbackIds) if (!state.ai.feedback.some(f => f.eventId === ref && !!f.payload.text)) throw new Error('Missing feedback context');
      ai.requestUnits={...ai.requestUnits,[action.eventId]:refs.reduce((total,ref)=>total+(action.schemaVersion>=13 && state.entries.find(e=>e.id===ref.entryId)!.text.trim().length>600?2:1),0)};
      ai.requests = { ...ai.requests, [action.eventId]: action }; ai.requestedAt={...ai.requestedAt,[action.eventId]:event.recordedAt}; ai.failure = null; break;
    }
    case 'PromptResponseReceived': {
      const request = ai.requests[action.payload.requestId];
      if(request && 'answersId' in request.payload && request.payload.answersId!==state.onboarding.answersId)throw new Error('Questionnaire answers changed.');
      if((action.schemaVersion===2)!==(!!request && request.schemaVersion>=13))throw new Error('Prompt response schema does not match its request.');
      if (!request || request.payload.choicesId !== ai.control.choicesId || !ai.choices.enabled) throw new Error('AI consent is no longer current.');
      ai.responses = { ...ai.responses, [action.eventId]: action };
      const usage = Object.fromEntries([...new Set(requestEntryRefs(request).map(ref=>ref.entryId))].map(entryId=>[entryId, {count:(ai.usage[entryId]?.count??0)+1,lastSequence:event.sequence}]));
      ai.usage = { ...ai.usage, ...usage };
      if (isBackupRequest(request)) return {...next, ai:{...ai,failure:null},backups:{...state.backups,[action.eventId]:{text:action.payload.text,removed:false}}};
      if (!isEditorRequest(request)&&!state.rotation.offers.some(o=>o.surface==='today'&&o.day===request.payload.day&&o.sequence>(state.rotation.requests[request.eventId]??0))) ai.days = { ...ai.days, [request.payload.day]: action.eventId }; ai.failure = null; break;
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
    if (action.type === 'PhotoSummaryRequested') {photo.status = 'pending';photo.requestChoicesId=action.schemaVersion>=3&&'choicesId' in action.payload?action.payload.choicesId:undefined;}
    if(action.type==='PhotoSummaryResponseReceived' && photo.requestChoicesId && photo.requestChoicesId!==state.ai.control.choicesId) throw new Error('Photo model settings changed. The late summary was discarded.');
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
export function resolvePrompt(state: Projection, id: string): string | undefined { return id === STARTER_ID ? STARTER_PROMPT : starterPrompt(id)?.text ?? state.prompts[id] ?? state.ai.responses[id]?.payload.text; }

/** Legacy accounts share the prompt connection until an explicit photo choice. */
export function photoProvider(choices:AIChoices):AIProvider { return !choices.photoProvider||choices.photoProvider==='prompt'?choices.provider:choices.photoProvider; }
