// Readiness only: each emulator executes real allow/deny Rules before browser use.
// The complete backend regression suite runs once in its own required job.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getMetadata,deleteObject} from 'firebase/storage';
import {appendReflection} from '../src/lib/firebase/append.ts';
import {STARTER_ID} from '../src/lib/domain.ts';
const uid='ci-emulator-readiness';
const environment=await initializeTestEnvironment({projectId:'demo-gratitude',
 firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')},
 storage:{host:'127.0.0.1',port:19199,rules:await readFile('storage.rules','utf8')}});
try{
 const owner=environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}});
 const stranger=environment.authenticatedContext('ci-readiness-stranger');
 await appendReflection(owner.firestore(),uid,{eventId:'readiness',type:'ReflectionWritten',schemaVersion:1,payload:{entryId:'readiness',text:'Fictional readiness probe.',expectedRevision:0,starterId:STARTER_ID}});
 const path=`users/${uid}/streams/v1/events/readiness`;
 assert.equal((await getDoc(doc(owner.firestore(),path))).get('payload.text'),'Fictional readiness probe.');
 await assertFails(getDoc(doc(stranger.firestore(),path)));
 const photo=ref(owner.storage(),`users/${uid}/v1/readiness`);
 await uploadBytes(photo,new Uint8Array([255,216,255,217]),{contentType:'image/jpeg'});
 assert.equal((await getMetadata(photo)).contentType,'image/jpeg');
 await assert.rejects(getMetadata(ref(stranger.storage(),photo.fullPath)),error=>error.code==='storage/unauthorized');
 await deleteObject(photo);
 await environment.withSecurityRulesDisabled(async context=>{
  for(const path of [`users/${uid}/streams/v1/events/readiness`,`users/${uid}/streams/v1/entries/readiness`,`users/${uid}/streams/v1`])await deleteDoc(doc(context.firestore(),path));
 });
 console.log('Firestore and Storage allowed owner operations and rejected cross-user access.');
}finally{await environment.cleanup();}
