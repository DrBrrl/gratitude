<script lang="ts">
  import { tick } from 'svelte';
  import type { Entry, Projection } from '../domain';
  import { topicChoices, topicLabel, type TopicAction } from '../reflection-topics';
  import Icon from './Icon.svelte';
  let { entry, journal, disabled=false, onchoose, onedit }: {
    entry: Entry; journal: Projection; disabled?:boolean;
    onchoose:(action:TopicAction)=>Promise<unknown>; onedit:()=>void;
  }=$props();
  let root:HTMLDivElement;
  let input=$state<HTMLInputElement>();
  let open=$state(false), saving=$state(false), error=$state(''), search=$state(''), active=$state(0);
  let snapshot=$state<{revision:number;previousEventId:string|null;answersId:string|null;topicId:string|null}|null>(null);
  let choices=$state<{id:string|null;label:string}[]>([]);
  const label=$derived(topicLabel(journal.topics[entry.id],journal.onboarding.answers));
  const filtered=$derived(choices.filter(option=>option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())));
  const listId=$derived(`topic-options-${entry.id}`);
  async function begin() {
    if(disabled||saving)return;
    snapshot={revision:entry.revision,previousEventId:journal.topics[entry.id]?.lastEventId??null,answersId:journal.onboarding.answersId,topicId:journal.topics[entry.id]?.topicId??null};
    choices=[{id:null,label:'Not yet classified'},...topicChoices(journal.onboarding.answers)];
    if(snapshot.topicId&&!choices.some(option=>option.id===snapshot!.topicId))choices.push({id:snapshot.topicId,label});
    search='';error='';active=Math.max(0,choices.findIndex(option=>option.id===snapshot!.topicId));open=true;
    await tick();input?.focus();scrollActive();
  }
  function close(){if(!saving){open=false;search='';}}
  function outside(event:Event){if(root&&!root.contains(event.target as Node))close();}
  function scrollActive(){root?.querySelector(`#${listId}-${active}`)?.scrollIntoView({block:'nearest'});}
  async function choose(topicId:string|null) {
    if(!snapshot||saving||disabled)return;
    if(topicId===snapshot.topicId){close();return;}
    saving=true;error='';
    try {
      await onchoose({eventId:crypto.randomUUID(),type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:entry.id,expectedRevision:snapshot.revision,previousEventId:snapshot.previousEventId,answersId:snapshot.answersId,topicId}});
      open=false;
    } catch(cause){error=cause instanceof Error?cause.message:'Topic could not be saved. Please retry.';}
    finally{saving=false;}
  }
  async function key(event:KeyboardEvent) {
    if(event.key==='Escape'){event.preventDefault();close();await tick();root.querySelector<HTMLButtonElement>('.pencil')?.focus();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=Math.max(0,Math.min(filtered.length-1,active+(event.key==='ArrowDown'?1:-1)));await tick();scrollActive();}
    if(event.key==='Enter'){event.preventDefault();if(filtered[active])await choose(filtered[active].id);}
  }
</script>
<svelte:window onpointerdown={outside} onfocusin={outside}/>
<div class="entry-footer" bind:this={root}>
  <button class="card-action card-button edit-reflection" onclick={onedit} disabled={disabled||saving}><Icon name="edit" size={16}/>Edit reflection</button>
  <div class="topic-control">
    {#if open}
      <div class="picker">
        <input bind:this={input} role="combobox" aria-label="Reflection topic" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={filtered[active]?`${listId}-${active}`:undefined} placeholder="Search topics" value={search} oninput={event=>{search=event.currentTarget.value;active=0;}} onkeydown={key} disabled={saving}/>
        <div class="options" role="listbox" aria-label="Reflection topics" id={listId}>
          {#each filtered as option,i}
            <button type="button" role="option" id={`${listId}-${i}`} tabindex="-1" aria-selected={option.id===snapshot?.topicId} class:active={i===active} onclick={()=>choose(option.id)} disabled={saving}>{option.label}{option.id===snapshot?.topicId?' ✓':''}</button>
          {/each}
          {#if !filtered.length}<p>No matching topics</p>{/if}
        </div>
        <button class="cancel" type="button" onclick={close} disabled={saving}>Cancel</button>
      </div>
    {:else}
      <strong class="topic-label">{label}</strong>
      <button class="card-action card-button pencil" aria-label="Change reflection topic" onclick={begin} disabled={disabled||saving}><Icon name="edit" size={15}/></button>
    {/if}
  </div>
  {#if saving}<p class="status" role="status">Saving topic…</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>
<style>
  .entry-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;font:400 .78rem/1.4 Arial,Helvetica,sans-serif}
  button,input{font:inherit}button{cursor:pointer;color:inherit}button:disabled{opacity:.5;cursor:default}
  .card-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(120deg,color-mix(in srgb,var(--entry-colour) 12%,transparent),transparent,color-mix(in srgb,var(--entry-colour) 8%,transparent));min-height:30px;padding:4px 9px;color:color-mix(in srgb,var(--entry-colour) 54%,#fff)}
  .edit-reflection{flex-shrink:0}.topic-control{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:7px;max-width:100%;min-width:0}.topic-label{font-size:.8rem;text-align:right;color:color-mix(in srgb,var(--entry-colour) 54%,#fff);overflow-wrap:anywhere}.pencil{padding:4px;min-width:30px;flex-shrink:0}
  .picker{width:min(260px,100%);border:1px solid color-mix(in srgb,var(--entry-colour) 55%,transparent);border-radius:10px;background:#15191fee;padding:8px;box-sizing:border-box;color:#e2e6ed}
  input{box-sizing:border-box;width:100%;min-height:36px;border:1px solid #ffffff30;border-radius:6px;background:#ffffff08;color:inherit;padding:7px;outline:none}.options{max-height:190px;overflow-y:auto;margin-top:6px}.options button{display:block;width:100%;background:transparent;border:0;border-radius:5px;padding:9px 6px;text-align:left}.options button.active,.options button:hover{background:color-mix(in srgb,var(--entry-colour) 15%,transparent)}.options button[aria-selected=true]{font-weight:bold}.cancel{display:block;margin:6px 0 0 auto;background:transparent;border:0;padding:5px;color:#bfc5ce}.options p{font-size:.8rem;margin:8px}.status,.error{width:100%;text-align:right;margin:0}.error{color:#f6b3bf}.status{color:#bbc4d2}
  button:focus-visible,input:focus-visible{outline:2px solid #bfc5ce;outline-offset:2px}
</style>
