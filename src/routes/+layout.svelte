<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import inkBackground from '$lib/assets/backgrounds/charcoal-ochre-ink.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-background" aria-hidden="true" style:background-image={`url(${inkBackground})`}></div>
{@render children()}

<style>
  :global(body) { isolation: isolate; min-height: 100svh; }
  .app-background {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-color: #0c0d10;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
</style>
