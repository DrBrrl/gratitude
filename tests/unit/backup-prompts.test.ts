import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,parseAction,resolvePrompt,STARTER_ID,type JournalEvent,type SourceAction,type Projection} from '../../src/lib/domain.ts';
import {makeRequest,buildContext,SYSTEM_PROMPT} from '../../src/lib/ai/context.ts';
import {importedBackup,availableBackups} from '../../src/lib/backup-prompts.ts';
import {BackupRefiller} from '../../src/lib/ai/backup-refiller.ts';
const at='2026-10-01T04:31:07.000Z';
function apply(state:Projection,action:SourceAction){return replay([{...action,sequence:state.cursor+1,recordedAt:at}],state);}
const choice:SourceAction={eventId:'choice',type:'AIChoicesConfirmed',schemaVersion:3,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Gentle, everyday sounds.',provider:'gemini',backupEnabled:true,backupProvider:'lm-studio'}};
const target={provider:'lm-studio' as const,model:'google/gemma-4-31b',thinking:false as const};
test('102 literal private imports replay, deduplicate, survive cached replay and are consumed only by saved reflections',async()=>{
  const actions=await Promise.all(Array.from({length:102},(_,i)=>importedBackup(`Which fictional sound ${i} was welcome?`)));
  assert.deepEqual(await importedBackup('  Which fictional sound 0 was welcome?  '),actions[0]);
  const log:JournalEvent[]=actions.map((a,i)=>({...a,sequence:i+1,recordedAt:at}));
  const state=replay(log);assert.equal(availableBackups(state).length,102);
  for(const cut of [0,1,51,102])assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),state);
  const id=actions[0].eventId;
  assert.equal(availableBackups(state,[id]).length,101);assert.equal(availableBackups(state,[],id).length,101);
  const removed=apply(state,{eventId:'remove',type:'BackupPromptRemoved',schemaVersion:1,payload:{promptId:id}});
  assert.equal(availableBackups(removed).length,101);assert.equal(resolvePrompt(removed,id),actions[0].payload.text);
  const written=apply(state,{eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A fictional kettle.',promptId:id,promptText:null,entryAt:at,photoSlot:null}});
  assert.equal(availableBackups(written).length,101);assert.equal(written.entries[0].prompt,actions[0].payload.text);
  const edited=apply(written,{eventId:'edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:1,text:'An edited reflection.',promptId:STARTER_ID,promptText:null,entryAt:at,photoSlot:null}});
  assert.equal(availableBackups(edited).length,101,'editing the entry must not resurrect an already used prompt');
});
test('backup generation uses identical consent, twenty-entry context and instruction while preserving the foreground provider and Today',()=>{
  let state=replay([{...choice,sequence:1,recordedAt:at}]);
  const request=makeRequest(state,'2026-10-01','personal','reserve',undefined,{timeZone:'Australia/Hobart',selectionSeed:'a'.repeat(32)},target,true);
  assert.equal(request.schemaVersion,8);assert.deepEqual(parseAction(request),request);
  const context=JSON.parse(buildContext(state,request));assert.equal(context.preferences,choice.payload.guidance);assert.deepEqual(context.promptFeedback,[]);
  assert.ok(SYSTEM_PROMPT.startsWith('Write exactly one short gratitude prompt'));
  state=apply(state,request);state=apply(state,{eventId:'reserve_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'reserve',text:'Which welcome sound stayed with you?',model:target.model,finishReason:'STOP'}});
  assert.equal(availableBackups(state).length,1);assert.deepEqual(state.ai.days,{});assert.equal(state.ai.choices.provider,'gemini');
  assert.equal(resolvePrompt(state,'reserve_response'),'Which welcome sound stayed with you?');
  assert.throws(()=>makeRequest(state,'2026-10-01','personal','wrong',undefined,undefined,undefined,true),/provider changed/);
  assert.throws(()=>makeRequest({...state,ai:{...state.ai,choices:{...state.ai.choices,backupEnabled:false}}},'2026-10-01','personal','off',undefined,undefined,target,true),/Enable backup/);
});
test('normal legacy choices do not enable automatic inference; malformed sources and unknown removals fail',()=>{
  const state=replay([{eventId:'old',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:''},sequence:1,recordedAt:at}]);
  assert.equal(state.ai.choices.backupEnabled,undefined);
  assert.throws(()=>parseAction({...choice,payload:{...choice.payload,backupProvider:'surprise'}}));
  assert.throws(()=>parseAction({eventId:'bp_'+'a'.repeat(64),type:'BackupPromptImported',schemaVersion:1,payload:{text:'x',count:30}}));
  assert.throws(()=>apply(state,{eventId:'remove',type:'BackupPromptRemoved',schemaVersion:1,payload:{promptId:'unknown'}}));
});
test('duplicate questions, including removed/used variants, never refill the usable count',async()=>{
  let state=replay([]);state=apply(state,await importedBackup('A quiet cup?'));state=apply(state,await importedBackup('A   QUIET cup?'));
  assert.equal(availableBackups(state).length,1);
  state=apply(state,{eventId:'remove',type:'BackupPromptRemoved',schemaVersion:1,payload:{promptId:Object.keys(state.backups)[0]}});
  assert.equal(availableBackups(state).length,0);
});
test('refiller stops at thirty, preserves overage, paces cloud calls, serializes ticks and backs off without fallback',async()=>{
  let state=replay([{...choice,payload:{...choice.payload,backupProvider:'gemini'},sequence:1,recordedAt:at}] as JournalEvent[]),now=Date.parse(at)+60_000,calls=0;
  const input=()=>({state,ready:true,online:true,visible:true,busy:false});
  const scheduler=new BackupRefiller(async()=>{calls++;state=apply(state,await importedBackup(`Fictional generated ${calls}?`));},()=>now);
  await Promise.all([scheduler.tick(input(),()=>state),scheduler.tick(input(),()=>state)]);assert.equal(calls,1);
  now+=14999;await scheduler.tick(input(),()=>state);assert.equal(calls,1);
  now++;await scheduler.tick(input(),()=>state);assert.equal(calls,2);
  for(let i=2;i<30;i++){now+=15000;await scheduler.tick(input(),()=>state);}assert.equal(availableBackups(state).length,30);
  now+=15000;await scheduler.tick(input(),()=>state);assert.equal(calls,30);
  state=apply(state,await importedBackup('An imported extra?'));now+=15000;await scheduler.tick(input(),()=>state);assert.equal(calls,30);
  let errors=0;const failing=new BackupRefiller(async()=>{errors++;throw new Error('offline');},()=>now);
  const small={...state,backups:{}};const failInput=()=>({...input(),state:small});
  for(let i=0;i<4;i++){now+=2000000;await failing.tick(failInput(),()=>small);}assert.equal(errors,3);assert.match(failing.status,/paused/);
  failing.reset();await failing.tick({...failInput(),online:false},()=>small);assert.equal(errors,3);
  await failing.tick({...failInput(),visible:false},()=>small);assert.equal(errors,3);
});
test('failed and abandoned reserve requests do not change Today or block forever',async()=>{
  let state=replay([{...choice,sequence:1,recordedAt:at}]);const request=makeRequest(state,'2026-10-01','generic','pending',undefined,undefined,target,true);state=apply(state,request);
  let calls=0,now=Date.parse(at);const scheduler=new BackupRefiller(async()=>{calls++;},()=>now);
  const input=()=>({state,ready:true,online:true,visible:true,busy:false});
  await scheduler.tick(input(),()=>state);assert.equal(calls,0);now+=180001;await scheduler.tick(input(),()=>state);assert.equal(calls,1);
  state=apply(state,{eventId:'pending_failure',type:'AIRequestFailed',schemaVersion:1,payload:{requestId:'pending',reason:'unavailable'}});assert.equal(availableBackups(state).length,0);assert.deepEqual(state.ai.days,{});
});
test('repeating model output pauses after three attempts and preserves all prior source output',async()=>{
 let state=replay([{...choice,sequence:1,recordedAt:at}]);state=apply(state,await importedBackup('Which fictional sound was welcome?'));
 let calls=0,now=Date.parse(at)+60_000;
 const scheduler=new BackupRefiller(async()=>{calls++;const request=makeRequest(state,'2026-10-01','personal',`repeat${calls}`,undefined,undefined,target,true);state=apply(state,request);state=apply(state,{eventId:`repeat${calls}_response`,type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:request.eventId,text:'Which fictional sound was welcome?',model:target.model,finishReason:'STOP'}});},()=>now);
 for(let i=0;i<5;i++){now+=4000;await scheduler.tick({state,ready:true,online:true,visible:true,busy:false},()=>state);}
 assert.equal(calls,3);assert.equal(availableBackups(state).length,1);assert.equal(Object.keys(state.ai.responses).length,3);assert.match(scheduler.status,/paused/);
});
