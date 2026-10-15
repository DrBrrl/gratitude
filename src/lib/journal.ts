import type { Entry } from './domain';
export const colours = ['#f16f83', '#f4a34b', '#e8cb51', '#60cf89', '#26d8e5', '#269dff', '#b669ff'];
export function entryTimestamp(entry: Entry) { return entry.entryAt ?? entry.recordedAt; }
export function chronologicalEntries(entries: Entry[]) {
  // User-selected times have second precision. Ignore receipt-time milliseconds
  // when breaking a tie, then keep the later-created entry first.
  return [...entries].reverse().sort((a, b) => Math.floor(Date.parse(entryTimestamp(b)) / 1000) - Math.floor(Date.parse(entryTimestamp(a)) / 1000));
}
export function localDateTime(value: Date | string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function localDay(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function todayReflection(entries: Entry[], day: string) {
  const entry = entries.find(entry => localDay(entryTimestamp(entry)) === day);
  return { entry, colour: entry?.colour ?? entries.filter(entry => localDay(entryTimestamp(entry)) < day).length % colours.length };
}
export function normalized(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en'); }
export function searchEntries(entries: Entry[], query: string) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return chronologicalEntries(entries).filter((entry) => words.every((word) => normalized(`${entry.prompt} ${entry.text}`).includes(word)));
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
