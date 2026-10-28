import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConnection,validateConnection,serverOrigin,probeLocalModel,generateLocal,localGenerator,parseLocalResponse,readConnection,saveConnection,wasAccountConnection,clearConnectionToken,DEFAULT_LOCAL_MODEL,type ModelConnection} from '../../src/lib/ai/lm-studio.ts';
import {makeRequest,buildContext,SYSTEM_PROMPT} from '../../src/lib/ai/context.ts';
import {replay,parseAction,STARTER_ID,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';

const connection:ModelConnection={...defaultConnection(),provider:'lm-studio',token:'fictional-lm-token'};
const model={type:'llm',key:DEFAULT_LOCAL_MODEL,loaded_instances:[{id:DEFAULT_LOCAL_MODEL,config:{context_length:32768}}],capabilities:{vision:true,reasoning:{allowed_options:['off','on'],default:'on'}}};
const completion=(text=' What small comfort did you notice?\n')=>({model:DEFAULT_LOCAL_MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:text,reasoning_content:'This separate field must never enter the saved journal.'}}]});
function endpoint(catalog:unknown={models:[model]},output:unknown=completion()) {
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher:typeof fetch=async(url,init={})=>{calls.push({url:String(url),init});return Response.json(String(url).endsWith('/models')?catalog:output);};
  return {calls,fetcher};
}
function storage():Storage {
  const values=new Map<string,string>();
  return {get length(){return values.size;},clear(){values.clear();},getItem(key){return values.get(key)??null;},key(i){return [...values.keys()][i]??null;},removeItem(key){values.delete(key);},setItem(key,value){values.set(key,String(value));}};
}
test('local endpoints and identifiers are explicit, bounded and free of embedded credentials',()=>{
  assert.equal(serverOrigin('http://127.0.0.1:8080/v1/'),'http://127.0.0.1:8080');
  assert.equal(serverOrigin('https://model.example.test/'),'https://model.example.test');
  for(const url of ['file:///etc/passwd','data:text/plain,x','http://user:secret@localhost:8080','http://localhost:8080/?token=x','http://localhost:8080/api/v1']) assert.throws(()=>serverOrigin(url));
  for(const change of [{model:''},{model:'x'.repeat(81)},{token:'header\nvalue'},{provider:'unknown'}]) assert.throws(()=>validateConnection({...connection,...change} as ModelConnection));
});
test('a connection test discovers capabilities without inference or journal content',async()=>{
  const {calls,fetcher}=endpoint();
  assert.deepEqual(await probeLocalModel(connection,fetcher),{vision:true,supportsThinking:true,reasoningOff:true,contextLength:32768,loaded:true});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:8080/api/v1/models');
  assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.redirect,'error');
  assert.deepEqual(calls[0].init.headers,{'Content-Type':'application/json',Authorization:'Bearer fictional-lm-token'});
});
test('Gemma receives the exact system/context messages and both supported thinking-off controls',async()=>{
  const {calls,fetcher}=endpoint();
  const context=JSON.stringify({reflections:{recent:[{date:'2026-10-01',text:'Fictional tea.'}]}});
  assert.deepEqual(await generateLocal(connection,SYSTEM_PROMPT,context,600,fetcher),{text:' What small comfort did you notice?\n',model:DEFAULT_LOCAL_MODEL,finishReason:'STOP'});
  const body=JSON.parse(calls[1].init.body as string);
  assert.deepEqual(body,{model:DEFAULT_LOCAL_MODEL,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:context}],stream:false,max_tokens:512,chat_template_kwargs:{enable_thinking:false},reasoning_effort:'off'});
  assert.equal(calls.length,2);assert.equal(calls[1].url,'http://127.0.0.1:8080/v1/chat/completions');
});
test('non-thinking models omit thinking arguments; models that cannot switch thinking off fail before inference',async()=>{
  const plain={...model,key:'local/plain',capabilities:{vision:false}};
  const ordinary=endpoint({models:[plain]});
  await generateLocal({...connection,model:'local/plain'},'system','context',600,ordinary.fetcher);
  const body=JSON.parse(ordinary.calls[1].init.body as string);
  assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.reasoning_effort,undefined);
  const forced=endpoint({models:[{...model,capabilities:{reasoning:{allowed_options:['on']}}}]});
  await assert.rejects(generateLocal(connection,'system','context',600,forced.fetcher),/does not offer thinking off/);assert.equal(forced.calls.length,1);
});
test('photos require a vision-capable model before any image reaches the server',async()=>{
  const textOnly=endpoint({models:[{...model,capabilities:{vision:false}}]});
  await assert.rejects(generateLocal(connection,'system',[{type:'image_url',image_url:{url:'data:image/jpeg;base64,fictional'}}],1000,textOnly.fetcher),/does not support photos/);
  assert.equal(textOnly.calls.length,1);assert.equal(textOnly.calls[0].init.body,undefined);
  const vision=endpoint();await generateLocal(connection,'system',[{type:'text',text:'Describe this photo.'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,fictional'}}],1000,vision.fetcher);
  assert.equal(JSON.parse(vision.calls[1].init.body as string).max_tokens,768);
});
test('provider failures never disclose bodies, retry inference or choose a cloud provider',async()=>{
  let count=0;
  const unauthorized:typeof fetch=async()=>{count++;return Response.json({error:'PRIVATE_PROVIDER_DETAILS'},{status:401});};
  await assert.rejects(generateLocal(connection,'system','private context',600,unauthorized),error=>error instanceof Error && /valid API token/.test(error.message)&&!error.message.includes('PRIVATE_PROVIDER_DETAILS'));
  assert.equal(count,1);
  const unreachable:typeof fetch=async()=>{throw new Error('PRIVATE_CONNECTION_DETAILS');};
  await assert.rejects(probeLocalModel(connection,unreachable),/Could not reach LM Studio/);
  await assert.rejects(probeLocalModel(connection,endpoint({models:[]}).fetcher),/not available/);
});
test('only a complete bounded final assistant answer is accepted, with exact whitespace',()=>{
  assert.equal(parseLocalResponse(completion(),600).text,' What small comfort did you notice?\n');
  for(const text of ['', ' ', 'x'.repeat(601), '<think>private reasoning</think>Answer', '</think>Answer', '<channel|>Answer', '<|channel>thought\nprivate<channel|>Answer']) assert.throws(()=>parseLocalResponse(completion(text),600),/invalid-response/);
  assert.throws(()=>parseLocalResponse({...completion(),choices:[{finish_reason:'length',message:{role:'assistant',content:'Truncated'}}]},600));
  assert.throws(()=>parseLocalResponse({...completion(),choices:[{finish_reason:'stop',message:{role:'assistant',content:'Answer',tool_calls:[{}]}}]},600));
  assert.throws(()=>parseLocalResponse({...completion(),model:''},600));
});
test('model destinations persist per account/device; tokens stay in the tab session and corrupt settings fail closed',()=>{
  const preferences=storage(),secrets=storage();saveConnection('account-a',connection,preferences,secrets);
  assert.ok(!preferences.getItem(preferences.key(0)!)!.includes(connection.token));
  assert.equal(readConnection('account-a',preferences,secrets).token,connection.token);
  assert.equal(readConnection('account-b',preferences,secrets).provider,'gemini');
  clearConnectionToken('account-a',secrets);
  assert.equal(readConnection('account-a',preferences,secrets).provider,'lm-studio');assert.equal(readConnection('account-a',preferences,secrets).token,'');
  preferences.setItem(preferences.key(0)!,'broken JSON');assert.throws(()=>readConnection('account-a',preferences,secrets));
  assert.deepEqual(localGenerator(connection).target,{provider:'lm-studio',model:DEFAULT_LOCAL_MODEL,thinking:false});
});

const recordedAt='2026-10-01T04:31:07.000Z';
const log=(actions:SourceAction[]):JournalEvent[]=>actions.map((action,i)=>({...action,sequence:i+1,recordedAt}));
test('local daily/editor targets and exact responses replay with existing consent and usage rules',()=>{
  const initial:SourceAction[]=[{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:2,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:false,guidance:'Quiet moments',provider:'lm-studio'}},{eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',text:'A fictional cup of tea.',expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:'2026-09-29T01:00:00.000Z',photoSlot:null}}];
  const snapshot=replay(log(initial)),selection={timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'};
  const daily=makeRequest(snapshot,'2026-10-01','personal','local',undefined,selection,localGenerator(connection).target);
  assert.throws(()=>makeRequest(snapshot,'2026-10-01','personal','unexpected-cloud',undefined,selection),/AI provider changed/);
  assert.equal(daily.schemaVersion,5);assert.equal(JSON.parse(buildContext(snapshot,daily)).reflections.recent.length,1);
  assert.equal('token' in daily.payload,false);assert.equal('baseUrl' in daily.payload,false);
  const response:SourceAction={eventId:'local_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'local',text:' A local question?\n',model:DEFAULT_LOCAL_MODEL,finishReason:'STOP'}};
  const events=log([...initial,daily,response]),full=replay(events);
  assert.equal(full.ai.days['2026-10-01'],'local_response');assert.equal(full.ai.usage.entry.count,1);
  for(let cut=0;cut<=events.length;cut++) assert.deepEqual(replay(events.slice(cut),replay(events.slice(0,cut))),full);
  const editor=makeRequest(full,'2026-10-01','personal','editor','entry',selection,localGenerator(connection).target);
  assert.equal(editor.schemaVersion,6);assert.deepEqual(editor.payload.entryRefs,{});
  assert.throws(()=>parseAction({...daily,payload:{...daily.payload,token:'secret'}}));
  assert.throws(()=>parseAction({...daily,payload:{...daily.payload,thinking:true}}));
  assert.throws(()=>parseAction({...daily,schemaVersion:3}));
});
test('local photo requests record the chosen provider but replay only the received summary',()=>{
  const actions:SourceAction[]=[{eventId:'choose-local',type:'AIChoicesConfirmed',schemaVersion:2,payload:{previousEventId:null,enabled:false,useJournal:false,useFeedback:false,guidance:'',provider:'lm-studio'}},{eventId:'attach',type:'PhotoAttached',schemaVersion:1,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:null}},{eventId:'summary',type:'PhotoSummaryRequested',schemaVersion:2,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:'attach',provider:'lm-studio',model:DEFAULT_LOCAL_MODEL,thinking:false}},{eventId:'summary_response',type:'PhotoSummaryResponseReceived',schemaVersion:1,payload:{entryId:'entry',photoId:'photo',slot:0,previousEventId:'summary',text:'A yellow mug beside a window.',model:DEFAULT_LOCAL_MODEL,finishReason:'STOP'}}];
  const events=log(actions),full=replay(events);assert.equal(full.photos.entry_0.summary,'A yellow mug beside a window.');
  assert.deepEqual(replay(events.slice(2),replay(events.slice(0,2))),full);
  assert.throws(()=>parseAction({...actions[2],payload:{...actions[2].payload,token:'secret'}}));
});


test('account-token provenance survives reloads but never follows another token or destination',()=>{
 const preferences=storage(),secrets=storage();
 saveConnection('account',connection,preferences,secrets,true);
 assert.equal(wasAccountConnection('account',secrets),true);
 assert.equal(wasAccountConnection('other-account',secrets),false);
 saveConnection('account',{...connection,provider:'gemini'},preferences,secrets);
 assert.equal(wasAccountConnection('account',secrets),true);
 saveConnection('account',{...connection,token:'fictional-replacement'},preferences,secrets);
 assert.equal(wasAccountConnection('account',secrets),false);
 saveConnection('account',connection,preferences,secrets,true);
 saveConnection('account',{...connection,baseUrl:'https://different.example.test'},preferences,secrets);
 assert.equal(wasAccountConnection('account',secrets),false);
 saveConnection('account',connection,preferences,secrets,true);
 clearConnectionToken('account',secrets);
 assert.equal(wasAccountConnection('account',secrets),false);
});
