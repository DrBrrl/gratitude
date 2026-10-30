<script lang="ts">
  import type { DayIndex } from '$lib/calendar';
  import LandingCalendar from './LandingCalendar.svelte';
  import { base } from '$app/paths';

  let { today, onsignin, signInDisabled=false }: { today: string; onsignin?: () => void; signInDisabled?: boolean } = $props();
  function requestSignIn(event: MouseEvent) {
    if (!onsignin) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!signInDisabled) onsignin();
  }
  // This preview always has its own empty index, independent of account history.
  const emptyIndex: DayIndex = new Map();
</script>

<section class="signed-out-calendar" aria-label="Calendar sign-in preview" aria-describedby="calendar-signin-message">
  <div class="calendar-preview">
    <LandingCalendar index={emptyIndex} {today} anchor={{month:today.slice(0,7),offset:0}} onanchor={()=>{}} onchoose={()=>{}} disabled />
  </div>
  <p class="signin-message" id="calendar-signin-message"><a onclick={requestSignIn} aria-disabled={signInDisabled ? true : undefined} href={`${base}/journal/?afterSignIn=journal`}>Sign in</a> to see your gratitude calendar.</p>
</section>

<style>
  .signed-out-calendar { position: relative; }
  .calendar-preview { filter: grayscale(1); opacity: .45; }
  .signin-message { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(260px,calc(100% - 40px)); margin: 0; padding: 14px 18px; border: 1px solid #c3c8d066; border-radius: 14px; background: #191e23ed; backdrop-filter: blur(12px); box-shadow: 0 8px 28px #0005; color: #dce0e7; font-size: .9rem; line-height: 1.6; text-align: center; }
  a { color: #f4d35e; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid #f4d35e; outline-offset: 4px; border-radius: 2px; }
</style>
