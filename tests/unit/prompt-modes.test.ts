import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProjection,parseAction,replay,STARTER_ID,type SourceAction,type JournalEvent,type Projection} from '../../src/lib/domain.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
import {makeRequest,buildContext,promptOptions} from '../../src/lib/ai/context.ts';
import {acceptedModeSource,requestMode,selectModeReflections} from '../../src/lib/ai/modes.ts';
import {chooseTopic} from '../../src/lib/ai/topic-selection.ts';
import {exportJournal} from '../../src/lib/export.ts';
import {eligibleTargets} from '../../src/lib/classification.ts';
const day='2026-11-24',at=day+'T00:00:00.000Z',selection={timeZone:'UTC',selectionSeed:'0123456789abcdef0123456789abcdef'},mode={promptMode:'review' as const,displayDay:day,scheduleId:null,lunarVersion:'ae-2.1.19-v1' as const};
const apply=(s:Projection,a:SourceAction)=>replay([{...parseAction(a),sequence:s.cursor+1,recordedAt:at} as JournalEvent],s);
function setup(){let s=apply(emptyProjection(),{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),selectedTopics:['nature','music'],useAnswers:true}),previousEventId:null}});return apply(s,{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Grounded questions.'}});}
function writing(s:Projection,id:string,date:string,topic:string|null,text='A fictional moment.'){return apply(s,{eventId:'w_'+id,type:'ReflectionWritten',schemaVersion:8,payload:{entryId:id,expectedRevision:0,text,promptId:STARTER_ID,promptText:null,entryAt:date+'T00:00:00.000Z',photoSlot:null,topic:{topicId:topic,previousEventId:null,answersId:s.onboarding.answersId}}});}
const request=(s:Projection,id='request',previous?:string)=>makeRequest(s,day,'personal',id,undefined,selection,undefined,false,previous,mode);
test('Review chooses only a shared topic with recent classified writing and supplies its thirty-day history',()=>{
 let s=writing(setup(),'recent','2026-11-02','music');s=writing(s,'old','2025-11-20','nature');s=writing(s,'unknown','2026-11-10','unknown');
 const r=request(s);assert.equal(r.schemaVersion,43);assert.deepEqual(parseAction(r),r);const c=JSON.parse(buildContext(s,r));
 assert.equal(c.mode,'review');assert.match(c.topic.description,/Music/);assert.deepEqual(c.reviewWindow,{from:'2026-10-25',through:'2026-11-23'});assert.deepEqual(c.reflections.recent,[{date:'2026-11-02',text:'A fictional moment.'}]);assert.deepEqual(c.reflections.anniversary,[]);assert.match(promptOptions(s,r).system,/review of the past month/);assert.ok(!('topicId' in r.payload));
});
test('Discovery counts thirty complete logical days while the unchanged Regular selector counts fourteen',()=>{
 let s=setup();for(let i=0;i<2;i++)s=writing(s,'n'+i,'2026-11-20','nature');for(let i=0;i<3;i++)s=writing(s,'m'+i,'2026-11-01','music');
 const input={...selection,day};assert.equal(chooseTopic(s,input,true)?.id,'music');assert.equal(chooseTopic(s,input,true,'discovery')?.id,'nature');
 const r=makeRequest(s,day,'personal','d',undefined,selection,undefined,false,undefined,{...mode,promptMode:'discovery'});assert.equal(requestMode(r),'discovery');assert.equal(JSON.parse(buildContext(s,r)).topic.description,s.onboarding.answers.descriptions.nature);assert.match(promptOptions(s,r).system,/fresh invitation/);
});
test('Review rotates successfully visible offers, never failed/background/unseen responses',()=>{
 let s=writing(writing(setup(),'n','2026-11-20','nature'),'m','2026-11-10','music');const first=request(s,'first');const a=JSON.parse(buildContext(s,first)).topic;
 s=apply(s,first);s=apply(s,{eventId:'first_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'first',text:'A fictional review?',model:'fixture',finishReason:'STOP'}});
 assert.deepEqual(JSON.parse(buildContext(s,request(s,'unseen'))).topic,a);
 s=apply(s,{eventId:`v${day}_tfirst_response`,type:'PromptViewed',schemaVersion:2,payload:{day,promptId:'first_response',surface:'today'}});
 const second=request(s,'second','first_response'),b=JSON.parse(buildContext(s,second)).topic;assert.notDeepEqual(a,b);
 s=apply(s,second);s=apply(s,{eventId:'second_failure',type:'AIRequestFailed',schemaVersion:1,payload:{requestId:'second',reason:'unavailable'}});assert.deepEqual(JSON.parse(buildContext(s,request(s,'retry','first_response'))).topic,b);
});
test('Review budget weights full text at 600/601 characters and excludes future, target, unrelated and stale AI writing',()=>{
 let s=setup();for(let i=0;i<25;i++)s=writing(s,'m'+i,'2026-11-10','music','x'.repeat(i%2?601:600));s=writing(s,'future',day,'music');s=writing(s,'unrelated','2026-11-10','nature');s=writing(s,'stale','2026-11-10','music');
 s={...s,topics:{...s.topics,stale:{...s.topics.stale,origin:'ai',revision:0}}};
 const group=selectModeReflections(s,{day,...selection,entryId:'m0',topic:{id:'music'}},'review');const list=group.recent;
 assert.equal(new Set(list.map(e=>e.id)).size,list.length);assert.equal(list.reduce((n,e)=>n+(e.text.trim().length>600?2:1),0),20);assert.ok(list.every(e=>!['future','unrelated','stale','m0'].includes(e.id)));assert.deepEqual(group.anniversary,[]);
});
test('empty/generic/sharing-off requests retain honest review instructions without leaking personal context',()=>{
 const s=setup(),r=request(s),c=JSON.parse(buildContext(s,r));assert.ok(!('topic'in c));assert.deepEqual(c.reflections.recent,[]);
 const generic=makeRequest(s,day,'generic','generic',undefined,selection,undefined,false,undefined,mode),g=JSON.parse(buildContext(s,generic));assert.ok(!('preferences'in g)&&!('topic'in g));assert.deepEqual(g.promptFeedback,[]);assert.match(promptOptions(s,generic).system,/If no reflections are supplied/);
 const noJournal={...writing(s,'m','2026-11-20','music'),ai:{...s.ai,choices:{...s.ai.choices,useJournal:false}}};const shared=JSON.parse(buildContext(noJournal,request(noJournal)));assert.ok(shared.topic);assert.deepEqual(shared.reflections.recent,[]);
});
test('all adapters preserve literal mode inputs, version boundaries and legacy Regular JSON',()=>{
 const s=setup();assert.equal(makeRequest(s,day,'personal','regular',undefined,selection).schemaVersion,28);
 for(const provider of ['gemini','lm-studio','ollama','openai-compatible','personal-gemini'] as const){
  const external=['ollama','openai-compatible','personal-gemini'].includes(provider),state={...s,ai:{...s.ai,choices:{...s.ai.choices,provider,promptConnectionId:external?'binding':null}}};
  const target=provider==='gemini'?undefined:provider==='lm-studio'?{provider,model:'fixture/model',thinking:false as const}:{provider,model:'fixture/model',thinking:provider==='personal-gemini'?'provider-default' as const:false as const,connectionId:'binding',connectionRevision:'revision'};
  const r=makeRequest(state,day,'personal','mode',undefined,selection,target as Parameters<typeof makeRequest>[6],false,undefined,mode);assert.deepEqual(parseAction(r),r);assert.equal(JSON.parse(buildContext(state,r)).mode,'review');
 }
 const legacy=makeRequest(s,day,'personal','legacy',undefined,selection);assert.equal(JSON.parse(buildContext(s,legacy)).mode,'regular');assert.match(promptOptions(s,legacy).system,/fresh invitation/);
 assert.throws(()=>parseAction({...request(s),payload:{...request(s).payload,phaseDate:'2026-11-24'}}));
});
test('accepted Review provenance survives manual wording/date edits and complete/cached replay, including no-topic writing',()=>{
 let s=setup();const r=request(s,'review');s=apply(s,r);s=apply(s,{eventId:'review_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'Review your month?',model:'fixture',finishReason:'STOP'}});
 const action={eventId:'saved',type:'ReflectionWritten' as const,schemaVersion:9 as const,payload:{entryId:'entry',expectedRevision:0,text:'A fictional pleasure.',promptId:'saved',promptText:'My amended review?',entryAt:'2026-11-20T01:00:00.000Z',photoSlot:null,topic:null,promptSourceId:'review_response'}};
 const before=s;s=apply(s,action);assert.equal(s.entries[0].promptSourceId,'review_response');assert.equal(eligibleTargets(s,'reflection').length,1);assert.equal(s.topics.entry,undefined);assert.equal(JSON.parse(exportJournal(s,'json').content).entries[0].promptMode,'review');assert.equal(JSON.parse(exportJournal(s,'json').content).version,6);
 assert.deepEqual(replay([{...action,sequence:before.cursor+1,recordedAt:at}],before),s);
 const edit={...action,eventId:'edit',payload:{...action.payload,expectedRevision:1,promptId:'edit',entryAt:'2026-11-19T01:00:00.000Z'}};s=apply(s,edit);assert.equal(JSON.parse(exportJournal(s,'json').content).entries[0].promptMode,'review');
 assert.throws(()=>apply(before,{...action,payload:{...action.payload,promptSourceId:'missing'}}));
});

test('photo-only and blank writing do not make a topic eligible for Monthly review',()=>{
 const base=writing(writing(setup(),'photo','2026-11-20','nature'),'blank','2026-11-19','music');
 const s={...base,entries:base.entries.map(e=>({...e,text:e.id==='photo'?'':'   '}))};
 assert.equal(chooseTopic(s,{...selection,day},true,'review'),null);
 const context=JSON.parse(buildContext(s,request(s)));assert.ok(!('topic' in context));assert.deepEqual(context.reflections.recent,[]);
});

test('reopening a replacement draft does not inherit the saved entry’s former Review source',()=>{
 let s=setup();s=apply(s,request(s,'review'));s=apply(s,{eventId:'review_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'review',text:'Review your month?',model:'fixture',finishReason:'STOP'}});
 const writing:Extract<SourceAction,{type:'ReflectionWritten';schemaVersion:9}>={eventId:'saved',type:'ReflectionWritten',schemaVersion:9,payload:{entryId:'entry',expectedRevision:0,text:'A fictional month.',promptId:'saved',promptText:'My edited review?',promptSourceId:'review_response',entryAt:null,photoSlot:null,topic:null}};s=apply(s,writing);
 const entry=s.entries[0],replacement={eventId:'replacement',type:'ReflectionWritten' as const,schemaVersion:6 as const,payload:{entryId:'entry',expectedRevision:1,text:'My draft.',promptId:STARTER_ID,promptText:null,entryAt:null,photoSlot:null}};
 assert.equal(acceptedModeSource(s,STARTER_ID,replacement,entry),null);assert.equal(acceptedModeSource(s,'saved',writing,entry),'review_response');assert.equal(acceptedModeSource(s,'saved',null,entry),'review_response');assert.equal(acceptedModeSource(s,'review_response',null,undefined),'review_response');
});
