import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { archiveFixture, sourceRecord } from '../fixtures/import-journal.mjs';
import { parseImportArchive, readBoundedZip, IMPORT_LIMITS } from '../../src/lib/import-archive.ts';
import { canonicalInput, NO_PROMPT, validImportSource } from '../../src/lib/import-source.ts';
import { applyEvent, emptyProjection, replay, parseAction, type JournalEvent, type SourceAction } from '../../src/lib/domain.ts';
import { exportJournal } from '../../src/lib/export.ts';
const time='2026-10-01T04:31:07.000Z';
const log=(actions:SourceAction[])=>actions.map((a,i)=>({...a,recordedAt:time,sequence:i+1})) as JournalEvent[];
async function plans(options={}) {return parseImportArchive(new Blob([new Uint8Array(archiveFixture(options).bytes)]),new Date(time));}
function actionsFor(plan:Awaited<ReturnType<typeof plans>>['records'][0]):SourceAction[] {
  return [{eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input},...plan.input.attachments.map((photo,slot)=>({eventId:plan.attachmentIds[slot],type:'PhotoAttached' as const,schemaVersion:1 as const,payload:{entryId:plan.input.entryId,slot,photoId:photo.photoId,previousEventId:null}})),{eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:plan.input.source.noteText.trim()?null:0}}];
}
test('bounded adapter validates source data and stable identity independently of ZIP packaging',async()=>{
  const fixture=archiveFixture(), first=await plans();
  assert.equal(first.records.length,3);assert.equal(first.photos,1);assert.equal(first.photoOnly,1);assert.equal(first.missingPrompts,2);
  const repacked=zipSync({'gratitudeEntries.json':strToU8(JSON.stringify(fixture.records.map(r=>Object.fromEntries(Object.entries(r).reverse())))), 'other/photo-0.jpg':fixture.jpeg},{level:0});
  const second=await parseImportArchive(new Blob([new Uint8Array(repacked)]),new Date(time));
  assert.deepEqual(first.records,second.records);
  const ambiguous=zipSync({'gratitudeEntries.json':strToU8(JSON.stringify(fixture.records)),'photos/photo-0.jpg':fixture.jpeg,'other/photo-0.jpg':fixture.jpeg});
  await assert.rejects(parseImportArchive(new Blob([new Uint8Array(ambiguous)]),new Date(time)),/ambiguous/);
  const sameDay=await plans({photos:[],missing:[],changes:{1:{...sourceRecord(0),id:2,noteId:'fictional-note-2'}}});
  assert.equal(sameDay.records[0].input.source.createdOn,sameDay.records[1].input.source.createdOn);
  assert.notEqual(sameDay.records[0].input.entryId,sameDay.records[1].input.entryId);
  assert.equal(replay(log(sameDay.records.flatMap(actionsFor))).entries.length,3);
  assert.equal(new Set(first.records.map(r=>r.input.entryId)).size,3);
  for(const p of first.records)assert.ok([p.confirmationId,p.completionId,...p.attachmentIds].every(id=>id.length+9<=80));
  assert.ok(validImportSource(sourceRecord(0)));
  assert.ok(!validImportSource({...sourceRecord(0),createdOnStr:'2024-02-30T14:00:00.000+10:00'}));
  assert.ok(!validImportSource({...sourceRecord(0),computedColour:0}));
  for(const change of [{prompt:'x'.repeat(601)},{createdOnStr:'bad'},{updatedOn:1},{noteText:'',imagePath:null,driveImagePath:null}])await assert.rejects(plans({photos:[],changes:{0:change}}));
  await assert.rejects(plans({changes:{1:{noteId:'fictional-note-1'}}}),/duplicate/);
  await assert.rejects(plans({changes:{0:{imagePath:'missing.jpg'}}}),/missing/);
});
test('unsafe, encrypted, oversized, truncated and corrupt ZIPs fail before import',()=>{
  assert.throws(()=>readBoundedZip(zipSync({'../escape':strToU8('x')})),/unsafe/);
  const fixture=archiveFixture().bytes;
  assert.throws(()=>readBoundedZip(fixture.slice(0,-8)),/incomplete/);
  for(const mode of ['encrypted','size','crc']){
    const bytes=fixture.slice(),v=new DataView(bytes.buffer);
    let at=0;while(at<bytes.length-46 && v.getUint32(at,true)!==0x02014b50)at++;
    if(mode==='encrypted')v.setUint16(at+8,1,true);
    if(mode==='size')v.setUint32(at+24,IMPORT_LIMITS.expanded+1,true);
    if(mode==='crc')v.setUint32(at+16,123,true);
    assert.throws(()=>readBoundedZip(bytes));
  }
});
test('import source events derive placeholders and preserve origin through edits and full/cached replay',async()=>{
  const archive=await plans({changes:{2:{prompt:NO_PROMPT}}});
  const actions=archive.records.flatMap(actionsFor), events=log(actions), state=replay(events);
  assert.equal(state.entries.length,3);assert.equal(state.entries[0].text,'');
  assert.equal(state.entries[0].prompt,NO_PROMPT);assert.equal(state.entries[0].origin?.source.prompt,null);
  assert.equal(state.entries[2].prompt,NO_PROMPT);assert.equal(state.entries[2].origin?.source.prompt,NO_PROMPT);
  assert.equal(Object.values(state.imports).filter(r=>r.completedId).length,3);
  for(let cut=0;cut<=events.length;cut++)assert.deepEqual(replay(events.slice(cut),replay(events.slice(0,cut))),state);
  const entry=state.entries[1];
  const edit:SourceAction={eventId:'explicit-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:entry.id,text:'My edited reflection.',expectedRevision:1,promptId:'explicit-edit',promptText:'A new question?',entryAt:'2024-02-01T04:00:00.000Z',photoSlot:null}};
  const edited=applyEvent(state,{...edit,sequence:state.cursor+1,recordedAt:time});
  assert.deepEqual(edited.entries[1].origin,entry.origin);assert.equal(edited.entries[1].prompt,'A new question?');
  assert.equal(canonicalInput(edited.imports[archive.records[1].input.sourceKey].input),canonicalInput(archive.records[1].input));
  const exported=JSON.parse(exportJournal(edited,'json').content);
  assert.equal(exported.version,3);assert.equal(exported.entries.find((e:{id:string})=>e.id===entry.id).origin.source.prompt,null);
  assert.ok(exportJournal(state,'markdown').content.includes('\\[No prompt\\]'));
  assert.equal(JSON.parse(exportJournal(emptyProjection(),'json').content).version,2);
  assert.throws(()=>parseAction({...actions[0],payload:{...actions[0].payload,computedPrompt:NO_PROMPT}}));
  assert.throws(()=>replay(log([actions[0],actions[2]])),/photos/);
  assert.throws(()=>applyEvent(state,{...actions[0],sequence:state.cursor+1,recordedAt:time}),/already claimed/);
});
test('686 records, five images, three missing prompts and one photo-only record remain bounded and replayable',async()=>{
  const archive=await plans({count:686,photos:[0,137,274,411,548],missing:[0,1,2]});
  assert.deepEqual([archive.records.length,archive.photos,archive.missingPrompts,archive.photoOnly],[686,5,3,1]);
  const events=log(archive.records.flatMap(actionsFor)), state=replay(events);
  assert.equal(state.entries.length,686);assert.equal(Object.keys(state.photos).length,5);
  assert.deepEqual(replay(events.slice(700),replay(events.slice(0,700))),state);
  const counts=Object.values(state.imports).filter(r=>r.completedId).length;assert.equal(counts,686);
});

test('imported rainbow colour follows the original logical date rather than import receipt time',async()=>{
 const {entryColour}=await import('../../src/lib/journal.ts');
 const createdOnStr='2026-09-28T12:00:00.000+10:00',updatedOnStr='2026-09-28T13:00:00.000+10:00';
 const archive=await plans({changes:{0:{createdOn:Date.parse(createdOnStr),createdOnStr,updatedOn:Date.parse(updatedOnStr),updatedOnStr}}});
 const source=log(archive.records.flatMap(actionsFor));const full=replay(source),cached=replay(source.slice(2),replay(source.slice(0,2)));
 const imported=full.entries.find(entry=>entry.origin?.source.createdOn===Date.parse(createdOnStr))!;
 assert.equal(imported.recordedAt,time);assert.equal(entryColour(imported,'Australia/Hobart'),'#c9e561');
 assert.deepEqual(full.entries.map(entry=>entryColour(entry,'Australia/Hobart')),cached.entries.map(entry=>entryColour(entry,'Australia/Hobart')));
});
