<script lang="ts">
  import {resolvePrompt,type Projection} from '$lib/domain';
  let {projection,sharing,disabled=false,onupdate}:{projection:Projection;sharing:boolean;disabled?:boolean;onupdate:(eventId:string,promptId:string,text:string)=>Promise<void>}=$props();
  const pairs=$derived(projection.ai.feedback.filter(item=>item.payload.text.trim()).toReversed());
  let editing=$state<string|null>(null),editingEventId=$state(''),text=$state(''),busy=$state(false),message=$state(''),failed=$state(false);
  async function update(eventId:string,promptId:string,value:string) {
    busy=true;message='';failed=false;
    try {await onupdate(eventId,promptId,value);editing=null;message=value.trim()?'Feedback saved.':'Feedback deleted.';}
    catch(cause){failed=true;message=cause instanceof Error?cause.message:'Could not save feedback. Try again.';}
    finally{busy=false;}
  }
</script>
<div class="prompt-feedback" aria-label="Saved prompt feedback">
  <h3>Prompt feedback</h3>
  {#if pairs.length}
    <p class="hint">{sharing?'Feedback sharing is on.':'Feedback sharing is off.'} When sharing is on, your latest 20 saved prompt and feedback pairs can inform new prompts. Edits save immediately. Deleting a pair removes it from future prompts; earlier history remains.</p>
    {#each pairs as item (item.payload.promptId)}
      <article class="feedback-pair" aria-label="Prompt and feedback">
        <h4>Prompt</h4><p class="feedback-prompt">{resolvePrompt(projection,item.payload.promptId)}</p>
        <h4>Feedback</h4>
        {#if editing===item.payload.promptId}
          <label for="settings-prompt-feedback">Your feedback</label>
          <textarea id="settings-prompt-feedback" bind:value={text} maxlength="500" rows="4" disabled={busy||disabled}></textarea>
          <div class="actions"><button onclick={()=>update(editingEventId,item.payload.promptId,text)} disabled={busy||disabled||!text.trim()}>Save feedback</button><button onclick={()=>{editing=null;message='';}} disabled={busy}>Cancel</button></div>
        {:else}
          <p class="feedback-text">{item.payload.text}</p>
          <div class="actions"><button onclick={()=>{editing=item.payload.promptId;editingEventId=item.eventId;text=item.payload.text;message='';}} disabled={busy||disabled||editing!==null}>Edit feedback</button><button onclick={()=>update(item.eventId,item.payload.promptId,'')} disabled={busy||disabled||editing!==null}>Delete feedback</button></div>
        {/if}
      </article>
    {/each}
  {:else}<p class="hint">No prompt feedback saved yet.</p>{/if}
  {#if editing&&!pairs.some(item=>item.payload.promptId===editing)}
    <div class="feedback-pair">
      <p class="hint" role="alert">This feedback was deleted on another device. Your unsaved text is kept here until you cancel.</p>
      <label for="deleted-feedback-draft">Your feedback</label><textarea id="deleted-feedback-draft" bind:value={text} maxlength="500" rows="4"></textarea>
      <div class="actions"><button onclick={()=>{editing=null;message='';}}>Cancel</button></div>
    </div>
  {/if}
  {#if message}<p class="hint" role={failed?'alert':'status'}>{message}</p>{/if}
</div>
<style>
  .prompt-feedback{margin-top:1.5rem;border-top:1px solid #ffffff25;padding-top:1rem}h3{font-size:1.05rem;margin:0 0 .7rem}h4{font-size:.9rem;margin:.7rem 0 .25rem;color:#cdd2dc}.hint{color:#aab2be;font-size:.85rem;line-height:1.5}.feedback-pair{padding:0 0 1rem;margin-top:1rem;border-bottom:1px solid #ffffff20}.feedback-pair:last-of-type{border-bottom:0;padding-bottom:0}.feedback-prompt{font-style:italic;color:#d5d9e1}.feedback-prompt,.feedback-text{font-size:.95rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;margin:.25rem 0 .75rem}label{display:block;font-size:.85rem;color:#aab2be;margin:.4rem 0}textarea{box-sizing:border-box;display:block;width:100%;background:#0d1117a6;border:1px solid #ffffff30;border-radius:12px;color:#f3f4f7;padding:.75rem;font:inherit;resize:vertical}textarea:focus-visible{outline:1px solid #ffffff60;outline-offset:2px}.actions{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:.75rem}button{border:1px solid #d9c44777;border-radius:12px;padding:.4rem .65rem;background:#11151b80;color:#edf0f5;font:inherit;font-size:.85rem;cursor:pointer}button:disabled{opacity:.5;cursor:default}
</style>
