<script lang="ts">
 import type {JournalView,JournalStore} from '../firebase/repository';
 import {unknownTargets} from '../unknown-review';
 import MoreReflections from './MoreReflections.svelte';
 import UnknownReviewCard from './UnknownReviewCard.svelte';
 let {view,repository,kind=$bindable('reflection')}:{view:JournalView;repository:JournalStore;kind?:'reflection'|'backup'}=$props();
 let sessionItems=$state<{kind:'reflection'|'backup';id:string}[]>([]);
 let limits=$state({reflection:20,backup:20});
 const reflections=$derived(unknownTargets(view.state,'reflection',view.backupRemoved));
 const backups=$derived(unknownTargets(view.state,'backup',view.backupRemoved));
 $effect(()=>{const seen=new Set(sessionItems.map(t=>`${t.kind}_${t.id}`));const added=[...reflections,...backups].filter(t=>!seen.has(`${t.kind}_${t.id}`));if(added.length)sessionItems=[...sessionItems,...added];});
 const items=$derived(sessionItems.filter(t=>t.kind===kind));
 const visibleItems=$derived(items.slice(0,limits[kind]));
</script>
<div class="filters" aria-label="Review item type">{#each [{value:'reflection',label:'Reflections',count:reflections.length},{value:'backup',label:'Backup prompts',count:backups.length}] as filter}<button class:chosen={kind===filter.value} aria-pressed={kind===filter.value} onclick={()=>kind=filter.value as typeof kind}>{filter.label} ({filter.count})</button>{/each}</div>
<p class="hint">Choose a topic to save it. Reviewed cards stay here until you leave so you can correct a choice.</p>
<div class="review-list">{#each visibleItems as item (`${kind}_${item.id}`)}<UnknownReviewCard {view} {repository} target={{kind,id:item.id}} />{:else}<p class="hint" role="status">No Unknown {kind==='reflection'?'reflections':'backup prompts'} to review.</p>{/each}</div>
{#if items.length>visibleItems.length}<MoreReflections shown={visibleItems.length} total={items.length} onmore={()=>limits[kind]+=20} itemLabel="items" buttonLabel="Show more items"/>{/if}
<style>
 .filters{display:flex;gap:8px}.filters button{flex:1;min-height:44px;border:1px solid var(--glass-border);border-radius:12px;background:#15191f90;color:#d9dde4;font:inherit;font-size:.85rem;padding:8px;cursor:pointer}.filters .chosen{border-color:var(--accent-text);background:color-mix(in srgb,var(--accent-text) 12%,#15191f)}.hint{font-size:.85rem;line-height:1.6;color:#b6beca}.review-list{display:grid;gap:14px}
</style>
