<script lang="ts">
  import type { Snippet } from 'svelte';
  let { calendar }: { calendar?: Snippet } = $props();
  import { base } from '$app/paths';
</script>
<svelte:head>
  <title>Gratitude</title>
  <meta name="description" content="Let us find joy in the small things. A space to practice being thankful every day." />
  <meta name="theme-color" content="#0c0d10" />
</svelte:head>

<div class="page">
  <main>
    <p class="eyebrow">Let us find joy in the small things</p>
    <h1>Gratitude<span aria-hidden="true">.</span></h1>
    <p class="introduction">A space to practice being thankful every day</p>
    {#if calendar}<section class="welcome-calendar" aria-label="Your gratitude calendar"><h2>Your gratitude calendar</h2>{@render calendar()}</section>{:else}<section aria-labelledby="reflection-heading" class="reflection">
      <p class="card-label" id="reflection-heading">A moment to notice</p>
      <p class="prompt">What is one small thing you appreciated today?</p>
      <p class="gentle-note">A small moment is enough.</p>
    </section>{/if}
    <footer>
      <a href={`${base}/journal/`}>Open your journal <span aria-hidden="true">→</span></a>
    </footer>
  </main>
</div>

<style>
  .page {
    font-family: system-ui, sans-serif;
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: max(64px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
  }
  main { width: min(100%, 540px); }
  .eyebrow { color: #f4d35e; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; }
  h1 { font: 500 clamp(3rem, 11vw, 5rem)/1.15 Georgia, serif; letter-spacing: -0.05em; margin: 16px 0; }
  h1 span { color: #f4d35e; }
  .introduction { color: #c6c4bd; font-size: 1.125rem; line-height: 1.7; }
  .reflection { margin-top: 40px; padding: clamp(24px, 6vw, 40px); background: #29232fe6; border: 1px solid #706178; border-radius: 24px; backdrop-filter: blur(16px); }
  .card-label { color: #e0d3e8; font-size: 0.875rem; margin: 0 0 24px; }
  .prompt { font: 400 clamp(1.6rem, 6vw, 2.15rem)/1.4 Georgia, serif; margin: 0; }
  .gentle-note { margin: 28px 0 0; color: #c6c4bd; font-size: 0.875rem; line-height: 1.6; }
  .welcome-calendar { margin-top: 28px; }
  .welcome-calendar h2 { font-size: 1.2rem; }
  @media(max-width:360px){ .page { padding-left:2px; padding-right:2px; } }
  footer { display: flex; flex-wrap: wrap; gap: 16px 24px; justify-content: space-between; margin-top: 32px; color: #c6c4bd; font-size: 0.8rem; }
  a { color: #f4d35e; text-underline-offset: 4px; min-height: 44px; display: inline-flex; gap: 6px; align-items: flex-start; }
  a:focus-visible { outline: 2px solid #f4d35e; outline-offset: 6px; border-radius: 2px; }
</style>
