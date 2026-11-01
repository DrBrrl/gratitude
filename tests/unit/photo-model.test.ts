import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,parseAction,photoProvider,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
const events=(actions:SourceAction[]):JournalEvent[]=>actions.map((action,index)=>({...action,sequence:index+1,recordedAt:'2026-10-01T04:31:07.000Z'}));
const choices=(eventId:string,previousEventId:string|null,provider:'gemini'|'lm-studio',photoProvider:'prompt'|'gemini'|'lm-studio'):SourceAction=>({eventId,type:'AIChoicesConfirmed',schemaVersion:4,payload:{previousEventId,enabled:true,useJournal:false,useFeedback:false,guidance:'',provider,photoProvider,backupEnabled:false,backupProvider:'lm-studio'}});
const attach:SourceAction={eventId:'attach',type:'PhotoAttached',schemaVersion:1,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:null}};
const request:SourceAction={eventId:'summary',type:'PhotoSummaryRequested',schemaVersion:3,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:'attach',choicesId:'choices',provider:'lm-studio',model:'local/vision',thinking:false}};
const response:SourceAction={eventId:'summary_response',type:'PhotoSummaryResponseReceived',schemaVersion:1,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:'summary',text:'A fictional yellow mug.',model:'local/vision',finishReason:'STOP'}};
test('photo selection is separate from prompts and legacy accounts retain their shared provider',()=>{
 assert.equal(photoProvider({enabled:false,useJournal:false,useFeedback:false,guidance:'',provider:'lm-studio'}),'lm-studio');
 for(const [provider,photo] of [['gemini','lm-studio'],['lm-studio','gemini'],['lm-studio','prompt']] as const){
  const chosen=choices('choices',null,provider,photo);
  assert.equal(photoProvider(replay(events([chosen])).ai.choices),photo==='prompt'?provider:photo);
 }
 const log=events([choices('choices',null,'gemini','lm-studio'),attach,request,response]);
 const full=replay(log);assert.equal(full.ai.choices.provider,'gemini');assert.equal(full.photos.entry_0.summary,'A fictional yellow mug.');
 for(let cut=0;cut<=log.length;cut++)assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),full);
});
test('photo requests bind the photo provider and choices revision; late results cannot replace newer settings',()=>{
 const initial=[choices('choices',null,'gemini','lm-studio'),attach];
 assert.throws(()=>replay(events([...initial,{...request,payload:{...request.payload,choicesId:'stale'}} as SourceAction])));
 assert.throws(()=>replay(events([...initial,{...request,payload:{...request.payload,provider:'gemini',model:null}} as SourceAction])));
 assert.throws(()=>replay(events([...initial,request,choices('changed','choices','gemini','prompt'),response])),/late summary/);
 for(const patch of [{photoProvider:'unknown'},{token:'secret'}])assert.throws(()=>parseAction({...choices('choices',null,'gemini','prompt'),payload:{...choices('choices',null,'gemini','prompt').payload,...patch}}));
 assert.throws(()=>parseAction({...request,payload:{...request.payload,baseUrl:'https://private.example.test'}}));
 assert.throws(()=>parseAction({...request,payload:{...request.payload,provider:'gemini',model:'a-local-model'}}));
});
