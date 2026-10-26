<script lang="ts">
  import { weekCells,summarizeStretches,civilDate,type DayIndex } from '$lib/calendar';
  import CalendarDay from './CalendarDay.svelte';
  let {index,today,ready=true,cached=false,onopen,onchoose}:{index:DayIndex;today:string;ready?:boolean;cached?:boolean;onopen:()=>void;onchoose:(day:string)=>void}=$props();
  const cells=$derived(weekCells(index,today));const streak=$derived(summarizeStretches(index,today));
  const range=$derived.by(()=>{const format=new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',day:'numeric',month:'short',...(cells[0].day.slice(0,4)!==cells[6].day.slice(0,4)?{year:'numeric'}:{})});return `${format.format(civilDate(cells[0].day))} – ${format.format(civilDate(cells[6].day))}`;});
</script>
<section class="week-box" aria-label="This week’s gratitude">
  <button class="week-open" type="button" aria-label="Open calendar" onclick={onopen}>
    <strong>{#if ready}{streak.current} {streak.current===1?'day':'days'} of gratitude in a row{:else}Opening your calendar…{/if}</strong><span aria-hidden="true">▦</span>
    <small>This week · {range}</small>
  </button>
  {#if ready}<div class="weekdays" aria-hidden="true">{#each ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as day}<span>{day}</span>{/each}</div>
    <div class="dates">{#each cells as cell (cell.day)}<CalendarDay {cell} {onchoose} />{/each}</div>
    {#if cached}<p class="cache-note">Saved on this device · waiting to sync</p>{/if}
  {/if}
</section>
<style>
 .week-box{position:relative;margin:16px 0 22px;padding:10px 8px 9px;border:1px solid #c4c6cc42;border-radius:16px;background:linear-gradient(120deg,#464b5038,#12161be3 70%,#c2a55216);backdrop-filter:blur(18px);}
 .week-open{display:grid;grid-template-columns:1fr auto;gap:6px 8px;width:100%;min-height:44px;background:none;border:0;color:#d8dbe2;font:inherit;text-align:left;cursor:pointer;padding:3px 7px 9px;border-radius:7px;}
 strong{font-size:.86rem;line-height:1.4;font-weight:600;} .week-open>span{color:#e5cd65;font-size:1.25rem;grid-column:2;grid-row:1/3;align-self:center;} small{font-size:.68rem;color:#a6adb9;grid-column:1;}
 .week-open::after{content:"";position:absolute;inset:0;border-radius:16px;} .dates{position:relative;z-index:1;} .weekdays{pointer-events:none;}
 .weekdays,.dates{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));text-align:center;}.weekdays{font-size:.65rem;color:#a6adb9;line-height:20px;}.cache-note{font-size:.7rem;color:#abb2bd;margin:8px 6px 0;}button:focus-visible{outline:2px solid #c7cbd2;outline-offset:2px;}
@media(max-width:360px){.week-box{padding-left:0;padding-right:0;}}
</style>
