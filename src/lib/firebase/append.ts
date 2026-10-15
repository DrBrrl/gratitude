import { doc, getDocFromServer, runTransaction, serverTimestamp, Timestamp, type Firestore, type DocumentData } from 'firebase/firestore';
import { GENERATION, parseAction, promptId, emptyControl, nextControl, STARTER_ID, type SourceAction, type JournalEvent, isPhotoAction, photoKey } from '../domain.ts';

export function decodeEvent(data: DocumentData): JournalEvent {
  const payload = data.type === 'ReflectionWritten' && (data.schemaVersion === 3 || data.schemaVersion === 4) && data.payload.entryAt
    ? { ...data.payload, entryAt: typeof data.payload.entryAt === 'string' ? data.payload.entryAt : data.payload.entryAt.toDate().toISOString() } : data.payload;
  return { ...data, payload, recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : data.recordedAt.toDate().toISOString() } as JournalEvent;
}

/** Security Rules independently validate every part of this atomic append. */
export async function appendReflection(db: Firestore, uid: string, input: SourceAction) {
  const action = parseAction(input);
  const stream = doc(db, `users/${uid}/streams/${GENERATION}`);
  const event = doc(db, `${stream.path}/events/${action.eventId}`);
  const pointer = doc(db, action.type === 'ReflectionWritten' ? `${stream.path}/entries/${action.payload.entryId}` : isPhotoAction(action) ? `${stream.path}/photos/${photoKey(action.payload.entryId, action.payload.slot)}` : `${stream.path}/ai/control`);
  const resultFromPrior = (value: DocumentData) => {
    const decoded = decodeEvent(value);
    const original = parseAction({ eventId: decoded.eventId, type: decoded.type, schemaVersion: decoded.schemaVersion, payload: decoded.payload });
    if (JSON.stringify(original) !== JSON.stringify(action)) throw new Error('Action ID already used with different input.');
    return { sequence: value.sequence, eventId: action.eventId, created: false };
  };
  for (let attempt = 0; ; attempt++) {
    try { return await runTransaction(db, async (tx) => {
      const prior = await tx.get(event);
      if (prior.exists()) return resultFromPrior(prior.data());
      const head = await tx.get(stream);
      const latest = await tx.get(pointer);
      let metadata: Record<string, unknown>;
      if (action.type === 'ReflectionWritten') {
        let revision = 0;
        if (latest.exists()) {
          const previous = await tx.get(doc(db, `${stream.path}/events/${latest.get('lastEventId')}`));
          if (!previous.exists()) throw new Error('Incomplete reflection history.');
          revision = previous.get('payload.expectedRevision') + 1;
          const original = previous.get('payload.promptId') ?? STARTER_ID;
          if (promptId(action) !== original) throw new Error('A saved reflection keeps its original prompt.');
          const previousAt = previous.get('payload.entryAt') as Timestamp | undefined;
          if (action.schemaVersion === 3 || action.schemaVersion === 4 ? (previousAt?.toDate().toISOString() ?? null) !== action.payload.entryAt : !!previousAt) throw new Error('A saved reflection keeps its original entry date.');
        }
        if (revision !== action.payload.expectedRevision) throw new Error('This reflection changed on another device. Your text has been kept; reload the reflection before editing again.');
        metadata = { lastEventId: action.eventId };
      } else if (isPhotoAction(action)) {
        if ((latest.get('lastEventId') ?? null) !== action.payload.previousEventId) throw new Error('This photo changed on another device. Reload before trying again.');
        metadata = { lastEventId: action.eventId };
      } else {
        const control = latest.exists() ? latest.data() as ReturnType<typeof emptyControl> : emptyControl();
        metadata = nextControl(control, action);
        if (action.type === 'PromptRequested') {
          if (action.payload.choicesId !== control.choicesId) throw new Error('AI consent changed. Please try again.');
          const choices = await tx.get(doc(db, `${stream.path}/events/${action.payload.choicesId}`));
          if (!choices.get('payload.enabled')) throw new Error('Enable AI prompts in Settings first.');
          for (const ref of action.payload.entryRefs) {
            const entry = await tx.get(doc(db, `${stream.path}/entries/${ref.entryId}`));
            if (!entry.exists()) throw new Error('AI context changed. Please try again.');
            const source = await tx.get(doc(db, `${stream.path}/events/${entry.get('lastEventId')}`));
            if (source.get('payload.expectedRevision') + 1 !== ref.revision) throw new Error('AI context changed. Please try again.');
          }
        }
      }
      const sequence = (head.get('sequence') ?? 0) + 1;
      const payload = action.type === 'ReflectionWritten' && (action.schemaVersion === 3 || action.schemaVersion === 4) && action.payload.entryAt
        ? { ...action.payload, entryAt: Timestamp.fromDate(new Date(action.payload.entryAt)) } : action.payload;
      tx.set(event, { ...action, payload, sequence, recordedAt: serverTimestamp() });
      tx.set(stream, { sequence, lastEventId: action.eventId });
      tx.set(pointer, metadata);
      return { sequence, eventId: action.eventId, created: true };
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
