import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,STARTER_ID,STARTER_PROMPT,type SourceAction,type JournalEvent,type Projection} from '../../src/lib/domain.ts';
import {makeRequest,buildContext} from '../../src/lib/ai/context.ts';
const at='2026-10-01T04:31:07.000Z';
const choice:SourceAction={eventId:'choice',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:true,guidance:''}};
function events(actions:SourceAction[]):JournalEvent[]{return actions.map((action,i)=>({...action,sequence:i+1,recordedAt:at}));}
function feedback(state:Projection,eventId:string,promptId:string,text:string) {return replay([{eventId,type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:state.ai.control.lastEventId,promptId,text},sequence:state.cursor+1,recordedAt:at}],state);}
function context(state:Projection){return JSON.parse(buildContext(state,makeRequest(state,'2026-10-01','personal','next')));}
test('feedback context pairs exact starter, manual and AI questions with all saved user text',()=>{
  let state=replay(events([choice]));
  state=feedback(state,'starter-note',STARTER_ID,'s'.repeat(500));
  const request=makeRequest(state,'2026-10-01','personal','generated');
  state=replay([{...request,sequence:state.cursor+1,recordedAt:at},{eventId:'generated_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'generated',text:' The exact AI question?\n',model:'fictional',finishReason:'STOP'},sequence:state.cursor+2,recordedAt:at}],state);
  state=feedback(state,'ai-note','generated_response','More sounds, less work.');
  state=replay([{eventId:'manual',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A fictional reflection.',promptId:'manual',promptText:'A manual question?',entryAt:at,photoSlot:null},sequence:state.cursor+1,recordedAt:at}],state);
  state=feedback(state,'manual-note','manual','Keep “quotes”, newlines\nand 😀.');
  assert.deepEqual(context(state).promptFeedback,[{prompt:STARTER_PROMPT,feedback:'s'.repeat(500)},{prompt:' The exact AI question?\n',feedback:'More sounds, less work.'},{prompt:'A manual question?',feedback:'Keep “quotes”, newlines\nand 😀.'}]);
  assert.ok(!JSON.stringify(context(state)).includes('promptId'));assert.ok(!JSON.stringify(context(state)).includes('ai-note'));
});
test('editing replaces future feedback and clearing removes both prompt and note without rewriting history',()=>{
  const log=events([choice,{eventId:'original',type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:'choice',promptId:STARTER_ID,text:'Original note.'}},{eventId:'edited',type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:'original',promptId:STARTER_ID,text:'Revised note.'}},{eventId:'deleted',type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:'edited',promptId:STARTER_ID,text:''}}]);
  assert.equal(context(replay(log.slice(0,2))).promptFeedback[0].feedback,'Original note.');
  assert.deepEqual(context(replay(log.slice(0,3))).promptFeedback,[{prompt:STARTER_PROMPT,feedback:'Revised note.'}]);
  assert.deepEqual(context(replay(log)).promptFeedback,[]);assert.equal(log[1].type==='PromptFeedbackSubmitted'&&log[1].payload.text,'Original note.');
  for(let cut=0;cut<=log.length;cut++)assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),replay(log));
  assert.deepEqual(context(feedback(replay(log),'blank',STARTER_ID,'   ')).promptFeedback,[]);
});
test('only the latest twenty nonblank pairs are sent, without losing the tail of full-length feedback',()=>{
  let state=replay(events([choice]));
  for(let i=0;i<22;i++){
    state=replay([{eventId:`manual${i}`,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:`entry${i}`,expectedRevision:0,text:'Fictional.',promptId:`manual${i}`,promptText:'"'.repeat(600),entryAt:at,photoSlot:null},sequence:state.cursor+1,recordedAt:at}],state);
    state=feedback(state,`note${i}`,`manual${i}`,'\n'.repeat(490)+String(i).padStart(10,'0'));
  }
  const supplied=context(state).promptFeedback;assert.equal(supplied.length,20);assert.equal(supplied[0].feedback.slice(-10),'0000000002');assert.equal(supplied[19].feedback.slice(-10),'0000000021');
  assert.ok(supplied.every((pair:any)=>pair.prompt.length===600&&pair.feedback.length===500));assert.ok(JSON.stringify(context(state)).length<50_000);
  state=feedback(state,'delete-last','manual21','');assert.equal(context(state).promptFeedback[0].feedback.slice(-10),'0000000001');
});
test('sharing off and generic mode exclude both halves; missing or stale feedback fails closed',()=>{
  const state=feedback(replay(events([choice])),'note',STARTER_ID,'Private feedback.');
  const off={...state,ai:{...state.ai,choices:{...state.ai.choices,useFeedback:false}}};assert.deepEqual(context(off).promptFeedback,[]);
  const generic=makeRequest(state,'2026-10-01','generic','generic');assert.ok(!buildContext(state,generic).includes('Private feedback.'));assert.ok(!buildContext(state,generic).includes(STARTER_PROMPT));
  const request=makeRequest(state,'2026-10-01','personal','request');
  assert.throws(()=>buildContext(feedback(state,'edit',STARTER_ID,'New note.'),request),/context changed/);
  assert.throws(()=>buildContext({...state,ai:{...state.ai,feedback:state.ai.feedback.map(item=>({...item,payload:{...item.payload,promptId:'missing'}}))}},request),/feedback prompt changed/);
  const {selectorVersion,timeZone,selectionSeed,...payload}=request.payload as Extract<typeof request,{schemaVersion:3}>['payload'];
  assert.deepEqual(JSON.parse(buildContext(state,{...request,schemaVersion:1,payload:{...payload,entryRefs:[]}})).promptFeedback,[{prompt:STARTER_PROMPT,feedback:'Private feedback.'}]);
});
