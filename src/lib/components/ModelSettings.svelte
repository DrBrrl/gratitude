<script lang="ts">
  import {defaultConnection,saveConnection,probeLocalModel,type ModelConnection,type LocalCapabilities} from '$lib/ai/lm-studio';
  import type {CredentialStatus} from '../firebase/model-credential';
  let {credentialStatus={ready:false,saved:false,error:''},onsavetoken,onforgettoken,connection,scope,disabled=false,connectionOnly=false,initialError='',onchange}:{credentialStatus?:CredentialStatus;onsavetoken?:(connection:ModelConnection)=>Promise<void>;onforgettoken?:()=>Promise<void>;connection:ModelConnection;scope:string;disabled?:boolean;connectionOnly?:boolean;initialError?:string;onchange:(connection:ModelConnection)=>Promise<void>}=$props();
  let draft=$state<ModelConnection>(defaultConnection()),busy=$state(false),message=$state(''),failed=$state(false),capabilities=$state<LocalCapabilities|null>(null);
  $effect(()=>{draft={...connection};capabilities=null;});
  $effect(()=>{if(initialError){message=initialError;failed=true;}});
  async function testConnection() {
    busy=true;message='';failed=false;
    try {capabilities=await probeLocalModel($state.snapshot(draft));message=`Connected to LM Studio. ${capabilities.loaded?'Model loaded.':'Model available; the first request may load it.'} ${capabilities.vision?'Photo summaries supported.':'Text prompts only.'}${capabilities.contextLength?` Loaded context: ${capabilities.contextLength.toLocaleString('en-AU')} tokens.`:''}`;}
    catch(error){failed=true;capabilities=null;message=error instanceof Error?error.message:'Could not connect to LM Studio.';}
    finally{busy=false;}
  }
  async function rememberToken(){
    busy=true;failed=false;message='';
    try{if(!onsavetoken)throw new Error('Account token sync is unavailable.');await onsavetoken($state.snapshot(draft));message='Token and server connection saved to your account.';}
    catch{failed=true;message='Could not save the account token. Use HTTPS (or localhost), enter a token and check your connection.';}
    finally{busy=false;}
  }
  async function forgetToken(){
    busy=true;failed=false;message='';
    try{if(!onforgettoken)throw new Error('Account token sync is unavailable.');await onforgettoken();message='Saved token forgotten. Connected devices clear it when they sync. Revoke it in LM Studio to disable it everywhere.';}
    catch{failed=true;message='Could not forget the saved token. Reconnect and try again.';}
    finally{busy=false;}
  }
  async function save() {
    busy=true;
    try {const input=draft.provider==='gemini'?{...connection,provider:'gemini' as const}:$state.snapshot(draft);const saved=saveConnection(scope,input);await onchange(saved);failed=false;message=connectionOnly?'Local connection saved on this device.':'Provider saved to your account; connection settings saved on this device.';}
    catch(error){failed=true;message=error instanceof Error?error.message:'Could not save model settings on this device.';}
    finally{busy=false;}
  }
</script>
<section class="glass model-settings" aria-label="AI model connection">
  <h2>AI model</h2>
  <p class="hint">Current provider: {connection.provider==='lm-studio'?'LM Studio':'Gemini'}. Provider choice syncs across devices. The connection stays on this device unless you choose account token sync.</p>
  {#if !connectionOnly}<label for="model-provider">AI provider</label>
  <select id="model-provider" bind:value={draft.provider} disabled={disabled||busy} onchange={()=>{message='';capabilities=null;}}>
    <option value="gemini">Gemini</option><option value="lm-studio">LM Studio · local model</option>
  </select>{/if}
  {#if draft.provider==='lm-studio'}
    <label for="local-server">LM Studio server URL</label>
    <input id="local-server" type="url" bind:value={draft.baseUrl} oninput={()=>{draft.token='';capabilities=null;}} disabled={disabled||busy} placeholder="http://127.0.0.1:8080" autocomplete="off" />
    <p class="hint">On your phone, use your computer’s reachable HTTPS or LAN address. Localhost refers to the device running this browser.</p>
    <label for="local-model">Model API identifier</label>
    <input id="local-model" bind:value={draft.model} disabled={disabled||busy} autocomplete="off" spellcheck="false" />
    <label for="local-token">LM Studio API token</label>
    <input id="local-token" type="password" bind:value={draft.token} disabled={disabled||busy} autocomplete="off" />
    <p class="hint">By default the token stays in this browser tab. Account token sync can restore it on your other devices, together with its server address and model.</p>
    <details class="token-sync"><summary>Account token sync</summary>
      <p class="hint">Optional: save this connection in your private account settings. Firebase project administrators and this app can access the token. It stays out of journal events and exports. Use a dedicated token with MCP permissions denied.</p>
      <p class="hint">{credentialStatus.saved?'A connection is saved to your account.':'No account connection loaded.'} Forgetting removes the saved copy; revoke the token in LM Studio to disable copies on offline devices.</p>
      <button class="outline" type="button" onclick={rememberToken} disabled={disabled||busy||!credentialStatus.ready||!draft.token||!onsavetoken}>Remember token in my account</button>
      {#if credentialStatus.saved}<button class="outline" type="button" onclick={forgetToken} disabled={disabled||busy}>Forget saved token</button>{/if}
      {#if credentialStatus.error}<p class="hint" role="status">{credentialStatus.error}</p>{/if}
    </details>
    <p class="hint">Thinking is off. Prompts use the same sharing choices and twenty-reflection selection. Photos go to this server only when you choose to summarize them. Your saved journal and attachments still sync through Firebase.</p>
    <p class="hint">Enable CORS in LM Studio. An HTTPS address works across browsers for phone access; Tailscale Serve can forward it to this computer’s local server. A full twenty-reflection context may need a larger loaded context window.</p>
    <button class="outline" type="button" onclick={testConnection} disabled={disabled||busy}>{busy?'Checking connection…':'Test connection'}</button>
  {:else}
    <p class="hint">Gemini uses this site’s managed Firebase AI connection.</p>
  {/if}
  <button class="outline" type="button" onclick={save} disabled={disabled||busy||!scope}>Save model settings</button>
  {#if message}<p class="hint connection-message" role={failed?'alert':'status'}>{message}</p>{/if}
</section>
<style>
  .model-settings{box-sizing:border-box;margin:24px 0;padding:22px;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid #c2c7ca65;border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px)}.model-settings h2{margin:0 0 .7rem;font-family:Georgia,serif;font-size:1.35rem;font-weight:500}.model-settings label{display:block;color:#d8dce2;margin-top:.9rem;margin-bottom:.35rem;font-size:.95rem}.model-settings input,.model-settings select{box-sizing:border-box;display:block;width:100%;min-height:44px;border:1px solid #ffffff30;background:#0d1117a6;border-radius:12px;padding:.65rem .75rem;color:#f3f4f7;font:inherit}.model-settings input:focus-visible,.model-settings select:focus-visible{outline:1px solid #ffffff60;outline-offset:2px}.token-sync{margin:.8rem 0}.token-sync summary{cursor:pointer;color:#d4d9e1;font-size:.9rem}.hint{color:#aab2be;font-size:.85rem;line-height:1.5}.model-settings button{margin-top:.4rem;margin-right:.4rem;border:1px solid #d9c44777;border-radius:12px;padding:.6rem .85rem;background:#11151b80;color:#edf0f5;font:inherit;cursor:pointer}.model-settings button:disabled{opacity:.5;cursor:default}.connection-message{margin-bottom:0}
@media(prefers-reduced-transparency:reduce){.model-settings{background:#1c2024;backdrop-filter:none}}
</style>
