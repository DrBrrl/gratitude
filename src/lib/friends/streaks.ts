import { dayInZone, validDay } from '../civil-date.ts';
import { summarizeStretches, type DayIndex } from '../calendar.ts';
import type { Entry } from '../domain.ts';
export function gratitudeDays(entries: Entry[], timeZone: string) {
  return [...new Set(entries.map(entry => dayInZone(entry.entryAt ?? entry.recordedAt, timeZone)))].sort();
}
export function streakSummary(days: string[], today: string) {
  if (!validDay(today) || days.some(day => !validDay(day))) throw new Error('Invalid shared gratitude dates.');
  const index: DayIndex = new Map(days.map(day => [day, []]));
  return summarizeStretches(index, today);
}
export function communityStreak(own: string[], peer: string[], today: string) {
  const theirs = new Set(peer);
  return streakSummary(own.filter(day => theirs.has(day)), today);
}
export type SharingAction = { eventId: string; schemaVersion: 1; type: 'GratitudeSharingChosen'; actorUid: string; sequence: number; recordedAt: string; payload: { previousEventId: string | null; enabled: boolean; timeZone: string } };
export type SharingProjection = { uid: string; sequence: number; lastEventId: string | null; enabled: boolean; timeZone: string | null };
export function emptySharing(uid: string): SharingProjection { return { uid, sequence: 0, lastEventId: null, enabled: false, timeZone: null }; }
export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 100) return false;
  try { new Intl.DateTimeFormat('en-AU', { timeZone: zone }).format(0); return true; } catch { return false; }
}
export function applySharing(state: SharingProjection, event: SharingAction): SharingProjection {
  const p = event.payload;
  if (event.type !== 'GratitudeSharingChosen' || event.schemaVersion !== 1 || event.actorUid !== state.uid || event.sequence !== state.sequence + 1 || p.previousEventId !== state.lastEventId || typeof p.enabled !== 'boolean' || !validTimeZone(p.timeZone) || !/^[a-zA-Z0-9_-]{1,80}$/.test(event.eventId) || !Number.isFinite(Date.parse(event.recordedAt)) || Object.keys(p).sort().join(',') !== 'enabled,previousEventId,timeZone') throw new Error('Invalid gratitude sharing action.');
  return { uid: state.uid, sequence: event.sequence, lastEventId: event.eventId, enabled: p.enabled, timeZone: p.enabled ? p.timeZone : null };
}
export type SharedGratitude = { schemaVersion: 1; publicationId: string; sharingEventId: string; timeZone: string; days: string[] };
