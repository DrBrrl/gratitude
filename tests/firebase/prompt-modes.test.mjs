import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,collection,getDocs,query,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';
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
