import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,writeBatch,serverTimestamp,collection,getDocs,orderBy,query,setDoc} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {claimClassification} from '../../src/lib/firebase/classification.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
import {STARTER_ID,replay} from '../../src/lib/domain.ts';
let environment;
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await environment.clearFirestore();});
after(async()=>environment?.cleanup());
const client=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const target={kind:'reflection',id:'entry',revision:1,previousTopicId:null};
async function fixture(uid,kind='reflection',options={}){
 const db=client(uid),path=`users/${uid}/streams/v1`;let previousEventId=null;
 async function action(type,eventId,payload){const a={eventId,type,schemaVersion:1,payload:{previousEventId,...payload}};const result=await appendReflection(db,uid,a);previousEventId=eventId;return result;}
 const id='bp_'+'a'.repeat(64),t=kind==='reflection'?target:{...target,kind:'backup',id};
 if(kind==='reflection')await appendReflection(db,uid,{eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'A fictional walk.',expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:null,photoSlot:null}});
 else await appendReflection(db,uid,{eventId:id,type:'BackupPromptImported',schemaVersion:1,payload:{text:'What small detail outdoors brought you joy?'}});
 await appendReflection(db,uid,{eventId:'setup-finished',type:'OnboardingFinished',schemaVersion:1,payload:{version:1,outcome:'skipped'}});
 if(options.custom)await appendReflection(db,uid,{eventId:'class-answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{previousEventId:null,...answersInput({...defaultAnswers(),customTopics:[{id:'custom_birds',label:'Birdwatching',description:'Watching birds.',selected:false}]})}});
 if(options.local)await setDoc(doc(db,`users/${uid}/privateConnections/local`),{schemaVersion:1,provider:'ollama',model:'fictional/text',revision:'one',updatedAt:serverTimestamp()});
 const destination=options.lm?{provider:'lm-studio',model:'google/gemma-4-31b',connectionId:'lm-studio',connectionRevision:'a'.repeat(64)}:{provider:options.local?'ollama':'gemini',model:options.local?'fictional/text':'gemini-3.6-flash',connectionId:options.local?'local':null,connectionRevision:options.local?'one':null};
 await action('ClassificationConsentChosen','consent',{enabled:true,...destination});
 await action('ClassificationBatchRequested','batch',{consentId:'consent',answersId:options.custom?'class-answers':null,catalogueVersion:1,targets:{[`${t.kind}_${t.id}`]:'1:'}});
 const request=async(eventId='request',changes={})=>action('ClassificationRequested',eventId,{batchId:'batch',target:t,retryOf:null,...changes});
 const reply=async(text='nature')=>action('ClassificationResponseReceived','response',{requestId:'request',text,model:'fictional/model',finishReason:'STOP'});
 const log=async()=> (await getDocs(query(collection(db,`${path}/events`),orderBy('sequence')))).docs.map(d=>decodeEvent(d.data()));
 return {uid,db,path,t,action,request,reply,log};
}
async function forgedReply(f,{extra={},assign=true}={}){
 const {db,path}=f,head=await getDoc(doc(db,path)),control=await getDoc(doc(db,`${path}/classification/control`));
 const e={eventId:'forged',type:'ClassificationResponseReceived',schemaVersion:1,payload:{previousEventId:control.get('lastEventId'),requestId:'request',text:'nature',model:'fictional/model',finishReason:'STOP',...extra},sequence:head.get('sequence')+1,recordedAt:serverTimestamp()};
 const b=writeBatch(db);b.set(doc(db,`${path}/events/forged`),e);b.set(doc(db,path),{sequence:e.sequence,lastEventId:e.eventId});b.set(doc(db,`${path}/classification/control`),{...control.data(),lastEventId:e.eventId,requestId:null});
 const claim=await getDoc(doc(db,`${path}/classificationClaims/request`));b.set(doc(db,`${path}/classificationClaims/request`),{...claim.data(),resultId:e.eventId});
 if(assign)b.set(doc(db,`${path}/${f.t.kind==='reflection'?'topics':'backupTopics'}/${f.t.id}`),{lastEventId:e.eventId});return b.commit();
}
test('owner-only classification claims coordinate devices; replies replay identically and never change writing',async()=>{
 const f=await fixture('class-owner');await f.request();assert.equal((await Promise.all([claimClassification(f.db,f.uid,'request','one'),claimClassification(f.db,f.uid,'request','two')])).filter(Boolean).length,1);await f.reply();
 const log=await f.log(),state=replay(log);assert.equal(state.topics.entry.topicId,'nature');assert.equal(state.entries[0].revision,1);assert.deepEqual(state,replay(log.slice(3),replay(log.slice(0,3))));
 const original=log.find(e=>e.type==='ClassificationResponseReceived');assert.equal((await appendReflection(f.db,f.uid,{eventId:original.eventId,type:original.type,schemaVersion:original.schemaVersion,payload:original.payload})).created,false);
 await assertFails(getDoc(doc(client('intruder'),`${f.path}/events/response`)));await assertFails(getDoc(doc(client('intruder'),`${f.path}/classification/control`)));
 await assert.rejects(f.reply(),/changed|already/);
});
test('invalid provider observations are retained with no assignment; backup categories are manually editable',async()=>{
 const invalid=await fixture('class-invalid');await invalid.request();await claimClassification(invalid.db,invalid.uid,'request','owner');await invalid.reply('nature and music');assert.equal((await getDoc(doc(invalid.db,`${invalid.path}/topics/entry`))).exists(),false);assert.equal(replay(await invalid.log()).classification.outcomes.request,'invalid');
 const f=await fixture('class-backup','backup');await f.request();await claimClassification(f.db,f.uid,'request','owner');await f.reply();
 await f.action('BackupTopicChosen','manual',{target:{...f.t,previousTopicId:'response'},answersId:null,topicId:'art'});const state=replay(await f.log());assert.equal(state.classification.backupTopics[f.t.id].topicId,'art');assert.equal(state.backups[f.t.id].used,undefined);
});
test('raw Rules reject stale/manual assignments and computed fields without relying on append helper checks',async()=>{
 for(const kind of ['manual','edit','withdraw','cancel']){
  const f=await fixture(`class-race-${kind}`);await f.request();await claimClassification(f.db,f.uid,'request','worker');
  if(kind==='manual')await appendReflection(f.db,f.uid,{eventId:'manual',type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:'entry',expectedRevision:1,previousEventId:null,answersId:null,topicId:'music'}});
  if(kind==='edit')await appendReflection(f.db,f.uid,{eventId:'edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'Changed reflection.',expectedRevision:1,promptId:STARTER_ID,promptText:null,entryAt:null,photoSlot:null}});
  if(kind==='withdraw')await f.action('ClassificationConsentChosen','withdraw',{enabled:false,provider:'gemini',model:'gemini-3.6-flash',connectionId:null,connectionRevision:null});
  if(kind==='cancel')await f.action('ClassificationBatchControlled','cancel',{batchId:'batch',operation:'cancel'});
  await assertFails(forgedReply(f));await f.reply();const state=replay(await f.log());assert.equal(state.classification.outcomes.request,'stale');assert.equal(state.topics.entry?.topicId,kind==='manual'?'music':undefined);
 }
 const f=await fixture('class-forged');await f.request();await claimClassification(f.db,f.uid,'request','worker');await assertFails(forgedReply(f,{extra:{completed:1}}));
 await assertFails(setDoc(doc(f.db,`${f.path}/classification/control`),{lastEventId:'request',consentId:'consent',batchId:'batch',requestId:null}));
});
test('pause, unknown targets and competing live requests fail before dispatch',async()=>{
 const f=await fixture('class-paused');await f.action('ClassificationBatchControlled','pause',{batchId:'batch',operation:'pause'});await assert.rejects(f.request(),/changed/);await f.action('ClassificationBatchControlled','resume',{batchId:'batch',operation:'resume'});await f.request();await assert.rejects(f.request('competing',{retryOf:'request'}));
});

test('custom unselected vocabulary and external bindings fit the full setup Rules budget',async()=>{
 const f=await fixture('class-custom-local','reflection',{custom:true,local:true});await f.request();await claimClassification(f.db,f.uid,'request','worker');await f.reply('custom_birds');assert.equal(replay(await f.log()).topics.entry.topicId,'custom_birds');
});
test('changed external bindings reject assignment until consent is withdrawn, then retain the late observation as stale',async()=>{
 const f=await fixture('class-late-binding','reflection',{local:true});await f.request();await claimClassification(f.db,f.uid,'request','worker');
 await setDoc(doc(f.db,`users/${f.uid}/privateConnections/local`),{schemaVersion:1,provider:'ollama',model:'fictional/text',revision:'two',updatedAt:serverTimestamp()});
 await assert.rejects(f.reply(),/connection changed/);
 await f.action('ClassificationConsentChosen','withdraw',{enabled:false,provider:'ollama',model:'fictional/text',connectionId:'local',connectionRevision:'one'});await f.reply();assert.equal(replay(await f.log()).classification.outcomes.request,'stale');
});
test('twenty selected targets fit Rules bounds with a populated setup projection',async()=>{
 const f=await fixture('class-bounded');const targets={reflection_entry:'1:'};
 for(let i=1;i<20;i++){const id=`entry_${i}`;await appendReflection(f.db,f.uid,{eventId:`write_${i}`,type:'ReflectionWritten',schemaVersion:1,payload:{entryId:id,expectedRevision:0,starterId:STARTER_ID,text:'A fictional small kindness.'}});targets[`reflection_${id}`]='1:';}
 await f.action('ClassificationBatchRequested','twenty',{consentId:'consent',answersId:null,catalogueVersion:1,targets});assert.equal(Object.keys(replay(await f.log()).classification.batches.twenty.action.payload.targets).length,20);
});
test('raw batches cannot bypass target validation in the latter half of their atomic append',async()=>{
 const f=await fixture('class-forged-tail'),targets={};
 for(let i=0;i<20;i++){const id=`a${String(i).padStart(2,'0')}`;targets[`reflection_${id}`]=i===19?'1:invalid topic cursor':'1:';}
 const head=await getDoc(doc(f.db,f.path)),control=await getDoc(doc(f.db,`${f.path}/classification/control`)),id='forged-tail';
 const e={eventId:id,type:'ClassificationBatchRequested',schemaVersion:1,payload:{previousEventId:control.get('lastEventId'),consentId:'consent',answersId:null,catalogueVersion:1,targets},sequence:head.get('sequence')+1,recordedAt:serverTimestamp()};
 const b=writeBatch(f.db);b.set(doc(f.db,`${f.path}/events/${id}`),e);b.set(doc(f.db,f.path),{sequence:e.sequence,lastEventId:id});b.set(doc(f.db,`${f.path}/classification/control`),{...control.data(),lastEventId:id,batchId:id});b.set(doc(f.db,`${f.path}/classificationBatches/${id}`),{lastEventId:id,status:'running'});await assertFails(b.commit());
});

test('LM Studio classifications retain a pinned server/model handle without exposing the address',async()=>{
 const f=await fixture('class-lm-studio','reflection',{lm:true});await f.request();await claimClassification(f.db,f.uid,'request','worker');await f.reply('unknown');
 const state=replay(await f.log());assert.equal(state.topics.entry.topicId,'unknown');assert.equal(state.classification.consent.payload.connectionRevision,'a'.repeat(64));
});
