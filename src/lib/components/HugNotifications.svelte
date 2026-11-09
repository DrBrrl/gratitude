<script lang="ts">
 import type {PushController,PushState} from '../push/controller';
 let {controller,state}:{controller:PushController|null;state:PushState}=$props();
</script>
<section class="glass push-notifications" aria-label="Hug notifications" data-ready={state.ready} aria-busy={state.busy}>
 <h2>Hug notifications</h2>
 <p>Get a little hug from your friends, even when Gratitude is closed.</p>
 {#if !state.ready}<p role="status">Checking this device…</p>
 {:else if !state.supported}<p>This browser doesn’t support background notifications.</p>
 {:else if !state.configured}<p>Background hugs aren’t available on this deployment yet.</p>
 {:else}
  <p class="status">{state.enabled?'On for this device':'Off for this device'}</p>
  {#if state.permission==='denied'}<p>Notifications are blocked. Allow them in your browser’s site settings, then try again.</p>{/if}
  {#if !state.online}<p>Connect to turn notifications on. You can still turn them off here.</p>{/if}
  <button class="outline" disabled={state.busy||!state.online&&!state.enabled} onclick={()=>state.enabled?controller?.disable():controller?.enable()}>{state.busy?'Updating notifications…':state.enabled?'Turn off hug notifications':'Turn on hug notifications'}</button>
  <p class="hint">Your browser will ask for permission when you turn these on. Choose separately on each device. Browser and battery settings can affect delivery.</p>
 {/if}
 {#if state.error}<p role="alert">{state.error}</p>{/if}
</section>
<style>
 .glass{background:linear-gradient(130deg,#333738c9,#11171cc9);border:1px solid var(--glass-border);border-radius:22px;padding:20px;backdrop-filter:blur(18px);margin-bottom:24px;}h2{font:600 1.35rem/1.35 Georgia,serif;margin:0 0 14px;}p{font:.85rem/1.6 Arial,Helvetica,sans-serif;color:#bfc5ce;margin:0 0 14px;}p.status{color:var(--accent-text);}p.hint{font-size:.78rem;margin:14px 0 0;}button{font:inherit;min-height:44px;border-radius:12px;padding:10px 14px;cursor:pointer;color:inherit;background:#bac5ce0a;border:1px solid var(--action-border);}button:disabled{opacity:.5;cursor:default;}button:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px;}[role=alert]{color:#f6b3bf;margin-top:14px;}
</style>
