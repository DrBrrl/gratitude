<script lang="ts">
  import type { summarizeStretches } from '$lib/calendar';
  let { streak, entries, cached = false }: { streak: ReturnType<typeof summarizeStretches>; entries: number; cached?: boolean } = $props();
  const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
</script>

<section class="calendar-summary" aria-label="Gratitude statistics">
  <p class="current-streak"><span>Current streak:</span> <strong>{days(streak.current)}</strong> of gratitude in a row <small>(Longest streak: {days(streak.longest)})</small></p>
  <p><span>Total entries:</span> <strong>{entries}</strong> · {days(streak.total)} of gratitude</p>
  <p><span>Most recent streak:</span> <strong>{days(streak.latest)}</strong> of gratitude in a row</p>
  {#if cached}<small class="calendar-cache-note">Saved on this device · waiting to sync</small>{/if}
</section>

<style>
  .calendar-summary { margin: 16px 0 20px; padding: 16px 18px; border: 1px solid #d9c44740; border-radius: 16px; background: linear-gradient(120deg, #464b5038, #12161be3 70%, #c2a55216); backdrop-filter: blur(18px); color: #c5cbd5; font: .84rem/1.65 Arial, Helvetica, sans-serif; }
  p { margin: 0; }
  p + p { margin-top: 7px; }
  p > span { font-weight: 600; color: #e1e4ea; }
  strong { color: var(--yellow); font-weight: 600; }
  .current-streak small { display: block; color: #aeb6c3; font-size: .77rem; }
  .calendar-cache-note { display: block; margin-top: 10px; font-size: .7rem; color: #b4bdca; }
</style>
