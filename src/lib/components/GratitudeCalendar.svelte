<script lang="ts">
 import {onMount,tick,untrack} from 'svelte';
 import {monthOrdinal,monthFromOrdinal,validMonth,monthLabel,monthCells,type DayIndex} from '$lib/calendar';
 import CalendarDay from './CalendarDay.svelte';
 export type CalendarAnchor={month:string;offset:number};
 let {index,today,anchor,onanchor,onchoose}:{index:DayIndex;today:string;anchor:CalendarAnchor;onanchor:(anchor:CalendarAnchor)=>void;onchoose:(day:string)=>void}=$props();
 const HEIGHT=368,MAX=9999*12;
 let scroller:HTMLDivElement;
 let start=$state(untrack(()=>Math.max(0,monthOrdinal(anchor.month)-2)));
 let jump=$state(untrack(()=>anchor.month));let mounted=$state(false);let external='';let adjusting=false;let positioning=0;
 const months=$derived(Array.from({length:Math.min(7,MAX-start)},(_,i)=>monthFromOrdinal(start+i)));
 async function position(next:CalendarAnchor) {
  if(!validMonth(next.month))return;
  const sequence=++positioning;adjusting=true;
  const n=monthOrdinal(next.month);start=Math.max(0,Math.min(n-2,MAX-7));jump=next.month;
  await tick();if(!scroller || sequence!==positioning)return;scroller.scrollTop=(n-start)*HEIGHT+Math.max(0,Math.min(next.offset,HEIGHT-1));external=`${next.month}:${next.offset}`;requestAnimationFrame(()=>{if(sequence===positioning)adjusting=false;});
 }
 onMount(()=>{mounted=true;});
 $effect(()=>{const next=anchor;const value=`${next.month}:${next.offset}`;if(mounted && value!==external)untrack(()=>{void position(next);});});
 async function scroll() {
  if(adjusting)return;
  const n=Math.max(0,Math.min(MAX-1,start+Math.floor(scroller.scrollTop/HEIGHT)));
  const value={month:monthFromOrdinal(n),offset:Math.max(0,Math.min(HEIGHT-1,Math.round(scroller.scrollTop-(n-start)*HEIGHT)))};
  external=`${value.month}:${value.offset}`;onanchor(value);jump=value.month;
  const next=Math.max(0,Math.min(n-2,MAX-7));
  if(next!==start){
   adjusting=true;const sequence=++positioning;
   const focused=document.activeElement instanceof HTMLElement?document.activeElement.closest('[data-month]')?.getAttribute('data-month'):null;
   if(focused && (monthOrdinal(focused)<next || monthOrdinal(focused)>=next+7))scroller.focus({preventScroll:true});
   start=next;await tick();if(sequence!==positioning)return;scroller.scrollTop=(n-start)*HEIGHT+value.offset;
   requestAnimationFrame(()=>{if(sequence===positioning)adjusting=false;});
  }
 }
 async function chooseMonth(value:string) {if(validMonth(value)){const next={month:value,offset:0};external=`${value}:0`;onanchor(next);await position(next);}}
</script>
<div class="calendar-tools"><button type="button" onclick={()=>chooseMonth(today.slice(0,7))}>This month</button><label>Jump to month<input type="month" aria-label="Jump to month" min="0001-01" max="9999-12" value={jump} onchange={event=>chooseMonth(event.currentTarget.value)} /></label></div>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region is deliberately keyboard-focusable for native scrolling.) -->
<div class="calendar-scroll" bind:this={scroller} onscroll={scroll} tabindex="0" role="region" aria-label="Gratitude calendar" data-anchor={anchor.month}>
 {#each months as month (month)}
  <section class="calendar-month" aria-label={monthLabel(month)} data-month={month}>
   <h2>{monthLabel(month)}</h2><div class="weekdays" aria-hidden="true">{#each ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as day}<span>{day}</span>{/each}</div>
   <div class="month-dates">{#each monthCells(index,month,today) as cell,i (i)}{#if cell}<CalendarDay {cell} {onchoose} />{:else}<span></span>{/if}{/each}</div>
  </section>
 {/each}
</div>
<style>
 .calendar-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0;color:#bac1cd;font-size:.75rem;}button,input{font:inherit;color:inherit;min-height:44px;border:1px solid #9a9da34f;border-radius:8px;background:#d3d8df12;padding:6px 9px;}button{cursor:pointer;}label{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}input{max-width:160px;}
 .calendar-scroll{height:min(560px,calc(100svh - 390px));min-height:280px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;overflow-anchor:none;scrollbar-width:thin;scrollbar-color:#94969d66 transparent;border:1px solid #b8bdc43d;border-radius:16px;background:linear-gradient(120deg,#494e5533,#13171bd9);backdrop-filter:blur(18px);}
 .calendar-month{height:368px;box-sizing:border-box;padding:12px 8px 14px;}h2{font:600 1.06rem/1.4 Arial,Helvetica,sans-serif;color:#e2e4eb;margin:0 6px 14px;text-align:left;}.weekdays,.month-dates{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}.weekdays{text-align:center;font-size:.7rem;color:#a5adba;height:26px;}button:focus-visible,input:focus-visible,.calendar-scroll:focus-visible{outline:2px solid #c8cbd1;outline-offset:2px;}
@media(max-width:360px){.calendar-month{padding-left:0;padding-right:0;}}
</style>
