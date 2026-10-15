<script lang="ts">
  import { onMount } from 'svelte';
  import type { FirebaseClient } from '$lib/firebase/client';
  import { readPhoto } from '$lib/photos';
  let { client, uid, photoId, summary = '' }: { client: FirebaseClient; uid: string; photoId: string; summary?: string } = $props();
  // Memoize primitive asset inputs: parent photo records also change when only
  // their summary/status changes. Those updates must not refetch the image.
  const assetClient = $derived(client);
  const assetOwner = $derived(uid);
  const assetId = $derived(photoId);
  let url = $state('');
  let failed = $state(false);
  let retry = $state(0);
  onMount(() => {
    const reconnect = () => { if (failed) retry++; };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  });
  $effect(() => {
    const active = assetClient, owner = assetOwner, id = assetId; retry;
    let disposed = false;
    let objectURL = '';
    url = ''; failed = false;
    void readPhoto(active, owner, id).then(blob => {
      if (disposed) return;
      objectURL = URL.createObjectURL(blob); url = objectURL;
    }).catch(() => { if (!disposed) failed = true; });
    return () => { disposed = true; if (objectURL) URL.revokeObjectURL(objectURL); };
  });
</script>
<div class="photo-image">
  {#if url}<img src={url} alt={summary || 'Attached journal photo'} />
  {:else if failed}<button onclick={() => retry++}>Photo unavailable · Retry</button>
  {:else}<span role="status">Loading photo…</span>{/if}
</div>
<style>
  .photo-image { width: 100%; aspect-ratio: 4 / 3; background: #ffffff08; border-radius: 12px; overflow: hidden; display: grid; place-items: center; }
  img { width: 100%; height: 100%; object-fit: contain; }
  span, button { font: 14px Arial, sans-serif; color: #bbc0c9; background: none; border: 0; }
  button { cursor: pointer; min-height: 44px; }
</style>
