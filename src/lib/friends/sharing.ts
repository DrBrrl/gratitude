import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { applySharing, emptySharing, gratitudeDays, type SharingProjection, type SharingAction, type SharedGratitude } from './streaks.ts';
import type { Projection } from '../domain.ts';

export async function saveGratitudeSharing(db: Firestore, uid: string, choice: { enabled: boolean; timeZone: string }, previousEventId: string | null, eventId = crypto.randomUUID()) {
  const headRef = doc(db, `friendSharing/${uid}`), eventRef = doc(db, `${headRef.path}/events/${eventId}`);
  return runTransaction(db, async tx => {
    const [head, prior] = await Promise.all([tx.get(headRef), tx.get(eventRef)]);
    const before = head.exists() ? head.data() as SharingProjection : emptySharing(uid);
    if (prior.exists()) {
      const saved = prior.get('payload');
      if (saved.previousEventId !== previousEventId || saved.enabled !== choice.enabled || saved.timeZone !== choice.timeZone) throw new Error('Sharing action ID already used.');
      return before;
    }
    if (before.lastEventId !== previousEventId) throw new Error('Streak sharing changed on another device. Review your choice and try again.');
    const event: SharingAction = { eventId, schemaVersion: 1, type: 'GratitudeSharingChosen', actorUid: uid, sequence: before.sequence + 1, recordedAt: new Date().toISOString(), payload: { previousEventId, ...choice } };
    const next = applySharing(before, event);
    tx.set(eventRef, { ...event, recordedAt: serverTimestamp() }); tx.set(headRef, next);
    if (!choice.enabled) { tx.delete(doc(db, `friendGratitude/${uid}`)); tx.delete(doc(db, `users/${uid}/privateProjections/gratitudeDays`)); }
    return next;
  });
}

/** Only civil dates leave the private journal; provenance remains owner-only. */
export async function publishGratitude(db: Firestore, uid: string, sharing: SharingProjection, state: Projection) {
  if (!sharing.enabled || !sharing.timeZone || !sharing.lastEventId) return;
  const days = gratitudeDays(state.entries, sharing.timeZone);
  if (days.length > 36600) throw new Error('This shared calendar is larger than the supported date range.');
  const sharingRef = doc(db, `friendSharing/${uid}`), publicRef = doc(db, `friendGratitude/${uid}`);
  const receiptRef = doc(db, `users/${uid}/privateProjections/gratitudeDays`);
  const snapshot: SharedGratitude = { schemaVersion: 1, publicationId: crypto.randomUUID(), sharingEventId: sharing.lastEventId, timeZone: sharing.timeZone, days };
  return runTransaction(db, async tx => {
    const [choice, head, current] = await Promise.all([tx.get(sharingRef), tx.get(doc(db, `users/${uid}/streams/v1`)), tx.get(publicRef)]);
    if (!choice.get('enabled') || choice.get('lastEventId') !== sharing.lastEventId) return;
    if ((head.get('sequence') ?? 0) !== state.cursor || (head.get('lastEventId') ?? null) !== state.lastEventId) return;
    if (current.exists() && current.get('sharingEventId') === snapshot.sharingEventId && current.get('timeZone') === snapshot.timeZone && JSON.stringify(current.get('days')) === JSON.stringify(days)) return true;
    tx.set(publicRef, snapshot);
    tx.set(receiptRef, { publicationId: snapshot.publicationId, sharingEventId: sharing.lastEventId, sourceSequence: state.cursor, sourceEventId: state.lastEventId });
    return true;
  });
}
