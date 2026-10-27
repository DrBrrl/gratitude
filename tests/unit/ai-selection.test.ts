import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, requestEntryRefs, emptyProjection, parseAction, STARTER_ID,STARTER_PROMPT, type SourceAction, type JournalEvent, type Projection, type RequestAction } from '../../src/lib/domain.ts';
import { selectReflections, selectedEntries, type SelectionInput } from '../../src/lib/ai/selection.ts';
import { makeRequest, buildContext } from '../../src/lib/ai/context.ts';

const receipt='2026-10-27T04:00:00.000Z';
const input:SelectionInput={day:'2026-10-27',timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'};
const choices:SourceAction={eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Small everyday moments'}};
function write(id:string,day:string,text=`Reflection ${id}`):SourceAction {
  return {eventId:`w_${id}`,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,text,expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:`${day}T01:00:00.000Z`,photoSlot:null}};
}
const events=(actions:SourceAction[]):JournalEvent[]=>actions.map((action,i)=>({...action,sequence:i+1,recordedAt:receipt}));
function history() {
  const actions:SourceAction[]=[choices];
  for(const year of [2023,2024,2025]) for(let day=24;day<=30;day++) actions.push(write(`ann_${year}_${day}`,`${year}-10-${day}`));
  for(let day=1;day<=18;day++) actions.push(write(`old_${day}`,`2022-04-${String(day).padStart(2,'0')}`));
  for(let day=12;day<=27;day++) actions.push(write(`recent_${day}`,`2026-10-${day}`));
  return replay(events(actions));
}
const ids=(state:Projection,i=input)=>selectedEntries(selectReflections(state,i)).map(e=>e.id);

test('twenty logical-date sources reserve 8 anniversaries, 7 rediscoveries and 5 recent entries',()=>{
  const state=history();const result=selectReflections(state,input);
  assert.deepEqual(Object.values(result).map(group=>group.length),[8,7,0,5]);
  // Pin mixed-v1's draw/order so an algorithm change cannot silently reinterpret recorded seeds.
  assert.deepEqual(Object.fromEntries(Object.entries(result).map(([group,entries])=>[group,entries.map(e=>e.id)])),{
    anniversary:['ann_2024_27','ann_2023_27','ann_2025_27','ann_2024_28','ann_2023_28','ann_2025_26','ann_2024_26','ann_2023_26'],
    rediscovery:['ann_2023_24','old_3','ann_2024_25','recent_17','recent_15','recent_14','ann_2025_28'],
    fallback:[],recent:['recent_20','recent_16','recent_13','recent_22','recent_23']
  });
  assert.equal(new Set(ids(state)).size,20);
  assert.deepEqual(new Set(result.anniversary.map(e=>e.entryAt!.slice(0,4))),new Set(['2023','2024','2025']));
  assert.ok(result.recent.every(e=>e.entryAt!.slice(0,10)>='2026-10-13' && e.entryAt!.slice(0,10)<='2026-10-26'));
  assert.ok(!ids(state).includes('recent_27'));
  assert.deepEqual(ids({...state,entries:[...state.entries].reverse()}),ids(state));
  assert.deepEqual(ids(state),ids(state));
  assert.notDeepEqual(ids(state,{...input,selectionSeed:'fedcba9876543210fedcba9876543210'}),ids(state));
});

test('sparse, exact and large histories deduplicate, fill missing pools and exclude current/future/blank/target entries',()=>{
  for(const count of [0,3,20,50]) {
    const state=replay(events([choices,...Array.from({length:count},(_,i)=>write(`e${i}`,`2020-01-${String(i%28+1).padStart(2,'0')}`))]));
    const result=selectReflections(state,input);
    assert.equal(selectedEntries(result).length,Math.min(count,20));
    assert.equal(result.anniversary.length,0);assert.equal(result.recent.length,0);
    assert.equal(result.fallback.length,Math.max(0,Math.min(count,20)-7));
  }
  const state=history();
  const changed={...state,entries:[...state.entries,{...state.entries[0],id:'photo-only',text:'  '},{...state.entries[0],id:'future',entryAt:'2027-01-01T00:00:00.000Z'}]};
  assert.ok(!ids(changed).includes('photo-only'));assert.ok(!ids(changed).includes('future'));
  const target=ids(state)[0];assert.ok(!ids(state,{...input,entryId:target}).includes(target));
});

test('anniversary windows cross years and map leap-day centres to February 28',()=>{
  const state=replay(events([choices,write('dec28','2024-12-28'),write('dec29','2024-12-29'),write('jan04','2025-01-04'),write('jan05','2025-01-05'),write('feb25','2025-02-25'),write('mar03','2025-03-03'),write('mar04','2025-03-04')]));
  const january=selectReflections(state,{...input,day:'2026-01-01'});
  assert.deepEqual(new Set(january.anniversary.map(e=>e.id)),new Set(['dec29','jan04']));
  const leap=selectReflections(state,{...input,day:'2024-02-29'});assert.equal(leap.anniversary.length,0);
  const futureLeap=selectReflections(state,{...input,day:'2028-02-29'});
  assert.deepEqual(new Set(futureLeap.anniversary.map(e=>e.id)),new Set(['feb25','mar03']));
});

test('local-day cutoffs, DST and backfill reference dates do not rank by receipt time',()=>{
  const state=replay(events([choices,write('old','2025-10-27'),write('recent','2026-10-26')]));
  const withBoundary={...state,entries:[...state.entries,{...state.entries[0],id:'boundary',entryAt:'2026-10-26T13:30:00.000Z'}]};
  assert.ok(!ids(withBoundary).includes('boundary')); // 27 October in Hobart
  assert.ok(ids(withBoundary,{...input,timeZone:'UTC'}).includes('boundary'));
  assert.deepEqual(ids(state,{...input,day:'2025-10-28'}),['old']);
  const dst=replay(events([choices,write('edge','2026-09-21'),write('outside','2026-09-20')]));
  assert.deepEqual(selectReflections(dst,{...input,day:'2026-10-05'}).recent.map(e=>e.id),['edge']);
  const autumn=replay(events([choices,write('edge','2026-03-23'),write('outside','2026-03-22')]));
  assert.deepEqual(selectReflections(autumn,{...input,day:'2026-04-06'}).recent.map(e=>e.id),['edge']);
  const moved=write('old','2026-10-27');if(moved.type!=='ReflectionWritten') throw 0;
  moved.eventId='moved';moved.payload.expectedRevision=1;
  const edited=replay([{...moved,recordedAt:receipt,sequence:state.cursor+1}],state);
  assert.ok(!ids(edited).includes('old'));

});

test('successful legacy/new usage is replayable, counts once per entry and survives edits; failures do not count',()=>{
  const initial:SourceAction[]=[choices,write('a','2020-01-01'),write('b','2020-01-02')];
  const legacy:RequestAction={eventId:'legacy',type:'PromptRequested',schemaVersion:1,payload:{previousEventId:'choices',choicesId:'choices',day:input.day,templateVersion:'gratitude-v1',contextMode:'personal',entryRefs:[{entryId:'a',revision:1},{entryId:'a',revision:1}],feedbackIds:[]}};
  const response:SourceAction={eventId:'legacy_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'legacy',text:'A recorded question?',model:'fixture',finishReason:'STOP'}};
  const log=events([...initial,legacy,response]);let state=replay(log);
  assert.deepEqual(state.ai.usage,{a:{count:1,lastSequence:5}});
  assert.equal(selectReflections(state,input).rediscovery[0].id,'b');
  const failed=makeRequest(state,input.day,'personal','failed',undefined,input);
  const failure:SourceAction={eventId:'failed_failure',type:'AIRequestFailed',schemaVersion:1,payload:{requestId:'failed',reason:'unavailable'}};
  const edit=write('a', '2020-01-03');if(edit.type!=='ReflectionWritten') throw 0;
  edit.eventId='edit';edit.payload.expectedRevision=1;
  log.push(...events([failed,failure,edit]).map((event,i)=>({...event,sequence:log.length+i+1})));
  state=replay(log);assert.deepEqual(state.ai.usage,{a:{count:1,lastSequence:5}});
  for(let cut=0;cut<=log.length;cut++) assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),state);
  const fresh=makeRequest(state,input.day,'personal','fresh',undefined,input);
  const done:SourceAction={...response,eventId:'fresh_response',payload:{...response.payload,requestId:'fresh'}};
  const full=replay([...log,...events([fresh,done]).map((event,i)=>({...event,sequence:log.length+i+1}))]);
  assert.equal(full.ai.usage.a.count,2);assert.equal(full.ai.usage.b.count,1);
  assert.deepEqual(emptyProjection().ai.usage,{});
});

test('versioned requests pin raw selection inputs, bound JSON, exclude identifiers and honour consent',()=>{
  let state=history();
  state=replay([{eventId:'explicit-feedback',type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:state.ai.control.lastEventId,promptId:STARTER_ID,text:'Explicit feedback '.repeat(25)},sequence:state.cursor+1,recordedAt:receipt}],state);
  state={...state,entries:state.entries.map(e=>({...e,text:' "\\\n😀'.repeat(2000)}))};
  const request=makeRequest(state,input.day,'personal','request',undefined,input);
  assert.equal(request.schemaVersion,3);assert.equal(requestEntryRefs(request).length,20);
  assert.equal(parseAction(request).type,'PromptRequested');
  const context=JSON.parse(buildContext(state,request));
  assert.deepEqual(Object.keys(context),['referenceDate','timeZone','preferences','reflections','promptFeedback']);
  assert.equal(context.timeZone,input.timeZone);assert.equal(context.referenceDate,input.day);
  const texts=Object.values(context.reflections).flat() as {text:string;date:string}[];
  assert.equal(texts.length,20);assert.ok(texts.every(e=>e.text.length<=1000));
  assert.ok(!buildContext(state,request).includes('entryId'));assert.ok(!buildContext(state,request).includes('userNotes'));
  assert.ok(buildContext(state,request).length<150_000); // Worst-case escaped characters stay valid JSON.
  for(const useJournal of [true,false]) for(const useFeedback of [true,false]) {
    const consent={...state,ai:{...state.ai,choices:{...state.ai.choices,useJournal,useFeedback}}};
    const r=makeRequest(consent,input.day,'personal','consent',undefined,input);
    assert.equal(requestEntryRefs(r).length,useJournal?20:0);
    const supplied=JSON.parse(buildContext(consent,r));
    assert.equal(Object.values(supplied.reflections).flat().length,useJournal?20:0);
    assert.deepEqual(supplied.promptFeedback,useFeedback?[{prompt:STARTER_PROMPT,feedback:'Explicit feedback '.repeat(25)}]:[]);
  }
  const generic=makeRequest(state,input.day,'generic','generic',undefined,input);
  assert.deepEqual(generic.payload.entryRefs,{});assert.ok(!buildContext(state,generic).includes('Small everyday'));
  const bad=(payload:object)=>assert.throws(()=>parseAction({...request,payload:{...request.payload,...payload}}));
  bad({selectionSeed:'bad'});bad({selectionSeed:123});bad({selectorVersion:'mixed-v99'});bad({timeZone:'Mars/Olympus'});bad({day:'2026-02-30'});
  bad({entryRefs:Object.fromEntries(Array.from({length:21},(_,i)=>[`e${i}`,'1']))});
  bad({entryRefs:{e1:'01'}});bad({entryRefs:{e1:1}});bad({entryRefs:{e1:'1 2'}});
  bad({entryRefs:requestEntryRefs(request)});
  bad({groups:{computed:'anniversary'}});
  const stale={...request,payload:{...request.payload,entryRefs:{missing:'1'}}};
  assert.throws(()=>buildContext(state,stale));
  assert.throws(()=>replay(events([choices,{...request,payload:{...request.payload,previousEventId:'choices'}}])));
});


test('every valid entry ID retains its own successful-use projection',()=>{
 const actions:SourceAction[]=[choices,write('__proto__','2020-01-01'),write('constructor','2020-01-02')];
 const state=replay(events(actions));
 const request=makeRequest(state,input.day,'personal','request',undefined,input);
 const response:SourceAction={eventId:'request_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'request',text:'A saved question?',model:'fixture',finishReason:'STOP'}};
 const full=replay(events([...actions,request,response]));
 assert.deepEqual(Object.keys(full.ai.usage).sort(),['__proto__','constructor']);
 assert.equal(full.ai.usage.__proto__.count,1);assert.equal(full.ai.usage['constructor'].count,1);
 assert.deepEqual(Object.keys(state.ai.usage),[]);
});


test('rediscovery prioritises never-used entries then the oldest successful response',()=>{
 const actions:SourceAction[]=[choices,write('a','2020-01-01'),write('b','2020-01-02'),write('c','2020-01-03')];
 for(const id of ['a','b']) {
   const before=replay(events(actions));
   actions.push({eventId:`request_${id}`,type:'PromptRequested',schemaVersion:1,payload:{previousEventId:before.ai.control.lastEventId,choicesId:'choices',day:input.day,templateVersion:'gratitude-v1',contextMode:'personal',entryRefs:[{entryId:id,revision:1}],feedbackIds:[]}});
   actions.push({eventId:`request_${id}_response`,type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:`request_${id}`,text:'A recorded question?',model:'fixture',finishReason:'STOP'}});
 }
 const state=replay(events(actions));
 assert.deepEqual(selectReflections(state,input).rediscovery.map(entry=>entry.id),['c','a','b']);
 assert.ok(state.ai.usage.a.lastSequence<state.ai.usage.b.lastSequence);
});
