import {makeRequest} from '../../src/lib/ai/context.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_CATALOGUE as catalogue} from '../../src/lib/starter-catalogue.ts';
import {choosePrompt,emptyRotation,civilDayDistance,type RotationState} from '../../src/lib/prompt-rotation.ts';
import {replay,parseAction,STARTER_ID,STARTER_PROMPT,resolvePrompt,type JournalEvent,type SourceAction} from '../../src/lib/domain.ts';
import {availableBackups,importedBackup} from '../../src/lib/backup-prompts.ts';
const day='2026-11-05',at=day+'T01:00:00.000Z';
const viewed=(promptId:string,when=day):SourceAction=>({eventId:`v${when}_${promptId.startsWith('starter-')?'t':'b'}${promptId}`,type:'PromptViewed',schemaVersion:1,payload:{day:when,promptId,surface:promptId.startsWith('starter-')?'today':'backup'}});
const accepted=(promptId:string,when=day):SourceAction=>({eventId:`a_${when}_${promptId}`,type:'PromptAccepted',schemaVersion:1,payload:{day:when,promptId}});
function logOf(actions:SourceAction[]):JournalEvent[]{return actions.map((action,i)=>({...action,sequence:i+1,recordedAt:at}));}
test('the immutable starter catalogue contains all 255 unique prompts in 17 equal categories',()=>{
 assert.equal(catalogue.length,255);assert.equal(new Set(catalogue.map(p=>p.text)).size,255);
 const categories=new Map<string,number>();for(const p of catalogue){assert.ok(p.text.trim());categories.set(p.category,(categories.get(p.category)??0)+1);assert.equal(resolvePrompt(replay([]),p.id),p.text);}
 assert.equal(categories.size,17);assert.ok([...categories.values()].every(n=>n===15));
 assert.equal(resolvePrompt(replay([]),STARTER_ID),STARTER_PROMPT,'historical starter identity stays unchanged');
});
test('offers exhaust categories before reuse, avoid adjacent categories and never repeat a prompt that day',()=>{
 let state=replay([]);const log:SourceAction[]=[],seen=new Set<string>(),categories:string[]=[];
 for(let i=0;i<255;i++){
  const chosen=choosePrompt([...catalogue],state.rotation,day,'starter',()=>.42);assert.ok(chosen);assert.ok(!seen.has(chosen.id));seen.add(chosen.id);
  const category=chosen.category!;if(i<17)assert.ok(!categories.includes(category));if(i>0&&i<240)assert.notEqual(category,categories.at(-1));categories.push(category);
  log.push(viewed(chosen.id));state=replay(logOf(log));
 }
 assert.equal(choosePrompt([...catalogue],state.rotation,day,'starter',()=>0),null);
 assert.ok(choosePrompt([...catalogue],state.rotation,'2026-11-06','starter',()=>0),'viewing alone is not a cooldown');
});
test('accepted starters rest for thirty civil days including DST and leap days; offers alone do not consume them',()=>{
 const p=catalogue[0],state=replay(logOf([viewed(p.id),accepted(p.id)]));
 assert.equal(choosePrompt([p],state.rotation,'2026-12-04','starter'),null);
 assert.equal(choosePrompt([p],state.rotation,'2026-12-05','starter')?.id,p.id);
 assert.equal(civilDayDistance('2028-02-01','2028-03-02'),30);
 assert.equal(civilDayDistance('2026-10-01','2026-10-31'),30);
 const backdated=replay(logOf([accepted(p.id,'2026-11-04'),accepted(p.id,'2026-10-01')]));
 assert.equal(backdated.rotation.accepted[p.id],'2026-11-04','late offline actions cannot shorten an existing rest');
});
test('accepting a backup consumes the original even when its saved prompt text is edited or its draft is discarded',async()=>{
 const b=await importedBackup('Which fictional sound helped?'),id=b.eventId;
 const edited:SourceAction={eventId:'edited-reflection',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A fictional kettle.',promptId:'edited-reflection',promptText:'Which quiet sound helped me?',entryAt:null,photoSlot:null}};
 const log=logOf([b,viewed(id),accepted(id),edited]),state=replay(log);
 assert.equal(availableBackups(state).length,0);assert.equal(state.entries[0].prompt,edited.payload.promptText);
 assert.equal(state.rotation.acceptedText[id],b.payload.text);assert.equal(availableBackups(replay(log.slice(0,3))).length,0,'acceptance alone consumes a backup');
 for(const cut of [0,1,2,3,4])assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),state);
});
test('random draws can select anywhere in the reserve and do not repeat previously offered text aliases',()=>{
 const pool=[{id:'a',text:'First?'},{id:'b',text:'Second?'},{id:'c',text:'Third?'}],history=emptyRotation();
 assert.equal(choosePrompt(pool,history,day,'backup',()=>.99)?.id,'c');
 history.offers.push({eventId:'seen',day,promptId:'c',kind:'backup',text:'Third?',surface:'backup',sequence:1});
 assert.equal(choosePrompt(pool,history,day,'backup',()=>.99)?.id,'b');
 assert.equal(choosePrompt([{id:'alias',text:'  THIRD?  '}],history,day,'backup'),null);
});
test('rotation source actions contain only observed identity and local day; malformed dates and unknown sources fail',()=>{
 const p=catalogue[0],event=viewed(p.id);
 assert.deepEqual(parseAction(event),event);
 assert.throws(()=>parseAction({...event,payload:{...event.payload,expires:'2026-12-05'}}));
 assert.throws(()=>parseAction({...event,payload:{...event.payload,surface:['today']}}));
 assert.throws(()=>parseAction({...viewed(p.id,'2026-02-30')}));
 assert.throws(()=>replay(logOf([viewed('unknown')])));
 const backupId='bp_'+'a'.repeat(64);assert.equal(viewed(backupId).eventId.length,80);assert.deepEqual(parseAction(viewed(backupId)),viewed(backupId));
});
test('independent editor offers share no-repeat history without replacing Today',()=>{
 const todayOffer=viewed(catalogue[0].id),editorOffer:SourceAction={eventId:`v${day}_e${catalogue[15].id}`,type:'PromptViewed',schemaVersion:1,payload:{day,promptId:catalogue[15].id,surface:'editor'}};
 const state=replay(logOf([todayOffer,editorOffer]));
 assert.equal(state.ai.days[day],catalogue[0].id);assert.equal(state.rotation.offers.length,2);
 assert.equal(choosePrompt([catalogue[15]],state.rotation,day,'starter'),null);
 const log=logOf([todayOffer,editorOffer,accepted(catalogue[15].id)]),random=Math.random;
 try{Math.random=()=>{throw new Error('Replay must never choose randomly.');};assert.equal(replay(log).rotation.accepted[catalogue[15].id],day);}finally{Math.random=random;}
});
test('accepting a text alias in backups also rests the matching starter for thirty days',async()=>{
 const p=catalogue[0],b=await importedBackup('  '+p.text.toUpperCase()+'  '),state=replay(logOf([b,viewed(b.eventId),accepted(b.eventId)]));
 assert.equal(choosePrompt([p],state.rotation,'2026-11-06','starter'),null);
 assert.equal(choosePrompt([p],state.rotation,'2026-12-05','starter')?.id,p.id);
});

test('a late AI response stays recorded without replacing a newer daily starter choice',()=>{
 const actions:SourceAction[]=[viewed(catalogue[0].id),{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:''}}];
 let state=replay(logOf(actions));
 const request=makeRequest(state,day,'generic','request',undefined,{timeZone:'Australia/Hobart',selectionSeed:'a'.repeat(32)});
 actions.push(request,viewed(catalogue[15].id),{eventId:'request_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'request',text:'A fictional AI question?',model:'fictional-model',finishReason:'STOP'}});
 state=replay(logOf(actions));assert.equal(state.ai.days[day],catalogue[15].id);assert.equal(state.ai.responses.request_response.payload.text,'A fictional AI question?');
 const fresh=makeRequest(state,day,'generic','fresh',undefined,{timeZone:'Australia/Hobart',selectionSeed:'b'.repeat(32)});
 actions.push(fresh,{eventId:'fresh_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'fresh',text:'A newly requested question?',model:'fictional-model',finishReason:'STOP'}});
 assert.equal(replay(logOf(actions)).ai.days[day],'fresh_response');
});
