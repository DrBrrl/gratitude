import {validModel, providerName, type ModelConnection} from './connection-contract.ts';
import {finalText,parseChatResponse} from './chat-response.ts';
import type {LocalModelInfo,LocalCapabilities} from './lm-studio.ts';

/** Browsers can hide a CORS-rejected 403 as a fetch failure. Do not call it a bad token. */
export class OllamaAccessError extends Error {
  readonly reason:'forbidden'|'network';
  constructor(reason:'forbidden'|'network') {
    super(reason==='forbidden'
      ? 'Ollama refused access (HTTP 403). Check its allowed browser origins. If you use a proxy, also check its access permissions and token.'
      : 'Could not reach Ollama from this browser. Check the server address, HTTPS access and allowed browser origins. Browser security can hide an origin rejection.');
    this.name='OllamaAccessError';this.reason=reason;
  }
}

/** POSIX quoting for a command copied into a macOS/Linux terminal. */
export function ollamaOriginCommand(origin:string) {
  return `OLLAMA_ORIGINS='${origin.replaceAll("'", "'\\''")}' ollama serve`;
}

async function request(connection:ModelConnection,path:string,body:unknown,fetcher:typeof fetch) {
  let response:Response;
  const headers:Record<string,string>={};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(connection.token)headers.Authorization=`Bearer ${connection.token}`;
  try {response=await fetcher(connection.baseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(path.endsWith('/chat')||path.endsWith('/completions')?120_000:10_000)});}
  catch {if(connection.provider==='ollama')throw new OllamaAccessError('network');throw new Error(`Could not reach ${providerName(connection.provider)}. Check the server address, allowed origins and HTTPS access from this device.`);}
  if(response.status===403&&connection.provider==='ollama')throw new OllamaAccessError('forbidden');
  if([401,403].includes(response.status))throw new Error('The server rejected its authentication token. Check this connection’s credentials.');
  if(!response.ok)throw new Error('The selected server could not complete the request. Check its model and context settings.');
  try{return await response.json();}catch{throw new Error('The server returned an invalid response.');}
}
export async function discoverServiceModels(connection:ModelConnection,fetcher:typeof fetch):Promise<LocalModelInfo[]> {
  const ollama=connection.provider==='ollama';
  const data=await request(connection,ollama?'/api/tags':'/v1/models',undefined,fetcher);
  const rows=ollama?data?.models:data?.data;
  const running=ollama?await request(connection,'/api/ps',undefined,fetcher):null;
  if(ollama&&!Array.isArray(running?.models))throw new Error('Ollama running-model metadata is unavailable. Update the server before connecting.');
  if(!Array.isArray(rows)||rows.length>256)throw new Error('The server did not return a supported model catalogue.');
  const ids=[...new Set<string>(rows.map((row:any)=>ollama?row?.name:row?.id).filter(validModel))];
  const result:LocalModelInfo[]=[];
  // Metadata only. Native Ollama /show neither loads a model nor generates text.
  for(const id of ids){
    if(ollama){
      const metadata=await request(connection,'/api/show',{model:id},fetcher);
      const capabilities=metadata?.capabilities;
      if(!Array.isArray(capabilities)||!capabilities.includes('completion')){result.push({id,loaded:false,capabilities:null,error:'This model does not advertise text completion support.'});continue;}
      // Cloud-routed models need their own reviewed cloud disclosure, not a local label.
      const source=rows.find((row:any)=>row.name===id);
      const remote=!!source?.remote_host||!!source?.remote_model||!!metadata.remote_host||!!metadata.remote_model||/(?:^|[-:])cloud(?:$|[-:])/i.test(id);
      const thinking=capabilities.includes('thinking');
      const thinkingValues=metadata.thinking?.supported_values??metadata.thinking?.supported??metadata.thinking?.values;
      const cannotDisable=thinking&&(!Array.isArray(thinkingValues)||!thinkingValues.includes(false));
      const error=remote?'Cloud-routed Ollama models are not supported by this local connection.':cannotDisable?'This model does not offer thinking off. Choose a different model.':null;
      const loaded=running.models.find((row:any)=>row.name===id||row.model===id);const length=loaded?.context_length;
      result.push({id,loaded:!!loaded,error,capabilities:error?null:{vision:capabilities.includes('vision'),supportsThinking:thinking,reasoningOff:thinking,contextLength:Number.isSafeInteger(length)&&length>0?length:null,loaded:!!loaded}});
    }else{
      const row=rows.find((row:any)=>row.id===id);
      // Compatibility mode is deliberately text-only and requires declared final-text semantics.
      const supported=row.capabilities?.completion===true&&row.capabilities?.thinking===false;
      result.push({id,loaded:false,error:supported?null:'Capabilities are unknown. This adapter requires completion: true and thinking: false in model metadata.',capabilities:supported?{vision:false,supportsThinking:false,reasoningOff:false,contextLength:null,loaded:false}:null});
    }
  }
  return result;
}
export async function generateService(connection:ModelConnection,capabilities:LocalCapabilities,system:string,content:unknown,max:number,fetcher:typeof fetch){
  if(connection.provider==='ollama'){
    const image=Array.isArray(content)?content.find(part=>part.type==='image_url')?.image_url?.url:undefined;
    const text=Array.isArray(content)?content.filter(part=>part.type==='text').map(part=>part.text).join('\n'):content;
    if(image&&(typeof image!=='string'||!image.startsWith('data:image/jpeg;base64,')))throw new Error('invalid-response');
    const data=await request(connection,'/api/chat',{model:connection.model,messages:[{role:'system',content:system},{role:'user',content:text,...(image?{images:[image.slice('data:image/jpeg;base64,'.length)]}:{})}],stream:false,truncate:false,shift:false,...(capabilities.supportsThinking?{think:false}:{}),options:{num_predict:max>1000?2048:768}},fetcher);
    if(data?.done!==true||data.done_reason!=='stop'||data.message?.role!=='assistant'||data.message.tool_calls?.length||data.message?.thinking?.trim())throw new Error('invalid-response');
    return finalText(data.message.content,data.model,max);
  }
  if(Array.isArray(content))throw new Error('This compatibility adapter supports text only. Choose a verified vision service for photos.');
  const data=await request(connection,'/v1/chat/completions',{model:connection.model,messages:[{role:'system',content:system},{role:'user',content}],stream:false,max_tokens:max>1000?2048:768},fetcher);
  const message=data?.choices?.[0]?.message;
  if(message?.reasoning_content||message?.reasoning)throw new Error('invalid-response');
  return parseChatResponse(data,max);
}
