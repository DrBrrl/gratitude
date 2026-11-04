import {test} from 'node:test';
import assert from 'node:assert/strict';
import { externalTarget } from '../../src/lib/ai/connection-contract.ts';
import {replay,parseAction,STARTER_ID,type SourceAction,type JournalEvent,type Projection} from '../../src/lib/domain.ts';
import {defaultAnswers,answersInput} from '../../src/lib/onboarding.ts';
import {makeRequest,buildContext,promptOptions,validatePromptOutput,boundContext,SYSTEM_PROMPT} from '../../src/lib/ai/context.ts';
import {selectReflections,selectedEntries} from '../../src/lib/ai/selection.ts';
import {exportJournal} from '../../src/lib/export.ts';
import {importedBackup} from '../../src/lib/backup-prompts.ts';
const at='2026-10-27T04:31:07.000Z',selection={timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'};
function apply(state:Projection,action:SourceAction){return replay([{...parseAction(action),sequence:state.cursor+1,recordedAt:at} as JournalEvent],state);}
function setup(changes={},provider:'gemini'|'lm-studio'='gemini'){
 let state=replay([]);state=apply(state,{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),preferredName:'Sam',pronouns:'they/them',selectedTopics:['music'],useAnswers:true,...changes}),previousEventId:null}});
 return apply(state,{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:3,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Quiet moments',provider,backupEnabled:true,backupProvider:provider}});
}
function write(state:Projection,id:string,date:string,text:string){return apply(state,{eventId:'w_'+id,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,text,expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:date+'T01:00:00.000Z',photoSlot:null}});}
test('new controls apply to both providers, all scopes and every request purpose; old requests retain exact templates',()=>{
 for(const provider of ['gemini','lm-studio'] as const)for(const scope of ['narrow','intermediate','broad'] as const)for(const wordLimit of [50,80,200]){
  const state=setup({scope,wordLimit},provider),target=provider==='lm-studio'?{provider,model:'fictional/model',thinking:false as const}:undefined;
  for(const entryId of [undefined,'draft'])for(const backup of [false,true]){
   const request=makeRequest(state,'2026-10-27','personal','r',entryId,selection,target,backup);
   assert.deepEqual(parseAction(request),request);assert.ok(request.schemaVersion>=13);
   const options=promptOptions(state,request);assert.ok(options.system.includes(`under ${wordLimit} words`));assert.ok(options.system.includes('for the user'));assert.ok(!options.system.includes('Sam')&&!options.system.includes('they/them'));assert.equal(options.max,4000);assert.ok(options.system.includes({narrow:'one specific subject',intermediate:'one or two main subjects',broad:'wider theme'}[scope]));
   const context=JSON.parse(buildContext(state,request));assert.deepEqual(context.topics,['Music and sounds: listening, playing, singing.']);assert.equal('user' in context,false);assert.ok(!JSON.stringify(request).includes('Sam'));
  }
 }
 const state=setup();state.onboarding={...state.onboarding,answersId:null,version:0};const old=makeRequest(state,'2026-10-27','personal','legacy',undefined,selection);
 assert.equal(old.schemaVersion,3);assert.equal(promptOptions(state,old).system,SYSTEM_PROMPT);assert.equal(promptOptions(state,old).max,600);
});
test('sharing and blank identity never infer personal data; generic requests retain only bounded formatting',()=>{
 for(const preferredName of ['', 'Sam'])for(const pronouns of ['', 'they/them'])for(const useAnswers of [false,true])for(const mode of ['generic','personal'] as const){
  const state=setup({preferredName,pronouns,useAnswers,wordLimit:200}),r=makeRequest(state,'2026-10-27',mode,'r',undefined,selection),system=promptOptions(state,r).system;
  const content=buildContext(state,r),shared=mode==='personal'&&useAnswers;
  assert.equal(system.includes('"Sam"'),false);assert.equal(system.includes('"they/them"'),false);assert.ok(system.includes('under 200 words'));
  if(mode==='personal'){const context=JSON.parse(content);assert.equal('user'in context,false);assert.equal('topics'in context,shared);assert.ok(!content.includes('Sam')&&!content.includes('they/them'));}
  else assert.ok(!content.includes('Sam')&&!content.includes('Music')&&!content.includes('Quiet moments'));
 }
});
test('new replacement prompts exclude private identity while historical v3 requests retain their original template',()=>{
 let state=setup();
 const request=makeRequest(state,'2026-10-27','personal','first',undefined,selection);
 assert.equal(request.payload.templateVersion,'gratitude-v4');
 const legacy=parseAction({...request,payload:{...request.payload,templateVersion:'gratitude-v3'}});
 assert.ok(legacy.type==='PromptRequested');
 assert.ok(promptOptions(state,legacy).system.includes('for "Sam" (pronouns: "they/them")'));
 assert.deepEqual(JSON.parse(buildContext(state,legacy)).user,{preferredName:'Sam',pronouns:'they/them'});
 state=apply(state,request);
 state=apply(state,{eventId:'first_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'first',text:'What ordinary sound did you enjoy?',model:'fictional/model',finishReason:'STOP'}});
 const replacement=makeRequest(state,'2026-10-27','personal','replacement',undefined,selection,undefined,false,'first_response');
 const context=JSON.parse(buildContext(state,replacement)),system=promptOptions(state,replacement).system;
 assert.ok(context.differentPromptRequest.startsWith('The user has requested a different prompt.'));
 assert.ok(!JSON.stringify(context).includes('Sam')&&!JSON.stringify(context).includes('they/them'));
 assert.ok(!system.includes('Sam')&&!system.includes('they/them'));
 assert.equal('user' in context,false);
 assert.throws(()=>parseAction({...request,payload:{...request.payload,templateVersion:'gratitude-v5'}}));
});
test('private identity stays out of prompt, editor and backup context for every external service',()=>{
 for(const provider of ['ollama','openai-compatible','personal-gemini'] as const){
  let state=setup();
  state=apply(state,{eventId:'external-choices',type:'AIChoicesConfirmed',schemaVersion:5,payload:{previousEventId:state.ai.control.lastEventId,enabled:true,useJournal:true,useFeedback:true,guidance:'Quiet moments',provider,backupEnabled:true,backupProvider:provider,photoProvider:'prompt',promptConnectionId:'private-connection',backupConnectionId:'private-connection',photoConnectionId:null}});
  const target=externalTarget({provider,model:'fictional/model',baseUrl:'https://fictional-local.example',token:'',connectionId:'private-connection',connectionRevision:'revision'});
  for(const entryId of [undefined,'draft'])for(const backup of [false,true]){
   const request=makeRequest(state,'2026-10-27','personal','external',entryId,selection,target,backup);
   assert.deepEqual(parseAction(request),request);assert.equal(request.payload.templateVersion,'gratitude-v4');
   const context=JSON.parse(buildContext(state,request)),system=promptOptions(state,request).system;
   assert.equal('user' in context,false);assert.deepEqual(context.topics,['Music and sounds: listening, playing, singing.']);
   assert.ok(!JSON.stringify(context).includes('Sam')&&!JSON.stringify(context).includes('they/them'));
   assert.ok(!system.includes('Sam')&&!system.includes('they/them'));
  }
 }
});
test('twenty-unit selection uses complete trimmed UTF-16 text and preserves old all-short draws',()=>{
 const input={...selection,day:'2026-10-27'};
 for(const length of [599,600,601,1201]){
  let state=setup();for(let i=0;i<50;i++)state=write(state,'e'+i,'2020-01-01','x'.repeat(length));
  const result=selectReflections(state,{...input,weighted:true}),entries=selectedEntries(result);
  assert.equal(entries.length,length>600?10:20);assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);assert.ok(entries.reduce((sum,e)=>sum+(e.text.trim().length>600?2:1),0)<=20);
  assert.deepEqual(result,selectReflections({...state,entries:[...state.entries].reverse()},{...input,weighted:true}));
  if(length<=600)assert.deepEqual(result,selectReflections(state,input));
 }
 let state=setup();for(let i=0;i<60;i++)state=write(state,'w'+i,i<20?'2025-10-27':i<40?'2026-10-20':'2020-01-01',i%3?'x'.repeat(601):'x'.repeat(600));
 const groups=selectReflections(state,{...input,weighted:true}),cost=(es:typeof state.entries)=>es.reduce((n,e)=>n+(e.text.trim().length>600?2:1),0);
 assert.equal(cost(groups.anniversary),8);assert.equal(cost(groups.recent),5);assert.equal(cost(groups.rediscovery),7);assert.equal(cost(selectedEntries(groups)),20);
 for(const [text,expected] of [['  '+'😀'.repeat(300)+'  ',20],['  '+'😀'.repeat(300)+'x  ',10]] as const){
  let unicodeState=setup();for(let i=0;i<25;i++)unicodeState=write(unicodeState,'utf'+i,'2020-01-01',text);
  assert.equal(selectedEntries(selectReflections(unicodeState,{...input,weighted:true})).length,expected);
 }
 const r=makeRequest(state,'2026-10-27','personal','weighted',undefined,selection),json=JSON.parse(buildContext(state,r));
 assert.equal(r.payload.templateVersion,'gratitude-v4');assert.ok(Object.values(json.reflections).flat().length<20);
 // A two-unit reflection contributes only the first 1,000 code units, never full unbounded writing.
 state=write(state,'huge','2020-01-01','z'.repeat(2000));const sparse={...state,entries:state.entries.filter(e=>e.id==='huge')};
 const one=JSON.parse(buildContext(sparse,makeRequest(sparse,'2026-10-27','personal','one',undefined,selection)));assert.equal(one.reflections.rediscovery[0].text.length,1000);
 assert.equal(selectedEntries(selectReflections({...sparse,entries:[{...sparse.entries[0],text:'  '+'😀'.repeat(300)+'  '}]},{...input,weighted:true})).length,1);
});
test('late results and contexts cannot use changed answers; source replay preserves long accepted questions exactly',async()=>{
 let state=setup({wordLimit:200}),r=makeRequest(state,'2026-10-27','personal','r',undefined,selection);state=apply(state,r);
 const text=Array.from({length:100},()=> 'Wonderful').join(' ')+'?';assert.ok(text.length>600);
 const output={text,model:'fictional',finishReason:'STOP' as const};validatePromptOutput(output,promptOptions(state,r));
 const response:SourceAction={eventId:'r_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:'r',...output}};
 const cleared=apply(state,{eventId:'clear',type:'OnboardingAnswersCleared',schemaVersion:1,payload:{previousEventId:'answers'}});
 assert.throws(()=>buildContext(cleared,r),/answers changed/);assert.throws(()=>apply(cleared,response),/answers changed/);
 state=apply(state,response);state=apply(state,{eventId:'long-write',type:'ReflectionWritten',schemaVersion:7,payload:{entryId:'long',expectedRevision:0,text:'A quiet moment',promptId:'long-write',promptText:text,entryAt:null,photoSlot:null}});
 assert.equal(state.entries[0].prompt,text);assert.ok(exportJournal(state,'markdown').content.includes('Wonderful'));assert.deepEqual(JSON.parse(exportJournal(state,'json').content).questionnaire.answers,state.onboarding.answers);
 const backup=await importedBackup(text);assert.equal(backup.schemaVersion,2);state=apply(state,backup);assert.equal(state.backups[backup.eventId].text,text);
 assert.throws(()=>validatePromptOutput({text:'word '.repeat(80)},promptOptions(setup(),makeRequest(setup(),'2026-10-27','personal','b',undefined,selection))),/invalid-response/);
 assert.throws(()=>boundContext('x'.repeat(160001),{system:'task',max:4000}),/too large/);
 assert.throws(()=>parseAction({...response,schemaVersion:1}));
});
