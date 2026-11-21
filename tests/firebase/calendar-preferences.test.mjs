import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,writeBatch,serverTimestamp,collection,getDocs,query,orderBy} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../src/lib/firebase/append.ts';
import {replay} from '../../src/lib/domain.ts';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')}});await env.clearFirestore();});
after(async()=>env?.cleanup());
const client=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const choice=(eventId,weekStartsOn,previousEventId=null)=>({eventId,type:'WeekStartChosen',schemaVersion:1,payload:{previousEventId,weekStartsOn}});
test('all seven calendar choices sync to another client and survive canonical replay; stale competing writes fail',async()=>{
 const uid='calendar-owner',db=client(uid);let last=null;
 for(let day=0;day<7;day++){const action=choice(`calendar-${day}`,day,last);await appendReflection(db,uid,action);await appendReflection(db,uid,action);last=action.eventId;}
 const second=client(uid),rows=await getDocs(query(collection(second,`users/${uid}/streams/v1/events`),orderBy('sequence'))),log=rows.docs.map(row=>decodeEvent(row.data()));
 assert.equal(log.length,7);assert.equal(replay(log).calendarPreferences.weekStartsOn,6);assert.deepEqual(replay(log.slice(3),replay(log.slice(0,3))),replay(log));
 await assert.rejects(appendReflection(second,uid,choice('stale-calendar',1,'calendar-4')),/another device/);
 await assertFails(getDoc(doc(client('calendar-stranger'),`users/${uid}/streams/v1/calendarPreferences/control`)));
 await assertFails(appendReflection(client('calendar-stranger'),uid,choice('stranger-calendar',1,last)));
});
test('Rules reject malformed choices, extra computed state and missing atomic metadata',async()=>{
 const uid='calendar-negative',db=client(uid),root=`users/${uid}/streams/v1`;
 for(const [i,patch]of [{weekStartsOn:7},{weekStartsOn:1.5},{weekStartsOn:'1'},{weekStartsOn:1,computedStart:'2026-09-27'}].entries()){
  const action=choice(`invalid-calendar-${i}`,1),batch=writeBatch(db);action.payload={...action.payload,...patch};
  batch.set(doc(db,root),{sequence:1,lastEventId:action.eventId});batch.set(doc(db,`${root}/events/${action.eventId}`),{...action,sequence:1,recordedAt:serverTimestamp()});batch.set(doc(db,`${root}/calendarPreferences/control`),{lastEventId:action.eventId});await assertFails(batch.commit());
 }
 const action=choice('missing-calendar-pointer',1),batch=writeBatch(db);batch.set(doc(db,root),{sequence:1,lastEventId:action.eventId});batch.set(doc(db,`${root}/events/${action.eventId}`),{...action,sequence:1,recordedAt:serverTimestamp()});await assertFails(batch.commit());
 await assertFails(setDoc(doc(db,`${root}/calendarPreferences/control`),{lastEventId:'unrecorded'}));
});
