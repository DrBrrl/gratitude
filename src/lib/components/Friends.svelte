<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { FirebaseClient } from '$lib/firebase/client';
  import { FriendsRepository, saveFriendProfile, appendFriendAction, acknowledgeHug, type FriendsView } from '$lib/friends/repository';
  import { canHug, emptyProfile, usernameKey, type PairType, type PairProjection, type Profile } from '$lib/friends/domain';
  import Icon from './Icon.svelte';

  let { client, uid }: { client: FirebaseClient; uid: string } = $props();
  let repository: FriendsRepository | null = null;
  let view = $state.raw<FriendsView>({ profile: emptyProfile(''), pairs: {}, peers: {}, ready: false, synced: false, error: '' });
  let username = $state(''), displayName = $state(''), discoverable = $state(true), editingProfile = $state(false), initializedForm = false;
  let search = $state(''), found = $state<Profile | null>(null), searched = $state(false), busy = $state(false), error = $state(''), notice = $state('');
  const pairs = $derived(Object.entries(view.pairs).sort(([,a],[,b]) => name(peer(a)).localeCompare(name(peer(b))) || handle(peer(a)).localeCompare(handle(peer(b)))));
  const incoming = $derived(pairs.filter(([,p]) => p.status === 'pending' && p.requesterUid !== uid));
  const outgoing = $derived(pairs.filter(([,p]) => p.status === 'pending' && p.requesterUid === uid));
  const friends = $derived(pairs.filter(([,p]) => p.status === 'accepted'));
  const blocked = $derived(pairs.filter(([,p]) => uid === p.members[0] ? p.blockedA : p.blockedB));
  const inbox = $derived(pairs.flatMap(([pairId,p]) => p.hugs.filter(h => h.to === uid).map(h => ({ ...h, pairId }))).sort((a,b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0,20));
  const foundPair = $derived(found ? pairs.find(([,p]) => p.members.includes(found!.uid))?.[1] : undefined);
  const disabled = $derived(busy || !view.synced);
  function peer(pair: PairProjection) { return pair.members.find(id => id !== uid)!; }
  function name(id: string) { return view.peers[id]?.displayName || 'Friend'; }
  function handle(id: string) { return view.peers[id]?.username ? `@${view.peers[id].username}` : 'Profile unavailable'; }
  function date(at: string) { return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(at)); }
  onMount(() => {
    const opened = new FriendsRepository(client.db, uid, `${client.projectId}:${base}`, next => {
      view = next;
      if (!initializedForm && next.ready) { initializedForm = true; username = next.profile.username; displayName = next.profile.displayName; discoverable = next.profile.sequence ? next.profile.discoverable : true; }
    });
    repository = opened;
    void opened.start().catch(() => {view={...view,ready:true};error='Friends could not be opened. Check your connection and reload.';});
    const offline = () => { view = { ...view, synced: false }; };
    const online = () => { void opened.sync().catch(() => {}); };
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    return () => { opened.stop(); repository = null; window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  });
  async function run(task: () => Promise<unknown>, message: string, recovery=false) {
    if (busy || (!view.synced && !recovery)) return;
    busy = true; error = ''; notice = '';
    try { await task(); await repository?.sync(); notice = message; }
    catch (cause) {
      const code = (cause as { code?: string }).code;
      error = code ? code === 'permission-denied' ? 'This action is no longer available. Refresh and check the friendship or username.' : 'Could not save. Check your connection and try again.' : cause instanceof Error ? cause.message : 'Please try again.';
    } finally { busy = false; }
  }
  function act(type: PairType | 'HugRead', targetUid: string, extra: { allowHugs?: boolean; hugId?: string; pairId?:string } = {}) {
    return run(() => type==='HugRead'?acknowledgeHug(client.db,uid,extra.pairId!,extra.hugId!):appendFriendAction(client.db, uid, { eventId: crypto.randomUUID(), type, targetUid, ...(type==='HugPreferencesChosen'?{allowHugs:extra.allowHugs}:{}) }), type === 'HugSent' ? 'A little hug, sent with care.' : type === 'HugRead' ? 'Hug marked as read.' : 'Friendship updated.');
  }
  async function saveProfile() {
    await run(async () => { await saveFriendProfile(client.db,uid,{username,displayName,discoverable}); editingProfile=false; }, 'Your friends profile is saved.');
  }
  async function findFriend() {
    if (disabled) return;
    busy=true;error='';notice='';found=null;searched=false;
    try { found=await repository!.find(search);searched=true; }
    catch(cause) {error=cause instanceof Error && !('code' in cause)?cause.message:'Could not search. Check your connection and try again.';}
    finally {busy=false;}
  }
</script>

<div class="friends-space">
  <h1>Friends & hugs</h1>
  <p class="intro">You can encourage your friends to practice gratitude by sending them a hug!</p>
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
          <button class="primary" disabled={disabled}>{view.profile.sequence?'Save profile changes':'Save friends profile'}</button>
          {#if view.profile.sequence}<button type="button" class="outline" onclick={() => editingProfile=false}>Cancel profile editing</button>{/if}
        </form>
      {:else}
        <div class="profile-heading"><Icon name="account" size={28} /><div><h2>{view.profile.displayName}</h2><p>@{view.profile.username}</p></div></div>
        <p class="hint">{#if view.profile.discoverable}People can find you by searching for your @<em>username</em>{:else}Your profile is hidden from new username searches.{/if}</p>
        <button class="outline" onclick={() => {username=view.profile.username;displayName=view.profile.displayName;discoverable=view.profile.discoverable;editingProfile=true;}}>Edit friends profile</button>
      {/if}
    </section>
    {#if view.profile.sequence}
      <section class="glass" aria-label="Add a friend">
        <h2>Add a friend</h2>
        <form onsubmit={event => {event.preventDefault();void findFriend();}}><label for="friend-search">Find your friend by searching for their @<em>username</em>!</label><div class="search-row"><input id="friend-search" bind:value={search} oninput={() => {found=null;searched=false;}} placeholder="@username" autocapitalize="none" autocomplete="off" spellcheck="false" disabled={disabled} /><button class="outline" disabled={disabled || !usernameKey(search)}>Find friend</button></div></form>
        {#if searched && !found}<p class="hint search-result" role="status">No profile found for that username.</p>{/if}
        {#if found}<div class="result search-result"><h3>{found.displayName}</h3><p>@{found.username}</p>
          {#if found.uid===uid}<p class="hint">That’s you!</p>
          {:else if foundPair?.blockedA || foundPair?.blockedB}<p class="hint">This connection is unavailable.</p>
          {:else if foundPair?.status==='accepted'}<p class="hint">You’re already friends.</p>
          {:else if foundPair?.status==='pending'}<p class="hint">A friend request is waiting below.</p>
          {:else}
            {#if foundPair?.requestedAt && Date.now()-Date.parse(foundPair.requestedAt)<86_400_000}<p class="hint">Give your friend some space. Another request can be sent after 24 hours.</p>
            {:else}<button class="outline" onclick={() => act('FriendRequestSent',found!.uid)} disabled={disabled}>Send friend request</button>{/if}
            <button class="quiet" onclick={() => act('FriendBlocked',found!.uid)} disabled={disabled}>Block {found.displayName}</button>
          {/if}
        </div>{/if}
      </section>
      {#if incoming.length}<section aria-label="Incoming friend requests"><h2>Friend requests</h2>{#each incoming as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint">{handle(peer(p))} would like to connect.</p><div class="actions"><button class="primary" onclick={() => act('FriendRequestAccepted',peer(p))} disabled={disabled}>Accept request from {name(peer(p))}</button><button class="outline" onclick={() => act('FriendRequestDeclined',peer(p))} disabled={disabled}>Decline request</button><button class="quiet" onclick={() => act('FriendBlocked',peer(p))} disabled={disabled}>Block {name(peer(p))}</button></div></article>{/each}</section>{/if}
      {#if outgoing.length}<section aria-label="Sent friend requests"><h2>Requests you sent</h2>{#each outgoing as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint">{handle(peer(p))} · waiting for a reply</p><button class="outline" onclick={() => act('FriendRequestCancelled',peer(p))} disabled={disabled}>Cancel request to {name(peer(p))}</button></article>{/each}</section>{/if}
      <section aria-label="Your friends"><h2>Your friends</h2>{#if !friends.length}<p class="hint">No friends yet. Add some to get started!</p>{/if}
        {#each friends as [id,p] (id)}<article class="glass friend-card"><div class="profile-heading"><Icon name="heart" size={24} /><div><h3>{name(peer(p))}</h3><p class="hint">{handle(peer(p))}</p></div></div>
          <button class="primary" onclick={() => act('HugSent',peer(p))} disabled={disabled || !canHug(p,uid,Date.now())}>Send a hug to {name(peer(p))}</button>
          <p class="hint">{(uid===p.members[0]?p.hugsB:p.hugsA)?'One gentle hug per friend every 24 hours.':'Your friend has paused incoming hugs.'}</p>
          <details><summary>Manage friendship with {name(peer(p))}</summary><div class="actions manage"><button class="outline" onclick={() => act('HugPreferencesChosen',peer(p),{allowHugs:!(uid===p.members[0]?p.hugsA:p.hugsB)})} disabled={disabled}>{(uid===p.members[0]?p.hugsA:p.hugsB)?'Pause hugs from':'Allow hugs from'} {name(peer(p))}</button><button class="outline" onclick={() => act('FriendRemoved',peer(p))} disabled={disabled}>Remove {name(peer(p))} as a friend</button><button class="quiet" onclick={() => act('FriendBlocked',peer(p))} disabled={disabled}>Block {name(peer(p))}</button></div></details>
        </article>{/each}
      </section>
      <section aria-label="Hug inbox"><h2>Your hugs <span class="hug-heart" aria-hidden="true"><Icon name="heart" size={22} filled /></span></h2>{#if !inbox.length}<p class="hint">Your friends' hugs will show up here!</p>{/if}
        {#each inbox as hug (hug.id)}<article class="glass hug" class:unread={!hug.read}><p><strong>{name(hug.from)}</strong> sent you a hug.</p><time datetime={hug.at}>{date(hug.at)}</time>{#if !hug.read}<button class="outline" onclick={() => act('HugRead',hug.from,{hugId:hug.id,pairId:hug.pairId})} disabled={disabled}>Mark hug from {name(hug.from)} as read</button>{:else}<p class="hint">Read, and kept with care.</p>{/if}</article>{/each}
      </section>
      {#if blocked.length}<section aria-label="Blocked people"><h2>Blocked people</h2>{#each blocked as [id,p] (id)}<article class="glass"><h3>{name(peer(p))}</h3><p class="hint">Unblocking does not restore the friendship.</p><button class="outline" onclick={() => act('FriendUnblocked',peer(p))} disabled={disabled}>Unblock {name(peer(p))}</button></article>{/each}</section>{/if}
    {/if}
    <button class="quiet recovery" onclick={() => run(() => repository!.rebuild(),'Friends view rebuilt from saved actions.',true)} disabled={busy}>Rebuild friends view</button>
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
</div>

<style>
  .friends-space { color:#f4f5fa; font-family:Arial,Helvetica,sans-serif; text-align:left; }
  /* Integral moving surfaces keep native borders stable across full-page scrolls. */
  .friends-space :is(section,article,div,h1,h2,h3,p,form,label,time,details,summary) { height:calc-size(auto,round(nearest,size,1px)); }
  h1 { font:600 2.4rem/1.15 Georgia,'Times New Roman',serif;letter-spacing:-.035em;margin:24px 0; }
  .profile-heading > div {min-width:0} h2,h3,.profile-heading p {overflow-wrap:anywhere} button {max-width:100%;overflow-wrap:anywhere}
  .hug-heart {color:#ffdf48;display:inline-flex;vertical-align:-.14em;}
  h2 {font:600 1.35rem/1.35 Georgia,serif;margin:0 0 14px;} h3 {font-size:1.05rem;margin:0 0 6px;}
  p {line-height:1.55;margin:0 0 14px;} .intro,.hint,time {color:#bfc5ce;} .intro{margin-bottom:24px}.hint,time {font-size:.85rem;line-height:1.6;}
  section {margin:0 0 24px;} .glass {background:linear-gradient(130deg,#333738c9,#11171cc9);border:1px solid #b6bec94d;border-radius:22px;padding:20px;backdrop-filter:blur(18px);margin-bottom:18px;}
  label{display:block;font-size:.9rem;margin:16px 0 8px;} input:not([type=checkbox]){width:100%;min-width:0;background:#10151a99;border:1px solid #89939c66;border-radius:10px;color:inherit;padding:12px;font:inherit;} input:focus{outline:none;border-color:#9da5ae;} .check{display:flex;gap:10px;align-items:center;margin:18px 0}.check input{accent-color:#ffdf48;width:18px;height:18px;flex-shrink:0;}
  button{font:inherit;min-height:44px;border-radius:12px;padding:10px 14px;cursor:pointer;color:inherit;}button:disabled{opacity:.5;cursor:default;} .primary{background:#ffdf48;color:#1e1d15;border:1px solid #ffdf48;} .outline{background:#bac5ce0a;border:1px solid #b6bec966;} .quiet{background:none;border:0;color:#c7ccd4;text-decoration:underline;text-underline-offset:4px;} button:focus-visible,summary:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px;} form>.primary,form>.outline{margin-right:8px;margin-top:10px}.profile-heading{display:flex;gap:12px;align-items:center;margin-bottom:14px}.profile-heading p,.profile-heading h2,.profile-heading h3{margin:0}.profile-heading :global(svg){color:#ffdf48;flex-shrink:0}.search-row{display:flex;gap:10px}.search-row input{flex:1}.search-row button{flex-shrink:0}.search-result{margin-top:18px}.actions{display:flex;flex-wrap:wrap;gap:10px}.friend-card>.primary{margin-bottom:10px}summary{font-size:.85rem;cursor:pointer;color:#c7ccd4;margin-top:16px;line-height:1.5}.manage{margin-top:14px}.hug time{display:block;margin:0 0 14px}.hug.unread{border-color:#f4d35e88}.notice{color:#e8d78e;padding:12px;border:1px solid #f4d35e55;border-radius:12px}.connection{color:#dbcd9b}.recovery{font-size:.85rem;padding-left:0} [role=alert]{color:#f6b3bf;line-height:1.5}
  @media(max-width:350px){.glass{padding:16px}.search-row{flex-wrap:wrap}.search-row input{flex-basis:100%}}
</style>
