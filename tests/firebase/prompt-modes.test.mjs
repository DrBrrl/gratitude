import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs,query,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {emptyProjection,replay,STARTER_ID} from '../../src/lib/domain.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
import {makeRequest,buildContext} from '../../src/lib/ai/context.ts';
let environment;
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await environment.clearFirestore();});
after(async()=>environment?.cleanup());
const client=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const day='2026-10-01',selection={timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'},mode={promptMode:'review',displayDay:day,scheduleId:null,lunarVersion:'ae-2.1.19-v1'};
async function source(db,uid){return (await getDocs(query(collection(db,`users/${uid}/streams/v1/events`),orderBy('sequence')))).docs.map(d=>decodeEvent(d.data()));}
async function setup(uid){const db=client(uid);await appendReflection(db,uid,{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),selectedTopics:['nature','music'],useAnswers:true}),previousEventId:null}});await appendReflection(db,uid,{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:''}});await appendReflection(db,uid,{eventId:'writing',type:'ReflectionWritten',schemaVersion:8,payload:{entryId:'past',expectedRevision:0,text:'A fictional song.',promptId:STARTER_ID,promptText:null,entryAt:'2026-09-20T01:00:00.000Z',photoSlot:null,topic:{topicId:'music',previousEventId:null,answersId:'answers'}}});return db;}
async function raw(db,uid,action,topic=false){const root=`users/${uid}/streams/v1`,head=await getDoc(doc(db,root)),batch=writeBatch(db);batch.set(doc(db,`${root}/events/${action.eventId}`),{...action,sequence:head.get('sequence')+1,recordedAt:serverTimestamp()});batch.set(doc(db,root),{sequence:head.get('sequence')+1,lastEventId:action.eventId});if(action.type==='PromptRequested')batch.set(doc(db,`${root}/ai/control`),{lastEventId:action.eventId,choicesId:action.payload.choicesId,requestId:action.eventId});else {batch.set(doc(db,`${root}/entries/${action.payload.entryId}`),{lastEventId:action.eventId});if(topic)batch.set(doc(db,`${root}/topics/${action.payload.entryId}`),{lastEventId:action.eventId});}return batch.commit();}
test('manual review requests pin consent, source and weighted context; Rules reject forged mode/schedule inputs',async()=>{
 const uid='mode-owner',db=await setup(uid),state=replay(await source(db,uid));
 const request=makeRequest(state,day,'personal','review',undefined,selection,undefined,false,undefined,mode);assert.equal(JSON.parse(buildContext(state,request)).topic.description,state.onboarding.answers.descriptions.music);
 for(const change of [{promptMode:'invalid'},{scheduleId:'fake-schedule'},{lunarVersion:'unversioned'},{displayDay:'2026-02-31'},{phaseDate:'2026-10-01'},{snapshotId:'stale'}])await assertFails(raw(db,uid,{...request,eventId:'bad',payload:{...request.payload,...change}}));
 await appendReflection(db,uid,request);assert.equal((await appendReflection(db,uid,request)).created,false);
 await appendReflection(db,uid,{eventId:'review_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'review',text:'Review a fictional detail?',model:'fixture',finishReason:'STOP'}});
 const after=replay(await source(db,uid));assert.equal(after.ai.requestTopics.review.id,'music');assert.deepEqual(after.ai.requestPools.review,{anniversary:0,rediscovery:0,fallback:0,recent:1});
 await appendReflection(db,uid,{eventId:`v${day}_treview_response`,type:'PromptViewed',schemaVersion:2,payload:{day,promptId:'review_response',surface:'today'}});
 const log=await source(db,uid);assert.deepEqual(replay(log.slice(3),replay(log.slice(0,3))),replay(log));
});
test('Review source survives edited wording and topic writes atomically; fabricated provenance is rejected',async()=>{
 const uid='mode-entry',db=await setup(uid);let state=replay(await source(db,uid));const request=makeRequest(state,day,'personal','review',undefined,selection,undefined,false,undefined,mode);await appendReflection(db,uid,request);
 await appendReflection(db,uid,{eventId:'review_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'review',text:'A fictional review?',model:'fixture',finishReason:'STOP'}});
 const writing={eventId:'saved',type:'ReflectionWritten',schemaVersion:9,payload:{entryId:'new',expectedRevision:0,text:'A remembered melody.',promptId:'saved',promptText:'My revised question?',promptSourceId:'review_response',entryAt:null,photoSlot:null,topic:{topicId:'music',previousEventId:null,answersId:'answers'}}};
 await assertFails(raw(db,uid,{...writing,payload:{...writing.payload,promptSourceId:'missing'}},true));await assertFails(raw(db,uid,writing,false));
 await appendReflection(db,uid,writing);assert.equal((await appendReflection(db,uid,writing)).created,false);state=replay(await source(db,uid));assert.equal(state.entries.at(-1).promptSourceId,'review_response');assert.equal(state.topics.new.topicId,'music');
 await appendReflection(db,uid,{...writing,eventId:'no-topic',payload:{...writing.payload,entryId:'generic',promptId:'no-topic',topic:null}});state=replay(await source(db,uid));assert.equal(state.topics.generic,undefined);
});
const lunarDay='2026-09-27',lunarZone='Australia/Hobart';
async function lunarSetup(uid){const db=await setup(uid);await appendReflection(db,uid,{eventId:'lunar',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:null,enabled:true,timeZone:lunarZone,lunarVersion:mode.lunarVersion}});return db;}
async function scheduled(db,uid,id){const state=replay(await source(db,uid));return makeRequest(state,lunarDay,'personal',id,undefined,selection,undefined,false,undefined,{...mode,displayDay:'2026-09-26',scheduleId:'lunar'});}
test('lunar settings, immutable declines, visible offer receipts and cross-zone display days are atomic',async()=>{
 const uid='lunar-offer',db=await lunarSetup(uid);const r=await scheduled(db,uid,'scheduled');
 await assertFails(raw(db,uid,{...r,eventId:'wrong-zone',payload:{...r.payload,timeZone:'UTC'}}));await appendReflection(db,uid,r);
 await assert.rejects(appendReflection(db,uid,{...r,eventId:'racing',payload:{...r.payload,previousEventId:r.eventId,snapshotId:r.eventId}}));
 await appendReflection(db,uid,{eventId:'scheduled_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A monthly review?',model:'fixture',finishReason:'STOP'}});
 const view={eventId:`v2026-09-26_tscheduled_response`,type:'PromptViewed',schemaVersion:2,payload:{day:'2026-09-26',promptId:'scheduled_response',surface:'today'}};await appendReflection(db,uid,view);assert.equal((await appendReflection(db,uid,view)).created,false);
 let pointer=await getDoc(doc(db,`users/${uid}/streams/v1/lunar/control`));assert.equal(pointer.get('offers')[lunarZone+'|'+lunarDay],view.eventId);assert.equal(pointer.get('lastEventId'),'lunar');
 await appendReflection(db,uid,{...view,eventId:`v${lunarDay}_tscheduled_response`,payload:{...view.payload,day:lunarDay}});pointer=await getDoc(doc(db,`users/${uid}/streams/v1/lunar/control`));assert.equal(pointer.get('lastOfferId'),view.eventId);
 const state=replay(await source(db,uid));assert.equal(state.ai.days['2026-09-26'],'scheduled_response');assert.equal(state.rotation.offers.filter(o=>o.kind==='ai').length,2);
 const forged={...r,eventId:'repeat',payload:{...r.payload,previousEventId:state.ai.control.lastEventId,snapshotId:state.lastEventId}};await assertFails(raw(db,uid,forged));
});
test('declines survive settings edits and disable/decline rejects late output; lunar controls cannot be forged',async()=>{
 for(const decline of [true,false]){const uid='lunar-late-'+decline,db=await lunarSetup(uid),r=await scheduled(db,uid,'scheduled');await appendReflection(db,uid,r);
 const change=decline?{eventId:'change',type:'LunarPromptDeclined',schemaVersion:1,payload:{previousEventId:'lunar',settingsId:'lunar',day:lunarDay,timeZone:lunarZone,lunarVersion:mode.lunarVersion}}:{eventId:'change',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'lunar',enabled:false,timeZone:lunarZone,lunarVersion:mode.lunarVersion}};await appendReflection(db,uid,change);
 await assert.rejects(appendReflection(db,uid,{eventId:'scheduled_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A late monthly review?',model:'fixture',finishReason:'STOP'}}));
 const sourceHead=await getDoc(doc(db,`users/${uid}/streams/v1`)),late=writeBatch(db),prefix=`users/${uid}/streams/v1`;late.set(doc(db,prefix+'/events/scheduled_response'),{eventId:'scheduled_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A late monthly review?',model:'fixture',finishReason:'STOP'},sequence:sourceHead.get('sequence')+1,recordedAt:serverTimestamp()});late.set(doc(db,prefix),{sequence:sourceHead.get('sequence')+1,lastEventId:'scheduled_response'});late.set(doc(db,prefix+'/ai/control'),{lastEventId:'scheduled_response',choicesId:'choices',requestId:null});await assertFails(late.commit());
 await assert.rejects(appendReflection(db,uid,{...change,eventId:'stale'}));
 const root=`users/${uid}/streams/v1`,batch=writeBatch(db);batch.set(doc(db,`${root}/lunar/control`),{lastEventId:'change',settingsId:'lunar',declines:{},offers:{},lastOfferId:null});await assertFails(batch.commit());
 await appendReflection(db,uid,{eventId:'scheduled_failure',type:'AIRequestFailed',schemaVersion:1,payload:{requestId:r.eventId,reason:'unavailable'}});assert.equal((await getDoc(doc(db,root+'/ai/control'))).get('requestId'),null);
 const log=await source(db,uid);assert.deepEqual(replay(log.slice(3),replay(log.slice(0,3))),replay(log));}
});
test('scheduled personal-cloud mode requests fit Rules bounds with twenty reflections and twenty feedback pairs',async()=>{
 const uid='mode-budget',db=await lunarSetup(uid);let state=replay(await source(db,uid));
 for(let i=0;i<20;i++){
 await appendReflection(db,uid,{eventId:'w'+i,type:'ReflectionWritten',schemaVersion:8,payload:{entryId:'e'+i,expectedRevision:0,promptId:'w'+i,promptText:'Fictional question '+i+'?',text:'Fictional music '+i,entryAt:'2026-09-20T01:00:00.000Z',photoSlot:null,topic:{topicId:'music',previousEventId:null,answersId:'answers'}}});
 await appendReflection(db,uid,{eventId:'f'+i,type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:state.ai.control.lastEventId,promptId:'w'+i,text:'Fictional feedback '+i}});state=replay(await source(db,uid));}
 await environment.withSecurityRulesDisabled(admin=>setDoc(doc(admin.firestore(),`users/${uid}/privateConnections/binding`),{schemaVersion:1,provider:'personal-gemini',model:'gemini-3.6-flash',revision:'revision',allowPersonal:true,updatedAt:serverTimestamp()}));
 await appendReflection(db,uid,{eventId:'personal-choices',type:'AIChoicesConfirmed',schemaVersion:6,payload:{previousEventId:state.ai.control.lastEventId,enabled:true,useJournal:true,useFeedback:true,guidance:'',provider:'personal-gemini',backupEnabled:false,backupProvider:'prompt',photoProvider:'prompt',promptConnectionId:'binding',photoConnectionId:null,backupConnectionId:null}});state=replay(await source(db,uid));
 const target={provider:'personal-gemini',model:'gemini-3.6-flash',thinking:'provider-default',connectionId:'binding',connectionRevision:'revision'};
 const r=makeRequest(state,lunarDay,'personal','budget',undefined,selection,target,false,undefined,{...mode,displayDay:'2026-09-26',scheduleId:'lunar'});assert.equal(r.schemaVersion,53);assert.equal(Object.keys(r.payload.entryRefs).length,20);assert.equal(r.payload.feedbackIds.length,20);const firstId=Object.keys(r.payload.entryRefs)[0];await assert.rejects(appendReflection(db,uid,{...r,eventId:'wrong-revision',payload:{...r.payload,entryRefs:{...r.payload.entryRefs,[firstId]:'999'}}}),/AI context changed/);await appendReflection(db,uid,r);assert.equal((await appendReflection(db,uid,r)).created,false);
 await appendReflection(db,uid,{eventId:'budget_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A fictional monthly review?',model:'fixture',finishReason:'STOP'}});
 let priorResponse='budget_response';
 for(const provider of ['personal-gemini','gemini','lm-studio']){
  state=replay(await source(db,uid));
  if(state.ai.choices.provider!==provider){await appendReflection(db,uid,{eventId:'choice-'+provider,type:'AIChoicesConfirmed',schemaVersion:6,payload:{previousEventId:state.ai.control.lastEventId,enabled:true,useJournal:true,useFeedback:true,guidance:'',provider,backupEnabled:false,backupProvider:'prompt',photoProvider:'prompt',promptConnectionId:provider==='personal-gemini'?'binding':null,photoConnectionId:null,backupConnectionId:null}});}
  for(let kind=0;kind<4;kind++){
   state=replay(await source(db,uid));const id='max-'+provider+'-'+kind,editor=kind%2===1?'editor-'+provider:undefined,connection=provider==='personal-gemini'?target:provider==='lm-studio'?{provider,model:'fixture-local',thinking:false}:undefined;
   const request=makeRequest(state,lunarDay,'personal',id,editor,selection,connection,false,kind>=2?priorResponse:undefined,{...mode,displayDay:lunarDay,scheduleId:null});
   assert.equal(request.schemaVersion,(provider==='personal-gemini'?[53,54,56,57]:provider==='gemini'?[43,44,49,50]:[45,46,51,52])[kind]);assert.equal(Object.keys(request.payload.entryRefs).length,20);assert.equal(request.payload.feedbackIds.length,20);
   if(editor)await assertFails(raw(db,uid,{...request,eventId:'bad-editor',payload:{...request.payload,entryRevision:1}}));
   if(kind>=2)await assertFails(raw(db,uid,{...request,eventId:'bad-prior',payload:{...request.payload,differentFromPromptId:'choices'}}));
   if('connectionId' in request.payload)await assertFails(raw(db,uid,{...request,eventId:'bad-binding',payload:{...request.payload,connectionRevision:'stale'}}));
   try{await appendReflection(db,uid,request);}catch(error){error.message=id+': '+error.message;throw error;}
   priorResponse=id+'_response';await appendReflection(db,uid,{eventId:priorResponse,type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:id,text:'A fictional review of another detail?',model:'fixture',finishReason:'STOP'}});
  }
 }
});
test('a regular prompt view cannot forge lunar offer or settings pointers',async()=>{
 const uid='lunar-forged-view',db=await lunarSetup(uid),root=`users/${uid}/streams/v1`;let state=replay(await source(db,uid));
 const r=makeRequest(state,day,'personal','manual',undefined,selection);await appendReflection(db,uid,r);await appendReflection(db,uid,{eventId:'manual_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A regular question?',model:'fixture',finishReason:'STOP'}});
 const view={eventId:`v${day}_tmanual_response`,type:'PromptViewed',schemaVersion:2,payload:{day,promptId:'manual_response',surface:'today'}},head=await getDoc(doc(db,root)),control=await getDoc(doc(db,root+'/lunar/control')),batch=writeBatch(db);
 batch.set(doc(db,root+'/events/'+view.eventId),{...view,sequence:head.get('sequence')+1,recordedAt:serverTimestamp()});batch.set(doc(db,root),{sequence:head.get('sequence')+1,lastEventId:view.eventId});batch.set(doc(db,root+'/rotation/control'),{lastEventId:view.eventId});batch.set(doc(db,root+'/lunar/control'),{...control.data(),offers:{invented:view.eventId},lastOfferId:view.eventId});await assertFails(batch.commit());
 await appendReflection(db,uid,view);await assertFails(getDoc(doc(client('lunar-outsider'),root+'/lunar/control')));
});
