<script lang="ts">
 import type {FirebaseClient} from '../firebase/client';
 import {personalGeminiRequest} from '../ai/personal-gemini';
 import type {ModelConnection} from '../ai/connection-contract';
 let {client,connection,disabled=false,onchange,oncomplete,onready}:{client:FirebaseClient|null;connection:ModelConnection;disabled?:boolean;onchange:(value:ModelConnection)=>Promise<void>;oncomplete?:(complete:boolean)=>void;onready?:(ready:boolean)=>void}=$props();
 const field=$props.id();
 let key=$state(''),model=$state(''),allowPersonal=$state(false),models=$state<string[]>([]),busy=$state(false),message=$state(''),failed=$state(false);
 let saved=$state<ModelConnection|null>(null);
 $effect(()=>{oncomplete?.(!!client&&!!model&&!!(key||saved)&&!busy&&!failed);onready?.(!!client&&!!saved&&!key&&model===saved.model&&allowPersonal===(saved.allowPersonal??false)&&!busy&&!failed);});
 $effect(()=>{const current=connection.provider==='personal-gemini'&&connection.connectionId&&connection.connectionRevision?{...connection}:null;saved=current;model=current?.model??'';allowPersonal=current?.allowPersonal??false;key='';models=[];});
 async function act(operation:'test'|'save'|'delete'){
  if(!client)return;busy=true;message='';failed=false;
  try{
   const base={connectionId:saved?.connectionId??crypto.randomUUID(),revision:saved?.connectionRevision??null};
   if(operation==='test'){
    const result=await personalGeminiRequest<{models:string[]}>(client,{operation,...base,...(key?{key}:{})});models=result.models;
    message=models.length?'Connected to your Gemini account. Choose a model; no reflection or inference was sent.':'The key exposes no supported Gemini text models.';
   }else if(operation==='save'){
    const result=await personalGeminiRequest<{connectionId:string;revision:string;model:string;allowPersonal:boolean}>(client,{operation,...base,...(key?{key}:{}),model,allowPersonal});key='';
    saved={provider:'personal-gemini',baseUrl:'',token:'',model:result.model,connectionId:result.connectionId,connectionRevision:result.revision,allowPersonal:result.allowPersonal};
    await onchange({...saved});message='Your private Gemini connection is saved to your account. The key cannot be read back through the app.';
   }else{
    await personalGeminiRequest(client,{operation,...base});saved=null;key='';models=[];model='';message='The saved key was removed. Requests using it are disabled. Revoke it with Google too if you want to disable other copies.';
   }
  }catch(cause){failed=true;message=cause instanceof Error?cause.message:'The cloud connection could not be completed.';}
  finally{busy=false;}
 }
</script>
<section class="personal-key" aria-label="Personal Gemini connection" aria-busy={busy}>
 <p class="hint">Use a key from your own <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">Google AI Studio account</a>. Your Gemini project pays for model usage. Gratitude’s private Firebase relay stores the key encrypted; this app’s administrators can access it.</p>
 <label for={`${field}-key`}>{saved?'Replacement Gemini API key (optional)':'Gemini API key'}</label>
 <input id={`${field}-key`} type="password" bind:value={key} oninput={()=>{models=[];message='';}} autocomplete="off" disabled={disabled||busy} />
 <p class="hint">Keys stay out of browser storage, journal events and exports. Other signed-in devices use this connection without receiving its key.</p>
 <button class="outline" type="button" onclick={()=>act('test')} disabled={disabled||busy||!client||(!key&&!saved)}>Test cloud connection</button>
 <p class="hint">Gemini uses its model’s default thinking settings. Only complete final text is saved; reasoning is never added to your journal.</p>
 <label for={`${field}-model`}>Your Gemini model</label>
 <select id={`${field}-model`} bind:value={model} disabled={disabled||busy||!models.length}>
  <option value="" disabled>Choose a model…</option>
  {#if model&&!models.includes(model)}<option value={model}>{model} · saved</option>{/if}
  {#each models as value}<option value={value}>{value}</option>{/each}
 </select>
 <label class="permission"><input type="checkbox" bind:checked={allowPersonal} disabled={disabled||busy} />I have reviewed Google’s terms for my project and allow personal context and selected photos.</label>
 <p class="hint">A personal key does not establish a paid tier. Review <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s current terms</a>. With this off, this connection generates generic prompts and cannot describe photos. Your journal, feedback and questionnaire sharing switches still apply separately.</p>
 <button class="outline" type="button" onclick={()=>act('save')} disabled={disabled||busy||!client||!model||(!key&&!saved)}>Save private cloud connection</button>
 {#if saved}<button class="outline" type="button" onclick={()=>act('delete')} disabled={disabled||busy}>Remove saved cloud key</button>{/if}
 {#if message}<p class="hint" role={failed?'alert':'status'}>{message}</p>{/if}
</section>
<style>
 .personal-key{margin-top:1rem}.hint{font-size:.85rem;line-height:1.5;color:#aab2be}label{display:block;margin:.9rem 0 .35rem;color:#d8dce2;font-size:.95rem}input:not([type=checkbox]),select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--glass-border);border-radius:12px;padding:.65rem .75rem;background:#0d1117a6;color:#f3f4f7;font:inherit}.permission{display:flex;gap:.7rem;align-items:start;line-height:1.5}.permission input{flex:0 0 auto;margin-top:.3rem}a{color:var(--accent-text)}button{margin:.4rem .4rem 0 0;border:1px solid var(--action-border);border-radius:12px;padding:.6rem .85rem;background:#11151b80;color:#edf0f5;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}
</style>
