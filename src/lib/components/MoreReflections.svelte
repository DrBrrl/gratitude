<script lang="ts">
  let { shown, total, onmore }: { shown: number; total: number; onmore: () => void } = $props();
  let sentinel = $state<HTMLDivElement>();
  $effect(() => {
    const node = sentinel;
    const count = shown;
    if (!node || count >= total) return;
    // Re-observe the new end after each batch. Never mount the whole history
    // just to find out which cards are near the viewport.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        onmore();
      }
    }, { rootMargin: '0px 0px 600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  });
</script>

<div class="more-reflections" bind:this={sentinel}>
  <p role="status">Showing {shown} of {total} reflections</p>
  {#if shown < total}<button type="button" onclick={onmore}>Show older reflections</button>{/if}
</div>

<style>
  .more-reflections { text-align: center; padding: 16px 0; }
  p { font-size: .85rem; color: #b7bdc6; }
  button { border: 1px solid #d9c44777; border-radius: 12px; padding: .6rem .85rem; background: #11151b80; color: #edf0f5; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--yellow); outline-offset: 4px; }
</style>
