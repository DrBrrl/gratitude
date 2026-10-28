<script lang="ts">
 let {prompts,onuse,onremove,disabled=false}:{prompts:{id:string;text:string}[];onuse:(id:string)=>Promise<void>;onremove:(id:string)=>Promise<void>;disabled?:boolean}=$props();
 let open=$state(false),index=$state(0),confirm=$state(false),message=$state('');
 const current=$derived(prompts.length?prompts[index%prompts.length]:undefined);
 async function use(){if(!current)return;try{await onuse(current.id);open=false;message='';}catch{message='Could not keep this choice on your device. Please try again.';}}
 async function remove(){if(!current)return;try{await onremove(current.id);confirm=false;}catch{message='Could not save this removal. Please try again.';}}
</script>
{#if prompts.length||open}
<div class="backup-picker"><button class="outline card-action" onclick={()=>{open=!open;confirm=false;}} {disabled} aria-expanded={open}>Choose a backup prompt ({prompts.length})</button>
{#if open}<aside class="glass" aria-label="Saved backup prompts">
 {#if current}<p class="hint">Personalised backup · no AI request</p><p class="question">{current.text}</p><div class="actions"><button class="outline card-action" onclick={use} {disabled}>Use this backup</button><button class="outline card-action" onclick={()=>{index=(index+1)%prompts.length;confirm=false;}} disabled={disabled||prompts.length<2}>Show another</button></div>
 {#if confirm}<p class="hint">Remove this prompt from your backups? Saved reflections keep their original question.</p><button class="outline card-action" onclick={remove} {disabled}>Remove permanently</button><button class="text-button" onclick={()=>confirm=false}>Keep it</button>{:else}<button class="text-button" onclick={()=>confirm=true} {disabled}>I won’t use this prompt</button>{/if}
 {:else}<p>No unused backups remain. Reconnect to refill or import more in AI settings.</p>{/if}
 {#if message}<p role="status">{message}</p>{/if}
</aside>{/if}</div>
{/if}
<style>
.glass{box-sizing:border-box;padding:22px;margin:24px 0;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid #c2c7ca65;border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px);transform:translateZ(0)}button{border:1px solid #d9c44777;border-radius:12px;padding:.55rem .7rem;background:#11151b80;color:#edf0f5;font:inherit;font-size:.85rem;cursor:pointer;min-height:44px}button:disabled{opacity:.5;cursor:default}.text-button{border-color:transparent;background:transparent;color:#ffdf48}
@media(prefers-reduced-transparency:reduce){.glass{background:#1c2024;backdrop-filter:none}}

.backup-picker{margin:12px 0}.backup-picker>button{width:100%}aside{padding:16px;margin-top:10px}.question{font-style:italic;line-height:1.6;color:#e2dcae}.actions{display:flex;gap:12px}.actions button{flex:1}.hint{color:#abb4c2;font-size:.78rem;line-height:1.6}
</style>
