<script lang="ts">
 import ReviewPhotos from './ReviewPhotos.svelte';
 import type {FirebaseClient} from '../firebase/client';
 import {tick} from 'svelte';
 import type {JournalView,JournalStore} from '../firebase/repository';
 import {currentTarget,targetTopic,targetAvailable,type ClassificationTarget} from '../classification';
 import {topicChoices,topicLabel} from '../reflection-topics';
 import {cardDateTime,entryTimestamp,entryColour} from '../journal';
 import ReflectionText from './ReflectionText.svelte';
 let {view,repository,target,client,uid}:{client?:FirebaseClient|null;uid?:string;view:JournalView;repository:JournalStore;target:Pick<ClassificationTarget,'kind'|'id'>}=$props();
 let overflowing=$state(false);
 let content=$state<HTMLDivElement>();
 $effect(()=>{const node=content;const text=question;const body=entry?.text;if(!node||expanded)return;const measure=()=>{overflowing=Array.from(node.querySelectorAll('.collapsed')).some(e=>e.scrollHeight>e.clientHeight);};const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect();});
 let root:HTMLElement,input=$state<HTMLInputElement>();
 let open=$state(false),busy=$state(false),expanded=$state(false),search=$state(''),error=$state(''),saved=$state(false),active=$state(0);
 let snapshot:{target:ClassificationTarget;answersId:string|null;previousEventId:string|null}|null=null;
 let options=$state<{id:string;label:string}[]>([]);
 const id=$props.id();
 const entry=$derived(view.state.entries.find(e=>e.id===target.id));
 const topic=$derived(targetTopic(view.state,target));
 const question=$derived(target.kind==='reflection'?entry?.prompt:view.state.backups[target.id]?.text);
 const available=$derived(targetAvailable(view.state,currentTarget(view.state,target.kind,target.id))&&!(target.kind==='backup'&&view.backupRemoved?.includes(target.id)));
 const filtered=$derived(options.filter(o=>o.label.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())));
 const label=$derived(topicLabel(topic,view.state.onboarding.answers));
 async function begin(){if(busy||!available)return;snapshot={target:currentTarget(view.state,target.kind,target.id),answersId:view.state.onboarding.answersId,previousEventId:view.state.classification.lastEventId};options=topicChoices(view.state.onboarding.answers);search='';error='';active=Math.max(0,options.findIndex(o=>o.id===topic?.topicId));open=true;await tick();input?.focus();root.querySelector(`#${id}-${active}`)?.scrollIntoView({block:'nearest'});}
 function close(){if(!busy)open=false;}
 function outside(e:Event){if(root&&!root.contains(e.target as Node))close();}
 async function choose(topicId:string){
  if(!snapshot||busy)return;
  if(topicId===topic?.topicId){close();return;}
  busy=true;error='';
  try{
   if(!available)throw new Error('This item is no longer available for review.');
   if(target.kind==='reflection')await repository.commitAI({eventId:crypto.randomUUID(),type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:target.id,expectedRevision:snapshot.target.revision,previousEventId:snapshot.target.previousTopicId,answersId:snapshot.answersId,topicId}});
   else await repository.commitAI({eventId:crypto.randomUUID(),type:'BackupTopicChosen',schemaVersion:1,payload:{previousEventId:snapshot.previousEventId,target:snapshot.target,answersId:snapshot.answersId,topicId}});
   saved=true;open=false;
  }catch(cause){error=cause instanceof Error?cause.message:'Could not save. Reconnect and retry this choice. Close and reopen to use any newer changes.';}
  finally{busy=false;}
 }
 async function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();close();await tick();root.querySelector<HTMLButtonElement>('.trigger')?.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,Math.min(filtered.length-1,active+(e.key==='ArrowDown'?1:-1)));await tick();root.querySelector(`#${id}-${active}`)?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();if(filtered[active])await choose(filtered[active].id);}}
</script>
<svelte:window onpointerdown={outside} onfocusin={outside}/>
<article bind:this={root} class="review-card" class:picker-open={open} style:--entry-colour={target.kind==='reflection'&&entry?entryColour(entry):'var(--accent-text)'} aria-label={target.kind==='reflection'?'Review reflection':'Review backup prompt'}>
 <div class="content" bind:this={content}>
 {#if target.kind==='reflection'&&entry}<time datetime={entryTimestamp(entry)}>{cardDateTime(entryTimestamp(entry))}</time>{/if}
 <h2>Prompt</h2><p class="prompt" class:collapsed={!expanded}>{question}</p>
 {#if target.kind==='reflection'&&entry}<h2>Reflection</h2><div class="reflection" class:collapsed={!expanded}><ReflectionText text={entry.text}/></div>{/if}
 {#if overflowing||expanded}<button class="expand" onclick={()=>expanded=!expanded}>{expanded?'(see less)':'(see more)'}</button>{/if}
 {#if target.kind==='reflection'&&entry}<ReviewPhotos state={view.state} entryId={entry.id} {client} {uid}/>{/if}
 </div>
 <div class="topic"><button class="trigger" aria-label={`Change ${target.kind==='reflection'?'reflection':'backup'} topic`} aria-haspopup="listbox" aria-expanded={open} onclick={begin} disabled={busy||!view.ready||!available}>{label} ⌄</button>
 {#if saved}<small role="status">Saved</small>{/if}
 {#if !available}<small>Item no longer available</small>{/if}
 {#if open}<div class="picker"><input bind:this={input} role="combobox" aria-label="Search topics" aria-expanded="true" aria-controls={`${id}-options`} aria-activedescendant={filtered[active]?`${id}-${active}`:undefined} aria-autocomplete="list" placeholder="Search topics" bind:value={search} oninput={()=>active=0} onkeydown={key} disabled={busy}/><div role="listbox" aria-label="Topics" id={`${id}-options`} class="options">{#each filtered as option,i}<button role="option" id={`${id}-${i}`} aria-selected={option.id===topic?.topicId} tabindex="-1" class:active={active===i} onclick={()=>choose(option.id)} disabled={busy}>{option.label}{option.id===topic?.topicId?' ✓':''}</button>{:else}<p>No matching topics</p>{/each}</div><button class="expand" onclick={close} disabled={busy}>Cancel</button>{#if error}<p role="alert">{error}</p>{/if}</div>{/if}
 </div>
 {#if busy}<p role="status">Saving topic…</p>{/if}
</article>
<style>
 .review-card{position:relative;display:flex;gap:12px;align-items:center;padding:16px;border:1px solid color-mix(in srgb,var(--entry-colour) 48%,transparent);border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--entry-colour) 15%,#191d1f),#191d1fe8 65%,color-mix(in srgb,var(--entry-colour) 8%,#191d1f));color:#e2e6ed}.picker-open{z-index:2}.content{min-width:0;flex:1}time{display:block;color:#b6beca;font-size:.72rem;margin-bottom:10px}h2{font:bold .9rem/1.4 Arial,Helvetica,sans-serif;margin:0 0 5px;color:color-mix(in srgb,var(--entry-colour) 55%,#fff)}.prompt{margin:0 0 12px;font:italic .85rem/1.5 Arial,Helvetica,sans-serif;color:color-mix(in srgb,var(--entry-colour) 70%,#fff);overflow-wrap:anywhere}.reflection{font-size:.82rem;line-height:1.5;overflow-wrap:anywhere}.collapsed{display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.topic{width:112px;flex-shrink:0;text-align:right}button,input{font:inherit;color:inherit;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.trigger{width:100%;min-height:44px;padding:8px;border:1px solid color-mix(in srgb,var(--entry-colour) 55%,transparent);border-radius:10px;background:color-mix(in srgb,var(--entry-colour) 8%,#11151b);font-size:.78rem;overflow-wrap:anywhere}.expand{display:block;margin:7px 0 0;padding:5px 0;border:0;background:transparent;color:#c4cbd5;font-size:.75rem;min-height:30px}small{display:block;font-size:.72rem;color:#b6beca;margin-top:6px}.picker{position:absolute;right:12px;top:calc(50% + 26px);width:min(280px,calc(100% - 24px));border:1px solid var(--action-border);border-radius:12px;background:#15191ff5;box-shadow:0 8px 24px #0008;padding:8px;text-align:left;z-index:3}.picker input{width:100%;min-height:44px;padding:8px;border:1px solid #ffffff30;border-radius:8px;background:#ffffff08}.options{max-height:220px;overflow-y:auto;margin-top:5px}.options button{width:100%;display:block;min-height:44px;text-align:left;border:0;border-radius:6px;background:transparent;padding:8px;font-size:.82rem}.options button.active,.options button:hover{background:color-mix(in srgb,var(--entry-colour) 15%,transparent)}.picker p{font-size:.8rem;line-height:1.5}.picker [role=alert]{color:#f6b3bf}button:focus-visible,input:focus-visible{outline:2px solid #bfc5ce;outline-offset:2px}
</style>
