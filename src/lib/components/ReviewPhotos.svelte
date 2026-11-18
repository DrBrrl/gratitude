<script lang="ts">
 import type {FirebaseClient} from '../firebase/client';
 import type {Projection} from '../domain';
 import {entryPhotos} from '../domain';
 import PhotoImage from './PhotoImage.svelte';
 let {state,entryId,client,uid}:{state:Projection;entryId:string;client?:FirebaseClient|null;uid?:string}=$props();
 const photos=$derived(entryPhotos(state,entryId));
</script>
{#if photos.length}<div class="review-photos" aria-label="Reflection photos">{#each photos as photo (photo.photoId)}<figure>
 {#if client&&uid}<PhotoImage {client} {uid} photoId={photo.photoId} summary={photo.summary}/>{:else}<p class="hint">Photo unavailable on this device.</p>{/if}
 <figcaption><strong>Photo description</strong><p>{photo.summary||'No photo description yet.'}</p></figcaption>
</figure>{/each}</div>{/if}
<style>
 .review-photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:12px;margin-top:12px}figure{min-width:0;margin:0}figcaption{font:.78rem/1.5 Arial,Helvetica,sans-serif;color:#c8cfd9;overflow-wrap:anywhere}strong{display:block;margin-top:7px;color:#dfe4ed}p{margin:4px 0 0;white-space:pre-wrap}
</style>
