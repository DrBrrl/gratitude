import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import type {FirebaseClient} from '../firebase/client.ts';
import {externalTarget,type ModelConnection} from './connection-contract.ts';
import {PHOTO_SYSTEM_PROMPT} from './instructions.ts';
import {SYSTEM_PROMPT,type GeneratePrompt} from './context.ts';
import type {GenerateSummary} from './local-contract.ts';
const instances=new WeakMap<FirebaseClient['app'],ReturnType<typeof getFunctions>>();
export async function personalGeminiRequest<T=unknown>(client:FirebaseClient,data:Record<string,unknown>):Promise<T>{
 if(!client.auth.currentUser)throw new Error('Sign in to use your cloud connection.');
 let functions=instances.get(client.app);
 if(!functions){functions=getFunctions(client.app,'australia-southeast1');if(client.emulators)connectFunctionsEmulator(functions,'127.0.0.1',15001);instances.set(client.app,functions);}
 try{return (await httpsCallable<Record<string,unknown>,T>(functions,'personalGemini',{timeout:120_000})(data)).data;}
 catch(cause){
  const allowed=['functions/unauthenticated','functions/permission-denied','functions/resource-exhausted','functions/failed-precondition','functions/invalid-argument','functions/data-loss','functions/unavailable'];
  if(cause&&typeof cause==='object'&&'code' in cause&&allowed.includes(String(cause.code))&&'message' in cause&&typeof cause.message==='string'&&cause.message.length<500)throw new Error(cause.message);
  throw new Error('Could not reach the private cloud relay. Check your connection and try again.');
 }
}
export function personalGeminiGenerator(client:FirebaseClient,connection:ModelConnection):GeneratePrompt{
 const target=externalTarget(connection);
 return Object.assign((context:string,options?:import('./context.ts').PromptOptions)=>personalGeminiRequest<{text:string;model:string;finishReason:'STOP'}>(client,{operation:'generate',connectionId:target.connectionId,revision:target.connectionRevision,requestId:options?.requestId,system:options?.system??SYSTEM_PROMPT,context,max:options?.max??600}),{target});
}
export function personalGeminiPhotoGenerator(client:FirebaseClient,connection:ModelConnection,read:()=>Promise<Blob>):GenerateSummary{
 const target=externalTarget(connection);
 return Object.assign(async(requestId?:string)=>{const blob=await read(),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return personalGeminiRequest<{text:string;model:string;finishReason:'STOP'}>(client,{operation:'generate',connectionId:target.connectionId,revision:target.connectionRevision,requestId,system:PHOTO_SYSTEM_PROMPT,image:btoa(binary),max:1000});},{target});
}
