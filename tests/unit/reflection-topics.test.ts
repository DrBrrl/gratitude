import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, replay, parseAction, STARTER_ID, PROJECTION_VERSION, type JournalEvent } from '../../src/lib/domain.ts';
import { defaultAnswers, answersInput } from '../../src/lib/onboarding.ts';
import { topicChoices, topicLabel, type TopicAction } from '../../src/lib/reflection-topics.ts';
import { exportJournal } from '../../src/lib/export.ts';
const recordedAt='2026-10-01T04:31:07.000Z';
const writing:JournalEvent={eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A quiet moment.',promptId:STARTER_ID,promptText:null,entryAt:'2026-09-01T04:31:07.000Z',photoSlot:null},sequence:1,recordedAt};
const choose=(topicId:string|null,changes:Partial<TopicAction['payload']>={}):TopicAction=>({eventId:'choose',type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:'entry',expectedRevision:1,previousEventId:null,answersId:null,topicId,...changes}});
const event=(action:TopicAction,sequence=2):JournalEvent=>({...action,sequence,recordedAt});
test('manual categories preserve writing identity, dates and revisions through full and cached replay',()=>{
 const log=[writing,event(choose('nature'))],full=replay(log),tail=replay(log.slice(1),replay(log.slice(0,1)));
 assert.equal(full.version,PROJECTION_VERSION);assert.deepEqual(full,tail);assert.deepEqual(full.entries[0],replay([writing]).entries[0]);
 assert.equal(topicLabel(full.topics.entry,full.onboarding.answers),'Nature & outdoors');
 const edited={...writing,eventId:'edit',sequence:3,payload:{...writing.payload,expectedRevision:1,text:'A different quiet moment.'}} as JournalEvent;
 assert.deepEqual(replay([...log,edited]).topics,full.topics);
});
test('unclassified, explicit unknown and clearing a manual topic are distinct source actions',()=>{
 let state=replay([writing]);assert.equal(topicLabel(state.topics.entry,state.onboarding.answers),'Not yet classified');
 state=applyEvent(state,event(choose('unknown')));assert.equal(topicLabel(state.topics.entry,state.onboarding.answers),'Unknown');
 state=applyEvent(state,event({...choose(null,{previousEventId:'choose'}),eventId:'clear'},3));
 assert.equal(state.topics.entry.topicId,null);assert.equal(topicLabel(state.topics.entry,state.onboarding.answers),'Not yet classified');
});
test('picker includes unselected built-ins and custom topics; retired labels survive replay',()=>{
 const answers={...defaultAnswers(),customTopics:[{id:'custom_birds',label:'Birdwatching',description:'Birds in the garden.',selected:false}]};
 assert.ok(topicChoices(answers).some(t=>t.id==='custom_birds'));assert.ok(topicChoices(answers).some(t=>t.id==='music'));
 const setup:JournalEvent={eventId:'setup',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput(answers),previousEventId:null},sequence:2,recordedAt};
 let state=replay([writing,setup,event(choose('custom_birds',{answersId:'setup'}),3)]);
 state=applyEvent(state,{eventId:'clear-answers',type:'OnboardingAnswersCleared',schemaVersion:1,payload:{previousEventId:'setup'},sequence:4,recordedAt});
 assert.equal(topicLabel(state.topics.entry,state.onboarding.answers),'Birdwatching');
});
test('reject unknown IDs, extra computed fields, stale categories, stale text and stale vocabulary',()=>{
 const state=replay([writing]);
 assert.throws(()=>parseAction(choose('other')));
 assert.throws(()=>parseAction({...choose('nature'),payload:{...choose('nature').payload,label:'Nature'}}));
 assert.throws(()=>applyEvent(state,event(choose('custom_missing'))),/no longer available/);
 assert.throws(()=>applyEvent(state,event(choose('nature',{entryId:'missing'}))),/reflection changed/);
 assert.throws(()=>applyEvent(state,event(choose('nature',{expectedRevision:2}))),/reflection changed/);
 assert.throws(()=>applyEvent(state,event(choose('nature',{previousEventId:'elsewhere'}))),/topic changed/);
 assert.throws(()=>applyEvent(state,event(choose('nature',{answersId:'elsewhere'}))),/topics changed/);
});
test('JSON carries manual category without changing Markdown or legacy export versions',()=>{
 const legacy=replay([writing]),state=replay([writing,event(choose('nature'))]);
 assert.equal(JSON.parse(exportJournal(legacy,'json').content).version,2);
 const json=JSON.parse(exportJournal(state,'json').content);assert.equal(json.version,4);assert.deepEqual(json.entries[0].topic,{id:'nature',label:'Nature & outdoors',origin:'user'});
 assert.equal(exportJournal(state,'markdown').content,exportJournal(legacy,'markdown').content);
});

test('legacy imported writing keeps its original identity, prompt and date after a topic correction',async()=>{
 const {archiveFixture}=await import('../fixtures/import-journal.mjs');
 const {parseImportArchive}=await import('../../src/lib/import-archive.ts');
 const archive=await parseImportArchive(new Blob([new Uint8Array(archiveFixture({count:1,photos:[],missing:[]}).bytes)]),new Date(recordedAt));
 const plan=archive.records[0];
 const source:JournalEvent[]=[{eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input,sequence:1,recordedAt},{eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:null},sequence:2,recordedAt}];
 const initial=replay(source),assigned=applyEvent(initial,event(choose('nature',{entryId:plan.input.entryId}),3));
 assert.deepEqual(assigned.entries,initial.entries);assert.equal(topicLabel(assigned.topics[plan.input.entryId],assigned.onboarding.answers),'Nature & outdoors');assert.equal(JSON.parse(exportJournal(assigned,'json').content).version,4);
});
