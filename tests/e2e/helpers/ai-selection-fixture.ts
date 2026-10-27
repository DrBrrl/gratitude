import type { Page } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, Timestamp, writeBatch, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { parseImportArchive } from '../../../src/lib/import-archive';
import { archiveFixture } from '../../fixtures/import-journal.mjs';
import { replay, STARTER_ID, type SourceAction, type JournalEvent } from '../../../src/lib/domain';
import { decodeEvent } from '../../../src/lib/firebase/append';

async function uid(page:Page) {
  return page.evaluate(async()=>{
    const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))?.name;
    if(!name) throw new Error('Missing fictional journal'); return name.split(':').at(-2)!;
  });
}
/** Only fictional source events; imported logical time intentionally differs from receipt time. */
export async function seedSelectionHistory(page:Page) {
  const createdOn=Date.parse('2025-10-01T01:00:00Z');
  const fixture=archiveFixture({count:1,photos:[],missing:[],changes:{0:{createdOn,createdOnStr:'2025-10-01T11:00:00.000+10:00',updatedOn:createdOn+60000,updatedOnStr:'2025-10-01T11:01:00.000+10:00',noteText:'An imported anniversary walk.'}}});
  const archive=await parseImportArchive(new Blob([new Uint8Array(fixture.bytes)]),new Date('2026-10-01T04:31:07Z'));
  const plan=archive.records[0];
  const actions:SourceAction[]=[{eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input},{eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:null}}];
  function add(id:string,day:string) {
    actions.push({eventId:`w_${id}`,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,text:`A fictional ${id} moment.`,expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:`${day}T01:00:00.000Z`,photoSlot:null}});
  }
  for(const year of [2024,2025]) for(let day=28;day<=30;day++) add(`anniversary_${year}_${day}`,`${year}-09-${day}`);
  add('anniversary_2024_01','2024-10-01');
  for(let day=1;day<=12;day++) add(`rediscovery_${day}`,`2022-04-${String(day).padStart(2,'0')}`);
  for(let day=17;day<=30;day++) add(`recent_${day}`,`2026-09-${day}`);
  const log=actions.map((action,i)=>({...action,sequence:i+1,recordedAt:'2026-10-01T04:31:07.000Z'})) as JournalEvent[];
  replay(log); // Fixture must satisfy the same canonical reducer as the application.
  const account=await uid(page);
  const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
  try {await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),batch=writeBatch(db),root=`users/${account}/streams/v1`;
    for(const event of log) {
      const payload=event.type==='ReflectionWritten' && event.schemaVersion===6?{...event.payload,entryAt:Timestamp.fromDate(new Date(event.payload.entryAt!))}:event.payload;
      batch.set(doc(db,`${root}/events/${event.eventId}`),{...event,payload,recordedAt:Timestamp.fromDate(new Date(event.recordedAt))});
      if(event.type==='ReflectionWritten'||event.type==='ReflectionImported') batch.set(doc(db,`${root}/entries/${event.payload.entryId}`),{lastEventId:event.eventId,...(event.type==='ReflectionImported'?{importId:plan.confirmationId}:{})});
    }
    batch.set(doc(db,`${root}/imports/${plan.input.sourceKey}`),{confirmationId:plan.confirmationId,lastEventId:plan.completionId});
    batch.set(doc(db,root),{sequence:log.length,lastEventId:log.at(-1)!.eventId});await batch.commit();
  });return log;} finally {await environment.cleanup();}
}
export async function selectionLog(page:Page) {
  const account=await uid(page);
  const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
  let log:JournalEvent[]=[];
  try {await environment.withSecurityRulesDisabled(async context=>{
    const result=await getDocs(query(collection(context.firestore(),`users/${account}/streams/v1/events`),orderBy('sequence')));
    log=result.docs.map(item=>decodeEvent(item.data()));
  });return log;} finally {await environment.cleanup();}
}
