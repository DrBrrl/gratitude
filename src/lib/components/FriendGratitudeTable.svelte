<script lang="ts">
  export type FriendGratitudeRow={id:string;name:string;handle:string;current:number|null;ownGrateful:boolean|null;peerGrateful:boolean|null;ownToday:string|null;peerToday:string|null;unavailable:string|null};
  let {rows,cached=false}:{rows:FriendGratitudeRow[];cached?:boolean}=$props();
  const status=(done:boolean|null)=>done===null?'Unavailable':done?'Grateful':'Not yet';
  const heart='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z';
</script>
{#if rows.length}
<section class="friend-gratitude" aria-label="Gratitude with friends">
 <h2>Gratitude together</h2>
 <p class="hint">Left half: you. Right half: your friend. Each half follows that person’s current gratitude day. Streaks count from when you became friends. Backfill a missed day to repair your shared streak.</p>
 <div class="table-glass">
  <table aria-label="Shared gratitude streaks">
   <thead><tr><th scope="col">Friend</th><th scope="col">Today</th><th scope="col">Together</th></tr></thead>
   <tbody>{#each rows as row (row.id)}
    <tr>
     <th scope="row"><span class="name">{row.name}</span><em>{row.handle}</em></th>
     <td class="day-status">
      <svg viewBox="0 0 24 24" width="34" height="34" role="img" aria-label={`You: ${status(row.ownGrateful)}. ${row.name}: ${status(row.peerGrateful)}.`}>
       <defs><clipPath id={`heart-left-${row.id}`}><rect x="0" y="0" width="12" height="24"/></clipPath><clipPath id={`heart-right-${row.id}`}><rect x="12" y="0" width="12" height="24"/></clipPath></defs>
       <path d={heart} fill={row.ownGrateful?'var(--accent-highlight)':'#ffffff12'} clip-path={`url(#heart-left-${row.id})`}/>
       <path d={heart} fill={row.peerGrateful?'var(--accent-highlight)':'#ffffff12'} clip-path={`url(#heart-right-${row.id})`}/>
       <path d={heart} fill="none" stroke="var(--accent-highlight)" stroke-width="1.2" opacity={row.unavailable ? 0.6 : 1}/>
      </svg>
      <small title={row.ownToday?`Your day: ${row.ownToday}`:undefined}>You: {status(row.ownGrateful)}</small>
      <small title={row.peerToday?`${row.name}’s day: ${row.peerToday}`:undefined}>Friend: {status(row.peerGrateful)}</small>
     </td>
     <td class="streak">{#if row.current!==null}<strong>{row.current}</strong><span>{row.current===1?'day':'days'} in a row</span>{:else}<span class="unavailable">{row.unavailable}</span>{/if}</td>
    </tr>
   {/each}</tbody>
  </table>
 </div>
 {#if cached}<p class="hint cache-note">Saved on this device · waiting to sync</p>{/if}
</section>
{/if}
<style>
 h2{font:600 1.35rem/1.35 Georgia,serif;margin:0 0 14px}.hint{font:.8rem/1.6 Arial,Helvetica,sans-serif;color:#bfc5ce;margin:0 0 14px}.table-glass{border:1px solid var(--glass-border);border-radius:18px;overflow:hidden;background:linear-gradient(130deg,#333738c9,#11171cc9)}table{width:100%;table-layout:fixed;border-collapse:collapse;font:.82rem/1.45 Arial,Helvetica,sans-serif;color:#e4e7ed}thead{background:#ffffff06}th,td{padding:12px 9px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}thead th{font-size:.73rem;color:#bdc5d2}thead th:first-child{width:36%}thead th:nth-child(2){width:31%}tbody tr+tr{border-top:1px solid #ffffff14}tbody th{font-weight:400}.name{display:block;font-weight:600}em{display:block;margin-top:4px;font-size:.72rem;color:#aeb8c6}.day-status svg{display:block;margin:0 auto 6px}.day-status small{display:block;font-size:.66rem;text-align:center;color:#bdc6d3}.streak strong{display:block;font-size:1.25rem;color:var(--accent-highlight);font-weight:600}.streak span{display:block;font-size:.7rem;color:#bfc5ce}.cache-note{margin-top:10px}.unavailable{line-height:1.5}thead th:nth-child(2){text-align:center}
</style>
