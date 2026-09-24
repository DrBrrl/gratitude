<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
  import { createFirebaseClient, googleSignIn, type FirebaseClient } from '$lib/firebase/client';
  import { JournalRepository, type JournalView } from '$lib/firebase/repository';
  import { emptyProjection, STARTER_ID, STARTER_PROMPT, type Entry } from '../../../functions/src/domain';

  let client: FirebaseClient | null = null;
  let repository: JournalRepository | null = null;
  let user = $state<User | null>(null);
  let configured = $state(false);
  let initialized = $state(false);
  let busy = $state(false);
  let error = $state('');
  let text = $state('');
  let editing = $state<Entry | null>(null);
  let view = $state<JournalView>({ state: emptyProjection(), pending: null, status: '', error: '', ready: false });
  const colours = ['#b35e66', '#b67a51', '#b89a49', '#638b60', '#509092', '#647bb4', '#9475ad'];

  onMount(() => {
    let stopAuth = () => {};
    let session = 0;
    try {
      client = createFirebaseClient(); configured = !!client;
      if (client) {
        stopAuth = onAuthStateChanged(client.auth, (next) => {
          const current = ++session;
          repository?.stop(); repository = null;
          user = next; text = ''; editing = null; error = '';
          view = { state: emptyProjection(), pending: null, status: '', error: '', ready: false };
          initialized = true;
          if (next && client) {
            repository = new JournalRepository(client, next.uid, (value) => {
              if (session === current) view = value;
            });
            void repository.start().catch(() => { if (session === current) error = 'Local storage is unavailable. Your journal could not be opened.'; });
          }
        });
      } else initialized = true;
    } catch { initialized = true; error = 'Sign-in is unavailable. Please try again later.'; }
    const online = () => { void repository?.retry(); };
    window.addEventListener('online', online);
    return () => { session++; stopAuth(); repository?.stop(); window.removeEventListener('online', online); };
  });
  async function signIn() {
    if (!client) return;
    busy = true; error = '';
    try { await googleSignIn(client); }
    catch { error = 'Sign-in was not completed. You can try again.'; }
    finally { busy = false; }
  }
  async function leave() {
    if (!client || (text.trim() && !confirm('Discard the text in this editor and sign out?'))) return;
    try { await signOut(client.auth); } catch { error = 'Sign-out failed. Please try again.'; }
  }
  async function save() {
    if (!repository) return;
    busy = true; error = '';
    try {
      await repository.save({ eventId: crypto.randomUUID(), type: 'ReflectionWritten', schemaVersion: 1,
        payload: { entryId: editing?.id ?? crypto.randomUUID(), text, expectedRevision: editing?.revision ?? 0, starterId: STARTER_ID } });
      text = ''; editing = null;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Save failed. Your text is still here.'; }
    finally { busy = false; }
  }
  function edit(entry: Entry) {
    if (text.trim() && !confirm('Replace the unsaved text in this editor?')) return;
    editing = { ...entry }; text = entry.text;
    document.getElementById('reflection')?.focus();
  }
  async function recoverPending() {
    const pending = view.pending;
    if (!pending || !repository) return;
    if (text.trim() && !confirm('Replace the editor text with your pending save?')) return;
    try {
      await repository.discardPending();
      text = pending.payload.text;
      editing = view.state.entries.find((entry) => entry.id === pending.payload.entryId) ?? null;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Please try again.'; }
  }
</script>

<svelte:head><title>Your journal · Gratitude</title><meta name="robots" content="noindex" /></svelte:head>
<main>
  <a href={`${base}/`}>← Gratitude</a>
  <h1>Your journal</h1>
  {#if !initialized}
    <p role="status">Opening Gratitude…</p>
  {:else if !configured}
    <section><h2>Your private space is coming soon</h2><p>Account sign-in is not available on this site yet.</p></section>
  {:else if !user}
    <section><h2>A little space for you</h2><p>Sign in with Google to keep your reflections together across your devices.</p><button onclick={signIn} disabled={busy}>Continue with Google</button></section>
  {:else}
    <div class="account"><span>{user.email}</span><button class="secondary" onclick={leave}>Sign out</button></div>
    <p role="status">{view.status}</p>
    {#if view.ready}
      <section>
        <p class="eyebrow">Starter prompt</p><h2>{STARTER_PROMPT}</h2>
        <label for="reflection">Your reflection</label>
        <textarea id="reflection" bind:value={text} maxlength="10000" rows="5"></textarea>
        <p class="hint">Your text is saved when you choose Save reflection. AI prompts are coming later.</p>
        <button onclick={save} disabled={busy || !text.trim() || !!view.pending}>{editing ? 'Save changes' : 'Save reflection'}</button>
      </section>
    {/if}
    {#if view.pending}
      <section><h2>A reflection is waiting to sync</h2><p class="entry-text">{view.pending.payload.text}</p><button onclick={() => repository?.retry()} disabled={busy}>Retry sync</button><button class="secondary" onclick={recoverPending}>Return text to editor</button></section>
    {/if}
    <h2>Saved reflections</h2>
    {#if view.ready && view.state.entries.length === 0}<p>No saved reflections yet.</p>{/if}
    {#each [...view.state.entries].reverse() as entry (entry.id)}
      <article style:border-color={colours[entry.colour]}>
        <h3>Prompt</h3><p>{entry.prompt}</p><h3>Reflection</h3><p class="entry-text">{entry.text}</p>
        <button class="secondary" onclick={() => edit(entry)} disabled={!!view.pending || busy}>Edit reflection</button>
      </article>
    {/each}
    <details><summary>Journal recovery</summary><p>Rebuild this device’s view from your saved account history. Your reflections stay in your account.</p><button class="secondary" onclick={() => repository?.rebuild().catch(() => error = 'Could not rebuild. Please reload and try again.')} disabled={busy}>Rebuild local view</button></details>
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
</main>
<style>
  :global(html) { color-scheme: dark; background: #0c0d10; }
  :global(body) { margin: 0; color: #f4f5fa; font-family: system-ui, sans-serif; }
  main { max-width: 540px; margin: 0 auto; padding: 32px 24px 64px; }
  h1 { font: 500 2.6rem Georgia, serif; } h2 { font: 400 1.5rem/1.4 Georgia, serif; } h3 { font-size: .85rem; color: #e0d3e8; }
  section, article { border: 1px solid #706178; border-radius: 24px; padding: 24px; background: #29232fe6; margin: 24px 0; }
  a, .eyebrow { color: #f4d35e; } p { line-height: 1.6; } .hint { font-size: .85rem; color: #c6c4bd; }
  label { display: block; margin-bottom: 8px; } textarea { box-sizing: border-box; width: 100%; padding: 12px; font: inherit; background: #111216; color: inherit; border: 1px solid #a49caa; border-radius: 8px; }
  button { min-height: 44px; padding: 10px 16px; margin: 4px 8px 4px 0; background: #f4d35e; color: #111; border: 1px solid #f4d35e; border-radius: 10px; font: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; } .secondary { background: transparent; color: #f4d35e; }
  .account { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; overflow-wrap: anywhere; }
  .entry-text { white-space: pre-wrap; overflow-wrap: anywhere; } [role=alert] { color: #ffc1ba; } details { margin-top: 32px; }
  :focus-visible { outline: 2px solid #f4d35e; outline-offset: 3px; }
</style>
