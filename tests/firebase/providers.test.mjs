import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {appendReflection} from '../../src/lib/firebase/append.ts';
import {makeRequest} from '../../src/lib/ai/context.ts';
import {replay} from '../../src/lib/domain.ts';
import {externalTarget} from '../../src/lib/ai/connection-contract.ts';
let environment;
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await environment.clearFirestore();});
after(async()=>environment?.cleanup());
const client=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const key='fictional-gemini-key-never-valid-in-production',model='gemini-3.6-flash';
const keyring={active:'fixture-v1',keys:{'fixture-v1':Buffer.alloc(32,7).toString('base64')}};
const auth=uid=>({uid,token:{firebase:{sign_in_provider:'google.com'}}});
const selection={timeZone:'Australia/Hobart',selectionSeed:'a'.repeat(32)};
const at='2026-10-01T04:31:07.000Z';
const choices=(provider,id='connection')=>({eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:5,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:'',provider,backupEnabled:true,backupProvider:provider,photoProvider:'prompt',promptConnectionId:id,backupConnectionId:id,photoConnectionId:null}});
test('connection bindings and received events are owner-only; legacy schemas cannot authorize a new service',async()=>{
 for(const provider of ['ollama','openai-compatible']){
  const uid='provider-'+provider,db=client(uid),connection={provider,baseUrl:'https://fictional.example',model:'fictional/text',token:'',connectionId:'connection',connectionRevision:'revision'};
  await setDoc(doc(db,`users/${uid}/privateConnections/connection`),{schemaVersion:1,provider,model:connection.model,revision:'revision',updatedAt:serverTimestamp()});
  await assertFails(getDoc(doc(client('other-owner'),`users/${uid}/privateConnections/connection`)));
  const action=choices(provider);await appendReflection(db,uid,action);const state=replay([{...action,sequence:1,recordedAt:at}]);
  const request=makeRequest(state,'2026-10-01','personal','request',undefined,selection,externalTarget(connection));
  await appendReflection(db,uid,request);
  const response={eventId:'request_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'request',text:'A fictional joy?',model:'fictional/text',finishReason:'STOP'}};
  await appendReflection(db,uid,response);
  const log=[{...action,sequence:1,recordedAt:at},{...request,sequence:2,recordedAt:at},{...response,sequence:3,recordedAt:at}];assert.deepEqual(replay(log.slice(2),replay(log.slice(0,2))),replay(log));
  await assertFails(setDoc(doc(db,`users/${uid}/privateConnections/forged`),{schemaVersion:1,provider:'personal-gemini',model,revision:'fake',updatedAt:serverTimestamp()}));
 }
});
test('replacing a local revision rejects new and late forged requests independently of browser checks',async()=>{
 const uid='provider-revision',db=client(uid),path=`users/${uid}/privateConnections/connection`;
 await setDoc(doc(db,path),{schemaVersion:1,provider:'ollama',model:'fictional/text',revision:'one',updatedAt:serverTimestamp()});const action=choices('ollama');await appendReflection(db,uid,action);
 const request=makeRequest(replay([{...action,sequence:1,recordedAt:at}]),'2026-10-01','personal','request',undefined,selection,{provider:'ollama',model:'fictional/text',thinking:false,connectionId:'connection',connectionRevision:'one'});await appendReflection(db,uid,request);
 await setDoc(doc(db,path),{schemaVersion:1,provider:'ollama',model:'fictional/text',revision:'two',updatedAt:serverTimestamp()});
 const response={eventId:'request_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'request',text:'Late fictional answer',model:'fictional/text',finishReason:'STOP'}};
 await assert.rejects(appendReflection(db,uid,response),/connection changed/);
 const root=`users/${uid}/streams/v1`,batch=writeBatch(db);batch.set(doc(db,root+'/events/request_response'),{...response,sequence:3,recordedAt:serverTimestamp()});batch.set(doc(db,root),{sequence:3,lastEventId:'request_response'});batch.set(doc(db,root+'/ai/control'),{lastEventId:'request_response',choicesId:'choices',requestId:null});await assertFails(batch.commit());
 await assertFails(setDoc(doc(db,`users/${uid}/privateSettings/lmStudio`),{schemaVersion:2,provider:'ollama',baseUrl:'https://fictional.example',model:'fictional/text',token:'',connectionId:'connection',connectionRevision:'one',updatedAt:serverTimestamp()}));
 await setDoc(doc(db,`users/${uid}/privateSettings/lmStudio`),{schemaVersion:2,provider:'ollama',baseUrl:'https://fictional.example',model:'fictional/text',token:'',connectionId:'connection',connectionRevision:'two',updatedAt:serverTimestamp()});
});
