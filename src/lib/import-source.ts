/** Raw user-selected archive input. No Firebase, browser state or projection snapshots. */
export const IMPORT_FORMAT = 'alternate-gratitude-zip-v1';
export const NO_PROMPT = '[No prompt]';
export type ImportSource = {
  id: number; noteId: string; noteText: string; createdOn: number; createdOnStr: string;
  updatedOn: number; updatedOnStr: string; noteColor: string; imagePath: string | null;
  driveImagePath: string | null; addressTo: string; prompt: string | null;
  promptId: string | null; moodId: string | null; backgroundId: string | null;
};
export type ImportAttachment = { photoId: string; sourceDigest: string };
export type ImportInput = { format: typeof IMPORT_FORMAT; sourceKey: string; entryId: string; source: ImportSource; attachments: ImportAttachment[] };
export type ImportOrigin = ImportInput & { confirmationId: string };
export const SOURCE_KEYS = ['id','noteId','noteText','createdOn','createdOnStr','updatedOn','updatedOnStr','noteColor','imagePath','driveImagePath','addressTo','prompt','promptId','moodId','backgroundId'] as const;
export function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const bounded = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const optional = (v: unknown, max: number) => v === null || bounded(v, max);
function sourceDate(value: unknown, millis: unknown) {
  if (!bounded(value, 40) || !Number.isSafeInteger(millis)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})(Z|[+-]\d{2}:\d{2})$/.exec(value as string);
  if (!match) return false;
  const [,y,m,d,h,min,s] = match.map(Number);
  const calendar = new Date(Date.UTC(y,m-1,d,h,min,s));
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && h < 24 && min < 60 && s < 60 && calendar.getUTCDate() === d && Date.parse(value as string) === millis;
}
export function validImportSource(v: unknown): v is ImportSource {
  if (!exactKeys(v, SOURCE_KEYS)) return false;
  return Number.isSafeInteger(v.id) && Number(v.id) >= 0 && bounded(v.noteId, 80) && !!String(v.noteId).trim()
    && bounded(v.noteText, 10000) && optional(v.prompt, 600) && (v.prompt === null || !!String(v.prompt).trim())
    && sourceDate(v.createdOnStr, v.createdOn) && sourceDate(v.updatedOnStr, v.updatedOn)
    && Number(v.createdOn) >= 0 && Number(v.updatedOn) >= Number(v.createdOn)
    && typeof v.noteColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.noteColor)
    && optional(v.imagePath, 512) && optional(v.driveImagePath, 512) && bounded(v.addressTo, 500)
    && optional(v.promptId, 80) && optional(v.moodId, 80) && optional(v.backgroundId, 80);
}
export function hasSourcePhoto(source: ImportSource) { return !!(source.imagePath || source.driveImagePath); }
export function validImportInput(v: unknown): v is ImportInput {
  if (!exactKeys(v, ['format','sourceKey','entryId','source','attachments'])) return false;
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
  return v.format === IMPORT_FORMAT && typeof v.sourceKey === 'string' && /^[a-f0-9]{64}$/.test(v.sourceKey) && v.entryId === `e_${v.sourceKey}` && validImportSource(v.source)
    && Array.isArray(v.attachments) && v.attachments.length === (hasSourcePhoto(v.source) ? 1 : 0)
    && v.attachments.every(a => exactKeys(a, ['photoId','sourceDigest']) && id(a.photoId) && typeof a.sourceDigest === 'string' && /^[a-f0-9]{64}$/.test(a.sourceDigest))
    && (!!v.source.noteText.trim() || v.attachments.length > 0);
}
/** Fixed source-field order makes identity independent of JSON property order. */
export function canonicalInput(input: ImportInput) {
  return JSON.stringify([input.format, SOURCE_KEYS.map(key => input.source[key]), input.attachments.map(a => a.sourceDigest)]);
}

export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(stableJSON).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+stableJSON(v)).join(',')+'}';
  return JSON.stringify(value);
}
