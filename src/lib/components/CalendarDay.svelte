<script lang="ts">
  import { dayLabel, type CalendarCell } from '$lib/calendar';
  import { colours } from '$lib/journal';
  let {cell,onchoose}:{cell:CalendarCell;onchoose:(day:string)=>void}=$props();
  const count=$derived(cell.entries.length);
  const label=$derived(`${dayLabel(cell.day)}, ${cell.future?'future date':count?`${count} ${count===1?'reflection':'reflections'}`:'no reflections'}`);
</script>
<button type="button" class:future={cell.future} class:today={cell.today} class:filled={!!count} aria-label={label} aria-current={cell.today?'date':undefined} disabled={cell.future} onclick={event=>{event.stopPropagation();onchoose(cell.day);}} data-day={cell.day} style:--day-colour={count?colours[cell.entries[0].colour]:'transparent'}>
  <span class="number">{cell.number}</span>{#if count>1}<small aria-hidden="true">{count}</small>{/if}{#if cell.today}<i aria-hidden="true"></i>{/if}
</button>
<style>
  button{position:relative;display:grid;place-items:center;min-width:0;width:100%;height:46px;padding:0;border:0;background:transparent;color:#e8eaf0;font:inherit;cursor:pointer;border-radius:9px;}
  .number{display:grid;place-items:center;width:34px;height:34px;border:2px solid transparent;border-radius:50%;font-size:.9rem;}
  .filled .number{border-color:var(--day-colour);box-shadow:0 0 8px color-mix(in srgb,var(--day-colour) 28%,transparent);}
  .future{color:#727782;cursor:default;} small{position:absolute;right:0;bottom:2px;font-size:.6rem;background:#22262e;color:#e3e5e9;border-radius:6px;padding:0 3px;line-height:12px;}
  i{position:absolute;bottom:1px;width:4px;height:4px;background:#d7dce2;border-radius:50%;} button:focus-visible{outline:2px solid #e0d8ab;outline-offset:-2px;} button:hover:not(:disabled){background:#ffffff0b;}
</style>
