import { doc, getDocFromServer } from 'firebase/firestore';
import { GENERATION, type Projection, type ImportAction, type PhotoAction } from '../domain.ts';
import { canonicalInput } from '../import-source.ts';
import type { ImportArchive, ImportSelection, PlannedImport } from '../import-archive';
import { uploadImportedPhoto } from '../photos.ts';
import type { FirebaseClient } from './client';
import type { JournalStore } from './repository';
import { decodeEvent } from './append.ts';
export function importCounts(archive: ImportArchive, state: Projection) {
  const counts={fresh:0,pending:0,identical:0,conflicts:0};
  for (const plan of archive.records) {
    const receipt=state.imports[plan.input.sourceKey];
    if (!receipt) counts.fresh++;
    else if (canonicalInput(receipt.input)!==canonicalInput(plan.input)) counts.conflicts++;
    else if (receipt.completedId) counts.identical++;
    else counts.pending++;
  }
  return counts;
}
async function completed(client: FirebaseClient, uid: string, plan: PlannedImport) {
  const stream=`users/${uid}/streams/${GENERATION}`;
  const receipt=await getDocFromServer(doc(client.db,`${stream}/imports/${plan.input.sourceKey}`));
  if (!receipt.exists()) return false;
  const source=await getDocFromServer(doc(client.db,`${stream}/events/${receipt.get('confirmationId')}`));
  if (!source.exists()) throw new Error('Import history is incomplete. Reconnect and try again.');
  const event=decodeEvent(source.data());
  if (event.type!=='ImportRecordConfirmed' || canonicalInput(event.payload)!==canonicalInput(plan.input)) throw new Error('This source record conflicts with an earlier import. Nothing was overwritten.');
  return receipt.get('lastEventId')!==receipt.get('confirmationId');
}
/** Explicitly called from confirmation/resume. Replay and reconnect never start this loop. */
export async function importJournal(archive: ImportArchive, selection: ImportSelection, client: FirebaseClient, uid: string, repository: JournalStore, hooks: { paused:()=>boolean; state:()=>Projection; progress:(completed:number)=>void }) {
  let done=0;
  const active=()=>!hooks.paused() && client.auth.currentUser?.uid===uid && navigator.onLine;
  for (const plan of archive.records) {
    if (!active()) return {done,paused:true};
    const cached=hooks.state().imports[plan.input.sourceKey];
    if (cached && canonicalInput(cached.input)!==canonicalInput(plan.input)) throw new Error('This source record conflicts with an earlier import. Nothing was overwritten.');
    if (cached?.completedId || await completed(client,uid,plan)) {hooks.progress(++done);continue;}
    if (!active()) return {done,paused:true};
    const claim:ImportAction={eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input};
    await repository.commitAI(claim);
    if (!active()) return {done,paused:true};
    // Another client may have completed and edited/removed images since our first read.
    if (await completed(client,uid,plan)) {hooks.progress(++done);continue;}
    for (const [slot,photo] of plan.input.attachments.entries()) {
      if (!active()) return {done,paused:true};
      const prepared=selection.prepared[photo.photoId];
      if (!prepared) throw new Error('Reselect the source ZIP to prepare its photos.');
      await uploadImportedPhoto(client,uid,photo.photoId,plan.input.sourceKey,photo.sourceDigest,prepared.blob);
      if (!active()) return {done,paused:true};
      const action:PhotoAction={eventId:plan.attachmentIds[slot],type:'PhotoAttached',schemaVersion:1,payload:{entryId:plan.input.entryId,slot,photoId:photo.photoId,previousEventId:null}};
      await repository.commitAI(action);
    }
    if (!active()) return {done,paused:true};
    await repository.commitAI({eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:plan.input.source.noteText.trim()?null:0}});
    hooks.progress(++done);
  }
  return {done,paused:false};
}
