<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
  import { createFirebaseClient, googleSignIn, type FirebaseClient } from '$lib/firebase/client';
  import { JournalRepository, type JournalView } from '$lib/firebase/repository';
  import { emptyProjection, STARTER_ID, STARTER_PROMPT, type Entry, type Action } from '$lib/domain';

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
  let draft = $state<Action | null>(null);
  let draftLoaded = $state(false);
  let draftRestored = $state(false);
  let draftStatus = $state('');
  let discardOpen = $state(false);
  let discardDialog = $state<HTMLDialogElement>();
  $effect(() => { if (discardOpen) discardDialog?.showModal(); else discardDialog?.close(); });
  let draftWrite = 0;
  let tab = $state<'today' | 'journal' | 'settings'>('today');
  let query = $state('');
  let selectedId = $state<string | null>(null);
  let journalScroll = 0;
  const selected = $derived(view.state.entries.find((entry) => entry.id === selectedId));
  const results = $derived(searchEntries(view.state.entries, query));
  const editorColour = $derived(colours[editing?.colour ?? view.state.entries.length % colours.length]);
  import { exportJournal } from '$lib/export';
  let exportStatus = $state('');
  let exporting = $state(false);
  import { colours, searchEntries, dateLabel } from '$lib/journal';
  import HighlightedText from '$lib/components/HighlightedText.svelte';
  async function navigate(next: typeof tab) { tab = next; selectedId = null; await tick(); window.scrollTo(0, 0); }
  async function openEntry(entry: Entry) { journalScroll = window.scrollY; selectedId = entry.id; await tick(); document.getElementById('entry-heading')?.focus(); window.scrollTo(0, 0); }
  async function closeEntry() { const id = selectedId; selectedId = null; await tick(); document.getElementById(`view-${id}`)?.focus({ preventScroll: true }); window.scrollTo(0, journalScroll); }

  $effect(() => {
    if (draftLoaded && view.ready && !draftRestored) {
      if (draft) {
        text = draft.payload.text;
        const original = view.state.entries.find((entry) => entry.id === draft?.payload.entryId);
        editing = original ? { ...original, revision: draft.payload.expectedRevision } : null;
        draftStatus = 'Draft saved on this device';
      }
      draftRestored = true;
    }
  });
  async function persistDraft(value = text) {
    text = value;
    if (!repository || !draftRestored) return;
    const version = ++draftWrite;
    draft = { eventId: draft?.eventId ?? crypto.randomUUID(), type: 'ReflectionWritten', schemaVersion: 1,
      payload: { entryId: editing?.id ?? draft?.payload.entryId ?? crypto.randomUUID(), text, expectedRevision: editing?.revision ?? 0, starterId: STARTER_ID } };
    draftStatus = 'Saving draft on this device…';
    try { await repository.writeDraft($state.snapshot(draft)); if (version === draftWrite) draftStatus = 'Draft saved on this device'; }
    catch { if (version === draftWrite) draftStatus = 'Draft could not be saved on this device. Keep this page open.'; }
  }
  async function downloadJournal(format: 'markdown' | 'json') {
    const active = repository;
    if (!active) return;
    exporting = true; exportStatus = '';
    try {
      const state = await active.exportSnapshot();
      if (repository !== active) return;
      const file = exportJournal(state, format);
      const url = URL.createObjectURL(new Blob([file.content], { type: `${file.type};charset=utf-8` }));
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      exportStatus = `Export ready: ${state.entries.length} saved ${state.entries.length === 1 ? 'reflection' : 'reflections'}.`;
    } catch (cause) { if (repository === active) exportStatus = cause instanceof Error ? cause.message : 'Export failed. Please try again.'; }
    finally { if (repository === active) exporting = false; }
  }
  async function discardDraft() {
    try { await repository?.clearDraft(); draftWrite++; draft = null; text = ''; editing = null; discardOpen = false; draftStatus = ''; }
    catch { error = 'Could not discard the draft. Your text is still here.'; }
  }

  onMount(() => {
    let stopAuth = () => {};
    let session = 0;
    try {
      client = createFirebaseClient(); configured = !!client;
      if (client) {
        stopAuth = onAuthStateChanged(client.auth, (next) => {
          const current = ++session;
          repository?.stop(); repository = null;
          user = next; text = ''; editing = null; error = ''; draft = null; draftLoaded = false; draftRestored = false; draftStatus = ''; draftWrite++; exportStatus = ''; exporting = false; tab = 'today'; selectedId = null; query = '';
          view = { state: emptyProjection(), pending: null, status: '', error: '', ready: false };
          initialized = true;
          if (next && client) {
            repository = new JournalRepository(client, next.uid, (value) => {
              if (session === current) view = value;
            });
            const opened = repository;
            void opened.start().then(() => opened.readDraft()).then((saved) => { if (session === current) { draft = saved; draftLoaded = true; } }).catch(() => { if (session === current) error = 'Local storage is unavailable. Your journal could not be opened.'; });
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
    if (!client) return;
    if (text.trim()) await persistDraft();
    try { await signOut(client.auth); } catch { error = 'Sign-out failed. Please try again.'; }
  }
  async function save() {
    if (!repository) return;
    const savingRepository = repository;
    busy = true; error = '';
    try {
      if (!draft) await persistDraft();
      await savingRepository.save($state.snapshot(draft!));
      if (repository !== savingRepository) return;
      await savingRepository.clearDraft();
      if (repository !== savingRepository) return;
      draftWrite++; draft = null; draftStatus = '';
      text = ''; editing = null; tab = 'journal';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Save failed. Your text is still here.'; }
    finally { busy = false; }
  }
  async function edit(entry: Entry) {
    if (text.trim() && !confirm('Replace the unsaved text in this editor?')) return;
    editing = { ...entry }; text = entry.text; draft = null; tab = 'today'; selectedId = null; await persistDraft(); await tick();
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
      draft = null; tab = 'today'; await persistDraft();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Please try again.'; }
  }
</script>

<svelte:head><title>Your journal · Gratitude</title><meta name="robots" content="noindex" /></svelte:head>
<main>
  <header><a class="brand" href={`${base}/`}>Gratitude<span aria-hidden="true">✦</span></a><span class="private">A little space for you</span></header>
  {#if !initialized}
    <p role="status">Opening Gratitude…</p>
  {:else if !configured}
    <h1>Your journal</h1><section><h2>Your private space is coming soon</h2><p>Account sign-in is not available on this site yet.</p></section>
  {:else if !user}
    <h1>Notice the good.</h1><section><h2>Small moments. Yours to keep.</h2><p>Sign in with Google to keep your reflections together across your devices.</p><button onclick={signIn} disabled={busy}>Continue with Google</button></section>
  {:else}
    <div class="sync"><p role="status">{view.status}</p><span aria-label="Private journal">◌ Private</span></div>
    {#if tab === 'today'}
      <p class="eyebrow">A moment for yourself</p><h1>{editing ? 'Return to a moment.' : 'What stayed with you?'}</h1>
      {#if view.ready}
        <section class="editor tinted" style:--entry-colour={editorColour}>
          <p class="eyebrow">Starter prompt</p><h2>{editing?.prompt ?? STARTER_PROMPT}</h2>
          <label for="reflection">Your reflection</label>
          <textarea id="reflection" value={text} oninput={(event) => void persistDraft(event.currentTarget.value)} disabled={busy || !draftRestored} maxlength="10000" rows="7" placeholder="A few words are enough…"></textarea>
          <p class="hint">{draftStatus || 'Drafts stay on this device until you save a reflection.'}</p>
          <button onclick={save} disabled={busy || !text.trim() || !!view.pending}>{editing ? 'Save changes' : 'Save reflection'}</button>
          {#if text}<button class="secondary" onclick={() => discardOpen = true}>Discard draft</button>{/if}
        </section>
      {/if}
    {:else if tab === 'journal'}
      {#if selected}
        <button class="secondary" onclick={closeEntry}>← Back to journal</button>
        <h1 id="entry-heading" tabindex="-1">Your reflection</h1>
        <article class="tinted detail" style:--entry-colour={colours[selected.colour]}>
          <time datetime={selected.recordedAt}>{dateLabel(selected.recordedAt)}</time>
          <h2>Prompt</h2><p><HighlightedText text={selected.prompt} {query} /></p>
          <h2>Reflection</h2><p class="entry-text"><HighlightedText text={selected.text} {query} /></p>
          <button onclick={() => edit(selected)} disabled={!!view.pending || busy}>Edit reflection</button>
        </article>
      {:else}
        <p class="eyebrow">Your collection of small things</p><h1>Your journal</h1>
        <label for="search">Search reflections</label><div class="search"><input id="search" type="search" bind:value={query} placeholder="A moment, a person, a word…" />{#if query}<button class="secondary" onclick={() => query = ''}>Clear search</button>{/if}</div>
        <p class="hint" aria-live="polite">{results.length} {results.length === 1 ? 'reflection' : 'reflections'}{view.status !== 'Synced' ? ' on this device' : ''}</p>
        {#if view.ready && view.state.entries.length === 0}<section><h2>Your small moments belong here.</h2><p>Start with something simple. There is no right length.</p><button onclick={() => navigate('today')}>Write your first reflection</button></section>
        {:else if results.length === 0}<section><h2>No matching reflections</h2><p>Try another word, or return to your full journal.</p><button onclick={() => query = ''}>Clear search</button></section>{/if}
        <div class="entries">
          {#each results as entry (entry.id)}
            <article class="tinted card" style:--entry-colour={colours[entry.colour]}>
              <time datetime={entry.recordedAt}>{dateLabel(entry.recordedAt)}</time>
              <h2>Prompt</h2><p class="prompt-preview"><HighlightedText text={entry.prompt} {query} /></p>
              <h2>Reflection</h2><p class="entry-text text-preview"><HighlightedText text={entry.text} {query} /></p>
              <button id={`view-${entry.id}`} class="secondary" onclick={() => openEntry(entry)}>View entry →</button>
            </article>
          {/each}
        </div>
      {/if}
    {:else}
      <p class="eyebrow">Make this space yours</p><h1>Settings</h1>
      <section><h2>Your account</h2><p class="account-email">{user.email}</p><p>Reflections are private to your Google account.</p><button class="secondary" onclick={leave} disabled={busy}>Sign out</button></section>
      <section><h2>Export journal</h2><p>Take all your saved reflections with you, including their original prompts. Search filters do not limit the export.</p><p class="hint">Unfinished drafts are excluded. A connection is needed to verify your complete journal.</p><button onclick={() => downloadJournal('markdown')} disabled={exporting || !!view.pending}>Download Markdown</button><button class="secondary" onclick={() => downloadJournal('json')} disabled={exporting || !!view.pending}>Download JSON</button>{#if exportStatus}<p class="export-status" aria-live="polite">{exportStatus}</p>{/if}</section>
      <details><summary>Journal recovery</summary><p>Rebuild this device’s view from your saved account history. Your reflections stay in your account.</p><button class="secondary" onclick={() => repository?.rebuild().catch(() => error = 'Could not rebuild. Please reload and try again.')} disabled={busy}>Rebuild local view</button></details>
    {/if}
    {#if view.pending}
      <section><h2>A reflection is waiting to sync</h2><p class="entry-text">{view.pending.payload.text}</p><button onclick={() => repository?.retry()} disabled={busy}>Retry sync</button><button class="secondary" onclick={recoverPending}>Return text to editor</button></section>
    {/if}
    <dialog bind:this={discardDialog} onclose={() => discardOpen = false} aria-labelledby="discard-title"><h2 id="discard-title">Discard this draft?</h2><p>Your saved reflections will remain in your journal.</p><button onclick={() => discardOpen = false}>Keep writing</button><button class="secondary" onclick={discardDraft}>Discard draft permanently</button></dialog>
    <nav aria-label="Journal navigation">{#each [{ id: 'today', label: 'Today', icon: '⌂' }, { id: 'journal', label: 'Journal', icon: '▤' }, { id: 'settings', label: 'Settings', icon: '⚙' }] as item}<button aria-current={tab === item.id ? 'page' : undefined} onclick={() => navigate(item.id as typeof tab)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>{/each}</nav>
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
</main>
<style>
  :global(html) { color-scheme: dark; background: #0c0d10; }
  :global(body) { margin: 0; color: #f4f5fa; font-family: 'DejaVu Sans', sans-serif; background: radial-gradient(ellipse at 8% 22%, #52493a35, transparent 55%), radial-gradient(ellipse at 90% 70%, #6f675324, transparent 50%), #0c0d10; background-attachment: fixed; }
  main { max-width: 560px; margin: 0 auto; padding: 28px 20px 120px; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; gap: 16px; } .brand { color: #f4f5fa; text-decoration: none; font: 24px Georgia, serif; } .brand span { color: #f4d35e; margin-left: 8px; } .private { font-size: 11px; color: #bbb7ae; }
  .sync { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 11px; color: #c6c4bd; } .sync p { max-width: 72%; }
  h1 { font: 400 2.35rem/1.12 Georgia, serif; margin: 12px 0 28px; } h2 { font: 400 1.45rem/1.45 Georgia, serif; }
  section, article, details { border: 1px solid #716b614f; border-radius: 24px; padding: 24px; background: #292722cf; margin: 24px 0; }
  .tinted { border-color: color-mix(in srgb, var(--entry-colour) 65%, #222); background: linear-gradient(140deg, color-mix(in srgb, var(--entry-colour) 15%, #19191a), #19191ae8); box-shadow: inset 0 1px 0 #ffffff0a; }
  .eyebrow { color: #f4d35e; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; } p { line-height: 1.6; } .hint, time { font-size: .75rem; color: #c6c4bd; } .account-email { overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 10px; font-size: .85rem; } textarea, input { box-sizing: border-box; width: 100%; padding: 14px; font: inherit; background: #111216b3; color: inherit; border: 1px solid #a49caa70; border-radius: 12px; } textarea { resize: vertical; min-height: 180px; }
  button { min-height: 44px; padding: 10px 16px; margin: 4px 8px 4px 0; background: #f4d35e; color: #17140d; border: 1px solid #f4d35e; border-radius: 12px; font: inherit; font-size: .85rem; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; } .secondary { background: transparent; color: #f4d35e; border-color: #f4d35e55; }
  .entries { display: grid; gap: 16px; } .card { margin: 0; height: 360px; box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; } .card h2 { font: 600 .72rem sans-serif; margin: 16px 0 6px; color: #ddd6c9; } .card p { margin: 0; font-size: .88rem; } .card button { margin-top: auto; align-self: flex-start; }
  .prompt-preview, .text-preview { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; } .prompt-preview { -webkit-line-clamp: 2; line-clamp: 2; } .text-preview { -webkit-line-clamp: 4; line-clamp: 4; } .detail p { overflow-wrap: anywhere; }
  .search { display: flex; gap: 8px; align-items: center; } .search button { margin: 0; } .entry-text { white-space: pre-wrap; overflow-wrap: anywhere; } [role=alert] { color: #ffc1ba; padding: 16px; background: #341b19; border-radius: 12px; }
  nav { position: fixed; z-index: 10; bottom: 0; left: 50%; transform: translateX(-50%); width: min(100%, 600px); display: flex; background: #151619f2; border-top: 1px solid #ffffff15; padding: 8px 0 max(8px, env(safe-area-inset-bottom)); } nav button { flex: 1; border: 0; background: none; color: #bebbb3; margin: 0; border-radius: 0; display: grid; gap: 4px; font-size: 11px; } nav span { font-size: 22px; } nav button[aria-current] { color: #f4d35e; text-decoration: underline; text-underline-offset: 5px; }
  dialog { max-width: min(420px, calc(100vw - 64px)); color: inherit; background: #262521; border: 1px solid #807764; border-radius: 24px; padding: 24px; } dialog::backdrop { background: #000a; }
  :focus-visible { outline: 2px solid #f4d35e; outline-offset: 4px; } @media (max-width: 340px) { .card { height: 410px; } .private { display: none; } }
  @media (prefers-reduced-transparency: reduce) { section, article, details { background: #242321; backdrop-filter: none; } }
</style>
