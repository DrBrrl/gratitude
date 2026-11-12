import { isOnboardingAction } from '../onboarding.ts';
import { stableJSON } from '../import-source.ts';
import { doc, getDocFromServer, runTransaction, serverTimestamp, Timestamp, type Firestore, type DocumentData } from 'firebase/firestore';
import { isRotationAction, GENERATION, parseAction, promptId, emptyControl, nextControl, STARTER_ID, isEditorRequest, isLocalRequest, requestProvider, isBackupRequest, isBackupAction, requestEntryRefs, type SourceAction, type JournalEvent, isPhotoAction, photoKey, photoProvider } from '../domain.ts';
import {BACKUP_LEASE_MS} from '../backup-prompts.ts';

export function decodeEvent(data: DocumentData): JournalEvent {
  const payload = data.type === 'ReflectionWritten' && (data.schemaVersion === 3 || data.schemaVersion === 4 || data.schemaVersion === 5 || data.schemaVersion === 6 || data.schemaVersion === 7) && data.payload.entryAt
    ? { ...data.payload, entryAt: typeof data.payload.entryAt === 'string' ? data.payload.entryAt : data.payload.entryAt.toDate().toISOString() } : data.payload;
  return { ...data, payload, recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : data.recordedAt.toDate().toISOString() } as JournalEvent;
}

/** Security Rules independently validate every part of this atomic append. */
export async function appendReflection(db: Firestore, uid: string, input: SourceAction) {
  const action = parseAction(input);
  const stream = doc(db, `users/${uid}/streams/${GENERATION}`);
  const event = doc(db, `${stream.path}/events/${action.eventId}`);
  const pointer = doc(db, action.type==='ReflectionTopicChosen'?`${stream.path}/topics/${action.payload.entryId}`:isRotationAction(action)?`${stream.path}/rotation/control`:isOnboardingAction(action) ? `${stream.path}/onboarding/control` : action.type === 'AccentColourChosen' ? `${stream.path}/appearance/control` : action.type === 'ReflectionWritten' || action.type === 'ReflectionImported' ? `${stream.path}/entries/${action.payload.entryId}` : action.type === 'ImportRecordConfirmed' ? `${stream.path}/imports/${action.payload.sourceKey}` : isBackupAction(action)?`${stream.path}/backups/${action.type==='BackupPromptImported'?action.eventId:action.payload.promptId}`:isPhotoAction(action) ? `${stream.path}/photos/${photoKey(action.payload.entryId, action.payload.slot)}` : `${stream.path}/ai/control`);
  const resultFromPrior = (value: DocumentData) => {
    const decoded = decodeEvent(value);
    const original = parseAction({ eventId: decoded.eventId, type: decoded.type, schemaVersion: decoded.schemaVersion, payload: decoded.payload });
    if (stableJSON(original) !== stableJSON(action)) throw new Error('Action ID already used with different input.');
    return { sequence: value.sequence, eventId: action.eventId, created: false };
  };
  for (let attempt = 0; ; attempt++) {
    try { return await runTransaction(db, async (tx) => {
      // These reads are independent; transaction preconditions still protect every version.
      const [prior,head,latest] = await Promise.all([tx.get(event),tx.get(stream),tx.get(pointer)]);
      if (prior.exists()) return resultFromPrior(prior.data());
      let metadata: Record<string, unknown>;
      if(action.type==='ReflectionTopicChosen') {
        const p=action.payload;
        const [entry,setup]=await Promise.all([tx.get(doc(db,`${stream.path}/entries/${p.entryId}`)),tx.get(doc(db,`${stream.path}/onboarding/control`))]);
        if(!entry.exists())throw new Error('This reflection is no longer available.');
        const source=await tx.get(doc(db,`${stream.path}/events/${entry.get('lastEventId')}`));
        if(source.get('payload.expectedRevision')+1!==p.expectedRevision)throw new Error('This reflection changed. Reopen it before choosing a topic.');
        if((latest.get('lastEventId')??null)!==p.previousEventId)throw new Error('The topic changed on another device. Please choose again.');
        if((setup.get('answersId')??null)!==p.answersId)throw new Error('Your topics changed. Please reopen the picker.');
        metadata={lastEventId:action.eventId};
      } else if(isRotationAction(action)){metadata={lastEventId:action.eventId};
      } else if (isOnboardingAction(action)) {
        const answersId = latest.get('answersId') ?? null;
        const version = latest.get('version') ?? 0;
        if (action.type === 'OnboardingFinished' ? action.payload.version <= version : action.payload.previousEventId !== answersId) {
          throw new Error(action.type === 'OnboardingFinished' ? 'This setup has already been acknowledged on another device.' : 'Your answers changed on another device. Your draft is kept; review the latest answers before saving.');
        }
        metadata = { lastEventId: action.eventId,
          answersId: action.type === 'OnboardingFinished' ? answersId : action.eventId,
          version: action.type === 'OnboardingFinished' ? action.payload.version : version,
          outcomeId: action.type === 'OnboardingFinished' ? action.eventId : latest.get('outcomeId') ?? null };
      } else if (action.type === 'AccentColourChosen') {
        if ((latest.get('lastEventId') ?? null) !== action.payload.previousEventId) throw new Error('Your accent colour changed on another device. Please choose again.');
        metadata = { lastEventId: action.eventId };
      } else if (isBackupAction(action)) {
        if(action.type==='BackupPromptRemoved' && !latest.exists()) {const source=await tx.get(doc(db,`${stream.path}/events/${action.payload.promptId}`));if(!source.exists() || source.get('type')!=='PromptResponseReceived') throw new Error('Unknown backup prompt.');}
        metadata={lastEventId:action.eventId};
      } else if (action.type === 'ImportRecordConfirmed') {
        if (latest.exists() || (await tx.get(doc(db, `${stream.path}/entries/${action.payload.entryId}`))).exists()) throw new Error('Import identity already claimed.');
        metadata = { confirmationId: action.eventId, lastEventId: action.eventId };
      } else if (action.type === 'ReflectionImported') {
        const receiptRef = doc(db, `${stream.path}/imports/${action.payload.sourceKey}`);
        const receipt = await tx.get(receiptRef);
        if (latest.exists() || receipt.get('confirmationId') !== action.payload.confirmationId || receipt.get('lastEventId') !== action.payload.confirmationId) throw new Error('Import cannot be completed in this state.');
        metadata = { lastEventId: action.eventId, importId: action.payload.confirmationId };
      } else if (action.type === 'ReflectionWritten') {
        let revision = 0;
        if (latest.exists()) {
          const previous = await tx.get(doc(db, `${stream.path}/events/${latest.get('lastEventId')}`));
          if (!previous.exists()) throw new Error('Incomplete reflection history.');
          revision = previous.get('payload.expectedRevision') + 1;
          if (latest.get('importId') && action.schemaVersion !== 6 && action.schemaVersion !== 7) throw new Error('Use the current editor for imported reflections.');
          const original = previous.get('payload.promptId') ?? STARTER_ID;
          if (action.schemaVersion !== 5 && action.schemaVersion !== 6 && action.schemaVersion !== 7 && promptId(action) !== original) throw new Error('A saved reflection keeps its original prompt.');
          const previousAt = previous.get('payload.entryAt') as Timestamp | undefined;
          if (action.schemaVersion !== 6 && action.schemaVersion !== 7 && (action.schemaVersion === 3 || action.schemaVersion === 4 || action.schemaVersion === 5 ? (previousAt?.toDate().toISOString() ?? null) !== action.payload.entryAt : !!previousAt)) throw new Error('A saved reflection keeps its original entry date.');
        }
        if (revision !== action.payload.expectedRevision) throw new Error('This reflection changed on another device. Your text has been kept; reload the reflection before editing again.');
        metadata = { lastEventId: action.eventId, ...(latest.get('importId') ? { importId: latest.get('importId') } : {}) };
      } else if (isPhotoAction(action)) {
        if(action.type==='PhotoSummaryRequested') {
          const control=await tx.get(doc(db,`${stream.path}/ai/control`));
          const choicesId=control.get('choicesId');
          const choices=choicesId?await tx.get(doc(db,`${stream.path}/events/${choicesId}`)):null;
          if(photoProvider({provider:choices?.get('payload.provider')??'gemini',photoProvider:choices?.get('payload.photoProvider')} as Parameters<typeof photoProvider>[0])!==(action.schemaVersion===1?'gemini':action.payload.provider) || action.schemaVersion>=3 && 'choicesId' in action.payload && action.payload.choicesId!==choicesId) throw new Error('AI provider changed. Review your model settings.');
        }
        if(action.type==='PhotoSummaryResponseReceived' && latest.exists()) {
          const original=await tx.get(doc(db,`${stream.path}/events/${latest.get('lastEventId')}`));
          if(original.get('schemaVersion')>=3) {
            const control=await tx.get(doc(db,`${stream.path}/ai/control`));
            if(control.get('choicesId')!==original.get('payload.choicesId')) throw new Error('Photo model settings changed. The late summary was discarded.');
          }
        }
        if(action.type==='PhotoSummaryRequested'&&action.schemaVersion===4||action.type==='PhotoSummaryResponseReceived'&&latest.exists()){const source=action.type==='PhotoSummaryRequested'?action:(await tx.get(doc(db,`${stream.path}/events/${latest.get('lastEventId')}`))).data();if(source?.schemaVersion===4){const p=source.payload;const bound=await tx.get(doc(db,`users/${uid}/privateConnections/${p.connectionId}`));if(bound.get('provider')!==p.provider||bound.get('model')!==p.model||bound.get('revision')!==p.connectionRevision)throw new Error('Model connection changed or was removed.');}}
        if ((latest.get('lastEventId') ?? null) !== action.payload.previousEventId) throw new Error('This photo changed on another device. Reload before trying again.');
        metadata = { lastEventId: action.eventId };
      } else {
        const control = latest.exists() ? latest.data() as ReturnType<typeof emptyControl> : emptyControl();
        metadata = nextControl(control, action);
        if(action.type==='PromptRequested' && 'answersId' in action.payload || action.type==='PromptResponseReceived'){
          const request=action.type==='PromptRequested'?action:decodeEvent((await tx.get(doc(db,`${stream.path}/events/${action.payload.requestId}`))).data()!) as Extract<SourceAction,{type:'PromptRequested'}>;
          if('connectionId' in request.payload){const bound=await tx.get(doc(db,`users/${uid}/privateConnections/${request.payload.connectionId}`));if(bound.get('provider')!==request.payload.provider||bound.get('model')!==request.payload.model||bound.get('revision')!==request.payload.connectionRevision)throw new Error('Model connection changed or was removed.');}
          if('answersId' in request.payload){const setup=await tx.get(doc(db,`${stream.path}/onboarding/control`));if((setup.get('answersId')??null)!==request.payload.answersId)throw new Error('Questionnaire answers changed.');}
          if(action.type==='PromptResponseReceived' && (action.schemaVersion===2)!==(request.schemaVersion>=13))throw new Error('Prompt response schema does not match its request.');
        }
        if (action.type === 'PromptRequested') {
          if('differentFromPromptId' in action.payload){const prior=await tx.get(doc(db,`${stream.path}/events/${action.payload.differentFromPromptId}`));if(prior.get('type')!=='PromptResponseReceived')throw new Error('Previous generated prompt is unavailable.');}
          if (action.payload.choicesId !== control.choicesId) throw new Error('AI consent changed. Please try again.');
          const choices = await tx.get(doc(db, `${stream.path}/events/${action.payload.choicesId}`));
          if ((isBackupRequest(action)?choices.get('payload.backupProvider'):(choices.get('payload.provider')??'gemini'))!==requestProvider(action)) throw new Error('AI provider changed. Review your model settings.');
          if(isBackupRequest(action)) {
            if(!choices.get('payload.backupEnabled')) throw new Error('Backup generation is disabled.');
            if(control.requestId) {const pending=await tx.get(doc(db,`${stream.path}/events/${control.requestId}`));if(pending.exists() && Date.now()-pending.get('recordedAt').toMillis()<BACKUP_LEASE_MS) throw new Error('Another prompt is being generated.');}
          }
          if (!choices.get('payload.enabled')) throw new Error('Enable AI prompts in Settings first.');
          if (requestEntryRefs(action).length && !choices.get('payload.useJournal') || action.payload.feedbackIds.length && !choices.get('payload.useFeedback')) throw new Error('AI consent changed. Please try again.');
          if (isEditorRequest(action)) {
            const target = await tx.get(doc(db, `${stream.path}/entries/${action.payload.entryId}`));
            const source = target.exists() ? await tx.get(doc(db, `${stream.path}/events/${target.get('lastEventId')}`)) : null;
            if ((source ? source.get('payload.expectedRevision') + 1 : 0) !== action.payload.entryRevision) throw new Error('This reflection changed before the prompt request.');
          }
          for (const ref of requestEntryRefs(action)) {
            const entry = await tx.get(doc(db, `${stream.path}/entries/${ref.entryId}`));
            if (!entry.exists()) throw new Error('AI context changed. Please try again.');
            const source = await tx.get(doc(db, `${stream.path}/events/${entry.get('lastEventId')}`));
            if (source.get('payload.expectedRevision') + 1 !== ref.revision) throw new Error('AI context changed. Please try again.');
          }
        }
      }
      const sequence = (head.get('sequence') ?? 0) + 1;
      const payload = action.type === 'ReflectionWritten' && (action.schemaVersion === 3 || action.schemaVersion === 4 || action.schemaVersion === 5 || action.schemaVersion === 6 || action.schemaVersion === 7) && action.payload.entryAt
        ? { ...action.payload, entryAt: Timestamp.fromDate(new Date(action.payload.entryAt)) } : action.payload;
      tx.set(event, { ...action, payload, sequence, recordedAt: serverTimestamp() });
      tx.set(stream, { sequence, lastEventId: action.eventId });
      tx.set(pointer, metadata);
      if (action.type === 'ReflectionImported') tx.set(doc(db, `${stream.path}/imports/${action.payload.sourceKey}`), { confirmationId: action.payload.confirmationId, lastEventId: action.eventId });
      return { sequence, eventId: action.eventId, created: true };
    }); } catch (error) {
      // Racing identical commits can fail Rules before the SDK retries its precondition.
      // Only a server-confirmed, identical immutable event counts as acknowledgement.
      // A transaction can observe a newer control after reading an absent event.
      // Check for an identical concurrent commit before interpreting any stale-state error.
      let prior;
      try { prior = await getDocFromServer(event); } catch { /* Preserve the original failure if the server is unavailable. */ }
      if (prior?.exists()) return resultFromPrior(prior.data());
      if ((error as { code?: string }).code === 'permission-denied' && attempt < 2) continue;
      throw error;
    }
  }
}
