/** Pure event contract shared by backend validation and browser replay. No SDK imports. */
export const GENERATION = 'v1';
export const STARTER_ID = 'small-moment-v1';
export const STARTER_PROMPT = 'What is one small thing you appreciated today?';
export type Action = {
  eventId: string;
  type: 'ReflectionWritten';
  schemaVersion: 1;
  payload: { entryId: string; text: string; expectedRevision: number; starterId: typeof STARTER_ID };
};
export type JournalEvent = Action & { sequence: number; recordedAt: string };
export type Entry = { id: string; text: string; prompt: string; revision: number; colour: number; recordedAt: string };
export type Projection = { version: 1; cursor: number; lastEventId: string | null; entries: Entry[] };
export function emptyProjection(): Projection { return { version: 1, cursor: 0, lastEventId: null, entries: [] }; }
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
function exactKeys(object: Record<string, unknown>, keys: string[]) {
  return Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));
}
export function parseAction(input: unknown): Action {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action');
  const value = input as Record<string, unknown>;
  if (!exactKeys(value, ['eventId', 'type', 'schemaVersion', 'payload']) ||
      typeof value.eventId !== 'string' || !idPattern.test(value.eventId) ||
      value.type !== 'ReflectionWritten' || value.schemaVersion !== 1 ||
      !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) throw new Error('Invalid action');
  const p = value.payload as Record<string, unknown>;
  if (!exactKeys(p, ['entryId', 'text', 'expectedRevision', 'starterId']) ||
      typeof p.entryId !== 'string' || !idPattern.test(p.entryId) ||
      typeof p.text !== 'string' || !p.text.trim() || p.text.length > 10_000 ||
      !Number.isSafeInteger(p.expectedRevision) || Number(p.expectedRevision) < 0 ||
      p.starterId !== STARTER_ID) throw new Error('Invalid reflection input');
  // Explicit construction also canonicalizes property order for idempotency checks.
  return { eventId: value.eventId, type: 'ReflectionWritten', schemaVersion: 1,
    payload: { entryId: p.entryId, text: p.text, expectedRevision: Number(p.expectedRevision), starterId: STARTER_ID } };
}
export function applyEvent(state: Projection, event: JournalEvent): Projection {
  const action = parseAction({ eventId: event.eventId, type: event.type, schemaVersion: event.schemaVersion, payload: event.payload });
  if (event.sequence !== state.cursor + 1 || !Number.isFinite(Date.parse(event.recordedAt))) throw new Error('Incomplete or invalid event stream');
  const existing = state.entries.find((entry) => entry.id === action.payload.entryId);
  if ((existing?.revision ?? 0) !== action.payload.expectedRevision) throw new Error('Conflicting reflection revision');
  const entry: Entry = { id: action.payload.entryId, text: action.payload.text, prompt: STARTER_PROMPT,
    revision: action.payload.expectedRevision + 1, colour: existing?.colour ?? state.entries.length % 7,
    recordedAt: existing?.recordedAt ?? event.recordedAt };
  return { version: 1, cursor: event.sequence, lastEventId: event.eventId,
    entries: existing ? state.entries.map((old) => old.id === entry.id ? entry : old) : [...state.entries, entry] };
}
export function replay(events: JournalEvent[], start = emptyProjection()): Projection {
  return events.reduce(applyEvent, start);
}
