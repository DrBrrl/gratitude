<script lang="ts">
	import GratitudeApp from '$lib/components/GratitudeApp.svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import inkBackground from '$lib/assets/backgrounds/charcoal-ochre-ink.png';
	import '$lib/styles/card-actions.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href={`${base}/manifest.webmanifest`} />
	<link rel="apple-touch-icon" sizes="180x180" href={`${base}/icons/gratitude-180.png`} />
	<meta name="theme-color" content="#0c0d10" />
</svelte:head>

<div class="app-background" aria-hidden="true" style:background-image={`url(${inkBackground})`}></div>
{@render children()}
<GratitudeApp landing={page.route.id === '/'} />

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
