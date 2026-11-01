<script lang="ts">
  import ModelSettings from './ModelSettings.svelte';
  import type {ModelConnection} from '../ai/lm-studio';
  import type {CredentialStatus} from '../firebase/model-credential';
  let {provider='prompt',connection,scope,credentialStatus,disabled=false,initialError='',onsave,onsavetoken,onforgettoken}:{provider?:'prompt'|'gemini'|'lm-studio';connection:ModelConnection;scope:string;credentialStatus:CredentialStatus;disabled?:boolean;initialError?:string;onsave:(provider:'prompt'|'gemini'|'lm-studio',connection?:ModelConnection)=>Promise<void>;onsavetoken:(connection:ModelConnection)=>Promise<void>;onforgettoken:()=>Promise<void>}=$props();
  let open=$state(false),choice=$state<'prompt'|'gemini'|'lm-studio'>('prompt'),busy=$state(false),message=$state('');
  const id=$props.id();
  $effect(()=>{choice=provider;});
  async function save(){busy=true;message='';try{await onsave(choice);message='Photo model choice saved to your account.';}catch{message='Could not save the photo model. Reconnect and try again.';}finally{busy=false;}}
</script>
<details class="photo-model" bind:open>
  <summary>Photo description model</summary>
  {#if open}
    <p class="hint">Use the prompt connection, or choose a different model and computer for photos. This does not change your prompt or backup settings.</p>
    <label for={id}>Photo description connection</label>
    <select id={id} bind:value={choice} disabled={disabled||busy} onchange={()=>message=''}>
      <option value="prompt">Same as prompt model</option>
      <option value="gemini">Gemini</option>
      <option value="lm-studio">Separate LM Studio connection</option>
    </select>
    {#if choice==='lm-studio'}
      <ModelSettings purpose="photos" heading="Photo model" regionLabel="Photo model connection" saveMessage="Photo model choice saved to your account; connection settings saved on this device." connection={{...connection,provider:'lm-studio'}} {scope} {credentialStatus} {onsavetoken} {onforgettoken} {initialError} connectionOnly disabled={disabled||busy} onchange={async saved=>{await onsave('lm-studio',saved);}} />
    {:else}
      <p class="hint">{choice==='prompt'?'Photo summaries will use the same server, model and credentials as prompts. Choose a vision-capable model to describe photos.':'Photo summaries will use this site’s managed Gemini connection, independently of prompts.'} Only the selected photo is sent when you request a summary.</p>
      <button class="outline" onclick={save} disabled={disabled||busy}>Save photo model</button>
    {/if}
    {#if message}<p class="hint" role="status">{message}</p>{/if}
  {/if}
</details>
<style>
  .photo-model{margin:24px 0;padding:18px;border:1px solid #c2c7ca65;border-radius:16px;background:#191d1fc9;backdrop-filter:blur(18px);box-sizing:border-box}.photo-model summary{color:#d8dce2;cursor:pointer;font-size:1rem}.hint{font-size:.85rem;line-height:1.5;color:#aab2be}label{display:block;margin:.9rem 0 .35rem;color:#d8dce2;font-size:.95rem}select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #ffffff30;border-radius:12px;padding:.65rem .75rem;background:#0d1117a6;color:#f3f4f7;font:inherit}button{margin-top:.4rem;border:1px solid #d9c44777;border-radius:12px;padding:.6rem .85rem;background:#11151b80;color:#edf0f5;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}
</style>
