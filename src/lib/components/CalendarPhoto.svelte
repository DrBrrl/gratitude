<script lang="ts">
  import { onMount } from 'svelte';
  import type { PhotoThumbnailCache } from '$lib/photo-thumbnails';
  let { cache, photoId }: { cache: PhotoThumbnailCache; photoId: string } = $props();
  let element = $state<HTMLSpanElement>();
  let visible = $state(false), url = $state(''), failed = $state(false), retry = $state(0);
  onMount(() => {
    const reconnect = () => { if (failed) retry++; };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  });
  $effect(() => {
    if (!element || visible) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); }
    }, { rootMargin: '96px' });
    observer.observe(element);
    return () => observer.disconnect();
  });
  $effect(() => {
    const active = cache, id = photoId; retry;
    url = ''; failed = false;
    if (!visible) return;
    let disposed = false;
    let asset: ReturnType<PhotoThumbnailCache['acquire']>;
    try { asset = active.acquire(id); }
    catch { failed = true; return; }
    void asset.promise.then(value => { if (!disposed) url = value; }).catch(() => { if (!disposed) failed = true; });
    return () => { disposed = true; asset.release(); };
  });
</script>

<span class="calendar-photo" bind:this={element} aria-hidden="true" data-state={url ? 'ready' : failed ? 'unavailable' : visible ? 'loading' : 'idle'}>
  {#if url}<img src={url} alt="" onerror={() => { url = ''; failed = true; }} />{/if}
</span>

<style>
  .calendar-photo { position: absolute; inset: 0; overflow: hidden; border-radius: 50%; pointer-events: none; background: #555d6860; }
  img { display: block; width: 100%; height: 100%; object-fit: cover; filter: blur(.4px) saturate(.75); }
  .calendar-photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, #e9eef650, #121a24a0); }
</style>
