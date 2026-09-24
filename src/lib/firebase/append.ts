import { doc, getDocFromServer, runTransaction, serverTimestamp, type Firestore, type DocumentData } from 'firebase/firestore';
import { GENERATION, parseAction, type Action, type JournalEvent } from '../domain.ts';

export function decodeEvent(data: DocumentData): JournalEvent {
  return { ...data, recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : data.recordedAt.toDate().toISOString() } as JournalEvent;
}

/** Security Rules independently validate every part of this atomic append. */
export async function appendReflection(db: Firestore, uid: string, input: Action) {
  const action = parseAction(input);
  const stream = doc(db, `users/${uid}/streams/${GENERATION}`);
  const event = doc(db, `${stream.path}/events/${action.eventId}`);
  const pointer = doc(db, `${stream.path}/entries/${action.payload.entryId}`);
  const resultFromPrior = (value: DocumentData) => {
    const original = parseAction({ eventId: value.eventId, type: value.type, schemaVersion: value.schemaVersion, payload: value.payload });
    if (JSON.stringify(original) !== JSON.stringify(action)) throw new Error('Action ID already used with different input.');
    return { sequence: value.sequence, eventId: action.eventId };
  };
  for (let attempt = 0; ; attempt++) {
    try { return await runTransaction(db, async (tx) => {
      const prior = await tx.get(event);
      if (prior.exists()) return resultFromPrior(prior.data());
      const head = await tx.get(stream);
      const latest = await tx.get(pointer);
      let revision = 0;
      if (latest.exists()) {
        const previous = await tx.get(doc(db, `${stream.path}/events/${latest.get('lastEventId')}`));
        if (!previous.exists()) throw new Error('Incomplete reflection history.');
        revision = previous.get('payload.expectedRevision') + 1;
      }
      if (revision !== action.payload.expectedRevision) throw new Error('This reflection changed on another device. Your text has been kept; reload the reflection before editing again.');
      const sequence = (head.get('sequence') ?? 0) + 1;
      tx.set(event, { ...action, sequence, recordedAt: serverTimestamp() });
      tx.set(stream, { sequence, lastEventId: action.eventId });
      tx.set(pointer, { lastEventId: action.eventId });
      return { sequence, eventId: action.eventId };
    }); } catch (error) {
      // Racing identical commits can fail Rules before the SDK retries its precondition.
      // Only a server-confirmed, identical immutable event counts as acknowledgement.
      if ((error as { code?: string }).code === 'permission-denied') {
        const prior = await getDocFromServer(event);
        if (prior.exists()) return resultFromPrior(prior.data());
        // Another device can advance the head before Rules evaluates our commit.
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
}
