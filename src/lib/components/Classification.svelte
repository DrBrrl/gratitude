<script lang="ts">
 import ReviewPhotos from './ReviewPhotos.svelte';
 import type {FirebaseClient} from '../firebase/client';
 import {onDestroy} from 'svelte';
 import {classificationDestination} from '../ai/classification-connection';
 import type {JournalStore,JournalView} from '../firebase/repository';
 import type {ModelConnection} from '../ai/connection-contract';
 import {providerName} from '../ai/connection-contract';
 import type {GeneratePrompt} from '../ai/context';
 import {CLASSIFICATION_LIMIT,CLASSIFICATION_LEASE_MS,batchTargets,targetSelection,eligibleTargets,batchProgress,batchRequests,currentTarget,targetTopic,topicStale,type ClassificationTarget,type ClassificationDestination} from '../classification';
 import {topicChoices,topicLabel} from '../reflection-topics';
 import {availableBackups} from '../backup-prompts';
 import {cardDateTime,entryTimestamp} from '../journal';
 let {view,repository,connection,allowed,generate,onconfigure,client,uid}:{client?:FirebaseClient|null;uid?:string;view:JournalView;repository:JournalStore;connection:ModelConnection;allowed:boolean;generate:()=>GeneratePrompt;onconfigure:()=>void}=$props();
 let workerEpoch=0,lastCloudDispatch=0;
 let busy=$state(false),running=$state(false),alive=true,message=$state(''),kind=$state<'reflection'|'backup'>('reflection'),chosenId=$state(''),chosenTopic=$state<string|null>(null);
 const c=$derived(view.state.classification),consent=$derived(c.consent);
 let destination=$state<ClassificationDestination|null>(null);
 $effect(()=>{const selected=$state.snapshot(connection);let current=true;void classificationDestination(selected).then(value=>{if(current)destination=value;}).catch(()=>{if(current)destination=null;});return()=>{current=false;};});
 const matches=$derived(!!destination&&!!consent?.payload.enabled&&Object.entries(destination).every(([key,value])=>consent.payload[key as keyof ClassificationDestination]===value));
 const batch=$derived(c.batchId?c.batches[c.batchId]:null),progress=$derived(c.batchId?batchProgress(c,c.batchId):{completed:0,remaining:0,failed:0});
 const batchCompatible=$derived(!!batch&&batch.action.payload.consentId===consent?.eventId&&batch.action.payload.answersId===view.state.onboarding.answersId);
 const reflects=$derived(eligibleTargets(view.state,'reflection')),backups=$derived(eligibleTargets(view.state,'backup'));
 const entries=$derived(view.state.entries);
 const items=$derived(kind==='reflection'?entries.map(e=>({id:e.id,label:`${cardDateTime(entryTimestamp(e))} · ${e.text.slice(0,90)}`})):availableBackups(view.state).map(p=>({id:p.id,label:p.text.slice(0,110)})));
 const chosen=$derived(items.some(i=>i.id===chosenId)?currentTarget(view.state,kind,chosenId):null);
 const activeTopic=$derived(chosen?targetTopic(view.state,chosen):undefined);
 const pending=$derived(c.requestId&&!c.replies[c.requestId]?c.requestId:null);
 onDestroy(()=>{alive=false;running=false;workerEpoch++;});
 async function run(operation:()=>Promise<unknown>){busy=true;message='';try{await operation();}catch(cause){message=cause instanceof Error?cause.message:'Could not save classification changes.';running=false;}finally{busy=false;}}
 async function consentTo(enabled:boolean){workerEpoch++;running=false;await run(()=>repository.commitAI({eventId:crypto.randomUUID(),type:'ClassificationConsentChosen',schemaVersion:1,payload:{previousEventId:c.lastEventId,...(enabled?destination!:{provider:consent!.payload.provider,model:consent!.payload.model,connectionId:consent!.payload.connectionId,connectionRevision:consent!.payload.connectionRevision}),enabled}}));}
 async function start(targets:ClassificationTarget[]){
  await run(async()=>{if(!matches||!allowed)throw new Error('Review and allow this classification connection first.');
   await repository.commitAI({eventId:crypto.randomUUID(),type:'ClassificationBatchRequested',schemaVersion:1,payload:{previousEventId:c.lastEventId,consentId:c.consent!.eventId,answersId:view.state.onboarding.answersId,catalogueVersion:1,targets:targetSelection(targets)}});
   running=true;
  });if(running)void drain();
 }
 async function control(operation:'pause'|'resume'|'cancel'){
  workerEpoch++;running=false;await run(()=>repository.commitAI({eventId:crypto.randomUUID(),type:'ClassificationBatchControlled',schemaVersion:1,payload:{previousEventId:c.lastEventId,batchId:c.batchId!,operation}}));
  if(operation==='resume'&&!message){running=true;void drain();}
 }
 async function drain(retry=false){
  if(!alive||!c.batchId)return;
  const id=c.batchId,epoch=++workerEpoch;
  while(alive&&running&&epoch===workerEpoch&&c.batchId===id&&c.batches[id]?.status==='running'&&matches&&allowed){
   const selected=batchTargets(c.batches[id].action).find(t=>{const last=batchRequests(c,id,t).at(-1);return retry?!!last&&c.outcomes[last.eventId]!=='classified':!last;});
   if(!selected)break;
   if(connection.provider==='personal-gemini'&&lastCloudDispatch){const wait=15_000-(performance.now()-lastCloudDispatch);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));if(!alive||!running||epoch!==workerEpoch)break;}
   if(connection.provider==='personal-gemini')lastCloudDispatch=performance.now();
   try{await repository.requestClassification(id,selected,generate(),$state.snapshot(connection));const last=batchRequests(c,id,selected).at(-1);if(last&&c.outcomes[last.eventId]==='failed'){message='The provider could not complete this item. Check the connection, then explicitly retry or resume the remaining batch.';break;}}
   catch(cause){message=cause instanceof Error?cause.message:'Classification paused. Reconnect and resume.';break;}
   if(retry)break;
  }
  if(epoch===workerEpoch)running=false;
 }
 async function retry(){running=true;message='';await drain(true);}
 async function saveBackup(){if(!chosen||kind!=='backup')return;await run(()=>repository.commitAI({eventId:crypto.randomUUID(),type:'BackupTopicChosen',schemaVersion:1,payload:{previousEventId:c.lastEventId,target:chosen,answersId:view.state.onboarding.answersId,topicId:chosenTopic}}));}
</script>
<section class="glass classification" aria-label="Classify journal and backup topics">
 <h2>AI classification</h2>
 <p>AI can suggest a category for saved reflections and backup prompts. You can correct every suggestion. Manual categories are kept, including after editing a reflection.</p>
 <p class="hint">Your selected reflection text or backup question and the built-in/custom topic descriptions are sent to <strong>{providerName(connection.provider)} · {destination?.model??connection.model}</strong>. Names, pronouns, friends, photos and other journal entries are not sent. Cloud services may charge for usage. Opening this screen sends nothing.</p>
 {#if connection.provider==='lm-studio'||connection.provider==='ollama'||connection.provider==='openai-compatible'}<p class="hint">Server: {connection.baseUrl}</p>{/if}
 <button class="outline" onclick={onconfigure} disabled={busy||running}>Change model in AI settings</button>
 {#if !allowed}<p class="hint">Configure this connection and approve personal processing before allowing classification.</p>{/if}
 {#if !matches}<button class="outline" onclick={()=>consentTo(true)} disabled={busy||running||!allowed||!destination}>Allow classification with this connection</button>
 {:else}<p class="hint">Classification is allowed for this connection. It runs only when requested.</p>{/if}{#if consent?.payload.enabled}<button class="outline" onclick={()=>consentTo(false)} disabled={busy}>Turn classification off</button>{/if}
 {#if connection.provider==='personal-gemini'}<p class="hint">Personal cloud requests are paced to respect the relay’s usage limits.</p>{/if}
 <p class="hint">Turning classification off stops queued calls. An already sent request cannot be recalled; its result will not assign a category after withdrawal.</p>
 {#if batch}<section aria-label="Classification progress">
  <h3>Classification progress</h3><p>{progress.completed} completed · {progress.remaining} remaining · {progress.failed} failed or stale</p>
  <p class="hint">{batch.status==='cancelled'?'Remaining work cancelled.':running?'Classifying one item at a time…':batch.status==='paused'?'Paused.':'Saved progress. Resume explicitly after reopening this screen.'}</p>
  {#if (progress.remaining||progress.failed)&&!batchCompatible&&consent?.payload.enabled}<p class="hint">The connection or topics changed. Cancel remaining work, then start a new batch with your current choices.</p>{/if}
  {#if pending}<p class="hint">A request may still be running. If it was interrupted, wait at least {CLASSIFICATION_LEASE_MS/1000} seconds from its start before explicitly retrying. Retrying may make another provider call.</p>{/if}
  {#if batch.status!=='cancelled'&&(progress.remaining||progress.failed)}
   <div class="actions"><button class="outline" onclick={()=>control('pause')} disabled={busy||batch.status==='paused'}>Pause</button><button class="outline" onclick={()=>control('resume')} disabled={busy||running||!matches||!allowed||!batchCompatible||!!pending}>Resume</button><button class="outline" onclick={()=>control('cancel')} disabled={busy}>Cancel remaining</button></div>
   {#if progress.failed||pending}<button class="outline" onclick={retry} disabled={busy||running||batch.status!=='running'||!matches||!allowed||!batchCompatible}>Retry failed or interrupted item</button>{/if}
  {/if}
 </section>{/if}
 {#if view.classificationResultsPending}<button class="outline" onclick={()=>run(()=>repository.syncClassifications())} disabled={busy}>Sync received classification</button>{/if}
 <section aria-label="Start classification"><h3>Choose a batch</h3>
 <p class="hint">{reflects.length} reflections and {backups.length} backup prompts need classification. Each batch contains at most {CLASSIFICATION_LIMIT} items. Imports keep their original dates; import completion never waits for AI. Unknown is a completed AI result; Not yet classified is not.</p>
 <div class="actions"><button class="outline" onclick={()=>start(reflects.slice(0,CLASSIFICATION_LIMIT))} disabled={busy||running||!matches||!allowed||!reflects.length||!!pending||!!batch&&batch.status!=='cancelled'&&progress.remaining>0}>Classify unclassified reflections</button><button class="outline" onclick={()=>start(backups.slice(0,CLASSIFICATION_LIMIT))} disabled={busy||running||!matches||!allowed||!backups.length||!!pending||!!batch&&batch.status!=='cancelled'&&progress.remaining>0}>Classify unclassified backups</button></div>
 </section>
 <section aria-label="Classify one item"><h3>Review or classify one item</h3>
 <label for="class-kind">Item type</label><select id="class-kind" bind:value={kind} onchange={()=>chosenId=''}><option value="reflection">Reflection</option><option value="backup">Backup prompt</option></select>
 <label for="class-item">Item</label><select id="class-item" bind:value={chosenId} onchange={event=>chosenTopic=targetTopic(view.state,currentTarget(view.state,kind,event.currentTarget.value))?.topicId??null}><option value="">Choose an item</option>{#each items as item}<option value={item.id}>{item.label}</option>{/each}</select>
 {#if chosen}{#if kind==='reflection'}<p class="item-text"><strong>Prompt</strong><br/>{view.state.entries.find(e=>e.id===chosen.id)?.prompt}</p>{/if}<p class="item-text">{kind==='reflection'?view.state.entries.find(e=>e.id===chosen.id)?.text:view.state.backups[chosen.id]?.text}</p>{#if kind==='reflection'}<ReviewPhotos state={view.state} entryId={chosen.id} {client} {uid}/>{/if}<p><strong>{topicLabel(activeTopic,view.state.onboarding.answers)}</strong>{activeTopic?.origin==='ai'?topicStale(view.state,chosen)?' · AI suggestion needs review after editing':' · AI suggestion':''}</p>
 <button class="outline" onclick={()=>start([chosen!])} disabled={busy||running||!matches||!allowed||activeTopic?.origin==='user'||!!pending||!!batch&&batch.status!=='cancelled'&&progress.remaining>0}>Classify this item</button>
 {#if kind==='backup'}<label for="backup-topic">Backup category</label><select id="backup-topic" bind:value={chosenTopic}><option value={null}>Not yet classified</option>{#each topicChoices(view.state.onboarding.answers) as option}<option value={option.id}>{option.label}</option>{/each}</select><button class="outline" onclick={saveBackup} disabled={busy||running}>Save backup category</button>{/if}
 {/if}</section>
 {#if message}<p role="status" class="hint">{message}</p>{/if}
</section>
<style>
 .glass{padding:22px;margin:20px 0;background:linear-gradient(130deg,#55585b52,#191d1fe8 60%,#55514b57);border:1px solid var(--glass-border);border-radius:16px}h2{margin:0 0 18px;font:500 1.5rem Georgia,serif}h3{font-size:1rem}p{line-height:1.6}.hint{font-size:.8rem;color:#b6beca}section section{margin-top:28px}.actions{display:flex;flex-wrap:wrap;gap:10px}button{border:1px solid var(--action-border);border-radius:10px;padding:9px 12px;background:#11151b80;color:inherit;font:inherit;font-size:.8rem;min-height:44px;cursor:pointer;margin:6px 0}button:disabled{opacity:.5;cursor:default}select{display:block;width:100%;padding:11px;margin:8px 0 18px;background:#14181e;color:inherit;border:1px solid var(--glass-border);border-radius:10px;font:inherit}.item-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9rem}
</style>
