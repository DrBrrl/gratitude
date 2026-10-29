<script lang="ts">
  import { onMount } from 'svelte';
  import { weekCells,summarizeStretches,civilDate,shiftDay,validDay,type DayIndex } from '$lib/calendar';
  import CalendarDay from './CalendarDay.svelte';
  let {index,today,activeDay=$bindable<string|null>(null),ready=true,cached=false,onopen,onchoose}:{index:DayIndex;today:string;activeDay?:string|null;ready?:boolean;cached?:boolean;onopen:(day:string)=>void;onchoose:(day:string)=>void}=$props();
  const cells=$derived(weekCells(index,activeDay??today,today));const streak=$derived(summarizeStretches(index,today));
  const currentWeek=$derived(cells.some(cell=>cell.day===today));
  const range=$derived.by(()=>{const format=new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',day:'numeric',month:'short',...(cells[0].day.slice(0,4)!==cells[6].day.slice(0,4)?{year:'numeric'}:{})});return `${format.format(civilDate(cells[0].day))} – ${format.format(civilDate(cells[6].day))}`;});
  let region:HTMLElement;
  let pointer:{id:number;x:number;y:number}|null=null;
  let suppressClick=false;
  let wheelDelta=0,wheelLocked=false,wheelTimer:ReturnType<typeof setTimeout>;
  function moveWeek(direction:number) {
    const next=shiftDay(activeDay??today,direction*7);
    if(validDay(next))activeDay=weekCells(index,next,today).some(cell=>cell.today)?null:next;
  }
  function pointerDown(event:PointerEvent) {
    suppressClick=false;
    if(event.isPrimary && event.button===0)pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  }
  function pointerUp(event:PointerEvent) {
    const start=pointer;pointer=null;
    if(!start || start.id!==event.pointerId)return;
    const x=event.clientX-start.x,y=event.clientY-start.y;
    if(Math.abs(x)>=40 && Math.abs(x)>Math.abs(y)*1.5){suppressClick=true;moveWeek(x<0?1:-1);}
  }
  function keyDown(event:KeyboardEvent) {
    if(event.key!=='ArrowLeft' && event.key!=='ArrowRight')return;
    event.preventDefault();moveWeek(event.key==='ArrowRight'?1:-1);region.focus({preventScroll:true});
  }
  function wheel(event:WheelEvent) {
    if(Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
    event.preventDefault();
    clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelLocked=false;wheelDelta=0;},200);
    if(wheelLocked)return;
    wheelDelta+=event.deltaX*(event.deltaMode===1?16:event.deltaMode===2?region.clientWidth:1);
    if(Math.abs(wheelDelta)>=30){moveWeek(wheelDelta>0?1:-1);wheelLocked=true;wheelDelta=0;}
  }
  onMount(()=>{
    region.addEventListener('wheel',wheel,{passive:false});
    return()=>{region.removeEventListener('wheel',wheel);clearTimeout(wheelTimer);};
  });
</script>
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The named week region deliberately supports swipe gestures and left/right arrow-key navigation as well as its date buttons.) -->
<section class="week-box" bind:this={region} tabindex="0" aria-label={currentWeek?'This week’s gratitude':`Gratitude for ${range}`} onkeydown={keyDown} onpointerdown={pointerDown} onpointerup={pointerUp} onpointercancel={()=>pointer=null} onclickcapture={event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}}}>
  <button class="week-open" type="button" aria-label="Open calendar" onclick={()=>onopen(activeDay??today)}>
    <strong>{#if ready}{streak.current} {streak.current===1?'day':'days'} of gratitude in a row{:else}Opening your calendar…{/if}</strong><span aria-hidden="true">▦</span>
    <small aria-live="polite">{currentWeek?'This week':'Week'} · {range}</small>
  </button>
  {#if ready}<div class="weekdays" aria-hidden="true">{#each ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as day}<span>{day}</span>{/each}</div>
    <div class="dates">{#each cells as cell (cell.day)}<CalendarDay {cell} {onchoose} />{/each}</div>
    {#if cached}<p class="cache-note">Saved on this device · waiting to sync</p>{/if}
  {/if}
</section>
<style>
 .week-box{position:relative;margin:16px 0 22px;padding:10px 8px 9px;border:1px solid #c4c6cc42;border-radius:16px;background:linear-gradient(120deg,#464b5038,#12161be3 70%,#c2a55216);backdrop-filter:blur(18px);touch-action:pan-y;}
 .week-open{display:grid;grid-template-columns:1fr auto;gap:6px 8px;width:100%;min-height:44px;background:none;border:0;color:#d8dbe2;font:inherit;text-align:left;cursor:pointer;padding:3px 7px 9px;border-radius:7px;}
 strong{font-size:.86rem;line-height:1.4;font-weight:600;} .week-open>span{color:#e5cd65;font-size:1.25rem;grid-column:2;grid-row:1/3;align-self:center;} small{font-size:.68rem;color:#a6adb9;grid-column:1;}
 .week-open::after{content:"";position:absolute;inset:0;border-radius:16px;} .dates{position:relative;z-index:1;} .weekdays{pointer-events:none;}
 .weekdays,.dates{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));text-align:center;}.weekdays{font-size:.65rem;color:#a6adb9;line-height:20px;}.cache-note{font-size:.7rem;color:#abb2bd;margin:8px 6px 0;}button:focus-visible,.week-box:focus-visible{outline:2px solid #c7cbd2;outline-offset:2px;}
@media(max-width:360px){.week-box{padding-left:0;padding-right:0;}}
</style>
