<script lang="ts">
  import { tick } from 'svelte';
  import { monthCells, monthLabel, shiftMonth, validMonth, type DayIndex } from '$lib/calendar';
  import type { CalendarAnchor } from '$lib/calendar-navigation';
  import CalendarDay from './CalendarDay.svelte';
  import Icon from './Icon.svelte';

  let { index, today, anchor, onanchor, onchoose, disabled=false }: {
    index: DayIndex;
    today: string;
    anchor: CalendarAnchor;
    onanchor: (anchor: CalendarAnchor) => void;
    onchoose: (day: string) => void;
    disabled?: boolean;
  } = $props();
  let choosingMonth = $state(false);
  let monthInput = $state<HTMLInputElement>();
  const monthNames = Array.from({ length: 12 }, (_, index) => monthLabel(`2026-${String(index + 1).padStart(2, '0')}`).replace(/ 2026$/, ''));
  let monthText = $state('');
  let yearText = $state('');
  let invalidChoice = $state(false);
  const years = $derived([...new Set([Number(anchor.month.slice(0, 4)), ...Array.from({ length: 21 }, (_, i) => Number(today.slice(0, 4)) - 10 + i), ...[...index.keys()].map(day => Number(day.slice(0, 4)))])].filter(year => year >= 1 && year <= 9999).sort((a, b) => b - a));
  function selectedMonth() {
    const text = monthText.trim().toLowerCase();
    const number = /^\d{1,2}$/.test(text) ? Number(text) : monthNames.findIndex(name => name.toLowerCase() === text || name.slice(0, 3).toLowerCase() === text) + 1;
    if (number < 1 || number > 12 || !/^\d{1,4}$/.test(yearText.trim()) || Number(yearText) < 1) return null;
    return `${String(Number(yearText)).padStart(4, '0')}-${String(number).padStart(2, '0')}`;
  }
  function applyChoice() {
    const month = selectedMonth();
    invalidChoice = !month;
    if (month) onanchor({ month, offset: 0 });
    return !!month;
  }
  async function closeChooser() { choosingMonth = false; await tick(); monthButton?.focus({ preventScroll: true }); }
  function chooserKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); void closeChooser(); }
    if (event.key === 'Enter') { event.preventDefault(); if (applyChoice()) void closeChooser(); }
  }
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
    monthText = monthNames[Number(anchor.month.slice(5)) - 1];
    yearText = String(Number(anchor.month.slice(0, 4)));
    invalidChoice = false;
    choosingMonth = true;
    await tick();
    monthInput?.focus();
  }
</script>

<section class="landing-calendar" aria-label="Gratitude calendar" data-anchor={anchor.month}>
  <header>
    <h2>
      {#if choosingMonth}
        <div class="month-chooser">
          <input bind:this={monthInput} list="landing-month-options" class="month-input" size="9" aria-label="Month" bind:value={monthText} onchange={applyChoice} onkeydown={chooserKey} aria-invalid={invalidChoice} autocomplete="off" />
          <input list="landing-year-options" class="year-input" size="4" aria-label="Year" bind:value={yearText} onchange={applyChoice} onkeydown={chooserKey} aria-invalid={invalidChoice} inputmode="numeric" maxlength="4" autocomplete="off" />
          <datalist id="landing-month-options">{#each monthNames as month}<option value={month}></option>{/each}</datalist>
          <datalist id="landing-year-options">{#each years as year}<option value={year}></option>{/each}</datalist>
        </div>
        {#if invalidChoice}<p class="choice-hint" role="alert">Choose a month and a year from 1 to 9999.</p>{/if}
      {:else}
        <button bind:this={monthButton} class="month-heading" aria-label={`Choose month, ${monthLabel(anchor.month)}`} {disabled} onclick={openMonthChooser}>{monthLabel(anchor.month)}</button>
      {/if}
    </h2>
    <div class="month-controls" role="group" aria-label="Calendar months">
      <button aria-label="Previous month" disabled={disabled || !previous} class="arrow" onclick={() => chooseMonth(previous)}><Icon name="back" size={16} /></button>
      <button class="current-month" {disabled} onclick={() => chooseMonth(today.slice(0, 7))}>Current month</button>
      <button aria-label="Next month" disabled={disabled || !next} class="arrow" onclick={() => chooseMonth(next)}><Icon name="next" size={16} /></button>
    </div>
  </header>
  <div class="weekdays" aria-hidden="true">{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day}<span>{day}</span>{/each}</div>
  <div class="month-dates">{#each monthCells(index, anchor.month, today) as cell, i (i)}{#if cell}<CalendarDay {cell} {onchoose} {disabled} />{:else}<span></span>{/if}{/each}</div>
</section>

<style>
  .landing-calendar { --calendar-highlight: #ffdf48; padding: 12px 8px 14px; border: 1px solid #f4d35e80; border-radius: 16px; background: linear-gradient(120deg,#494e5533,#13171bd9); backdrop-filter: blur(18px); }
  header { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 4px 6px; margin-bottom: 12px; }
  h2 { margin: 0; min-width: 0; font: 600 1.06rem/1.4 Arial,Helvetica,sans-serif; color: #f4d35e; }
  button, input { font: inherit; color: inherit; min-height: 32px; border: 1px solid #f4d35e80; border-radius: 8px; background: #d3d8df12; padding: 3px 5px; }
  button { cursor: pointer; }
  button:disabled { opacity: .35; cursor: default; }
  .month-heading { background: none; border-color: transparent; padding-inline: 5px; text-align: left; max-width: 100%; }
  .month-controls { display: flex; gap: 4px; margin-left: auto; color: #f4d35e; font-size: .65rem; }
  .month-controls button { height: 32px; white-space: nowrap; }
  .month-controls .arrow { display: grid; place-items: center; width: 32px; min-width: 32px; padding: 0; }
  .weekdays, .month-dates { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
  .weekdays { text-align: center; font-size: .7rem; color: #a5adba; height: 26px; }
  input { min-width: 0; font: .75rem/1.4 ui-monospace, monospace; }
  .month-chooser { display: flex; align-items: center; gap: 4px; }
  .month-input { width: calc(9ch + 28px); }
  .year-input { width: calc(4ch + 28px); }
  .choice-hint { font-size: .7rem; font-weight: 400; color: #bac1cd; margin: 8px 0 0; }
  button:focus-visible, input:focus-visible { outline: 2px solid #ffdf48; outline-offset: 2px; }
  @media(max-width:360px) { .landing-calendar { padding-left: 0; padding-right: 0; } }
</style>
