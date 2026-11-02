<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { FirebaseClient } from '$lib/firebase/client';
  import { FriendsRepository, saveFriendProfile, appendFriendAction, type DiscoveredProfile, type FriendsView } from '$lib/friends/repository';
  import { canHug, huggedToday, emptyProfile, usernameKey, type PairType, type PairProjection } from '$lib/friends/domain';
  import Icon from './Icon.svelte';
  import HugNotifications from './HugNotifications.svelte';
  import type {PushController,PushState} from '../push/controller';
  import type { JournalView } from '../firebase/repository';
  import { saveGratitudeSharing, publishGratitude } from '../friends/sharing';
  import { gratitudeDays, streakSummary, communityStreak, emptySharing } from '../friends/streaks';
  import { dayInZone } from '../civil-date';

  let { client, uid, journal, pushController, pushState }: { client: FirebaseClient; uid: string; journal: JournalView; pushController:PushController|null;pushState:PushState } = $props();
  let repository: FriendsRepository | null = null;
  let view = $state.raw<FriendsView>({ sharing: emptySharing(''), gratitude: {}, streaksLoading: false, profile: emptyProfile(''), pairs: {}, peers: {}, ready: false, synced: false, error: '' });
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zoneChoices = [...new Set([browserZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort();
  let shareStreaks = $state(true), sharingZone = $state(browserZone);
  let username = $state(''), displayName = $state(''), discoverable = $state(true), editingProfile = $state(false), initializedForm = false;
  let search = $state(''), found = $state<DiscoveredProfile[]>([]), searchNext = $state<string|null>(null), searched = $state(false), busy = $state(false), error = $state(''), notice = $state('');
  const pairs = $derived(Object.entries(view.pairs).sort(([,a],[,b]) => name(peer(a)).localeCompare(name(peer(b))) || handle(peer(a)).localeCompare(handle(peer(b)))));
  const incoming = $derived(pairs.filter(([,p]) => p.status === 'pending' && p.requesterUid !== uid));
  const outgoing = $derived(pairs.filter(([,p]) => p.status === 'pending' && p.requesterUid === uid));
  const friends = $derived(pairs.filter(([,p]) => p.status === 'accepted'));
  const blocked = $derived(pairs.filter(([,p]) => uid === p.members[0] ? p.blockedA : p.blockedB));
  let now = $state(Date.now());
  const utcOffset = $derived(-new Date(now).getTimezoneOffset());
  const disabled = $derived(busy || !view.synced);
  function peer(pair: PairProjection) { return pair.members.find(id => id !== uid)!; }
  function name(id: string) { return view.peers[id]?.displayName || 'Friend'; }
  function handle(id: string) { return view.peers[id]?.username ? `@${view.peers[id].username}` : 'Profile unavailable'; }
  function peerStreak(peerUid: string) {
    const snapshot = view.gratitude[peerUid];
    return snapshot ? streakSummary(snapshot.days, dayInZone(new Date(now).toISOString(), snapshot.timeZone)).current : null;
  }
  const communities = $derived.by(() => {
    if (!view.sharing.enabled || !view.sharing.timeZone || !journal.ready) return [];
    const own = gratitudeDays(journal.state.entries, view.sharing.timeZone);
    const today = dayInZone(new Date(now).toISOString(), view.sharing.timeZone);
    return friends.flatMap(([, pair]) => {
      const person = peer(pair), snapshot = view.gratitude[person];
      if (!snapshot) return [];
      const theirsToday = dayInZone(new Date(now).toISOString(), snapshot.timeZone);
      const summary = communityStreak(own, snapshot.days, today < theirsToday ? today : theirsToday);
      return summary.longest ? [{ uid: person, ...summary }] : [];
    });
  });
  function streakArticle(days: number) {
    const text = String(days), first = Number(text.slice(0, (text.length - 1) % 3 + 1));
    return first === 8 || first === 11 || first === 18 || first >= 80 && first < 90 || first >= 800 && first < 900 ? 'an' : 'a';
  }
  function editProfile() {
    username=view.profile.username;displayName=view.profile.displayName;discoverable=view.profile.discoverable;
    shareStreaks=view.sharing.sequence ? view.sharing.enabled : true; sharingZone=view.sharing.timeZone ?? browserZone;editingProfile=true;
  }
  onMount(() => {
    const opened = new FriendsRepository(client.db, uid, `${client.projectId}:${base}`, next => {
      view = next;
      if (!initializedForm && next.ready) { initializedForm = true; username = next.profile.username; displayName = next.profile.displayName; discoverable = next.profile.sequence ? next.profile.discoverable : true; }
    });
    repository = opened;
    void opened.start().catch(() => {view={...view,ready:true};error='Friends could not be opened. Check your connection and reload.';});
    const offline = () => { view = { ...view, synced: false }; };
    const online = () => { void opened.sync().catch(() => {}); };
    const clock = setInterval(() => now = Date.now(), 30_000);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    return () => { clearInterval(clock); opened.stop(); repository = null; window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  });
  async function run(task: () => Promise<unknown>, message: string, recovery=false) {
    if (busy || (!view.synced && !recovery)) return false;
    busy = true; error = ''; notice = '';let saved=false;
    try { await task(); await repository?.sync(); notice = message;saved=true; }
    catch (cause) {
      const code = (cause as { code?: string }).code;
      error = code ? code === 'permission-denied' ? 'This action is no longer available. Refresh and check the friendship or username.' : 'Could not save. Check your connection and try again.' : cause instanceof Error ? cause.message : 'Please try again.';
    } finally { busy = false; now = Date.now(); }
    return saved;
  }
  function act(type: PairType, targetUid: string, extra: { allowHugs?: boolean } = {}) {
    return run(() => appendFriendAction(client.db, uid, { eventId: crypto.randomUUID(), type, targetUid, ...(type==='HugPreferencesChosen'?{allowHugs:extra.allowHugs}:type==='HugSent'?{utcOffsetMinutes:-new Date().getTimezoneOffset()}:{}) }), type === 'HugSent' ? 'Hug sent!' : 'Friendship updated.');
  }
  async function saveProfile() {
    editingProfile=true;
    const saved=await run(async () => {
      await saveFriendProfile(client.db,uid,{username,displayName,discoverable});
      if (!view.sharing.sequence || view.sharing.enabled !== shareStreaks || shareStreaks && view.sharing.timeZone !== sharingZone) {
        const sharing = await saveGratitudeSharing(client.db,uid,{enabled:shareStreaks,timeZone:sharingZone},view.sharing.lastEventId);
        if (journal.ready && journal.status === 'Synced') await publishGratitude(client.db,uid,sharing,journal.state);
      }
    }, 'Your friends profile is saved.');
    if(saved)editingProfile=false;
  }
  async function findFriend(more = false) {
    if (disabled) return;
    busy=true;error='';notice='';if(!more){found=[];searched=false;searchNext=null;}
    try { const result = await repository!.find(search, more ? searchNext ?? undefined : undefined); found = more ? [...found, ...result.profiles] : result.profiles; searchNext = result.next; searched=true; }
    catch(cause) {error=cause instanceof Error && !('code' in cause)?cause.message:'Could not search. Check your connection and try again.';}
    finally {busy=false;}
  }

</script>

<div class="friends-space" aria-busy={busy} data-streaks-loading={view.streaksLoading}>
  <h1>Friends & hugs</h1>
  <p class="intro">You can encourage your friends to practice gratitude by sending them one hug per day!</p>
  {#if !view.ready}<p role="status">Opening your friends…</p>{:else}
    {#if !view.synced}<p class="connection" role="status">Saved on this device. Connect to refresh friends and send hugs.</p>{/if}
    <section class="glass" aria-label="Your friends profile">
      {#if !view.profile.sequence || editingProfile}
        <h2>Your friends profile</h2>
        <p class="hint">Choose the name and username people will see. Your Google name, email and journal are not shared.</p>
        <form onsubmit={event => {event.preventDefault();void saveProfile();}}>
          <label for="friend-name">Display name</label><input id="friend-name" bind:value={displayName} maxlength="60" autocomplete="nickname" required disabled={disabled} />
          <label for="friend-username">Your username</label><input id="friend-username" bind:value={username} maxlength="30" autocapitalize="none" autocomplete="off" spellcheck="false" required disabled={disabled} aria-describedby="username-hint" />
          <p class="hint" id="username-hint">3–24 letters, numbers or underscores, starting with a letter. Usernames ignore capital letters.</p>
          <label class="check"><input type="checkbox" bind:checked={discoverable} disabled={disabled} />Let people find me by username</label>
          <label class="check"><input type="checkbox" bind:checked={shareStreaks} disabled={disabled} />Share my gratitude streaks with friends</label>
          <p class="hint">Friends can see the dates you practised gratitude and your streaks. Prompts, reflections and photos stay private.</p>
          {#if shareStreaks}<label for="sharing-zone">Shared calendar timezone</label><select id="sharing-zone" bind:value={sharingZone} disabled={disabled}>{#each zoneChoices as zone}<option value={zone}>{zone}</option>{/each}</select><p class="hint">Use the same shared calendar dates across your devices.</p>{/if}
          <button class="primary" disabled={disabled}>{view.profile.sequence?'Save profile changes':'Save friends profile'}</button>
          {#if view.profile.sequence}<button type="button" class="outline" onclick={() => editingProfile=false}>Cancel profile editing</button>{/if}
        </form>
      {:else}
        <div class="profile-heading"><Icon name="account" size={28} /><div><h2>{view.profile.displayName}</h2><p><em>@{view.profile.username}</em></p></div></div>
        <p class="hint">{#if view.profile.discoverable}People can find you by searching for your <em>@username</em>{:else}Your profile is hidden from new username searches.{/if}</p>
        <p class="hint">{view.sharing.sequence ? view.sharing.enabled ? 'Your gratitude streaks are shared with accepted friends.' : 'Your gratitude streaks are hidden from friends.' : 'Review streak sharing to start your community calendar.'}</p>
        <button class="outline" onclick={editProfile}>Edit friends profile</button>
      {/if}
    </section>
    {#if view.profile.sequence}
      <section class="glass" aria-label="Add a friend">
        <h2>Add a friend</h2>
        <form onsubmit={event => {event.preventDefault();void findFriend();}}><label class="sr-only" for="friend-search">Search for friends by username</label><div class="search-row"><div class="search-input"><input id="friend-search" type="search" bind:value={search} oninput={() => {found=[];searched=false;searchNext=null;}} placeholder=" " autocapitalize="none" autocomplete="off" spellcheck="false" disabled={disabled} />{#if !search}<span class="search-placeholder" aria-hidden="true">Search for your friend's{' '}<em>@username</em></span>{/if}</div><button class="outline" disabled={disabled || usernameKey(search).length<3}>Find friend</button></div></form>
        <p class="hint search-help">Use at least 3 characters from any part of their username.</p>
        {#if searched && !found.length}<p class="hint search-result" role="status">No profile found for that username.</p>{/if}
        {#each found as person (person.uid)}
          {@const foundPair = pairs.find(([,pair]) => pair.members.includes(person.uid))?.[1]}
          <article class="result search-result" aria-label={`Friend match @${person.username}`}><h3>{person.displayName}</h3><p><em>@{person.username}</em></p>
          {#if person.uid===uid}<p class="hint">That’s you!</p>
          {:else if foundPair?.blockedA || foundPair?.blockedB}<p class="hint">This connection is unavailable.</p>
          {:else if foundPair?.status==='accepted'}<p class="hint">You’re already friends.</p>
          {:else if foundPair?.status==='pending'}<p class="hint">A friend request is waiting below.</p>
          {:else}
            {#if foundPair?.requestedAt && Date.now()-Date.parse(foundPair.requestedAt)<86_400_000}<p class="hint">Give your friend some space. Another request can be sent after 24 hours.</p>
            {:else}<button class="outline" onclick={() => act('FriendRequestSent',person.uid)} disabled={disabled}>Send friend request</button>{/if}
            <button class="quiet" onclick={() => act('FriendBlocked',person.uid)} disabled={disabled}>Block {person.displayName}</button>
          {/if}
        </article>{/each}
        {#if searchNext}<button class="outline more-matches" onclick={() => findFriend(true)} disabled={disabled}>More matches</button>{/if}
      </section>
      {#if incoming.length}<section aria-label="Incoming friend requests"><h2>Friend requests</h2>{#each incoming as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint"><em>{handle(peer(p))}</em> would like to connect.</p><div class="actions"><button class="primary" onclick={() => act('FriendRequestAccepted',peer(p))} disabled={disabled}>Accept request from {name(peer(p))}</button><button class="outline" onclick={() => act('FriendRequestDeclined',peer(p))} disabled={disabled}>Decline request</button><button class="quiet" onclick={() => act('FriendBlocked',peer(p))} disabled={disabled}>Block {name(peer(p))}</button></div></article>{/each}</section>{/if}
      {#if outgoing.length}<section aria-label="Sent friend requests"><h2>Requests you sent</h2>{#each outgoing as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint"><em>{handle(peer(p))}</em> · waiting for a reply</p><button class="outline" onclick={() => act('FriendRequestCancelled',peer(p))} disabled={disabled}>Cancel request to {name(peer(p))}</button></article>{/each}</section>{/if}
      <section aria-label="Your friends"><h2>Your friends</h2>{#if !friends.length}<p class="hint">No friends yet. Add some to get started!</p>{/if}
        {#each friends as [id,p] (id)}<article class="glass friend-card"><div class="profile-heading"><svg class="gratitude-star" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z" /></svg><div><h3>{name(peer(p))}{#if peerStreak(peer(p)) !== null}<span class="friend-streak">{' '}({peerStreak(peer(p))} days of gratitude in a row)</span>{/if}</h3><p class="hint"><em>{handle(peer(p))}</em></p></div><button class="outline hug-button" aria-label={`Send a hug to ${name(peer(p))}`} aria-pressed={huggedToday(p,uid,now,utcOffset)} title={huggedToday(p,uid,now,utcOffset)?'Hug sent today':`Send a hug to ${name(peer(p))}`} onclick={() => act('HugSent',peer(p))} disabled={disabled || !canHug(p,uid,now,utcOffset)}><Icon name="heart" size={28} filled={huggedToday(p,uid,now,utcOffset)} /></button></div>
          {#if !(uid===p.members[0]?p.hugsB:p.hugsA)}<p class="hint">Your friend has paused incoming hugs.</p>{/if}
          <details><summary>Manage friendship with {name(peer(p))}</summary><div class="actions manage"><button class="outline" onclick={() => act('HugPreferencesChosen',peer(p),{allowHugs:!(uid===p.members[0]?p.hugsA:p.hugsB)})} disabled={disabled}>{(uid===p.members[0]?p.hugsA:p.hugsB)?'Pause hugs from':'Allow hugs from'} {name(peer(p))}</button><button class="outline" onclick={() => act('FriendRemoved',peer(p))} disabled={disabled}>Remove {name(peer(p))} as a friend</button><button class="quiet" onclick={() => act('FriendBlocked',peer(p))} disabled={disabled}>Block {name(peer(p))}</button></div></details>
        </article>{/each}
      </section>
      <section aria-label="Community gratitude"><h2>Community gratitude</h2>
        {#if !communities.length}<p class="hint">Your community streaks will show up here!</p>{/if}
        {#each communities as streak (streak.uid)}<article class="glass community-streak">
          {#if streak.current}<p>{view.profile.displayName} and {name(streak.uid)} have {streakArticle(streak.current)} <strong>{streak.current} day gratitude streak.</strong></p>
          {:else}<p>{view.profile.displayName} and {name(streak.uid)}’s longest gratitude streak: <strong>{streak.longest} {streak.longest===1?'day':'days'}.</strong></p>{/if}
        </article>{/each}
      </section>
      {#if blocked.length}<section aria-label="Blocked people"><h2>Blocked people</h2>{#each blocked as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint">Unblocking does not restore the friendship.</p><button class="outline" onclick={() => act('FriendUnblocked',peer(p))} disabled={disabled}>Unblock {name(peer(p))}</button></article>{/each}</section>{/if}
    {/if}
    <HugNotifications controller={pushController} state={pushState} />
    <button class="quiet recovery" onclick={() => run(() => repository!.rebuild(),'Friends view rebuilt from saved actions.',true)} disabled={busy}>Rebuild friends view</button>
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
</div>

<style>
  .sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0; }
  .search-input { position:relative;flex:1;min-width:0; }.search-placeholder { position:absolute;inset:0;padding:0 10px;color:#aab2be;font-size:.7rem;line-height:42px;pointer-events:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }.search-input input { height:42px;min-height:42px;padding:9px 10px; }.search-row button { height:42px;min-height:42px;padding:8px 8px;font-size:.8rem; }.search-help { font-size:.75rem;margin:10px 0 0; }.more-matches{margin-top:16px;}
  .friend-streak { font-size:.78rem;font-weight:400;color:#bfc5ce;line-height:1.5; }.community-streak p { margin:0; }.community-streak strong { color:var(--accent-text);font-weight:600; } select { width:100%;padding:12px;border:1px solid var(--glass-border);border-radius:10px;background:#10151a;color:inherit;font:inherit; }
  .friend-card .profile-heading > div { flex:1; }.hug-button { display:grid;place-items:center;width:46px;height:46px;padding:6px;flex-shrink:0;color:var(--accent-highlight);border-color:var(--action-border); }.hug-button[aria-pressed=true] { opacity:1; }
  .friends-space { color:#f4f5fa; font-family:Arial,Helvetica,sans-serif; text-align:left; }
  /* Integral moving surfaces keep native borders stable across full-page scrolls. */
  .friends-space :is(section,article,div,h1,h2,h3,p,form,label,details,summary) { height:calc-size(auto,round(nearest,size,1px)); }
  h1 { font:600 2.4rem/1.15 Georgia,'Times New Roman',serif;letter-spacing:-.035em;margin:24px 0; }
  .profile-heading > div {min-width:0} h2,h3,.profile-heading p {overflow-wrap:anywhere} button {max-width:100%;overflow-wrap:anywhere}
  h2 {font:600 1.35rem/1.35 Georgia,serif;margin:0 0 14px;} h3 {font-size:1.05rem;margin:0 0 6px;}
  p {line-height:1.55;margin:0 0 14px;} .intro,.hint {color:#bfc5ce;} .intro{margin-bottom:24px}.hint {font-size:.85rem;line-height:1.6;}
  section {margin:0 0 24px;} .glass {background:linear-gradient(130deg,#333738c9,#11171cc9);border:1px solid var(--glass-border);border-radius:22px;padding:20px;backdrop-filter:blur(18px);margin-bottom:18px;}
  label{display:block;font-size:.9rem;margin:16px 0 8px;} input:not([type=checkbox]){width:100%;min-width:0;background:#10151a99;border:1px solid var(--glass-border);border-radius:10px;color:inherit;padding:12px;font:inherit;} input:focus{outline:none;border-color:var(--action-border);} .check{display:flex;gap:10px;align-items:center;margin:18px 0}.check input{accent-color:var(--accent-text);width:18px;height:18px;flex-shrink:0;}
  button{font:inherit;min-height:44px;border-radius:12px;padding:10px 14px;cursor:pointer;color:inherit;}button:disabled{opacity:.5;cursor:default;} .primary{background:var(--accent-pale);color:#1e1d15;border:1px solid var(--accent-text);} .outline{background:#bac5ce0a;border:1px solid var(--action-border);} .quiet{background:none;border:0;color:#c7ccd4;text-decoration:underline;text-underline-offset:4px;} button:focus-visible,summary:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px;} form>.primary,form>.outline{margin-right:8px;margin-top:10px}.profile-heading{display:flex;gap:12px;align-items:center;margin-bottom:14px}.profile-heading p,.profile-heading h2,.profile-heading h3{margin:0}.profile-heading :global(svg){color:var(--accent-highlight);flex-shrink:0}.search-row{display:flex;gap:10px}.search-row input{flex:1}.search-row button{flex-shrink:0}.search-result{margin-top:18px}.actions{display:flex;flex-wrap:wrap;gap:10px}summary{font-size:.85rem;cursor:pointer;color:#c7ccd4;margin-top:16px;line-height:1.5}.manage{margin-top:14px}.notice{color:var(--accent-soft);padding:12px;border:1px solid var(--glass-border);border-radius:12px}.connection{color:var(--accent-soft)}.recovery{font-size:.85rem;padding-left:0} [role=alert]{color:#f6b3bf;line-height:1.5}
  @media(max-width:350px){.glass{padding:16px}.search-row{flex-wrap:wrap}.search-row .search-input{flex-basis:100%}}
</style>
