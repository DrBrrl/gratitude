<script lang="ts">
  import {WEEKDAYS} from '../calendar-preferences';
  let {value=$bindable(0),disabled=false}:{value?:number;disabled?:boolean}=$props();
</script>
<div class="week-preference">
  <label for="week-start">Start my week on</label>
  <select id="week-start" bind:value {disabled}>{#each WEEKDAYS as day,index}<option value={index}>{day}</option>{/each}</select>
  <p>Applies to all your calendars. Your reflection dates, colours and gratitude streaks stay the same.</p>
</div>
<style>
  .week-preference{margin:18px 0;text-align:left}label{display:block;font-size:.9rem;font-weight:600;color:#e0e4eb;margin-bottom:8px}select{box-sizing:border-box;width:100%;padding:10px 12px;min-height:44px;border:1px solid var(--glass-border);border-radius:10px;background:#161b23;color:#e0e4eb;font:inherit}p{margin:9px 0 0;font-size:.8rem;line-height:1.5;color:#b9c1ce}select:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px}
</style>
