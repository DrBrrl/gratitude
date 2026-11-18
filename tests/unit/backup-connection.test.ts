import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,parseAction,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
import {backupProvider,backupConnectionId} from '../../src/lib/ai/backup-connection.ts';
import {makeRequest} from '../../src/lib/ai/context.ts';
const at='2026-10-01T04:31:07.000Z';
const shared:SourceAction={eventId:'choice',type:'AIChoicesConfirmed',schemaVersion:6,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:'',provider:'ollama',backupEnabled:true,backupProvider:'prompt',photoProvider:'gemini',promptConnectionId:'prompt-one',photoConnectionId:null,backupConnectionId:null}};
const events=(actions:SourceAction[]):JournalEvent[]=>actions.map((a,i)=>({...a,sequence:i+1,recordedAt:at}));
test('shared backups follow prompt bindings and replay without changing photo or refill choices',()=>{
 let state=replay(events([shared]));assert.equal(backupProvider(state.ai.choices),'ollama');assert.equal(backupConnectionId(state.ai.choices),'prompt-one');
 const target={provider:'ollama' as const,model:'fictional/text',thinking:false as const,connectionId:'prompt-one',connectionRevision:'revision'};
 const request=makeRequest(state,'2026-10-01','personal','request',undefined,undefined,target,true);
 assert.equal(request.schemaVersion,40);assert.equal(replay(events([shared,request])).ai.control.requestId,'request');
 const changed={...shared,eventId:'changed',payload:{...shared.payload,previousEventId:'choice',provider:'openai-compatible',promptConnectionId:'prompt-two'}} as SourceAction;
 state=replay(events([shared,changed]));assert.equal(backupProvider(state.ai.choices),'openai-compatible');assert.equal(backupConnectionId(state.ai.choices),'prompt-two');assert.equal(state.ai.choices.photoProvider,'gemini');assert.equal(state.ai.choices.backupEnabled,true);
 assert.throws(()=>makeRequest(state,'2026-10-01','personal','wrong',undefined,undefined,target,true),/provider changed/);
 for(let cut=0;cut<=2;cut++)assert.deepEqual(replay(events([shared,changed]).slice(cut),replay(events([shared,changed]).slice(0,cut))),state);
});
test('legacy explicit backups never become shared merely because providers match',()=>{
 const fixed={...shared,schemaVersion:5,payload:{...shared.payload,backupProvider:'ollama',backupConnectionId:'backup-one'}} as SourceAction;
 const changed={...fixed,eventId:'changed',payload:{...fixed.payload,previousEventId:'choice',provider:'gemini',promptConnectionId:null}} as SourceAction;
 const state=replay(events([fixed,changed]));assert.equal(backupProvider(state.ai.choices),'ollama');assert.equal(backupConnectionId(state.ai.choices),'backup-one');
 assert.throws(()=>parseAction({...shared,schemaVersion:5}));assert.throws(()=>parseAction({...shared,payload:{...shared.payload,backupConnectionId:'hidden-separate'}}));
 assert.throws(()=>parseAction({...shared,payload:{...shared.payload,token:'never-in-events'}}));
});
