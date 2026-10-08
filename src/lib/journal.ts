import type { Entry } from './domain';
export const colours = ['#f16f83', '#f4a34b', '#e8cb51', '#60cf89', '#26d8e5', '#269dff', '#b669ff'];
export function localDay(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function todayReflection(entries: Entry[], day: string) {
  const entry = entries.find(entry => localDay(entry.recordedAt) === day);
  return { entry, colour: entry?.colour ?? entries.filter(entry => localDay(entry.recordedAt) < day).length % colours.length };
}
export function normalized(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en'); }
export function searchEntries(entries: Entry[], query: string) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return [...entries].reverse().filter((entry) => words.every((word) => normalized(`${entry.prompt} ${entry.text}`).includes(word)));
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
