<script lang="ts">
  import ReflectionText from './ReflectionText.svelte';
  import Icon from './Icon.svelte';
  import { reflectionPreview } from '$lib/reflection-preview';
  import { cardDateTime } from '$lib/journal';

  let { text, query, entryId, entryAt, expanded, onexpand, oncollapse, onopen }: {
    text: string; query: string; entryId: string; entryAt: string; expanded: boolean;
    onexpand: () => void; oncollapse: () => void; onopen: () => void;
  } = $props();
  let space = $state<HTMLDivElement>();
  let paragraph = $state<HTMLParagraphElement>();
  let preview = $state('');
  let overflowing = $state(false);
  const dateLabel = $derived(cardDateTime(entryAt));

  $effect(() => {
    const container = space;
    const source = paragraph;
    const fullText = text;
    if (!container || !source || expanded) return;
    // Count actual wrapped lines per paragraph; paragraph margins are not text lines.
    let measuredWidth = -1;
    const measure = (force = false) => {
      const width = source.clientWidth;
      // Updating a preview changes its height, which also notifies the observer.
      // Only wrapping width or newly loaded fonts require another measurement.
      if (!force && width === measuredWidth) return;
      measuredWidth = width;
      const probe = source.cloneNode(false) as HTMLParagraphElement;
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden',
        pointerEvents: 'none', width: `${width}px` });
      container.append(probe);
      // Match ReflectionText's paragraph layout when measuring full and truncated text.
      const setProbeText = (value: string) => {
        probe.replaceChildren(...value.split(/\r?\n/).map((text, index) => {
          const line = document.createElement('span');
          line.textContent = text;
          Object.assign(line.style, { display: 'block', minHeight: '1lh', marginTop: index ? '.5lh' : '0' });
          return line;
        }));
      };
      const lineHeight = Number.parseFloat(getComputedStyle(source).lineHeight);
      const fits = (value: string) => {
        setProbeText(value);
        const lines = Array.from(probe.children).reduce((count, paragraph) =>
          count + Math.max(1, Math.round(paragraph.getBoundingClientRect().height / lineHeight)), 0);
        return lines <= 3;
      };
      try {
        const result = reflectionPreview(fullText, fits);
        preview = result.text;
        overflowing = result.truncated;
      } finally { probe.remove(); }
    };
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    const fontsChanged = () => measure(true);
    document.fonts.addEventListener('loadingdone', fontsChanged);
    measure();
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', fontsChanged); };
  });
</script>

<div class="preview" bind:this={space}>
  <p bind:this={paragraph}><ReflectionText text={expanded ? text : preview} {query} /></p>
  {#if expanded || overflowing}<button class="more" aria-expanded={expanded} onclick={expanded ? oncollapse : onexpand}>{expanded ? '(see less)' : '(see more)'}</button>{/if}
  <div class="card-footer">
    <button class="view-entry card-action" id={`view-${entryId}`} onclick={onopen}>View entry<Icon name="next" size={20} /></button>
    <time datetime={entryAt}>{dateLabel}</time>
  </div>
</div>

<style>
  .preview { display: flex; flex-direction: column; }
  p { margin: 0; font-size: .9rem; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; text-align: justify; }
  button { border: 0; background: none; color: var(--yellow); font: inherit; cursor: pointer; }
  .more { align-self: flex-start; padding: 0; white-space: nowrap; font-size: .9rem; line-height: 1.4; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; padding-top: 8px; }
  .card-footer time { font-size: .85rem; color: #b7bdc6; text-align: right; }
  .view-entry { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; min-height: 28px; padding: 2px 6px; font-size: .85rem; }
  button:focus-visible { outline: 2px solid var(--yellow); outline-offset: 4px; }
</style>
