import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { appendReflection, decodeEvent } from '../../src/lib/firebase/append.ts';
import { defaultAnswers, answersInput } from '../../src/lib/onboarding.ts';
import { replay } from '../../src/lib/domain.ts';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});
  await environment.clearFirestore();
});
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const confirmed = (eventId, previousEventId = null, changes = {}) => ({eventId,type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),preferredName:'Sam',...changes}),previousEventId,...('computedSummary' in changes ? {computedSummary:changes.computedSummary}:{})}});
async function history(db, uid) {
  const rows = await getDocs(query(collection(db,`users/${uid}/streams/v1/events`),orderBy('sequence')));
  return rows.docs.map(row => decodeEvent(row.data()));
}
async function rawAppend(db,uid,action) {
  const root=`users/${uid}/streams/v1`,head=await getDoc(doc(db,root)),pointer=await getDoc(doc(db,root+'/onboarding/control'));
  const sequence=(head.get('sequence')??0)+1,finish=action.type==='OnboardingFinished';
  const batch=writeBatch(db);
  batch.set(doc(db,root+'/events/'+action.eventId),{...action,sequence,recordedAt:serverTimestamp()});
  batch.set(doc(db,root),{sequence,lastEventId:action.eventId});
  batch.set(doc(db,root+'/onboarding/control'),{lastEventId:action.eventId,answersId:finish?(pointer.get('answersId')??null):action.eventId,version:finish?action.payload.version:pointer.get('version')??0,outcomeId:finish?action.eventId:pointer.get('outcomeId')??null});
  return batch.commit();
}

test('questionnaire actions are owner-only, ordered, idempotent and fully replayable across clients',async()=>{
  const uid='setup-owner',a=client(uid),b=client(uid);
  const action=confirmed('private-answers',null,{pronouns:'they/them',selectedTopics:['music'],useAnswers:true});
  assert.equal((await appendReflection(a,uid,action)).created,true);
  assert.equal((await appendReflection(b,uid,action)).created,false);
  await appendReflection(b,uid,{eventId:'finished',type:'OnboardingFinished',schemaVersion:1,payload:{version:1,outcome:'completed'}});
  const log=await history(a,uid),state=replay(log);
  assert.equal(state.onboarding.answers.preferredName,'Sam');assert.equal(state.onboarding.version,1);
  assert.deepEqual(replay(log.slice(1),replay(log.slice(0,1))),state);
  await assertFails(getDocs(collection(client('someone-else'),`users/${uid}/streams/v1/events`)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),`users/${uid}/streams/v1/onboarding/control`)));
});

test('clear atomically removes the current answers permission while retaining rollout acknowledgment',async()=>{
  const uid='setup-clear',db=client(uid);
  await appendReflection(db,uid,confirmed('clear-source',null,{useAnswers:true}));
  await appendReflection(db,uid,{eventId:'skip',type:'OnboardingFinished',schemaVersion:1,payload:{version:1,outcome:'skipped'}});
  await appendReflection(db,uid,{eventId:'cleared',type:'OnboardingAnswersCleared',schemaVersion:1,payload:{previousEventId:'clear-source'}});
  const state=replay(await history(db,uid));
  assert.deepEqual(state.onboarding.answers,defaultAnswers());assert.equal(state.onboarding.version,1);
  await assert.rejects(appendReflection(db,uid,confirmed('stale','clear-source')));
  await assertFails(rawAppend(db,uid,confirmed('forged-stale','clear-source')));
  await assertFails(rawAppend(db,uid,{eventId:'repeat',type:'OnboardingFinished',schemaVersion:1,payload:{version:1,outcome:'completed'}}));
});

test('Rules validate every built-in/custom row, duplicates and exact limits when append validation is bypassed',async()=>{
  const uid='setup-bounds',db=client(uid),answers=defaultAnswers();
  answers.descriptions.music='x'.repeat(149);
  answers.customTopics=Array.from({length:20},(_,i)=>({id:`custom_${i}`,label:`Topic ${i}`,description:'x'.repeat(150),selected:i===0}));
  await appendReflection(db,uid,confirmed('all-rows',null,answers));
  const invalid=[
    {...answers,descriptions:{...answers.descriptions,music:'x'.repeat(150)}},
    {...answers,descriptions:{...answers.descriptions,music:''}},
    {...answers,customTopics:answers.customTopics.map((row,i)=>i===19?{...row,description:'x'.repeat(151)}:row)},
    {...answers,customTopics:answers.customTopics.map((row,i)=>i===19?{...row,id:'custom_0'}:row)},
    {...answers,selectedTopics:['music','music']},
    {...answers,descriptions:{...answers.descriptions,music:'  '}},
    {...answers,descriptions:{...answers.descriptions,music:'\u00a0Music'}},
    {...answers,descriptions:{...answers.descriptions,music:'Music\u001fother'}},
    {...answers,wordLimit:81},
    {...answers,computedSummary:'Not a source action'},
  ];
  for(const [i,changes] of invalid.entries())await assertFails(rawAppend(db,uid,confirmed(`bad-row-${i}`,'all-rows',changes)));
  assert.equal((await history(db,uid)).length,1);
});

test('Rules preserve the same string bounds for supplementary Unicode characters',async()=>{
  const uid='setup-unicode',db=client(uid),answers=defaultAnswers();
  answers.descriptions.music='🎵'.repeat(148)+'x';
  await appendReflection(db,uid,confirmed('unicode',null,answers));
  await assertFails(rawAppend(db,uid,confirmed('unicode-too-long','unicode',{descriptions:{...answers.descriptions,music:'🎵'.repeat(150)}})));
});

test('new provider requests bind the exact answers revision, preserve long output and reject revoked answers',async()=>{
  const {makeRequest,buildContext,promptOptions}=await import('../../src/lib/ai/context.ts');
  for(const provider of ['gemini','lm-studio']){
    const uid=`setup-ai-${provider}`,db=client(uid),target=provider==='lm-studio'?{provider,model:'fictional/model',thinking:false}:undefined;
    await appendReflection(db,uid,confirmed('ai-answers',null,{pronouns:'they/them',selectedTopics:['music'],useAnswers:true,wordLimit:200}));
    await appendReflection(db,uid,{eventId:'ai-choice',type:'AIChoicesConfirmed',schemaVersion:3,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Quiet moments',provider,backupEnabled:true,backupProvider:provider}});
    let state=replay(await history(db,uid));const selection={timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'};
    const historical=makeRequest(state,'2026-10-01','personal','historical-request',undefined,selection,target);historical.payload.templateVersion='gratitude-v3';
    await appendReflection(db,uid,historical);await appendReflection(db,uid,{eventId:'historical-request_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:historical.eventId,text:'A previously generated question?',model:'fictional/model',finishReason:'STOP'}});
    state=replay(await history(db,uid));assert.equal(state.ai.responses['historical-request_response'].payload.text,'A previously generated question?');
    const request=makeRequest(state,'2026-10-01','personal','new-request',undefined,selection,target);assert.ok(request.schemaVersion>=13);assert.equal(request.payload.templateVersion,'gratitude-v4');
    await appendReflection(db,uid,request);const instruction=promptOptions(state,request).system,context=buildContext(state,request);assert.ok(instruction.includes('under 200 words'));assert.deepEqual(JSON.parse(context).topics,['Music and sounds: listening, playing, singing.']);assert.equal('user' in JSON.parse(context),false);assert.ok(!instruction.includes('Sam')&&!instruction.includes('they/them')&&!context.includes('Sam')&&!context.includes('they/them'));
    const text=Array.from({length:100},()=> 'Wonderful').join(' ')+'?';assert.ok(text.length>600);
    await appendReflection(db,uid,{eventId:'new-request_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:request.eventId,text,model:'fictional/model',finishReason:'STOP'}});
    state=replay(await history(db,uid));const next=makeRequest(state,'2026-10-01','personal','late',undefined,selection,target);
    await appendReflection(db,uid,next);await appendReflection(db,uid,{eventId:'answers-revoked',type:'OnboardingAnswersCleared',schemaVersion:1,payload:{previousEventId:'ai-answers'}});
    await assert.rejects(appendReflection(db,uid,{eventId:'late_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'late',text:'A late question?',model:'fictional/model',finishReason:'STOP'}}),/answers changed/);
    // Bypass append validation: Rules must independently reject a late result and its control update.
    const root=`users/${uid}/streams/v1`,head=await getDoc(doc(db,root)),control=await getDoc(doc(db,root+'/ai/control')),batch=writeBatch(db);
    batch.set(doc(db,root+'/events/late_response'),{eventId:'late_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'late',text:'A late question?',model:'fictional/model',finishReason:'STOP'},sequence:head.get('sequence')+1,recordedAt:serverTimestamp()});
    batch.set(doc(db,root),{sequence:head.get('sequence')+1,lastEventId:'late_response'});batch.set(doc(db,root+'/ai/control'),{lastEventId:'late_response',choicesId:control.get('choicesId'),requestId:null});await assertFails(batch.commit());
    const log=await history(db,uid),final=replay(log);assert.equal(final.ai.responses.new_request_response,undefined);assert.equal(final.ai.responses['new-request_response'].payload.text,text);assert.deepEqual(replay(log.slice(2),replay(log.slice(0,2))),final);
  }
});

test('long manual, backup and imported prompt carriers preserve 4,000 characters and imported origin',async()=>{
  const {archiveFixture}=await import('../fixtures/import-journal.mjs');
  const {parseImportArchive}=await import('../../src/lib/import-archive.ts');
  const {importedBackup}=await import('../../src/lib/backup-prompts.ts');
  const uid='setup-long-carriers',db=client(uid),text='x'.repeat(4000);
  const fixture=archiveFixture({count:1,photos:[],missing:[],changes:{0:{prompt:text}}});
  const archive=await parseImportArchive(new Blob([fixture.bytes]),new Date('2026-10-01T04:31:07Z')),plan=archive.records[0];
  const claim={eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:2,payload:plan.input};
  await assert.rejects(appendReflection(db,uid,{...claim,schemaVersion:1}));await appendReflection(db,uid,claim);
  await appendReflection(db,uid,{eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:null}});
  await appendReflection(db,uid,{eventId:'long-edit',type:'ReflectionWritten',schemaVersion:7,payload:{entryId:plan.input.entryId,expectedRevision:1,text:'A quiet moment.',promptId:'long-edit',promptText:text,entryAt:null,photoSlot:null}});
  const backup=await importedBackup(text);assert.equal(backup.schemaVersion,2);await appendReflection(db,uid,backup);
  const log=await history(db,uid),state=replay(log);assert.equal(state.entries[0].prompt,text);assert.equal(state.entries[0].origin.source.prompt,text);assert.equal(state.backups[backup.eventId].text,text);assert.deepEqual(replay(log.slice(1),replay(log.slice(0,1))),state);
});
