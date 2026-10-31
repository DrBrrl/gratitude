/** Social source events contain user actions; all relationship state is derived. */
export const SOCIAL_VERSION = 1;
export type ProfileInput = { username: string; displayName: string; discoverable: boolean };
export type Profile = ProfileInput & { uid: string; sequence: number; lastEventId: string | null };
export type ProfileEvent = { eventId: string; schemaVersion: 1; sequence: number; recordedAt: string; type: 'FriendProfileChosen'; actorUid: string; payload: ProfileInput };
export type PairType = 'FriendRequestSent' | 'FriendRequestAccepted' | 'FriendRequestDeclined' | 'FriendRequestCancelled' | 'FriendRemoved' | 'FriendBlocked' | 'FriendUnblocked' | 'HugPreferencesChosen' | 'HugSent';
export type PairAction = { eventId: string; type: PairType; actorUid: string; targetUid: string; payload: { previousEventId: string | null; allowHugs?: boolean } };
export type PairEvent = PairAction & { schemaVersion: 1; sequence: number; recordedAt: string };
export type PairHead = { members: [string, string]; sequence: number; lastEventId: string | null; status: 'none' | 'pending' | 'accepted'; requesterUid: string | null; blockedA: boolean; blockedB: boolean; hugsA: boolean; hugsB: boolean; requestedAt: string | null; lastHugA: string | null; lastHugB: string | null };
export type Hug = { id: string; from: string; to: string; at: string; read: boolean };
export type PairProjection = PairHead & { hugs: Hug[] };
export function usernameKey(input: string) { return input.trim().toLowerCase().replace(/^@/, ''); }
export function validateProfile(input: ProfileInput) {
  if (!input || typeof input.username !== 'string' || !/^[a-z][a-z0-9_]{2,23}$/.test(usernameKey(input.username)) || input.username.length > 30) throw new Error('Use 3–24 letters, numbers or underscores, starting with a letter.');
  if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 60) throw new Error('Choose a display name of 1–60 characters.');
  if (typeof input.discoverable !== 'boolean' || Object.keys(input).sort().join(',') !== 'discoverable,displayName,username') throw new Error('Invalid friend profile.');
}
export function emptyProfile(uid: string): Profile { return { uid, username: '', displayName: '', discoverable: false, sequence: 0, lastEventId: null }; }
export function applyProfile(before: Profile, event: ProfileEvent): Profile {
  validateProfile(event.payload);
  if (event.schemaVersion !== 1 || event.type !== 'FriendProfileChosen' || event.actorUid !== before.uid || event.sequence !== before.sequence + 1 || !event.eventId || !Number.isFinite(Date.parse(event.recordedAt))) throw new Error('Invalid profile history.');
  return { ...event.payload, username: usernameKey(event.payload.username), displayName: event.payload.displayName.trim(), uid: before.uid, sequence: event.sequence, lastEventId: event.eventId };
}
export function emptyPair(a: string, b: string): PairProjection {
  if (!a || !b || a === b) throw new Error('Choose another person.');
  return { members: [a, b], sequence: 0, lastEventId: null, status: 'none', requesterUid: null, blockedA: false, blockedB: false, hugsA: true, hugsB: true, requestedAt: null, lastHugA: null, lastHugB: null, hugs: [] };
}
export function pairHead(pair: PairProjection): PairHead { const { hugs: _, ...head } = pair; return head; }
export function canHug(pair: PairHead, actor: string, now: number) {
  const a = actor === pair.members[0];
  const last = a ? pair.lastHugA : pair.lastHugB;
  return pair.members.includes(actor) && pair.status === 'accepted' && !pair.blockedA && !pair.blockedB && (a ? pair.hugsB : pair.hugsA) && (!last || now - Date.parse(last) >= 86_400_000);
}
export function applyPair(before: PairProjection, event: PairEvent): PairProjection {
  const p = event.payload, a = event.actorUid === before.members[0], now = Date.parse(event.recordedAt);
  if (event.schemaVersion !== 1 || event.sequence !== before.sequence + 1 || p.previousEventId !== before.lastEventId || !before.members.includes(event.actorUid) || event.targetUid !== before.members[a ? 1 : 0] || !Number.isFinite(now) || !event.eventId) throw new Error('Invalid friendship history.');
  const keys = event.type === 'HugPreferencesChosen' ? 'allowHugs,previousEventId' : 'previousEventId';
  if (Object.keys(p).sort().join(',') !== keys) throw new Error('Invalid friendship action.');
  let next = { ...before, sequence: event.sequence, lastEventId: event.eventId };
  const connected = !before.blockedA && !before.blockedB;
  switch (event.type) {
    case 'FriendRequestSent':
      if (!connected || before.status !== 'none' || before.requestedAt && now - Date.parse(before.requestedAt) < 86_400_000) throw new Error('A request cannot be sent yet.');
      next = { ...next, status: 'pending', requesterUid: event.actorUid, requestedAt: event.recordedAt }; break;
    case 'FriendRequestAccepted':
    case 'FriendRequestDeclined':
      if (!connected || before.status !== 'pending' || before.requesterUid === event.actorUid) throw new Error('Only the recipient can answer this request.');
      next = { ...next, status: event.type === 'FriendRequestAccepted' ? 'accepted' : 'none', requesterUid: null }; break;
    case 'FriendRequestCancelled':
      if (before.status !== 'pending' || before.requesterUid !== event.actorUid) throw new Error('Only the sender can cancel this request.');
      next = { ...next, status: 'none', requesterUid: null }; break;
    case 'FriendRemoved':
      if (before.status !== 'accepted') throw new Error('This friendship has already ended.');
      next = { ...next, status: 'none', requesterUid: null }; break;
    case 'FriendBlocked':
      if (a ? before.blockedA : before.blockedB) throw new Error('Already blocked.');
      next = { ...next, status: 'none', requesterUid: null, [a ? 'blockedA' : 'blockedB']: true }; break;
    case 'FriendUnblocked':
      if (!(a ? before.blockedA : before.blockedB)) throw new Error('Not blocked.');
      next = { ...next, [a ? 'blockedA' : 'blockedB']: false }; break;
    case 'HugPreferencesChosen':
      if (typeof p.allowHugs !== 'boolean' || before.status !== 'accepted') throw new Error('Choose hug preferences for an accepted friend.');
      next = { ...next, [a ? 'hugsA' : 'hugsB']: p.allowHugs }; break;
    case 'HugSent':
      if (!canHug(before, event.actorUid, now)) throw new Error('Hugs are paused, or you have already sent a hug in the past 24 hours.');
      next = { ...next, [a ? 'lastHugA' : 'lastHugB']: event.recordedAt, hugs: [...before.hugs, { id: event.eventId, from: event.actorUid, to: event.targetUid, at: event.recordedAt, read: false }] }; break;
    default: throw new Error('Unknown friendship action.');
  }
  return next;
}
