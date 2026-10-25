import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithCredential} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,collection,getDocs,query,orderBy,doc,getDocFromServer} from 'firebase/firestore';
import {ref,getBytes} from 'firebase/storage';
import {unzipSync,strFromU8} from 'fflate';
import {archiveFixture} from '../fixtures/import-journal.mjs';
import {parseImportArchive,sha256} from '../../src/lib/import-archive.ts';
import {importJournal} from '../../src/lib/firebase/import-journal.ts';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {applyEvent,emptyProjection,replay} from '../../src/lib/domain.ts';
import {exportArchive} from '../../src/lib/export.ts';

test('686-record authenticated import pauses, resumes on another device and exports all five images', {timeout:900000},async()=>{
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
  const projectId='demo-gratitude', apps=[];
  const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:19199,rules:await readFile('storage.rules','utf8')}});
  await environment.clearFirestore();
  try {
    const makeDevice=async name=>{
      const app=initializeApp({projectId,apiKey:'demo-key'},name);apps.push(app);
      const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:19099',{disableWarnings:true});
      const token=`${Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:'import-scale@example.test',email:'import-scale@example.test',email_verified:true,name:'Fictional import visitor'})).toString('base64url')}.`;
      const {user}=await signInWithCredential(auth,GoogleAuthProvider.credential(token));
      const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',18080);
      const storage=environment.authenticatedContext(user.uid,{firebase:{sign_in_provider:'google.com'}}).storage('demo-gratitude.firebasestorage.app');
      let state=emptyProjection();
      const stream=`users/${user.uid}/streams/v1`;
      const rebuild=async()=>{state=replay((await getDocs(query(collection(db,`${stream}/events`),orderBy('sequence')))).docs.map(d=>decodeEvent(d.data())));return state;};
      const repository={commitAI:async action=>{
        const result=await appendReflection(db,user.uid,action);
        if(result.sequence>state.cursor)state=applyEvent(state,decodeEvent((await getDocFromServer(doc(db,`${stream}/events/${action.eventId}`))).data()));
        return result;
      }};
      return {client:{db,auth,storage},uid:user.uid,repository,rebuild,state:()=>state};
    };
    const fixture=archiveFixture({count:686,photos:[0,137,274,411,548],missing:[0,1,2]});
    const archive=await parseImportArchive(new Blob([fixture.bytes]),new Date('2026-10-01T04:31:07Z'));
    const selection={file:new File([fixture.bytes],'fictional-gratitude.zip'),prepared:{}};
    for(const [id,file] of archive.files)selection.prepared[id]={blob:file,digest:await sha256(new Uint8Array(await file.arrayBuffer()))};
    const first=await makeDevice('scale-first');let done=0;
    const paused=await importJournal(archive,selection,first.client,first.uid,first.repository,{paused:()=>done===100,state:first.state,progress:value=>done=value});
    assert.equal(paused.paused,true);assert.equal(first.state().entries.length,100);
    const changed=first.state().entries[1];
    await first.repository.commitAI({eventId:'scale-user-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:changed.id,text:'An explicit post-import edit.',expectedRevision:1,promptId:'scale-user-edit',promptText:'An edited question?',entryAt:changed.entryAt,photoSlot:null}});
    const second=await makeDevice('scale-second');await second.rebuild();
    const resumed=await importJournal(archive,selection,second.client,second.uid,second.repository,{paused:()=>false,state:second.state,progress:()=>{}});
    assert.equal(resumed.paused,false);assert.equal(second.state().entries.length,686);
    const state=await second.rebuild();assert.equal(Object.keys(state.photos).length,5);
    assert.equal(state.entries.filter(e=>e.origin.source.prompt===null).length,3);assert.equal(state.entries.filter(e=>!e.text.trim()).length,1);
    assert.equal(state.entries.find(e=>e.id===changed.id).text,'An explicit post-import edit.');
    const before=state.cursor;
    await importJournal(archive,selection,second.client,second.uid,second.repository,{paused:()=>false,state:second.state,progress:()=>{}});
    assert.equal(second.state().cursor,before);
    const exported=await exportArchive(state,'json',async id=>new Blob([await getBytes(ref(second.client.storage,`users/${second.uid}/v1/${id}`))]));
    const files=unzipSync(exported.content), json=JSON.parse(strFromU8(files['gratitude-journal.json']));
    assert.equal(json.version,3);assert.equal(json.entries.length,686);assert.equal(Object.keys(files).length,6);
    for(const entry of json.entries)for(const photo of entry.photos??[])assert.equal(await sha256(files[photo.path]),await sha256(fixture.jpeg));
    console.log({entries:686,photos:5,sourceNullPrompts:3,photoOnly:1,events:state.cursor,repeatAddedEvents:second.state().cursor-before});
  } finally {await Promise.all(apps.map(deleteApp));await environment.cleanup();}
});
