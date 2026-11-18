import {externalTarget} from '../../src/lib/ai/connection-contract.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProjection,replay,parseAction,STARTER_ID,type Projection,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
import {answersInput,defaultAnswers} from '../../src/lib/onboarding.ts';
import {chooseTopic} from '../../src/lib/ai/topic-selection.ts';
import {selectReflections,selectedEntries} from '../../src/lib/ai/selection.ts';
import {makeRequest,buildContext,promptOptions,makeLegacyRequest} from '../../src/lib/ai/context.ts';
const at='2026-10-27T00:00:00.000Z',input={day:'2026-10-27',timeZone:'UTC',selectionSeed:'0123456789abcdef0123456789abcdef'};
const apply=(s:Projection,a:SourceAction)=>replay([{...parseAction(a),sequence:s.cursor+1,recordedAt:at} as JournalEvent],s);
function setup(){let s=apply(emptyProjection(),{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),selectedTopics:['nature','music'],useAnswers:true}),previousEventId:null}});return apply(s,{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:3,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Fictional preference',provider:'gemini',backupEnabled:true,backupProvider:'gemini'}});}
function write(s:Projection,id:string,day:string,topic:string|null,text='A fictional reflection.'){s=apply(s,{eventId:'w_'+id,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,text,expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:day+'T00:00:00.000Z',photoSlot:null}});return topic?apply(s,{eventId:'t_'+id,type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:id,expectedRevision:1,previousEventId:null,answersId:s.onboarding.answersId,topicId:topic}}):s;}
test('v5 requests derive one consented description and versioned instruction without identity or computed topic events',()=>{
 let s=setup();s=write(s,'same','2026-10-26','nature');s=write(s,'same2','2026-10-24','nature');s=write(s,'matching','2026-10-25','music');
 const r=makeRequest(s,input.day,'personal','request',undefined,input);assert.equal(r.schemaVersion,28);assert.equal(r.payload.templateVersion,'gratitude-v5');assert.deepEqual(parseAction(r),r);
 assert.ok('snapshotId'in r.payload&&r.payload.snapshotId===s.lastEventId);assert.equal('topicId'in r.payload,false);
 const c=JSON.parse(buildContext(s,r));assert.deepEqual(c.topic,{description:s.onboarding.answers.descriptions.music});assert.equal(c.mode,'regular');assert.deepEqual(c.reflections.recent,[{date:'2026-10-25',text:'A fictional reflection.'}]);assert.ok(!('topics'in c)&&!('user'in c));
 assert.match(promptOptions(s,r).system,/Do not ask them to revisit/);
 const next=apply(s,r);assert.equal(next.ai.requestTopics.request?.id,'music');
 assert.throws(()=>apply({...s,lastEventId:'changed'},r),/context changed/);assert.throws(()=>buildContext({...s,lastEventId:'changed'},r),/snapshot changed/);
 const old=makeLegacyRequest(s,input.day,'personal','legacy',undefined,input);assert.equal(old.payload.templateVersion,'gratitude-v4');assert.ok('topics'in JSON.parse(buildContext(s,old)));assert.ok(!promptOptions(s,old).system.includes('Do not ask them to revisit'));
});
test('separate source switches: no answers sends no topic/history, no journal keeps local topic choice, generic sends no preferences',()=>{
 let s=write(setup(),'nature','2026-10-26','nature');
 for(const useAnswers of [false,true])for(const useJournal of [false,true])for(const mode of ['generic','personal'] as const){
  const state={...s,onboarding:{...s.onboarding,answers:{...s.onboarding.answers,useAnswers}},ai:{...s.ai,choices:{...s.ai.choices,useJournal}}};const r=makeRequest(state,input.day,mode,'r',undefined,input),c=JSON.parse(buildContext(state,r));
  assert.equal('topic'in c,useAnswers&&mode==='personal');if(!useJournal||mode==='generic'||!useAnswers)assert.equal(Object.keys(r.payload.entryRefs).length,0);if(mode==='generic')assert.ok(!('preferences'in c));
 }
});

test('all five adapters use the same v5 JSON for daily/editor/backup and replacement requests',()=>{
 for(const provider of ['gemini','lm-studio','ollama','openai-compatible','personal-gemini'] as const){
  let state=setup();state=apply(state,{eventId:'provider',type:'AIChoicesConfirmed',schemaVersion:6,payload:{previousEventId:state.ai.control.lastEventId,enabled:true,useJournal:true,useFeedback:true,guidance:'Fictional preference',provider,backupEnabled:true,backupProvider:'prompt',photoProvider:'prompt',promptConnectionId:['gemini','lm-studio'].includes(provider)?null:'connection',photoConnectionId:null,backupConnectionId:null}});
  const target=provider==='gemini'?undefined:provider==='lm-studio'?{provider,model:'fictional/model',thinking:false as const}:externalTarget({provider,model:'fictional/model',baseUrl:'https://fictional.test',token:'',connectionId:'connection',connectionRevision:'revision'});
  for(const entryId of [undefined,'draft'])for(const backup of [false,true]){
   const r=makeRequest(state,input.day,'personal','request',entryId,input,target,backup);assert.deepEqual(parseAction(r),r);assert.ok(r.schemaVersion>=28);assert.ok(r.payload.templateVersion==='gratitude-v5');
   const c=JSON.parse(buildContext(state,r));assert.ok(c.topic.description);assert.equal('topics'in c,false);assert.equal('provider'in c,false);assert.equal('connectionId'in c,false);
   const next=apply(state,r);assert.equal(next.ai.requestTopics.request?.description,c.topic.description);
   const received=apply(next,{eventId:'request_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'request',text:'What fictional moment did you appreciate?',model:'fictional/model',finishReason:'STOP'}});
   if(!backup){const replacement=makeRequest(received,input.day,'personal','second',entryId,input,target,false,'request_response');assert.deepEqual(parseAction(replacement),replacement);assert.match(JSON.parse(buildContext(received,replacement)).differentPromptRequest,/What fictional moment/);}
   else assert.equal(received.rotation.offers.length,0,'reserve generation is not a visible offer');
  }
 }
});
test('AI and known-backup visible offers replay without inference, and manual backup corrections govern their offer topic',()=>{
 let state=setup();const actions:SourceAction[]=[];const save=(a:SourceAction)=>{actions.push(a);state=apply(state,a);};
 const topic=chooseTopic(state,input,true)!.id;const r=makeRequest(state,input.day,'personal','r',undefined,input);save(r);save({eventId:'r_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'r',text:'What fictional moment?',model:'fixture',finishReason:'STOP'}});
 assert.equal(state.rotation.offers.length,0);save({eventId:'v2026-10-27_tr_response',type:'PromptViewed',schemaVersion:2,payload:{day:input.day,promptId:'r_response',surface:'today'}});
 assert.equal(state.rotation.offers[0].topicId,topic);assert.notEqual(chooseTopic(state,input,true)?.id,topic);
 const backup=makeRequest(state,input.day,'personal','b',undefined,input,undefined,true);save(backup);save({eventId:'b_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'b',text:'Another fictional moment?',model:'fixture',finishReason:'STOP'}});
 save({eventId:'v2026-10-27_bb_response',type:'PromptViewed',schemaVersion:1,payload:{day:input.day,promptId:'b_response',surface:'backup'}});
 assert.equal(state.rotation.offers[1].topicId,state.ai.requestTopics.b?.id);assert.equal(state.backups.b_response.used,undefined);
 const base=setup(),log=actions.map((a,i)=>({...a,recordedAt:at,sequence:base.cursor+i+1} as JournalEvent));for(let cut=0;cut<=log.length;cut++)assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut),base)),state);
 assert.throws(()=>parseAction({...r,payload:{...r.payload,topicId:'nature'}}));assert.throws(()=>parseAction({...r,payload:{...r.payload,topicCounts:{nature:0}}}));
 assert.throws(()=>apply(setup(),parseAction({...r,payload:{...r.payload,entryRefs:{forged:'1'}}})),/selection changed/);
});

test('Unknown gets only rediscovery/fallback and explicit cleared backup categories override generated provenance',async()=>{
 const {promptTopicId}=await import('../../src/lib/ai/topic-selection.ts');
 let s=write(setup(),'unknown','2025-10-27','unknown');s=write(s,'same','2025-10-27','music');
 const result=selectReflections(s,{...input,weighted:true,topic:{id:'music'}});assert.deepEqual(result.anniversary.map(e=>e.id),['same']);assert.deepEqual(result.rediscovery.map(e=>e.id),['unknown']);
 s={...s,ai:{...s.ai,requestTopics:{backup:{id:'nature',label:'Nature',description:'Fictional nature.'}},responses:{backup_response:{eventId:'backup_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'backup',text:'Fictional?',model:'fixture',finishReason:'STOP'}}}}};
 assert.equal(promptTopicId(s,'backup_response'),'nature');s={...s,classification:{...s.classification,backupTopics:{backup_response:{topicId:null,label:'Not yet classified',origin:'user',lastEventId:'clear'}}}};assert.equal(promptTopicId(s,'backup_response'),null);
});


test('a delayed AI-view observation neither suppresses nor replaces a newer daily response',()=>{
 for(const viewedBeforeReply of [true,false]){
  let s=setup();const first=makeRequest(s,input.day,'personal','first',undefined,input);s=apply(s,first);s=apply(s,{eventId:'first_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'first',text:'The first fictional question?',model:'fixture',finishReason:'STOP'}});
  const second=makeRequest(s,input.day,'personal','second',undefined,input,undefined,false,'first_response');s=apply(s,second);
  const view:SourceAction={eventId:'v2026-10-27_tfirst_response',type:'PromptViewed',schemaVersion:2,payload:{day:input.day,promptId:'first_response',surface:'today'}};
  const reply:SourceAction={eventId:'second_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'second',text:'The newer fictional question?',model:'fixture',finishReason:'STOP'}};
  for(const a of viewedBeforeReply?[view,reply]:[reply,view])s=apply(s,a);
  assert.equal(s.ai.days[input.day],'second_response');assert.equal(s.rotation.offers[0].promptId,'first_response');
 }
});

test('prompt defaults follow captured generation topics and explicit backup corrections, never inventing unavailable topics',async()=>{
 const {defaultPromptTopic,generatedPromptTopicLabel}=await import('../../src/lib/ai/prompt-topic.ts');
 let s=setup();const r=makeRequest(s,input.day,'personal','prompt-topic',undefined,input);s=apply(s,r);s=apply(s,{eventId:'prompt-topic_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:r.eventId,text:'A fictional question?',model:'fixture',finishReason:'STOP'}});
 assert.equal(defaultPromptTopic(s,'prompt-topic_response'),s.ai.requestTopics[r.eventId]!.id);assert.equal(generatedPromptTopicLabel(s,'prompt-topic_response'),s.ai.requestTopics[r.eventId]!.label);
 s={...s,classification:{...s.classification,backupTopics:{prompt_topic:{topicId:'music',label:'Music',lastEventId:'chosen',origin:'user'}}}};
 assert.equal(defaultPromptTopic(s,'prompt_topic'),'music');assert.equal(generatedPromptTopicLabel(s,'prompt_topic'),'Music');
 s.classification.backupTopics.prompt_topic={topicId:'custom_retired',label:'Retired',lastEventId:'retired',origin:'user'};assert.equal(defaultPromptTopic(s,'prompt_topic'),null);assert.equal(generatedPromptTopicLabel(s,'prompt_topic'),'Retired');
 assert.equal(defaultPromptTopic(s,'missing'),null);
});
