import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {appendReflection} from '../../src/lib/firebase/append.ts';
import {makeRequest} from '../../src/lib/ai/context.ts';
import {replay} from '../../src/lib/domain.ts';
import {externalTarget} from '../../src/lib/ai/connection-contract.ts';
import {createAIRelay,sealKey,openKey} from '../../functions/src/ai-relay.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
let environment,adminApp,admin;
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await environment.clearFirestore();adminApp=initializeApp({projectId:'demo-gratitude'},'relay-test');admin=getFirestore(adminApp);});
after(async()=>{await environment?.cleanup();await deleteApp(adminApp);});
const client=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const key='fictional-gemini-key-never-valid-in-production',model='gemini-3.6-flash';
const keyring={active:'fixture-v1',keys:{'fixture-v1':Buffer.alloc(32,7).toString('base64')}};
const auth=uid=>({uid,token:{firebase:{sign_in_provider:'google.com'}}});
const selection={timeZone:'Australia/Hobart',selectionSeed:'a'.repeat(32)};
const at='2026-10-01T04:31:07.000Z';
const choices=(provider,id='connection')=>({eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:5,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:'',provider,backupEnabled:true,backupProvider:provider,photoProvider:'prompt',promptConnectionId:id,backupConnectionId:id,photoConnectionId:null}});
function endpoint({status=200,onGenerate}={}){
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init,body:init.body?JSON.parse(init.body):undefined});if(init.method==='GET')return Response.json({models:[{name:'models/'+model,supportedGenerationMethods:['generateContent']}]});if(onGenerate)await onGenerate();return Response.json(status===200?{modelVersion:model+'-fixture',candidates:[{finishReason:'STOP',content:{parts:[{text:'What fictional comfort did you notice?'}]}}]}:{error:{message:key+' private provider diagnostics'}},{status});};return {calls,fetcher};
}
function relay(fetcher){return createAIRelay({db:admin,project:'demo-gratitude',keyring:()=>keyring,fetcher,now:()=>Date.parse(at)});}
async function prepareCloud(uid,options={}){
 const network=endpoint(options),invoke=relay(network.fetcher);
 const saved=await invoke({auth:auth(uid),data:{operation:'save',connectionId:'connection',revision:null,key,model,allowPersonal:options.allowPersonal??false}});
 const db=client(uid),action=choices('personal-gemini');await appendReflection(db,uid,action);
 const state=replay([{...action,sequence:1,recordedAt:at}]);
 const request=makeRequest(state,'2026-10-01','generic','request',undefined,selection,{provider:'personal-gemini',model,thinking:'provider-default',connectionId:'connection',connectionRevision:saved.revision});
 await appendReflection(db,uid,request);
 const data={operation:'generate',connectionId:'connection',revision:saved.revision,requestId:'request',system:'Write one fictional gratitude prompt.',context:'Offer a fresh question about an ordinary everyday moment. No personal context is supplied.',max:4000};
 return {db,invoke,saved,request,data,network};
}
test('key encryption is bound to its owner and revision and supports retained keyring versions',()=>{
 const sealed=sealKey(key,'owner:revision',keyring);assert.ok(!JSON.stringify(sealed).includes(key));assert.equal(openKey(sealed,'owner:revision',keyring),key);assert.throws(()=>openKey(sealed,'other:revision',keyring));assert.throws(()=>openKey({...sealed,tag:Buffer.alloc(16).toString('base64')},'owner:revision',keyring));
 assert.equal(openKey(sealed,'owner:revision',{active:'fixture-v2',keys:{...keyring.keys,'fixture-v2':Buffer.alloc(32,9).toString('base64')}}),key);
});
test('personal key testing is metadata-only; saved credentials are encrypted, write-only and usable from a second device',async()=>{
 const uid='relay-owner',network=endpoint(),invoke=relay(network.fetcher);
 await assert.rejects(invoke({data:{operation:'test',key}}),error=>error.code==='unauthenticated');
 assert.deepEqual(await invoke({auth:auth(uid),data:{operation:'test',key}}),{models:[model]});assert.ok(network.calls.every(call=>call.init.method==='GET'));
 const saved=await invoke({auth:auth(uid),data:{operation:'save',connectionId:'connection',revision:null,key,model,allowPersonal:false}});assert.ok(!JSON.stringify(saved).includes(key));
 const secret=await admin.doc(`users/${uid}/privateModelKeys/connection`).get();assert.ok(!JSON.stringify(secret.data()).includes(key));
 await assertFails(getDoc(doc(client(uid),`users/${uid}/privateModelKeys/connection`)));await assertFails(getDoc(doc(client('other'),`users/${uid}/privateConnections/connection`)));
 const metadata=await getDoc(doc(client(uid),`users/${uid}/privateConnections/connection`));assert.equal(metadata.get('revision'),saved.revision);assert.equal(metadata.get('allowPersonal'),false);
 assert.deepEqual(await invoke({auth:auth(uid),data:{operation:'test',connectionId:'connection',revision:saved.revision}}),{models:[model]});
 await assert.rejects(invoke({auth:auth('other'),data:{operation:'test',connectionId:'connection',revision:saved.revision}}),error=>error.code==='failed-precondition');
 await assert.rejects(invoke({auth:auth(uid),data:{operation:'test',key,url:'http://127.0.0.1'}}),error=>error.code==='invalid-argument');
 assert.ok(network.calls.every(call=>call.url.startsWith('https://generativelanguage.googleapis.com/v1beta/')&&call.init.redirect==='error'&&call.init.headers['x-goog-api-key']===key&&!call.init.headers.Authorization));
});
test('personal generation uses only its recorded target and does not redispatch the same source request',async()=>{
 const {invoke,data,network}=await prepareCloud('relay-generate');
 const output=await invoke({auth:auth('relay-generate'),data});assert.equal(output.text,'What fictional comfort did you notice?');assert.ok(!JSON.stringify(output).includes(key));
 const generation=network.calls.filter(call=>call.init.method==='POST');assert.equal(generation.length,1);assert.equal(generation[0].url,`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);assert.equal(generation[0].body.contents[0].parts[0].text,data.context);
 await assert.rejects(invoke({auth:auth('relay-generate'),data}),error=>error.code==='failed-precondition');assert.equal(network.calls.filter(call=>call.init.method==='POST').length,1);
});
test('personal quota errors are safe and never return raw provider diagnostics',async()=>{
 const {invoke,data}=await prepareCloud('relay-quota',{status:429});await assert.rejects(invoke({auth:auth('relay-quota'),data}),error=>error.code==='resource-exhausted'&&!error.message.includes(key)&&!error.message.includes('private provider diagnostics'));
});
test('photo dispatch requires separate cloud terms and sends only the recorded selected image',async()=>{
 for(const allowPersonal of [false,true]){
  const uid='relay-photo-'+allowPersonal,{invoke,db,saved,network}=await prepareCloud(uid,{allowPersonal});
  await appendReflection(db,uid,{eventId:'attached',type:'PhotoAttached',schemaVersion:1,payload:{entryId:'entry',slot:0,photoId:'photo',previousEventId:null}});
  await appendReflection(db,uid,{eventId:'photo_request',type:'PhotoSummaryRequested',schemaVersion:4,payload:{entryId:'entry',slot:0,photoId:'photo',previousEventId:'attached',choicesId:'choices',provider:'personal-gemini',model,thinking:'provider-default',connectionId:'connection',connectionRevision:saved.revision}});
  const data={operation:'generate',connectionId:'connection',revision:saved.revision,requestId:'photo_request',system:'Describe visible photo content only.',image:'/9j/AAAA==',max:1000};
  if(!allowPersonal){await assert.rejects(invoke({auth:auth(uid),data}),error=>error.code==='failed-precondition');assert.equal(network.calls.filter(call=>call.init.method==='POST').length,0);}
  else{await invoke({auth:auth(uid),data});const body=network.calls.at(-1).body;assert.deepEqual(body.contents[0].parts,[{text:'Describe this photo.'},{inlineData:{mimeType:'image/jpeg',data:'/9j/AAAA=='}}]);assert.ok(!JSON.stringify(body).includes('No personal context'));}
 }
});
test('removing a key during inference invalidates the late result and future use without blocking deletion',async()=>{
 let releaseProvider,started;const ready=new Promise(resolve=>{started=resolve;});const pending=new Promise(resolve=>{releaseProvider=resolve;});
 const {invoke,data,saved}=await prepareCloud('relay-delete',{onGenerate:async()=>{started();await pending;}});
 const response=invoke({auth:auth('relay-delete'),data});const rejected=assert.rejects(response,error=>error.code==='failed-precondition');await ready;
 await assert.rejects(invoke({auth:auth('relay-delete'),data:{operation:'test',connectionId:'connection',revision:saved.revision}}),error=>error.code==='resource-exhausted');
 assert.deepEqual(await invoke({auth:auth('relay-delete'),data:{operation:'delete',connectionId:'connection',revision:saved.revision}}),{deleted:true});releaseProvider();await rejected;
 assert.equal((await admin.doc('users/relay-delete/privateModelKeys/connection').get()).exists,false);
 await assert.rejects(invoke({auth:auth('relay-delete'),data:{operation:'test',connectionId:'connection',revision:saved.revision}}),error=>error.code==='failed-precondition');
});
test('revocation does not need readable ciphertext or generation quota, and removal has its own bounded budget',async()=>{
 const uid='relay-corrupt',network=endpoint(),invoke=relay(network.fetcher);
 const saved=await invoke({auth:auth(uid),data:{operation:'save',connectionId:'connection',revision:null,key,model,allowPersonal:false}});
 await admin.doc(`users/${uid}/privateModelKeys/connection`).update({keyVersion:'missing-old-version',ciphertext:'corrupt'});
 await admin.doc(`users/${uid}/aiRelay/control`).set({lease:'other-inference',expiresAt:Date.parse(at)+125000,minute:Math.floor(Date.parse(at)/60000),minuteCount:99,hour:Math.floor(Date.parse(at)/3600000),hourCount:99,day:Math.floor(Date.parse(at)/86400000),dayCount:999});
 assert.deepEqual(await invoke({auth:auth(uid),data:{operation:'delete',connectionId:'connection',revision:saved.revision}}),{deleted:true});
 assert.equal((await admin.doc(`users/${uid}/privateModelKeys/connection`).get()).exists,false);
 assert.equal((await admin.doc(`users/${uid}/privateConnections/connection`).get()).exists,false);
 for(let i=0;i<14;i++)assert.deepEqual(await invoke({auth:auth(uid),data:{operation:'delete',connectionId:'connection',revision:saved.revision}}),{deleted:true});
 await assert.rejects(invoke({auth:auth(uid),data:{operation:'delete',connectionId:'connection',revision:saved.revision}}),error=>error.code==='resource-exhausted');
 assert.equal(network.calls.filter(call=>call.init.method==='POST').length,0);
});
