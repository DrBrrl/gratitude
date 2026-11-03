import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverLocalModels,generateLocal,defaultConnection,saveConnection,readProviderConnection,validateConnection,wasAccountConnection,clearConnectionToken,type ModelConnection} from '../../src/lib/ai/lm-studio.ts';
import {makeRequest,buildContext,promptOptions} from '../../src/lib/ai/context.ts';
import {externalTarget} from '../../src/lib/ai/connection-contract.ts';
import {replay,parseAction,requestProvider,isEditorRequest,isBackupRequest,type JournalEvent} from '../../src/lib/domain.ts';

const connection:ModelConnection={...defaultConnection(),provider:'ollama',baseUrl:'https://fictional-local.example',model:'fictional-text:8b',token:'',connectionId:'fictional-prompts',connectionRevision:'revision-one'};
function native(changes:any={}){
 const calls:{url:string;body:any;init:RequestInit}[]=[];
 const fetcher:typeof fetch=async(url,init={})=>{const path=new URL(String(url)).pathname,body=init.body?JSON.parse(String(init.body)):undefined;calls.push({url:String(url),body,init});
  if(path==='/api/tags')return Response.json({models:[{name:connection.model},{name:'fictional-vision:8b'},{name:'fictional-reasoning:8b'},{name:'fictional-remote:cloud',remote_host:'https://ollama.com'},{name:'embedding:small'}]});
  if(path==='/api/ps')return Response.json({models:[{name:connection.model,context_length:32768}]});
  if(path==='/api/show'){const id=body.model;return Response.json(id==='embedding:small'?{capabilities:['embedding']}:id==='fictional-reasoning:8b'?{capabilities:['completion','thinking'],thinking:{values:['low','high'],default:'low'}}:{capabilities:['completion',...(id==='fictional-vision:8b'?['vision','thinking']:[])],...(id==='fictional-vision:8b'?{thinking:{values:[false,true],default:true}}:{})});}
  if(path==='/api/chat')return Response.json({model:body.model,done:true,done_reason:'stop',message:{role:'assistant',content:' A fictional small joy?\n'},...changes});
  throw Error('Unexpected endpoint');
 };return {calls,fetcher};
}
test('native Ollama discovery is metadata-only and distinguishes vision, loaded context, thinking and remote destinations',async()=>{
 const {calls,fetcher}=native(),models=await discoverLocalModels(connection,fetcher);
 assert.equal(models[0].capabilities?.contextLength,32768);assert.equal(models[0].loaded,true);
 assert.equal(models[1].capabilities?.vision,true);assert.equal(models[1].capabilities?.reasoningOff,true);
 assert.match(models[2].error!,/thinking off/);assert.match(models[3].error!,/Cloud-routed/);assert.equal(models[4].capabilities,null);
 assert.ok(calls.every(call=>!call.url.endsWith('/chat')&&!JSON.stringify(call.body??null).includes('fictional private journal')));
 assert.ok(calls.every(call=>call.init.redirect==='error'&&call.init.credentials==='omit'&&!('Authorization' in (call.init.headers as object))));
});
test('Ollama prompt and photo requests use native non-thinking controls, complete exact output and no LM Studio fields',async()=>{
 for(const photo of [false,true]){
  const {calls,fetcher}=native(),selected={...connection,model:photo?'fictional-vision:8b':connection.model};
  const content=photo?[{type:'text',text:'Describe this photo.'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,/9j/fictional'}}]:'fictional private journal';
  assert.deepEqual(await generateLocal(selected,'instruction',content,photo?1000:4000,fetcher),{text:' A fictional small joy?\n',model:selected.model,finishReason:'STOP'});
  const sent=calls.at(-1)!.body;assert.equal(sent.stream,false);assert.equal(sent.truncate,false);assert.equal(sent.shift,false);
  assert.equal(sent.chat_template_kwargs,undefined);assert.equal(sent.reasoning_effort,undefined);assert.equal(sent.think,photo?false:undefined);
  assert.equal(sent.messages[1].content,photo?'Describe this photo.':'fictional private journal');assert.deepEqual(sent.messages[1].images,photo?['/9j/fictional']:undefined);
 }
});
test('unsupported photos and forced/unknown thinking fail before inference or image transmission',async()=>{
 const {calls,fetcher}=native();await assert.rejects(generateLocal(connection,'instruction',[{type:'image_url',image_url:{url:'private-image'}}],1000,fetcher),/does not support photos/);
 assert.ok(!calls.some(call=>call.url.endsWith('/chat')||JSON.stringify(call.body??null).includes('private-image')));
 await assert.rejects(generateLocal({...connection,model:'fictional-reasoning:8b'},'instruction','data',4000,fetcher),/thinking off/);
});
test('native final responses reject truncation, tools, reasoning, blank text and visible control markers',async()=>{
 for(const changes of [{done:false},{done_reason:'length'},{message:{role:'assistant',content:'',thinking:'secret'}},{message:{role:'assistant',content:'<think>hidden</think> answer'}},{message:{role:'assistant',content:'answer',tool_calls:[{}]}},{message:{role:'assistant',content:'answer',thinking:'reasoning'}}]){
  await assert.rejects(generateLocal(connection,'instruction','data',4000,native(changes).fetcher),/invalid-response/);
 }
});
test('compatibility mode requires declared text/non-thinking capabilities and never assumes vision',async()=>{
 const calls:string[]=[];const fetcher:typeof fetch=async(url)=>{calls.push(String(url));return Response.json({data:[{id:'unknown/model'},{id:'verified/model',capabilities:{completion:true,thinking:false}}]});};
 const models=await discoverLocalModels({...connection,provider:'openai-compatible'},fetcher);
 assert.match(models[0].error!,/unknown/);assert.equal(models[1].capabilities?.vision,false);assert.deepEqual(calls,['https://fictional-local.example/v1/models']);
 await assert.rejects(generateLocal({...connection,provider:'openai-compatible',model:'unknown/model'},'instruction','data',4000,fetcher),/unknown/);
});
test('new destination requests preserve literal bindings and legacy event validation and replay',()=>{
 for(const provider of ['ollama','openai-compatible','personal-gemini'] as const){
  const choices={eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:5,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:'',provider,backupEnabled:true,backupProvider:provider,photoProvider:'prompt',promptConnectionId:connection.connectionId!,backupConnectionId:connection.connectionId!,photoConnectionId:null}} as const;
  const events:JournalEvent[]=[{...choices,sequence:1,recordedAt:'2026-10-01T00:00:00.000Z'}];
  for(const purpose of ['daily','editor','backup'] as const){
   const state=replay(events),request=makeRequest(state,'2026-10-01','personal','request-'+purpose,purpose==='editor'?'entry':undefined,{timeZone:'Australia/Hobart',selectionSeed:'a'.repeat(32)},externalTarget({...connection,provider}),purpose==='backup');
   assert.equal(request.schemaVersion,{daily:23,editor:24,backup:25}[purpose]);assert.equal(requestProvider(request),provider);assert.equal(isEditorRequest(request),purpose==='editor');assert.equal(isBackupRequest(request),purpose==='backup');
   assert.deepEqual(parseAction(request),request);assert.ok(!JSON.stringify(request).includes(connection.baseUrl));assert.equal(promptOptions(state,request).wordLimit,80);assert.equal(JSON.parse(buildContext(state,request)).reflections.recent.length,0);
   events.push({...request,sequence:events.length+1,recordedAt:'2026-10-01T00:00:01.000Z'});
   events.push({eventId:request.eventId+'_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:request.eventId,text:'A fictional joy?',model:connection.model,finishReason:'STOP'},sequence:events.length+1,recordedAt:'2026-10-01T00:00:02.000Z'});
  }
  const state=replay(events);for(let cut=0;cut<events.length;cut++)assert.deepEqual(replay(events.slice(cut),replay(events.slice(0,cut))),state);
  const {sequence,recordedAt,...oldShape}=events[1];const {connectionId,connectionRevision,...oldPayload}=oldShape.payload as any;
  assert.throws(()=>parseAction({...oldShape,schemaVersion:15,payload:oldPayload}));
  const {promptConnectionId,photoConnectionId,backupConnectionId,...oldChoices}=choices.payload;
  for(const field of ['provider','backupProvider','photoProvider'])assert.throws(()=>parseAction({...choices,schemaVersion:4,payload:{...oldChoices,provider:'gemini',backupProvider:'lm-studio',photoProvider:'prompt',[field]:provider}}));
 }
});
test('local account provenance supports a tokenless proxy and stays bound to its service and destination',()=>{
 const storage=():Storage=>{const map=new Map<string,string>();return {get length(){return map.size;},getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,String(value));},removeItem:key=>{map.delete(key);},clear:()=>map.clear(),key:index=>[...map.keys()][index]??null};};
 const preferences=storage(),secrets=storage();saveConnection('account',connection,preferences,secrets,true);assert.equal(wasAccountConnection('account',secrets),true);
 saveConnection('account',{...connection,model:'fictional/other'},preferences,secrets);assert.equal(wasAccountConnection('account',secrets),true);
 saveConnection('account',{...connection,provider:'openai-compatible'},preferences,secrets);assert.equal(wasAccountConnection('account',secrets),false);
 const token='fictional-proxy-token';saveConnection('account',{...connection,token},preferences,secrets,true);
 assert.equal(readProviderConnection('account','ollama',preferences,secrets).token,token);assert.ok(!JSON.stringify(Array.from({length:preferences.length},(_,i)=>preferences.getItem(preferences.key(i)!))).includes(token));
 clearConnectionToken('account',secrets);assert.equal(readProviderConnection('account','ollama',preferences,secrets).token,'');assert.equal(wasAccountConnection('account',secrets),false);
});
test('legacy destinations survive choosing another service and a personal connection can return to managed Gemini',()=>{
 const storage=():Storage=>{const map=new Map<string,string>();return {get length(){return map.size;},getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,String(value));},removeItem:key=>{map.delete(key);},clear:()=>map.clear(),key:index=>[...map.keys()][index]??null};};
 for(const provider of ['gemini','lm-studio'] as const){
  const preferences=storage(),secrets=storage();const legacy={provider,baseUrl:'https://previous-laptop.example',model:'legacy/chosen-model'};
  preferences.setItem('gratitude:model:account',JSON.stringify(legacy));secrets.setItem('gratitude:model:account','fictional-old-token');
  if(provider==='gemini')saveConnection('account',{...legacy,token:'fictional-old-token'},preferences,secrets,true);
  saveConnection('account',connection,preferences,secrets);
  assert.deepEqual(readProviderConnection('account','lm-studio',preferences,secrets),{...legacy,provider:'lm-studio',token:'fictional-old-token'});
 }
 assert.deepEqual(validateConnection({provider:'gemini',baseUrl:'',model:'',token:'',connectionId:'deleted-key'}),defaultConnection());
});
