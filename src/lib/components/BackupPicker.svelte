<script lang="ts">
 let {prompts,onoffer,onuse,onremove,disabled=false,compact=false}:{compact?:boolean;prompts:{id:string;text:string}[];onoffer:()=>Promise<{id:string;text:string}|null>;onuse:(id:string)=>Promise<void>;onremove:(id:string)=>Promise<void>;disabled?:boolean}=$props();
 let applying=$state(false);
 const locked=$derived(disabled||applying);
 let open=$state(false),confirm=$state(false),message=$state('');
 let current=$state<{id:string;text:string}|null>(null);
 async function another(){if(locked)return;applying=true;confirm=false;message='';try{current=await onoffer();}catch{message='Could not save this offer on your device. Please try again.';}finally{applying=false;}}
 async function toggle(){if(locked)return;open=!open;confirm=false;if(open)await another();}
 async function use(){if(!current||locked)return;const id=current.id;applying=true;try{await onuse(id);open=false;message='';}catch{message='Could not keep this choice on your device. Please try again.';}finally{applying=false;}}
 async function remove(){if(!current||locked)return;const id=current.id;confirm=false;applying=true;try{await onremove(id);current=await onoffer();}catch{message='Could not save this removal. Please try again.';}finally{applying=false;}}
</script>
{#if prompts.length||open}
<div class="backup-picker" class:compact><button class="outline card-action" onclick={toggle} disabled={locked} aria-expanded={open}>Choose a backup prompt ({prompts.length})</button>
{#if open}<aside class="glass" aria-label="Saved backup prompts">
 {#if current}<p class="hint">Personalised backup · no AI request</p><p class="question">{current.text}</p><div class="actions"><button class="outline card-action" onclick={use} disabled={locked}>Use this backup</button><button class="outline card-action" onclick={another} disabled={locked}>Show another</button></div>
 {#if confirm}<p class="hint">Remove this prompt from your backups? Saved reflections keep their original question.</p><button class="outline card-action" onclick={remove} disabled={locked}>Remove permanently</button><button class="text-button" onclick={()=>confirm=false} disabled={locked}>Keep it</button>{:else}<button class="text-button" onclick={()=>confirm=true} disabled={locked}>I won’t use this prompt</button>{/if}
 {:else}<p>No unseen backups remain today. Try again tomorrow, or add more in AI settings.</p>{/if}
 {#if message}<p role="status">{message}</p>{/if}
</aside>{/if}</div>
{/if}
<style>
.glass{box-sizing:border-box;padding:22px;margin:24px 0;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid var(--glass-border);border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px);transform:translateZ(0)}button{border:1px solid var(--action-border);border-radius:12px;padding:.55rem .7rem;background:#11151b80;color:#edf0f5;font:inherit;font-size:.85rem;cursor:pointer;min-height:44px}button:disabled{opacity:.5;cursor:default}.text-button{border-color:transparent;background:transparent;color:var(--accent-text)}
@media(prefers-reduced-transparency:reduce){.glass{background:#1c2024;backdrop-filter:none}}

.backup-picker.compact{display:contents}.compact>button{font-size:.75rem;padding:8px 5px;min-height:44px;border-radius:10px}.compact>aside{grid-column:1/-1;margin:0}
.backup-picker{margin:12px 0}.backup-picker>button{width:100%}aside{padding:16px;margin-top:10px}.question{font-style:italic;line-height:1.6;color:var(--accent-soft)}.actions{display:flex;gap:12px}.actions button{flex:1}.hint{color:#abb4c2;font-size:.78rem;line-height:1.6}
</style>
