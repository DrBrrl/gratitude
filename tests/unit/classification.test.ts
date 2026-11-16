import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProjection,applyEvent,replay,parseAction,STARTER_ID,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
import {targetSelection,currentTarget,eligibleTargets,topicStale,classificationContext,batchProgress,type ClassificationAction} from '../../src/lib/classification.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
import {exportJournal} from '../../src/lib/export.ts';
const at='2026-10-01T00:00:00.000Z';
function fixture(){
 let state=emptyProjection();const log:JournalEvent[]=[];
 function append(a:SourceAction,time=at){const e={...a,sequence:log.length+1,recordedAt:time} as JournalEvent;state=applyEvent(state,e);log.push(e);return a.eventId;}
 function action<T extends ClassificationAction['type']>(type:T,payload:Omit<Extract<ClassificationAction,{type:T}>['payload'],'previousEventId'>,time=at){return append(parseAction({eventId:`action_${log.length}`,type,schemaVersion:1,payload:{previousEventId:state.classification.lastEventId,...payload}}),time);}
 append({eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'Birdsong and a peaceful walk.',promptId:STARTER_ID,promptText:null,expectedRevision:0,entryAt:null,photoSlot:null}});
 const consent=()=>action('ClassificationConsentChosen',{enabled:true,provider:'gemini',model:'gemini-3.6-flash',connectionId:null,connectionRevision:null});
 function batch(kind:'reflection'|'backup'='reflection',id='entry') {return action('ClassificationBatchRequested',{consentId:state.classification.consent?.eventId??'missing_consent',answersId:state.onboarding.answersId,catalogueVersion:1,targets:targetSelection([currentTarget(state,kind,id)])});}
 function request(batchId:string,kind:'reflection'|'backup'='reflection',id='entry',retryOf:string|null=null,time=at){return action('ClassificationRequested',{batchId,target:currentTarget(state,kind,id),retryOf},time);}
 function reply(requestId:string,text='nature'){return action('ClassificationResponseReceived',{requestId,text,model:'fictional/model',finishReason:'STOP'});}
 return {append,action,consent,batch,request,reply,log,get state(){return state;}};
}
test('classification requires its own consent; exact observations and cached replay restore AI suggestions without inference',()=>{
 const f=fixture();assert.throws(()=>f.batch(),/consent/);f.consent();const b=f.batch(),r=f.request(b);f.reply(r);
 assert.equal(f.state.topics.entry.origin,'ai');assert.equal(f.state.topics.entry.topicId,'nature');assert.deepEqual(replay(f.log),replay(f.log.slice(3),replay(f.log.slice(0,3))));
 assert.equal(f.state.classification.replies[r].payload.requestId,r);assert.equal(eligibleTargets(f.state,'reflection').length,0);assert.deepEqual(batchProgress(f.state.classification,b),{completed:1,failed:0,remaining:0});
 const json=JSON.parse(exportJournal(f.state,'json').content);assert.equal(json.version,5);assert.equal(json.entries[0].topic.stale,false);assert.equal(json.entries[0].topic.requestId,r);
});
test('malformed or invented IDs are retained as invalid observations, with Unknown distinct from unclassified',()=>{
 for(const text of ['{"topicId":"nature"}','nature\n','nature, music','invented','']){const f=fixture();f.consent();const r=f.request(f.batch());f.reply(r,text);assert.equal(f.state.classification.outcomes[r],'invalid');assert.equal(f.state.topics.entry,undefined);assert.equal(f.state.classification.replies[r].type,'ClassificationResponseReceived');}
 const f=fixture();f.consent();const r=f.request(f.batch());f.reply(r,'unknown');assert.equal(f.state.topics.entry.topicId,'unknown');assert.equal(eligibleTargets(f.state,'reflection').length,0);
});
test('late replies cannot overwrite manual corrections; manual categories survive later text edits',()=>{
 const f=fixture();f.consent();const r=f.request(f.batch());f.append({eventId:'manual',type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:'entry',expectedRevision:1,previousEventId:null,topicId:'music',answersId:null}});f.reply(r);
 assert.equal(f.state.topics.entry.topicId,'music');assert.equal(f.state.classification.outcomes[r],'stale');
 f.append({eventId:'edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'Edited words.',promptId:STARTER_ID,promptText:null,expectedRevision:1,entryAt:null,photoSlot:null}});
 assert.equal(eligibleTargets(f.state,'reflection').length,0);assert.equal(topicStale(f.state,{kind:'reflection',id:'entry'}),false);
});
test('edited reflection revisions mark AI assignments stale and reject outstanding results',()=>{
 const f=fixture();f.consent();const r=f.request(f.batch());f.reply(r);const before=exportJournal(f.state,'markdown').content;
 f.append({eventId:'edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'Edited words.',promptId:STARTER_ID,promptText:null,expectedRevision:1,entryAt:null,photoSlot:null}});
 assert.equal(topicStale(f.state,{kind:'reflection',id:'entry'}),true);assert.equal(eligibleTargets(f.state,'reflection').length,1);assert.equal(JSON.parse(exportJournal(f.state,'json').content).entries[0].topic.stale,true);assert.ok(!before.includes('topic'));
 const g=fixture();g.consent();const pending=g.request(g.batch());g.append({eventId:'edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'New text.',promptId:STARTER_ID,promptText:null,expectedRevision:1,entryAt:null,photoSlot:null}});g.reply(pending);assert.equal(g.state.topics.entry,undefined);
});
test('withdrawal, cancelled batches and changed vocabularies keep observations but prevent assignment',()=>{
 for(const kind of ['withdraw','cancel','vocabulary']){
  const f=fixture();f.consent();const b=f.batch(),r=f.request(b);
  if(kind==='withdraw')f.action('ClassificationConsentChosen',{enabled:false,provider:'gemini',model:'gemini-3.6-flash',connectionId:null,connectionRevision:null});
  if(kind==='cancel')f.action('ClassificationBatchControlled',{batchId:b,operation:'cancel'});
  if(kind==='vocabulary')f.append({eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput(defaultAnswers()),previousEventId:null}});
  f.reply(r);assert.equal(f.state.classification.outcomes[r],'stale');assert.equal(f.state.topics.entry,undefined);
 }
});
test('backup questions receive editable categories without changing their text or using them',()=>{
 const f=fixture(),id='bp_'+'a'.repeat(64);f.append({eventId:id,type:'BackupPromptImported',schemaVersion:1,payload:{text:'What small outdoor detail did you appreciate?'}});f.consent();const b=f.batch('backup',id),r=f.request(b,'backup',id);f.reply(r);
 assert.equal(f.state.classification.backupTopics[id].topicId,'nature');assert.equal(f.state.backups[id].used,undefined);
 const p=JSON.parse(classificationContext(f.state,currentTarget(f.state,'backup',id)));assert.equal(p.kind,'backup');assert.equal(p.vocabulary.length,18);assert.equal('preferredName' in p,false);
 f.action('BackupTopicChosen',{target:currentTarget(f.state,'backup',id),answersId:null,topicId:'art'});assert.equal(f.state.classification.backupTopics[id].origin,'user');assert.equal(f.state.backups[id].text,'What small outdoor detail did you appreciate?');assert.equal(JSON.parse(exportJournal(f.state,'json').content).backupPrompts[0].topic.topicId,'art');
});
test('resumable batches pause dispatch, retain in-flight results and require explicit lease expiry retries',()=>{
 const f=fixture();f.consent();const b=f.batch(),r=f.request(b);f.action('ClassificationBatchControlled',{batchId:b,operation:'pause'});
 assert.throws(()=>f.request(b,'reflection','entry',r),/consent/);f.action('ClassificationBatchControlled',{batchId:b,operation:'resume'});
 assert.throws(()=>f.request(b,'reflection','entry',r),/in progress/);
 const retry=f.request(b,'reflection','entry',r,'2026-10-01T00:03:01.000Z');f.reply(r);assert.equal(f.state.classification.outcomes[r],'stale');f.reply(retry);assert.equal(f.state.topics.entry.topicId,'nature');
 assert.throws(()=>f.reply(retry),/already settled/);
});
test('strict parsing rejects computed progress, malformed or duplicate targets and oversized replies',()=>{
 const f=fixture();f.consent();f.batch();const a=f.log.at(-1)!;const source={eventId:a.eventId,type:a.type,schemaVersion:a.schemaVersion,payload:a.payload};
 assert.throws(()=>parseAction({...source,payload:{...source.payload,completed:0}}));
 assert.throws(()=>parseAction({...source,payload:{...source.payload,targets:{wrong:currentTarget(f.state,'reflection','entry')}}}));
 assert.throws(()=>f.reply('missing','x'.repeat(4001)),/Invalid action/);
});
test('a fresh explicit batch supersedes old queued work and keeps old observations non-authoritative',()=>{
 const f=fixture();f.consent();const first=f.batch(),r=f.request(first);const second=f.batch();assert.notEqual(first,second);f.reply(r);assert.equal(f.state.classification.outcomes[r],'stale');assert.equal(f.state.topics.entry,undefined);assert.equal(f.state.classification.batches[first].status,'cancelled');
});
test('imported reflection classification preserves the historical instant, source metadata and original prompt',async()=>{
 const {archiveFixture}=await import('../fixtures/import-journal.mjs');const {parseImportArchive}=await import('../../src/lib/import-archive.ts');
 const archive=await parseImportArchive(new Blob([new Uint8Array(archiveFixture({count:1,photos:[],missing:[]}).bytes)]),new Date(at));const plan=archive.records[0],f=fixture();
 f.append({eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input});f.append({eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:null}});
 const before=structuredClone(f.state.entries.find(e=>e.id===plan.input.entryId));f.consent();const b=f.batch('reflection',plan.input.entryId),r=f.request(b,'reflection',plan.input.entryId);f.reply(r);
 assert.deepEqual(f.state.entries.find(e=>e.id===plan.input.entryId),before);assert.equal(f.state.topics[plan.input.entryId].origin,'ai');
});
