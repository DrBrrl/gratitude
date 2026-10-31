import type { PairProjection } from './domain.ts';
export type InboxEvent = { eventId: string; schemaVersion: 1; type: 'HugRead'; actorUid: string; sequence: number; recordedAt: string; payload: { pairId: string; hugId: string } };
export type InboxProjection = { sequence: number; lastEventId: string | null; seen: Record<string, true> };
export function emptyInbox(): InboxProjection { return { sequence: 0, lastEventId: null, seen: {} }; }
export function applyInbox(before: InboxProjection, event: InboxEvent, uid: string): InboxProjection {
  if (event.schemaVersion !== 1 || event.type !== 'HugRead' || event.actorUid !== uid || event.sequence !== before.sequence + 1 || !event.eventId || !Number.isFinite(Date.parse(event.recordedAt)) || Object.keys(event.payload).sort().join(',') !== 'hugId,pairId' || !/^[a-zA-Z0-9_-]{1,80}$/.test(event.payload.pairId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(event.payload.hugId)) throw new Error('Invalid private inbox history.');
  return { sequence: event.sequence, lastEventId: event.eventId, seen: { ...before.seen, [`${event.payload.pairId}/${event.payload.hugId}`]: true } };
}
export function applyReadState(pairs: Record<string, PairProjection>, inbox: InboxProjection, uid: string) {
  return Object.fromEntries(Object.entries(pairs).map(([id,pair]) => [id, { ...pair, hugs: pair.hugs.map(hug => ({ ...hug, read: hug.to === uid && !!inbox.seen[`${id}/${hug.id}`] })) }]));
}
