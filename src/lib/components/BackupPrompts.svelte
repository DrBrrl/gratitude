<script lang="ts">
  import type {JournalStore,JournalView} from '../firebase/repository';
  import {availableBackups,readPromptWorkbook,importedBackup,BACKUP_MINIMUM} from '../backup-prompts';
  let {view,repository,email,disabled=false,onconfigure}:{view:JournalView;repository:JournalStore;email:string;disabled?:boolean;onconfigure:(enabled:boolean,provider:'gemini'|'lm-studio')=>Promise<void>}=$props();
  let enabled=$state(false),provider=$state<'gemini'|'lm-studio'>('lm-studio');
  let editing=$state(false),busy=$state(false),message=$state(''),selected=$state<string[]>([]);
  const available=$derived(availableBackups(view.state,view.backupRemoved));
  async function choose(event:Event){message='';selected=[];const file=(event.currentTarget as HTMLInputElement).files?.[0];if(!file)return;try{selected=readPromptWorkbook(new Uint8Array(await file.arrayBuffer()));}catch(cause){message=cause instanceof Error?cause.message:'Could not read this workbook.';}}
  async function confirmImport(){if(!navigator.onLine){message='Connect to import prompts into your account. Your selected workbook stays here.';return;}busy=true;message='';try{let added=0;for(const text of selected){const action=await importedBackup(text);if(!view.state.backups[action.eventId]){await repository.queueBackup(action);added++;}}selected=[];message=`${added} prompts imported. Previously imported prompts are kept unchanged.`;}catch(cause){message=cause instanceof Error?cause.message:'Import paused. Reselect the workbook to continue safely.';}finally{busy=false;}}
  async function configure(){busy=true;message='';try{await onconfigure(enabled,provider);editing=false;message='Backup preferences saved.';}catch(cause){message=cause instanceof Error?cause.message:'Could not save backup preferences.';}finally{busy=false;}}
</script>
<section class="glass backup-settings" aria-label="Backup prompts">
  <h2>Backup prompts</h2>
  <p>{available.length} personalised {available.length===1?'prompt':'prompts'} ready on this device.</p>
  <p class="hint">Choose a saved prompt on Today or in your reflection, with no wait for AI. Saving a reflection uses that prompt; skipping keeps it available. Removed prompts stay out of the reserve.</p>
  <p class="hint">Refill: {view.state.ai.choices.backupEnabled?'automatic with '+(view.state.ai.choices.backupProvider==='lm-studio'?'LM Studio':'Gemini'):'off'}.</p>
  {#if !editing}<button class="outline" onclick={()=>{enabled=view.state.ai.choices.backupEnabled??false;provider=view.state.ai.choices.backupProvider??'lm-studio';editing=true;}} disabled={disabled||busy}>Backup preferences</button>
  {:else}
    <label class="choice"><input type="checkbox" bind:checked={enabled} />Automatically refill below {BACKUP_MINIMUM}</label>
    <label class="choice" for="backup-provider">Generate backups with</label><select id="backup-provider" bind:value={provider}><option value="lm-studio">Local LLM · LM Studio</option><option value="gemini">Cloud LLM · Gemini</option></select>
    <p class="hint">While Gratitude is open and connected, generate one prompt at a time using your saved sharing choices and the same rules as an ordinary prompt. Cloud refills are paced. No automatic fallback to another provider. Local credentials stay on this device.</p>
    <button class="outline" onclick={configure} disabled={busy||disabled}>Save backup preferences</button><button class="text-button" onclick={()=>editing=false}>Cancel</button>
  {/if}
  {#if view.backupStatus}<p class="hint" role="status">{view.backupStatus}</p>{/if}
  <details><summary>Import backup prompts</summary><p class="hint">Choose a single-column XLSX with an optional “Prompt” header. All prompts stay in your private account; imports may exceed {BACKUP_MINIMUM}. Reimporting the same file adds no duplicates.</p><label for="backup-workbook">Prompt spreadsheet (.xlsx)</label><input id="backup-workbook" type="file" accept=".xlsx" onchange={choose} disabled={disabled||busy} />
  {#if selected.length}<p>Import {selected.length} prompts into {email}?</p><button class="outline" onclick={confirmImport} disabled={busy||disabled}>{busy?'Importing…':'Confirm prompt import'}</button><button class="text-button" onclick={()=>selected=[]} disabled={busy}>Cancel import</button>{/if}</details>
  {#if message}<p class="hint" role="status">{message}</p>{/if}
</section>
<style>
.glass{box-sizing:border-box;padding:22px;margin:24px 0;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid #c2c7ca65;border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px);transform:translateZ(0)}h2{margin:0 0 .7rem;font:500 1.35rem Georgia,serif}button{border:1px solid #d9c44777;border-radius:12px;padding:.55rem .7rem;background:#11151b80;color:#edf0f5;font:inherit;font-size:.85rem;cursor:pointer;min-height:44px}button:disabled{opacity:.5;cursor:default}.text-button{border-color:transparent;background:transparent;color:#ffdf48}
@media(prefers-reduced-transparency:reduce){.glass{background:#1c2024;backdrop-filter:none}}

.backup-settings{margin-top:22px}.choice{display:flex;align-items:center;gap:10px;margin:14px 0}select{width:100%;padding:10px;border:1px solid #ffdf4850;border-radius:10px;background:#14181e;color:#eef0f5}details{margin-top:20px}summary{cursor:pointer;color:#ffdf48}input[type=file]{display:block;width:100%;margin:12px 0;font-size:.8rem}button{margin:8px 0}.hint{font-size:.8rem;color:#b6beca;line-height:1.6}
</style>
