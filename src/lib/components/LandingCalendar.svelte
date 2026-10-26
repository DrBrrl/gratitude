<script lang="ts">
  import { tick } from 'svelte';
  import { monthCells, monthLabel, shiftMonth, validMonth, type DayIndex } from '$lib/calendar';
  import type { CalendarAnchor } from '$lib/calendar-navigation';
  import CalendarDay from './CalendarDay.svelte';

  let { index, today, anchor, onanchor, onchoose }: {
    index: DayIndex;
    today: string;
    anchor: CalendarAnchor;
    onanchor: (anchor: CalendarAnchor) => void;
    onchoose: (day: string) => void;
  } = $props();
  let choosingMonth = $state(false);
  let monthInput = $state<HTMLInputElement>();
  let monthButton = $state<HTMLButtonElement>();
  const previous = $derived(shiftMonth(anchor.month, -1));
  const next = $derived(shiftMonth(anchor.month, 1));

  async function chooseMonth(month: string | null) {
    if (!month || !validMonth(month)) return;
    onanchor({ month, offset: 0 });
    if (choosingMonth) {
      choosingMonth = false;
      await tick();
      monthButton?.focus({ preventScroll: true });
    }
  }
  async function openMonthChooser() {
    choosingMonth = true;
    await tick();
    monthInput?.focus();
  }
</script>

<section class="landing-calendar" aria-label="Gratitude calendar" data-anchor={anchor.month}>
  <header class:choosing-month={choosingMonth}>
    <h2>
      {#if choosingMonth}
        <input bind:this={monthInput} type="month" aria-label="Jump to month" min="0001-01" max="9999-12" value={anchor.month}
          onchange={event => chooseMonth(event.currentTarget.value)}
          onkeydown={event => { if (event.key === 'Escape') { choosingMonth = false; void tick().then(() => monthButton?.focus()); } }}
          onblur={() => choosingMonth = false} />
      {:else}
        <button bind:this={monthButton} class="month-heading" aria-label={`Choose month, ${monthLabel(anchor.month)}`} onclick={openMonthChooser}>{monthLabel(anchor.month)}</button>
      {/if}
    </h2>
    <div class="month-controls" role="group" aria-label="Calendar months">
      <button aria-label="Previous month" disabled={!previous} onclick={() => chooseMonth(previous)}>&lt;</button>
      <button class="current-month" onclick={() => chooseMonth(today.slice(0, 7))}>Current month</button>
      <button aria-label="Next month" disabled={!next} onclick={() => chooseMonth(next)}>&gt;</button>
    </div>
  </header>
  <div class="weekdays" aria-hidden="true">{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day}<span>{day}</span>{/each}</div>
  <div class="month-dates">{#each monthCells(index, anchor.month, today) as cell, i (i)}{#if cell}<CalendarDay {cell} {onchoose} />{:else}<span></span>{/if}{/each}</div>
</section>

<style>
  .landing-calendar { padding: 12px 8px 14px; border: 1px solid #b8bdc43d; border-radius: 16px; background: linear-gradient(120deg,#494e5533,#13171bd9); backdrop-filter: blur(18px); }
  header { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 4px 8px; margin-bottom: 12px; }
  h2 { margin: 0; min-width: 0; font: 600 1.06rem/1.4 Arial,Helvetica,sans-serif; color: #e2e4eb; }
  button, input { font: inherit; color: inherit; min-height: 44px; border: 1px solid #9a9da34f; border-radius: 8px; background: #d3d8df12; padding: 6px 8px; }
  button { cursor: pointer; }
  button:disabled { opacity: .35; cursor: default; }
  .month-heading { background: none; border-color: transparent; padding-inline: 5px; text-align: left; max-width: 100%; }
  .month-controls { display: flex; gap: 4px; margin-left: auto; color: #bac1cd; font-size: .72rem; }
  .month-controls button { min-width: 44px; }
  .weekdays, .month-dates { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
  .weekdays { text-align: center; font-size: .7rem; color: #a5adba; height: 26px; }
  input { width: 100%; min-width: 0; font-size: .9rem; }
  .choosing-month h2 { grid-column: 1 / -1; grid-row: 2; }
  .choosing-month .month-controls { grid-column: 2; grid-row: 1; }
  button:focus-visible, input:focus-visible { outline: 2px solid #c8cbd1; outline-offset: 2px; }
  @media(max-width:360px) { .landing-calendar { padding-left: 0; padding-right: 0; } }
</style>
