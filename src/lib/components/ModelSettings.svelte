<script lang="ts">
  import {defaultConnection,saveConnection,readProviderConnection,wasAccountConnection,discoverLocalModels,selectedLocalCapabilities,type ModelConnection,type LocalCapabilities,type LocalModelInfo} from '$lib/ai/lm-studio';
  import {providerName,isLocalService,isExternalProvider,type AIProvider} from '../ai/connection-contract';
  import type {FirebaseClient} from '../firebase/client';
  import PersonalKeySettings from './PersonalKeySettings.svelte';
  import type {CredentialStatus} from '../firebase/model-credential';
  let {cloudConnections=null,client=null,purpose='prompts',heading='AI model',regionLabel='AI model connection',saveMessage='',credentialStatus={ready:false,saved:false,error:''},onsavetoken,onforgettoken,connection,scope,disabled=false,connectionOnly=false,initialError='',onchange}:{cloudConnections?:Record<string,ModelConnection>|null;client?:FirebaseClient|null;purpose?:'prompts'|'photos';heading?:string;regionLabel?:string;saveMessage?:string;credentialStatus?:CredentialStatus;onsavetoken?:(connection:ModelConnection)=>Promise<void>;onforgettoken?:()=>Promise<void>;connection:ModelConnection;scope:string;disabled?:boolean;connectionOnly?:boolean;initialError?:string;onchange:(connection:ModelConnection)=>Promise<void>}=$props();
  const field=$props.id();
  let draft=$state<ModelConnection>(defaultConnection()),busy=$state(false),message=$state(''),failed=$state(false),capabilities=$state<LocalCapabilities|null>(null);
  let models=$state<LocalModelInfo[]>([]),manualModel=$state(false),discoveredFor=$state('');
  const connectionKey=(value:ModelConnection)=>JSON.stringify([scope,value.provider,value.baseUrl,value.token]);
  const showPicker=$derived(!manualModel&&discoveredFor===connectionKey(draft)&&models.length>0&&(models.length>1||!models.some(item=>item.id===draft.model)));
  $effect(()=>{draft={...connection};capabilities=null;models=[];discoveredFor='';manualModel=false;});
  $effect(()=>{if(initialError){message=initialError;failed=true;}});
  async function testConnection() {
    busy=true;message='';failed=false;
    models=[];discoveredFor='';manualModel=false;
    const captured=$state.snapshot(draft),key=connectionKey(captured),capturedScope=scope;
    try {
      const discovered=await discoverLocalModels(captured);
      if(scope!==capturedScope||connectionKey(draft)!==key) return;
      models=discovered;discoveredFor=key;
      describeModel();
    }
    catch(error){if(scope===capturedScope&&connectionKey(draft)===key){failed=true;capabilities=null;message=error instanceof Error?error.message:'Could not connect to LM Studio.';}}
    finally{busy=false;}
  }
  function describeModel(){
    try{capabilities=selectedLocalCapabilities(models,draft.model,providerName(draft.provider));failed=false;message=`Connected to ${providerName(draft.provider)}. ${capabilities.loaded?'Model loaded.':'Model available; the first request may load it.'} ${capabilities.vision?'Photo summaries supported.':'Text prompts only.'}${capabilities.contextLength?` Loaded context: ${capabilities.contextLength.toLocaleString('en-AU')} tokens.`:''}`;}
    catch(error){failed=true;capabilities=null;message=error instanceof Error?error.message:'Choose an available model.';}
  }
  async function rememberToken(){
    busy=true;failed=false;message='';
    try{if(!onsavetoken)throw new Error('Account token sync is unavailable.');await onsavetoken($state.snapshot(draft));message=draft.provider==='lm-studio'?'Token and server connection saved to your account.':'Service, server, model and optional proxy token saved to your account.';}
    catch{failed=true;message='Could not save the account token. Use HTTPS (or localhost), enter a token and check your connection.';}
    finally{busy=false;}
  }
  async function forgetToken(){
    busy=true;failed=false;message='';
    try{if(!onforgettoken)throw new Error('Account token sync is unavailable.');await onforgettoken();message=draft.provider==='lm-studio'?'Saved token forgotten. Connected devices clear it when they sync. Revoke it in LM Studio to disable it everywhere.':'Account connection sync stopped. Revoke any token at its proxy to disable copies on offline devices.';}
    catch{failed=true;message='Could not forget the saved token. Reconnect and try again.';}
    finally{busy=false;}
  }
  async function save() {
    busy=true;message='';failed=false;
    try {const input=draft.provider==='gemini'?{...connection,provider:'gemini' as const}:$state.snapshot(draft);const keepRemembered=credentialStatus.saved&&!!onsavetoken&&isLocalService(input.provider)&&input.baseUrl===connection.baseUrl&&input.token===connection.token&&wasAccountConnection(scope);const saved=saveConnection(scope,input);await onchange(saved);if(keepRemembered)await onsavetoken!(saved);failed=false;message=saveMessage||(connectionOnly?'Local connection saved on this device.':'Provider saved to your account; connection settings saved on this device.');}
    catch(error){failed=true;message=error instanceof Error?error.message:'Could not save model settings on this device.';}
    finally{busy=false;}
  }
</script>
<section class="glass model-settings" aria-label={regionLabel} aria-busy={busy}>
  <h2>{heading}</h2>
  <p class="hint">Current provider: {providerName(connection.provider)}. {connection.provider==='personal-gemini'?'This private cloud connection follows your account without restoring the key to your browser.':'Provider choice syncs across devices. The connection stays on this device unless you choose account token sync.'}</p>
  {#if !connectionOnly}<label for={`${field}-model-provider`}>AI provider</label>
  <select id={`${field}-model-provider`} bind:value={draft.provider} disabled={disabled||busy} onchange={()=>{message='';capabilities=null;models=[];discoveredFor='';const provider=draft.provider;draft=readProviderConnection(scope,provider);}}>
    <option value="gemini">Gemini</option><option value="lm-studio">LM Studio · local model</option><option value="ollama">Ollama · local model</option><option value="openai-compatible">Verified compatible local server</option><option value="personal-gemini">My Gemini API key</option>
  </select>{/if}
  {#if isLocalService(draft.provider)}
    <label for={`${field}-local-server`}>{draft.provider==='lm-studio'?'LM Studio server URL':'Server address'}</label>
    <input id={`${field}-local-server`} type="url" bind:value={draft.baseUrl} oninput={()=>{draft.token='';capabilities=null;models=[];message='';}} disabled={disabled||busy} placeholder="http://127.0.0.1:8080" autocomplete="off" />
    <p class="hint">Use your computer’s reachable HTTPS or LAN address to access your local model on other devices.</p>
    {#if draft.provider!=='lm-studio'}<p class="hint">{draft.provider==='ollama'?'Allow this app’s origin in OLLAMA_ORIGINS. Native Ollama does not authenticate a placeholder API key; optional tokens must be enforced by your proxy. Cloud-routed models are not supported here.':'This text-only adapter requires models to declare completion: true and thinking: false in their capabilities metadata. Unknown capabilities are unavailable; it does not promise support for every chat server.'}</p>{:else}<p class="hint">Enable CORS in LM Studio. An HTTPS address works across browsers and devices; Tailscale Serve can forward it to this computer’s local server.</p>{/if}
    <label for={`${field}-local-model`}>Model API identifier</label>
    {#if showPicker}
      <select id={`${field}-local-model`} value={draft.model} disabled={disabled||busy} onchange={(event)=>{const id=event.currentTarget.value;if(!id){manualModel=true;message='';capabilities=null;}else{draft.model=id;describeModel();}}}>
        {#if !models.some(item=>item.id===draft.model)}<option value={draft.model} disabled>{draft.model?draft.model+' · not available':'Choose a model…'}</option>{/if}
        {#each models as model (model.id)}<option value={model.id} disabled={!!model.error}>{model.id} · {model.error?'thinking off unavailable':model.loaded?'loaded':'available'}</option>{/each}
        <option value="">Enter an identifier manually…</option>
      </select>
    {:else}
      <input id={`${field}-local-model`} bind:value={draft.model} oninput={()=>{capabilities=null;message='';}} disabled={disabled||busy} autocomplete="off" spellcheck="false" />
    {/if}
    <label for={`${field}-local-token`}>{draft.provider==='lm-studio'?'LM Studio API token':'Proxy authentication token (optional)'}</label>
    <input id={`${field}-local-token`} type="password" bind:value={draft.token} oninput={()=>{models=[];capabilities=null;message='';}} disabled={disabled||busy} autocomplete="off" />
    <details class="token-sync"><summary>Account token sync</summary>
      <p class="hint">By default, the token is saved in this browser tab. Account token sync can make it available in other tabs and on your other devices, together with its server address and model.</p>
      <p class="hint">{draft.provider==='lm-studio'?'Use a dedicated token with MCP permissions denied.':'Use a dedicated inference-only proxy token if your proxy requires authentication. Native Ollama has no API token to revoke.'} Firebase project administrators and this app can access the token. It stays out of journal events and exports.</p>
      <p class="hint">{credentialStatus.saved?'A connection is saved to your account.':'No account connection loaded.'} {draft.provider==='lm-studio'?'Forgetting removes the saved copy for online devices; revoke the token in LM Studio to disable copies on offline devices.':'Stopping sync removes the account copy. Other devices can retain their private server settings; revoke optional tokens at your proxy to disable them everywhere.'}</p>
      <button class="outline" type="button" onclick={rememberToken} disabled={disabled||busy||!credentialStatus.ready||(draft.provider==='lm-studio'&&!draft.token)||!onsavetoken}>{draft.provider==='lm-studio'?'Remember token in my account':'Remember connection in my account'}</button>
      {#if credentialStatus.saved}<button class="outline" type="button" onclick={forgetToken} disabled={disabled||busy}>{draft.provider==='lm-studio'?'Forget saved token':'Stop account connection sync'}</button>{/if}
      {#if credentialStatus.error}<p class="hint" role="status">{credentialStatus.error}</p>{/if}
    </details>
    <p class="hint">Model thinking is off. Your saved journal and attachments sync through Firebase and photos only go to this server when you choose to summarize them.</p>
    {#if purpose==='photos'}<p class="hint">Choose a vision-capable model for photo descriptions. No journal text or prompt context is sent.</p>{/if}
    <button class="outline" type="button" onclick={testConnection} disabled={disabled||busy}>{busy?'Checking connection…':'Test connection'}</button>
  {:else if draft.provider==='personal-gemini'}
    <PersonalKeySettings {client} connection={draft.connectionId&&cloudConnections?(cloudConnections[draft.connectionId]??{...draft,connectionId:undefined,connectionRevision:undefined}):draft} disabled={disabled||busy} onchange={async saved=>{await onchange(saved);draft=saved;}} />
  {:else}
    <p class="hint">Gemini uses this site’s managed Firebase AI connection.</p>
  {/if}
  {#if draft.provider!=='personal-gemini'}<button class="outline" type="button" onclick={save} disabled={disabled||busy||!scope||((draft.provider==='ollama'||draft.provider==='openai-compatible')&&!capabilities)}>Save model settings</button>{/if}
  {#if message}<p class="hint connection-message" role={failed?'alert':'status'}>{message}</p>{/if}
</section>
<style>
  .model-settings{box-sizing:border-box;margin:24px 0;padding:22px;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid var(--glass-border);border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px)}.model-settings h2{margin:0 0 .7rem;font-family:Georgia,serif;font-size:1.35rem;font-weight:500}.model-settings label{display:block;color:#d8dce2;margin-top:.9rem;margin-bottom:.35rem;font-size:.95rem}.model-settings input,.model-settings select{box-sizing:border-box;display:block;width:100%;min-height:44px;border:1px solid var(--glass-border);background:#0d1117a6;border-radius:12px;padding:.65rem .75rem;color:#f3f4f7;font:inherit}.model-settings input:focus-visible,.model-settings select:focus-visible{outline:1px solid var(--glass-border);outline-offset:2px}.token-sync{margin:.8rem 0}.token-sync summary{cursor:pointer;color:#d4d9e1;font-size:.9rem}.hint{color:#aab2be;font-size:.85rem;line-height:1.5}.model-settings button{margin-top:.4rem;margin-right:.4rem;border:1px solid var(--action-border);border-radius:12px;padding:.6rem .85rem;background:#11151b80;color:#edf0f5;font:inherit;cursor:pointer}.model-settings button:disabled{opacity:.5;cursor:default}.connection-message{margin-bottom:0}
@media(prefers-reduced-transparency:reduce){.model-settings{background:#1c2024;backdrop-filter:none}}
</style>
