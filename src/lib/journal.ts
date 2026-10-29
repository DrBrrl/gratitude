import type { Entry, Photo } from './domain';
import { colourForDay, colourIndexForDay } from './colours.ts';
import { dayInZone } from './civil-date.ts';
export { colours, colourForDay, colourIndexForDay } from './colours.ts';
export function entryColour(entry: Entry, zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return colourForDay(dayInZone(entryTimestamp(entry), zone));
}
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
  return { entry, colour: colourIndexForDay(day) };
}
export function normalized(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en'); }
export function searchEntries(entries: Entry[], query: string, photos: Photo[] = []) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  const ordered = chronologicalEntries(entries);
  if (!words.length) return ordered;
  const summaries = new Map<string, string[]>();
  for (const photo of photos) {
    if (photo.removed) continue;
    const list = summaries.get(photo.entryId) ?? [];
    list.push(photo.summary); summaries.set(photo.entryId, list);
  }
  return ordered.filter(entry => {
    const haystack = normalized(`${entry.prompt} ${entry.text} ${(summaries.get(entry.id) ?? []).join(' ')}`);
    return words.every(word => haystack.includes(word));
  });
}
const cardWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const cardMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function cardDateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${cardWeekdays[date.getDay()]} ${pad(date.getDate())} ${cardMonths[date.getMonth()]} ${date.getFullYear()}, ${date.getHours() % 12 || 12}:${pad(date.getMinutes())} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
