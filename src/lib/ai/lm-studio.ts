import {PHOTO_SYSTEM_PROMPT} from './instructions.ts';
import type {GenerateSummary} from './local-contract.ts';
import { SYSTEM_PROMPT, type GeneratePrompt } from './context.ts';

import {PROVIDERS,providerName,validModel,isExternalProvider,externalTarget,type ModelConnection} from './connection-contract.ts';
import {discoverServiceModels,generateService} from './local-services.ts';
import {parseChatResponse} from './chat-response.ts';
export type {ModelConnection} from './connection-contract.ts';
import {DEFAULT_LOCAL_MODEL} from './local-contract.ts';
export {DEFAULT_LOCAL_MODEL} from './local-contract.ts';
export type LocalCapabilities = { vision: boolean; supportsThinking: boolean; reasoningOff: boolean; contextLength: number | null; loaded: boolean };
export type LocalModelInfo = { id: string; loaded: boolean; capabilities: LocalCapabilities | null; error: string | null };
export const defaultConnection = (): ModelConnection => ({provider:'gemini',baseUrl:'http://127.0.0.1:8080',model:DEFAULT_LOCAL_MODEL,token:''});
export function serverOrigin(value: string) {
  let url:URL;
  try {url=new URL(value.trim());} catch {throw new Error('Enter the LM Studio server URL, including http:// or https://.');}
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['/','/v1','/v1/'].includes(url.pathname)) throw new Error('Use an HTTP or HTTPS server address without credentials, query parameters or an API path.');
  return url.origin;
}
export function validateConnection(input:ModelConnection):ModelConnection {
  if (!PROVIDERS.includes(input.provider)) throw new Error('Choose an AI provider.');
  if(input.provider==='gemini'&&!input.baseUrl)return defaultConnection();
  if (!validModel(input.model.trim())) throw new Error('Enter a model API identifier of up to 80 characters.');
  if(input.token.length>4096 || /[\r\n]/.test(input.token)) throw new Error('Enter a valid LM Studio API token.');
  if(input.provider==='personal-gemini'){if(input.token)throw new Error('Cloud keys must be saved through the private relay.');return {...input,baseUrl:'',model:input.model.trim(),token:''};}
  return {...input,baseUrl:serverOrigin(input.baseUrl),model:input.model.trim(),token:input.token.trim()};
}
function headers(connection:ModelConnection) {
  return {'Content-Type':'application/json',...(connection.token?{Authorization:`Bearer ${connection.token}`}:{})};
}
async function request(connection:ModelConnection,path:string,body?:unknown,fetcher:typeof fetch=fetch) {
  let response:Response;
  try {response=await fetcher(`${connection.baseUrl}${path}`,{method:body?'POST':'GET',headers:headers(connection),body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(body?120_000:10_000)});}
  catch {throw new Error('Could not reach LM Studio. Check the server address, CORS, browser network permission and HTTPS access from this device.');}
  if(response.status===401||response.status===403) throw new Error('LM Studio needs a valid API token. Enter it in AI settings on this device.');
  if(!response.ok) throw new Error('LM Studio could not complete this request. Check the loaded model and its context length.');
  try {return await response.json();} catch {throw new Error('LM Studio returned an invalid response.');}
}
/** Metadata only: does not load a model, send a journal or trigger inference. */
export async function discoverLocalModels(input:ModelConnection,fetcher:typeof fetch=fetch):Promise<LocalModelInfo[]> {
  // Discovery needs the destination/token, not an already valid model choice.
  const connection=validateConnection({...input,model:DEFAULT_LOCAL_MODEL});
  if(connection.provider==='ollama'||connection.provider==='openai-compatible')return discoverServiceModels(connection,fetcher);
  const data=await request(connection,'/api/v1/models',undefined,fetcher);
  if(!Array.isArray(data?.models)) throw new Error('LM Studio model discovery is unavailable. Use a current LM Studio version.');
  const result=new Map<string,LocalModelInfo>();
  for(const model of data.models) {
    if(model?.type!=='llm') continue;
    const instances=Array.isArray(model.loaded_instances)?model.loaded_instances.filter((item:any)=>item&&typeof item==='object'):[];
    for(const id of [model.key,...instances.map((item:any)=>item.id)]) {
      if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]{0,79}$/.test(id)||result.has(id)) continue;
      const reasoning=model.capabilities?.reasoning,instance=instances.find((item:any)=>item.id===id)??instances[0];
      const contextLength=instance?.config?.context_length;
      const error=reasoning&&(!Array.isArray(reasoning.allowed_options)||!reasoning.allowed_options.includes('off'))
        ?'This model does not offer thinking off. Choose a model that supports your non-thinking preference.':null;
      result.set(id,{id,loaded:instances.length>0,error,capabilities:error?null:{vision:model.capabilities?.vision===true,supportsThinking:!!reasoning||model.key===DEFAULT_LOCAL_MODEL,reasoningOff:!!reasoning,loaded:instances.length>0,contextLength:Number.isSafeInteger(contextLength)&&contextLength>0?contextLength:null}});
    }
  }
  return [...result.values()];
}
export function selectedLocalCapabilities(models:LocalModelInfo[],id:string,service='LM Studio'):LocalCapabilities {
  const model=models.find(item=>item.id===id);
  if(!model) throw new Error(`The selected model is not available in ${service}. Check its API identifier.`);
  if(model.error) throw new Error(model.error);
  return model.capabilities!;
}
export async function probeLocalModel(input:ModelConnection,fetcher:typeof fetch=fetch):Promise<LocalCapabilities> {
  const connection=validateConnection(input);
  return selectedLocalCapabilities(await discoverLocalModels(connection,fetcher),connection.model,providerName(connection.provider));
}
export function parseLocalResponse(data:any,max:number) {
  return parseChatResponse(data,max);
}
export async function generateLocal(input:ModelConnection,system:string,content:unknown,max:number,fetcher:typeof fetch=fetch) {
  const connection=validateConnection(input),capabilities=await probeLocalModel(connection,fetcher);
  if(Array.isArray(content)&&!capabilities.vision) throw new Error('The selected local model does not support photos. You can attach the photo without AI or write its summary.');
  if(max>1000&&capabilities.contextLength&&new TextEncoder().encode(system+JSON.stringify(content)).length+2048>capabilities.contextLength)throw new Error('This context may exceed the selected model’s loaded context. Increase its context length or reduce sharing before retrying.');
  if(connection.provider==='ollama'||connection.provider==='openai-compatible')return generateService(connection,capabilities,system,content,max,fetcher);
  // Native discovery calls non-thinking 'off'; chat/completions calls it 'none'.
  const payload={model:connection.model,messages:[{role:'system',content:system},{role:'user',content}],stream:false,max_tokens:max===600?512:max>1000?2048:768,
    ...(capabilities.supportsThinking?{chat_template_kwargs:{enable_thinking:false}}:{}),...(capabilities.reasoningOff?{reasoning_effort:'none'}:{})};
  return parseLocalResponse(await request(connection,'/v1/chat/completions',payload,fetcher),max);
}
export function localGenerator(connection:ModelConnection):GeneratePrompt {
  const captured=validateConnection(connection);
  return Object.assign((context:string,options?:import('./context').PromptOptions)=>generateLocal(captured,options?.system??SYSTEM_PROMPT,context,options?.max??600),{target:isExternalProvider(captured.provider)?externalTarget(captured):{provider:'lm-studio' as const,model:captured.model,thinking:false as const}});
}

// Scope device preferences and tab credentials to the signed-in account/deployment.
// Optional account sync lives separately in ModelCredentialStore.
const key=(scope:string)=>`gratitude:model:${scope}`;
const accountKey=(scope:string)=>`gratitude:model-account:${scope}`;
export function wasAccountConnection(scope:string,secrets:Storage=sessionStorage){const marker=secrets.getItem(accountKey(scope));if(!marker)return false;if(marker.startsWith('[')){try{const value=JSON.parse(marker);return Array.isArray(value)&&['ollama','openai-compatible'].includes(value[0])&&typeof value[1]==='string';}catch{return false;}}return !!secrets.getItem(key(scope));}
export function readConnection(scope:string,storage:Storage=localStorage,secrets:Storage=sessionStorage):ModelConnection {
  const saved=JSON.parse(storage.getItem(key(scope))??'null');
  return saved?validateConnection({...saved,token:secrets.getItem(key(scope))??''}):defaultConnection();
}
export function readProviderConnection(scope:string,provider:import('./connection-contract.ts').AIProvider,storage:Storage=localStorage,secrets:Storage=sessionStorage):ModelConnection {
  const providerScope=JSON.stringify(['provider',scope,provider]);
  const saved=storage.getItem(key(providerScope));
  if(saved)return {...readConnection(providerScope,storage,secrets),provider};
  const previous=readConnection(scope,storage,secrets);
  if(previous.provider===provider||provider==='gemini'||provider==='lm-studio'&&previous.provider==='gemini'&&!PROVIDERS.some(value=>storage.getItem(key(JSON.stringify(['provider',scope,value])))))return {...previous,provider};
  return {...defaultConnection(),provider,baseUrl:provider==='personal-gemini'?'':provider==='ollama'?'http://127.0.0.1:11434':'http://127.0.0.1:8080',model:provider==='personal-gemini'?'':provider==='ollama'?'':'',token:''};
}
export function saveConnection(scope:string,input:ModelConnection,storage:Storage=localStorage,secrets:Storage=sessionStorage,fromAccount=false) {
  const connection=validateConnection(input),{token,...preferences}=connection;
  const previous=secrets.getItem(key(scope));
  const prior=storage.getItem(key(scope));
  let priorPreferences:ModelConnection|null=null;
  if(prior){try{priorPreferences=validateConnection({...JSON.parse(prior),token:previous??''});}catch{/* An unreadable cache must not prevent an explicit valid replacement. */}}
  if(priorPreferences){const parsed=priorPreferences;const provider=parsed.provider==='gemini'&&connection.provider!=='gemini'&&!PROVIDERS.some(value=>storage.getItem(key(JSON.stringify(['provider',scope,value]))))?'lm-studio':parsed.provider;if(provider&&provider!=='gemini'){const previousSlot=key(JSON.stringify(['provider',scope,provider]));storage.setItem(previousSlot,JSON.stringify({...parsed,provider}));if(previous)secrets.setItem(previousSlot,previous);else secrets.removeItem(previousSlot);}}
  storage.setItem(key(scope),JSON.stringify(preferences));
  if(connection.provider!=='gemini'){const slot=key(JSON.stringify(['provider',scope,connection.provider]));storage.setItem(slot,JSON.stringify(preferences));if(token)secrets.setItem(slot,token);else secrets.removeItem(slot);}
  if(token) secrets.setItem(key(scope),token);else secrets.removeItem(key(scope));
  const boundMarker=JSON.stringify([connection.provider,connection.baseUrl]);
  const marker=secrets.getItem(accountKey(scope));
  if(fromAccount&&(token||connection.provider==='ollama'||connection.provider==='openai-compatible'))secrets.setItem(accountKey(scope),connection.provider==='lm-studio'?connection.baseUrl:boundMarker);
  else if((previous??'')!==token||(marker!==connection.baseUrl&&marker!==boundMarker)||(!token&&connection.provider==='lm-studio'))secrets.removeItem(accountKey(scope));
  return connection;
}
export function clearConnectionToken(scope:string,secrets:Storage=sessionStorage) {secrets.removeItem(key(scope));secrets.removeItem(accountKey(scope));for(const provider of PROVIDERS)secrets.removeItem(key(JSON.stringify(['provider',scope,provider])));}

export function localPhotoGenerator(input:ModelConnection,read:()=>Promise<Blob>):GenerateSummary {
 const connection=validateConnection(input);
 return Object.assign(async()=>{
   const blob=await read(),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
   for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
   return generateLocal(connection,PHOTO_SYSTEM_PROMPT,[{type:'text',text:'Describe this photo.'},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${btoa(binary)}`}}],1000);
 },{target:isExternalProvider(connection.provider)?externalTarget(connection):{provider:'lm-studio' as const,model:connection.model,thinking:false as const}});
}

/** Keep task slots distinct even when an account ID contains a delimiter. */
export function photoConnectionScope(scope:string){return JSON.stringify(['photos',scope]);}
