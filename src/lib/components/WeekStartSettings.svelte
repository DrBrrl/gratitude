<script lang="ts">
  import {untrack} from 'svelte';
  import WeekStartPicker from './WeekStartPicker.svelte';
  let {current,onchoose,disabled=false}:{current:number;onchoose:(day:number)=>Promise<void>;disabled?:boolean}=$props();
  let value=$state(untrack(()=>current)),saving=$state(false),message=$state('');
  $effect(()=>{const latest=current;untrack(()=>{if(!saving)value=latest;});});
  async function save(){saving=true;message='';try{await onchoose(value);message='Your week start is saved.';}catch(cause){message=cause instanceof Error?cause.message:'Could not save your week start. Try again.';}finally{saving=false;}}
</script>
<section class="week-settings" aria-label="Calendar preferences" aria-busy={saving}>
  <WeekStartPicker bind:value disabled={disabled||saving}/>
  <button onclick={save} disabled={disabled||saving}>{saving?'Saving…':'Save week start'}</button>
  {#if message}<p role="status">{message}</p>{/if}
</section>
<style>
  .week-settings{margin:20px 0 28px}button{font:inherit;font-size:.9rem;min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid var(--action-border);background:#bac5ce0a;color:#edf0f5;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px}p{font-size:.85rem;color:#d7dce5;line-height:1.5}
</style>
