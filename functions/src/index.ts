import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { GENERATION, parseAction } from './domain.js';

initializeApp();
const db = getFirestore();
export const appendReflection = onCall({ region: 'australia-southeast1', maxInstances: 3, cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to save your reflection.');
  if (request.auth.token.firebase?.sign_in_provider !== 'google.com') throw new HttpsError('permission-denied', 'Use Google sign-in.');
  let action;
  try { action = parseAction(request.data); }
  catch { throw new HttpsError('invalid-argument', 'Invalid reflection input.'); }
  const uid = request.auth.uid; // Never trust a UID from request data.
  const stream = db.doc(`users/${uid}/streams/${GENERATION}`);
  const eventRef = stream.collection('events').doc(action.eventId);
  const revisionRef = db.doc(`users/${uid}/entryRevisions/${action.payload.entryId}`);
  const digest = createHash('sha256').update(JSON.stringify(action)).digest('hex');
  return db.runTransaction(async (tx) => {
    const [prior, head, revision] = await tx.getAll(eventRef, stream, revisionRef);
    if (prior.exists) {
      if (prior.get('inputDigest') !== digest) throw new HttpsError('already-exists', 'Action ID already used with different input.');
      return { sequence: prior.get('sequence'), eventId: action.eventId };
    }
    let currentRevision = revision.get('version') === 1 ? revision.get('revision') : undefined;
    if (currentRevision === undefined) {
      // This index is a disposable projection, never another source of truth.
      const history = await tx.get(stream.collection('events').where('payload.entryId', '==', action.payload.entryId));
      currentRevision = 0;
      for (const item of history.docs.sort((a, b) => a.get('sequence') - b.get('sequence'))) {
        if (item.get('payload.expectedRevision') !== currentRevision) throw new HttpsError('data-loss', 'Invalid event history.');
        currentRevision++;
      }
    }
    if (currentRevision !== action.payload.expectedRevision) {
      throw new HttpsError('failed-precondition', 'This reflection changed on another device. Your text has been kept; reload the reflection before editing again.');
    }
    // Bound per-user writes independently of the shared function instance limit.
    const now = Date.now();
    if (head.exists && now - (head.get('lastWriteMillis') ?? 0) < 200) throw new HttpsError('resource-exhausted', 'Please wait a moment before saving again.');
    const sequence = (head.get('sequence') ?? 0) + 1;
    const event = { ...action, sequence, recordedAt: new Date(now).toISOString() };
    tx.create(eventRef, { ...event, inputDigest: digest });
    tx.set(stream, { sequence, lastEventId: action.eventId, lastWriteMillis: now });
    tx.set(revisionRef, { version: 1, revision: action.payload.expectedRevision + 1, sequence });
    return { sequence, eventId: action.eventId };
  });
});
