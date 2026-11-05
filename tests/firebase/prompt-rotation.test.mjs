import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {replay} from '../../src/lib/domain.ts';
import {importedBackup,availableBackups} from '../../src/lib/backup-prompts.ts';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await env.clearFirestore();});
after(async()=>env?.cleanup());
const client=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const action=(type,promptId,day='2026-11-05')=>{const surface=promptId.startsWith('starter-')?'today':'backup';return {eventId:type==='PromptViewed'?`v${day}_${surface[0]}${promptId}`:`a_${day}_${promptId}`,type,schemaVersion:1,payload:{day,promptId,...(type==='PromptViewed'?{surface}:{})}};};
async function history(db,uid){return (await getDocs(query(collection(db,`users/${uid}/streams/v1/events`),orderBy('sequence')))).docs.map(d=>decodeEvent(d.data()));}
async function raw(db,uid,a){const root=`users/${uid}/streams/v1`,head=await getDoc(doc(db,root)),sequence=(head.get('sequence')??0)+1,b=writeBatch(db);b.set(doc(db,root+'/events/'+a.eventId),{...a,sequence,recordedAt:serverTimestamp()});b.set(doc(db,root),{sequence,lastEventId:a.eventId});b.set(doc(db,root+'/rotation/control'),{lastEventId:a.eventId});return b.commit();}
test('literal prompt views and acceptances are private, idempotent across devices and fully replayable',async()=>{
 const uid='rotation-owner',a=client(uid),b=client(uid),view=action('PromptViewed','starter-v1-001');
 const results=await Promise.all([appendReflection(a,uid,view),appendReflection(b,uid,view)]);
 assert.equal(results.filter(r=>r.created).length,1);
 await appendReflection(b,uid,action('PromptAccepted','starter-v1-001'));
 const log=await history(a,uid),state=replay(log);assert.equal(state.rotation.offers.length,1);assert.equal(state.rotation.accepted['starter-v1-001'],'2026-11-05');
 for(let cut=0;cut<=log.length;cut++)assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),state);
 await assertFails(getDocs(collection(client('rotation-intruder'),`users/${uid}/streams/v1/events`)));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),`users/${uid}/streams/v1/rotation/control`)));
});
test('Rules reject unknown catalogue IDs, extra computed fields and forged identity receipts',async()=>{
 const uid='rotation-invalid',db=client(uid);
 await assertFails(raw(db,uid,action('PromptViewed','starter-v1-256')));
 const good=action('PromptViewed','starter-v1-001');
 await assertFails(raw(db,uid,{...good,payload:{...good.payload,cooldownUntil:'2026-12-05'}}));
 await assertFails(raw(db,uid,{...good,eventId:'forged-identity'}));
 await assertFails(raw(db,uid,action('PromptViewed','unavailable-backup')));
});
test('new catalogue reflections and edited accepted backups save while old starter references retain their text',async()=>{
 const uid='rotation-writing',db=client(uid),backup=await importedBackup('A fictional backup question?');
 await appendReflection(db,uid,backup);
 await appendReflection(db,uid,action('PromptViewed',backup.eventId));
 await appendReflection(db,uid,action('PromptAccepted',backup.eventId));
 await appendReflection(db,uid,{eventId:'edited',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A fictional reflection.',promptId:'edited',promptText:'My edited question?',entryAt:null,photoSlot:null}});
 await appendReflection(db,uid,{eventId:'catalogue-entry',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'catalogue',expectedRevision:0,text:'A fictional garden.',promptId:'starter-v1-001',promptText:null,entryAt:null,photoSlot:null}});
 await appendReflection(db,uid,{eventId:'legacy-entry',type:'ReflectionWritten',schemaVersion:1,payload:{entryId:'legacy',expectedRevision:0,text:'An old question.',starterId:'small-moment-v1'}});
 const state=replay(await history(db,uid));assert.equal(availableBackups(state).length,0);assert.equal(state.entries[0].prompt,'My edited question?');assert.equal(state.entries[2].prompt,'What is one small thing you appreciated today?');
});
