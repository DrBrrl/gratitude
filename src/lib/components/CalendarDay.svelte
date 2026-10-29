<script lang="ts">
  import { dayLabel, type CalendarCell } from '$lib/calendar';
  import { colourForDay } from '$lib/journal';
  import type { CalendarPhotos } from '$lib/calendar-photos';
  import CalendarPhoto from './CalendarPhoto.svelte';
  let {cell,onchoose,disabled=false,photos=null}:{cell:CalendarCell;onchoose:(day:string)=>void;disabled?:boolean;photos?:CalendarPhotos|null}=$props();
  const count=$derived(cell.entries.length);
  const photoId=$derived(!disabled && count && !cell.future ? photos?.days.get(cell.day) : undefined);
  const label=$derived(`${dayLabel(cell.day)}, ${cell.future?'future date':count?`${count} ${count===1?'reflection':'reflections'}`:'no reflections'}${photoId?', photo attached':''}`);
</script>
<button type="button" class:future={cell.future} class:today={cell.today} class:filled={!!count} class:hasPhoto={!!photoId} aria-label={label} aria-current={cell.today?'date':undefined} disabled={disabled || cell.future} onclick={event=>{event.stopPropagation();onchoose(cell.day);}} data-day={cell.day} style:--day-colour={count?colourForDay(cell.day):'transparent'}>
  <span class="number">{#if photoId && photos}<CalendarPhoto cache={photos.cache} {photoId} /><span class="day-number">{cell.number}</span>{:else}{cell.number}{/if}</span>{#if count>1}<small aria-hidden="true">{count}</small>{/if}{#if cell.today}<i aria-hidden="true"></i>{/if}
</button>
<style>
  button{position:relative;display:grid;place-items:center;min-width:0;width:100%;height:46px;padding:0;border:0;background:transparent;color:#e8eaf0;font:inherit;cursor:pointer;border-radius:9px;}
  .number{position:relative;display:grid;place-items:center;width:34px;height:34px;border:2px solid transparent;border-radius:50%;font-size:.9rem;}
  .day-number{position:relative;color:#fff;font-weight:700;text-shadow:0 1px 3px #000,0 0 4px #000b;}
  .filled .number{border-color:var(--day-colour);box-shadow:0 0 8px color-mix(in srgb,var(--day-colour) 28%,transparent);}
  .future{color:#727782;cursor:default;} small{position:absolute;right:0;bottom:2px;font-size:.6rem;background:#22262e;color:#e3e5e9;border-radius:6px;padding:0 3px;line-height:12px;}
  button:disabled{cursor:default;}
  i{position:absolute;bottom:1px;width:4px;height:4px;background:var(--calendar-highlight,#d7dce2);border-radius:50%;} button:focus-visible{outline:2px solid var(--calendar-highlight,#e0d8ab);outline-offset:-2px;} button:hover:not(:disabled){background:#ffffff0b;}
</style>
