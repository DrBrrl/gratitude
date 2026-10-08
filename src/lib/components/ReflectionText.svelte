<script lang="ts">
  import HighlightedText from './HighlightedText.svelte';
  let { text, query = '' }: { text: string; query?: string } = $props();
</script>

{#each text.split(/\r?\n/) as paragraph}<span class="paragraph"><HighlightedText text={paragraph} {query} /></span>{/each}

<style>
  .paragraph { display: block; min-height: 1lh; white-space: pre-wrap; overflow-wrap: anywhere; text-align: justify; }
  .paragraph + .paragraph { margin-top: .5lh; }
</style>
