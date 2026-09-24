import type { Entry } from './domain';
export const colours = ['#ed8f99', '#edb081', '#ebd17b', '#96c292', '#8fcace', '#9aafe8', '#c4a1e0'];
export function normalized(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en'); }
export function searchEntries(entries: Entry[], query: string) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return [...entries].reverse().filter((entry) => words.every((word) => normalized(`${entry.prompt} ${entry.text}`).includes(word)));
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
