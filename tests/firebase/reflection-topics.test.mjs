import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,writeBatch,serverTimestamp,collection,getDocs,orderBy,query} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {STARTER_ID,replay} from '../../src/lib/domain.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
let environment;
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await environment.clearFirestore();});
after(async()=>environment?.cleanup());
const client=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const write={eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'A fictional peaceful walk.',expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:null,photoSlot:null}};
const choice=(eventId,topicId,changes={})=>({eventId,type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:'entry',expectedRevision:1,previousEventId:null,answersId:null,topicId,...changes}});
async function raw(db,uid,action,extraPointer={}){
 const path=`users/${uid}/streams/v1`,head=await getDoc(doc(db,path)),sequence=(head.get('sequence')??0)+1;
 const batch=writeBatch(db);batch.set(doc(db,`${path}/events/${action.eventId}`),{...action,sequence,recordedAt:serverTimestamp()});batch.set(doc(db,path),{sequence,lastEventId:action.eventId});
 batch.set(doc(db,`${path}/topics/${action.payload.entryId}`),{lastEventId:action.eventId,...extraPointer});return batch.commit();
}
test('manual topics sync, deduplicate retries and leave reflection revision and AI control untouched',async()=>{
 const uid='topics-owner',db=client(uid);await appendReflection(db,uid,write);
 const a=choice('choose','nature');assert.equal((await appendReflection(db,uid,a)).created,true);assert.equal((await appendReflection(db,uid,a)).created,false);
 const root=`users/${uid}/streams/v1`;
 assert.equal((await getDoc(doc(db,`${root}/entries/entry`))).get('lastEventId'),'write');
 assert.equal((await getDoc(doc(db,`${root}/ai/control`))).exists(),false);
 const events=(await getDocs(query(collection(client(uid),`${root}/events`),orderBy('sequence')))).docs.map(row=>decodeEvent(row.data()));
 assert.equal(replay(events).topics.entry.topicId,'nature');assert.equal(replay(events).entries[0].revision,1);
 await assert.rejects(appendReflection(db,uid,choice('stale','music')),/topic changed/);
 await appendReflection(db,uid,choice('clear',null,{previousEventId:'choose'}));
 assert.equal((await getDoc(doc(db,`${root}/topics/entry`))).get('lastEventId'),'clear');
 await assertFails(getDoc(doc(client('stranger'),`${root}/topics/entry`)));
 await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),`${root}/topics/entry`)));
});
test('Rules independently reject malformed choices, stale pointers, missing entries and forged custom topics',async()=>{
 const uid='topics-rules',db=client(uid);await appendReflection(db,uid,write);
 for(const action of [choice('bad','not-a-topic'),choice('missing','nature',{entryId:'missing'}),choice('old','nature',{expectedRevision:2}),choice('stale','nature',{previousEventId:'not-current'}),choice('answers','nature',{answersId:'not-current'}),choice('custom','custom_forged'),{...choice('extra','nature'),payload:{...choice('extra','nature').payload,score:5}},{...choice('version','nature'),schemaVersion:2}])await assertFails(raw(db,uid,action));
 await assertFails(raw(db,uid,choice('pointer-extra','nature'),{count:1}));
 await raw(db,uid,choice('valid','unknown'));
 await assertFails(raw(db,uid,choice('old-again','nature')));
});
test('unselected custom topics require the current saved vocabulary and manual corrections survive text edits',async()=>{
 const uid='topics-custom',db=client(uid);await appendReflection(db,uid,write);
 const answers={...defaultAnswers(),customTopics:[{id:'custom_birds',label:'Birdwatching',description:'Birds in the garden.',selected:false}]};
 await appendReflection(db,uid,{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput(answers),previousEventId:null}});
 await raw(db,uid,choice('custom-ok','custom_birds',{answersId:'answers'}));
 await appendReflection(db,uid,{...write,eventId:'edit',payload:{...write.payload,text:'A longer walk.',expectedRevision:1}});
 await assertFails(raw(db,uid,choice('stale-text','music',{answersId:'answers',previousEventId:'custom-ok'})));
 await appendReflection(db,uid,choice('correct','food',{answersId:'answers',previousEventId:'custom-ok',expectedRevision:2}));
 const events=(await getDocs(query(collection(db,`users/${uid}/streams/v1/events`),orderBy('sequence')))).docs.map(row=>decodeEvent(row.data()));
 assert.equal(replay(events).topics.entry.topicId,'food');assert.equal(replay(events).entries[0].revision,2);
});
