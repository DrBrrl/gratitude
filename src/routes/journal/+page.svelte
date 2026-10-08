<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
  import { createFirebaseClient, googleSignIn, type FirebaseClient } from '$lib/firebase/client';
  import { JournalRepository, type JournalView, type JournalStore } from '$lib/firebase/repository';
  import { emptyProjection, STARTER_ID, STARTER_PROMPT, type Entry, type Action } from '$lib/domain';

  const uiReview = import.meta.env.DEV && import.meta.env.VITE_UI_REVIEW === 'true';
  let reviewSession = 0;
  let resetReview: ((empty?: boolean) => Promise<void>) | null = null;
  async function openReview() {
    const session = ++reviewSession;
    try {
      const { ReviewRepository, reviewUser } = await import('$lib/dev/review-repository');
      if (session !== reviewSession) return;
      repository?.stop();
      chooseInitialPage = true;
      const opened = new ReviewRepository((value) => { if (session === reviewSession) receiveView(value); });
      repository = opened; user = reviewUser; configured = true; initialized = true;
      writing = false; savedId = null; settingsPage = 'menu';
      draftLoaded = false; draftRestored = false;
      resetReview = async (empty = false) => {
        await opened.reset(empty);
        text = ''; editing = null; draft = null; todayDraft = null; draftStatus = ''; draftWrite++;
        selectedId = null; query = ''; error = ''; exportStatus = ''; writing = false; savedId = null; tab = 'journal';
      };
      await opened.start();
      if (session === reviewSession) await loadDrafts(opened);
    } catch { initialized = true; error = 'Could not open the local UI review fixture.'; }
  }
  let client: FirebaseClient | null = null;
  let repository: JournalStore | null = null;
  let user = $state<Pick<User, 'uid' | 'email'> | null>(null);
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
  let chooseInitialPage = true;
  function receiveView(value: JournalView) {
    view = value;
    // Choose the landing page once from the loaded projection. Later syncs must
    // not interrupt writing or an explicitly selected tab.
    if (chooseInitialPage && value.ready && value.status === 'Synced') {
      chooseInitialPage = false;
      tab = todayReflection(value.state.entries, today).entry ? 'journal' : 'today';
    }
  }
  let query = $state('');
  let selectedId = $state<string | null>(null);
  let journalScroll = 0;
  const selected = $derived(view.state.entries.find((entry) => entry.id === selectedId));
  const results = $derived(searchEntries(view.state.entries, query));
  let today = $state(localDay(new Date()));
  let todayDraft = $state<Action | null>(null);
  let todayDraftDay = $state('');
  let editorDraftKey = $state('');
  const todayKey = $derived(`draft:today:${today}`);
  const daily = $derived(todayReflection(view.state.entries, today));
  const todayColour = $derived(colours[daily.colour]);
  const hasTodayDraft = $derived(todayDraftDay === today && !!todayDraft?.payload.text.trim());
  let editorColour = $state(colours[0]);
  function keyForEntry(entry: Entry) { return entry.id === daily.entry?.id ? todayKey : `draft:entry:${entry.id}`; }
  async function loadDrafts(active: JournalStore) {
    const legacy = await active.readDraft();
    if (legacy) {
      const key = legacy.payload.expectedRevision > 0 ? `draft:entry:${legacy.payload.entryId}` : todayKey;
      if (!await active.readDraft(key)) await active.writeDraft(legacy, key);
      await active.clearDraft();
    }
    if (repository === active) { draftLoaded = true; draftRestored = true; }
  }
  $effect(() => {
    const key = todayKey;
    const day = today;
    if (!draftLoaded || !user || !repository) return;
    const active = repository;
    let cancelled = false;
    void active.readDraft(key).then(value => {
      if (!cancelled && repository === active) { todayDraft = value; todayDraftDay = day; }
    }).catch(() => { if (!cancelled) error = 'Could not load today’s draft.'; });
    return () => { cancelled = true; };
  });
  onMount(() => {
    const updateDay = () => { today = localDay(new Date()); };
    const timer = window.setInterval(updateDay, 30_000);
    window.addEventListener('focus', updateDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', updateDay); };
  });
  import { exportJournal } from '$lib/export';
  let exportStatus = $state('');
  let exporting = $state(false);
  let preparedFile = $state<ReturnType<typeof exportJournal> | null>(null);
  import { colours, searchEntries, localDay, todayReflection } from '$lib/journal';
  import HighlightedText from '$lib/components/HighlightedText.svelte';
  import ReflectionText from '$lib/components/ReflectionText.svelte';
  import ReflectionEditor from '$lib/components/ReflectionEditor.svelte';
  import ReflectionPreview from '$lib/components/ReflectionPreview.svelte';
  let expandedEntries = $state<Set<string>>(new Set());
  import Icon from '$lib/components/Icon.svelte';
  let writing = $state(false);
  let settingsPage = $state<'menu' | 'ai' | 'export' | 'privacy' | 'account'>('menu');
  let exportFormat = $state<'markdown' | 'json'>('markdown');
  let showPromptInfo = $state(false);
  let savedId = $state<string | null>(null);
  let editorOrigin = $state<{ tab: typeof tab; selectedId: string | null; savedId: string | null; label: string; scroll: number }>({ tab: 'today', selectedId: null, savedId: null, label: 'Today', scroll: 0 });
  function rememberEditorOrigin() {
    editorOrigin = { tab, selectedId, savedId, label: tab === 'journal' ? 'Journal' : tab === 'settings' ? 'Settings' : savedId ? 'Saved reflection' : 'Today', scroll: window.scrollY };
  }
  async function returnFromEditor() {
    writing = false; tab = editorOrigin.tab; selectedId = editorOrigin.selectedId; savedId = editorOrigin.savedId;
    await tick(); window.scrollTo(0, editorOrigin.scroll);
  }
  const savedEntry = $derived(view.state.entries.find((entry) => entry.id === savedId));
  const todayLabel = $derived(new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${today}T12:00:00`)));
  function shortDate(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long' }).format(new Date(value)); }
  function entryDateTime(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
  async function openComposer(key: string, entry: Entry | undefined) {
    const active = repository;
    if (!active) return;
    busy = true; error = '';
    try {
      let stored = await active.readDraft(key);
      // Pick up a migrated draft previously stored under the entry's identity.
      if (!stored && entry && key === todayKey) {
        stored = await active.readDraft(`draft:entry:${entry.id}`);
        if (stored) { await active.writeDraft(stored, key); await active.clearDraft(`draft:entry:${entry.id}`); }
      }
      if (repository !== active) return;
      chooseInitialPage = false;
      rememberEditorOrigin();
      editorDraftKey = key;
      draft = stored;
      const original = stored ? view.state.entries.find(item => item.id === stored.payload.entryId) : entry;
      editing = original ? { ...original, revision: stored?.payload.expectedRevision ?? original.revision } : null;
      editorColour = original ? colours[original.colour] : todayColour;
      text = stored?.payload.text ?? original?.text ?? '';
      draftStatus = stored ? 'Draft saved on this device' : '';
      draftWrite++; tab = 'today'; writing = true; savedId = null; selectedId = null;
      busy = false; await tick(); window.scrollTo(0, 0);
      document.getElementById('reflection')?.focus();
    } catch { error = 'Could not open this reflection. Your drafts are still saved.'; }
    finally { busy = false; }
  }
  async function beginWriting() { await openComposer(todayKey, daily.entry); }
  async function openSettings(next: typeof settingsPage) { settingsPage = next; exportStatus = ''; preparedFile = null; await tick(); window.scrollTo(0, 0); }

  async function navigate(next: typeof tab) { chooseInitialPage = false; tab = next; selectedId = null; writing = false; savedId = null; settingsPage = 'menu'; await tick(); window.scrollTo(0, 0); }
  async function openEntry(entry: Entry) { journalScroll = window.scrollY; selectedId = entry.id; await tick(); document.getElementById('entry-heading')?.focus(); window.scrollTo(0, 0); }
  async function closeEntry() { const id = selectedId; selectedId = null; await tick(); document.getElementById(`view-${id}`)?.focus({ preventScroll: true }); window.scrollTo(0, journalScroll); }

  async function persistDraft(value = text) {
    text = value;
    if (!repository || !draftRestored || !editorDraftKey) return;
    const version = ++draftWrite;
    draft = { eventId: draft?.eventId ?? crypto.randomUUID(), type: 'ReflectionWritten', schemaVersion: 1,
      payload: { entryId: editing?.id ?? draft?.payload.entryId ?? crypto.randomUUID(), text, expectedRevision: editing?.revision ?? 0, starterId: STARTER_ID } };
    if (editorDraftKey === todayKey) { todayDraft = draft; todayDraftDay = today; }
    draftStatus = 'Saving draft on this device…';
    try { await repository.writeDraft($state.snapshot(draft), editorDraftKey); if (version === draftWrite) draftStatus = 'Draft saved on this device'; }
    catch { if (version === draftWrite) draftStatus = 'Draft could not be saved on this device. Keep this page open.'; }
  }
  async function prepareExport(format: 'markdown' | 'json') {
    const active = repository;
    if (!active) return;
    exporting = true; exportStatus = ''; preparedFile = null;
    try {
      const state = await active.exportSnapshot();
      if (repository !== active) return;
      const file = exportJournal(state, format);
      preparedFile = file;
      exportStatus = `Export ready: ${state.entries.length} saved ${state.entries.length === 1 ? 'reflection' : 'reflections'}.`;
    } catch (cause) { if (repository === active) exportStatus = cause instanceof Error ? cause.message : 'Export failed. Please try again.'; }
    finally { if (repository === active) exporting = false; }
  }
  function downloadPrepared() {
    if (!preparedFile) return;
    const url = URL.createObjectURL(new Blob([preparedFile.content], { type: `${preparedFile.type};charset=utf-8` }));
    const link = document.createElement('a'); link.href = url; link.download = preparedFile.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function discardDraft() {
    const wasEditing = !!editing;
    try {
      await repository?.clearDraft(editorDraftKey);
      if (editorDraftKey === todayKey) todayDraft = null;
      draftWrite++; draft = null; text = ''; editing = null; discardOpen = false; draftStatus = '';
      if (wasEditing) await returnFromEditor();
    }
    catch { error = 'Could not discard the draft. Your text is still here.'; }
  }

  onMount(() => {
    if (uiReview) {
      void openReview();
      return () => { reviewSession++; repository?.stop(); };
    }
    let stopAuth = () => {};
    let session = 0;
    try {
      client = createFirebaseClient(); configured = !!client;
      if (client) {
        stopAuth = onAuthStateChanged(client.auth, (next) => {
          const current = ++session;
          repository?.stop(); repository = null;
          chooseInitialPage = true;
          user = next; todayDraft = null; todayDraftDay = ''; editorDraftKey = ''; text = ''; editing = null; error = ''; draft = null; draftLoaded = false; draftRestored = false; draftStatus = ''; draftWrite++; exportStatus = ''; preparedFile = null; exporting = false; tab = 'today'; selectedId = null; query = ''; writing = false; savedId = null; settingsPage = 'menu';
          view = { state: emptyProjection(), pending: null, status: '', error: '', ready: false };
          initialized = true;
          if (next && client) {
            repository = new JournalRepository(client, next.uid, (value) => {
              if (session === current) receiveView(value);
            });
            const opened = repository;
            void opened.start().then(() => { if (session === current) return loadDrafts(opened); }).catch(() => { if (session === current) error = 'Local storage is unavailable. Your journal could not be opened.'; });
          }
        });
      } else initialized = true;
    } catch { initialized = true; error = 'Sign-in is unavailable. Please try again later.'; }
    const online = () => { void repository?.retry(); };
    window.addEventListener('online', online);
    return () => { session++; stopAuth(); repository?.stop(); window.removeEventListener('online', online); };
  });
  async function signIn() {
    if (uiReview) { await openReview(); return; }
    if (!client) return;
    busy = true; error = '';
    try { await googleSignIn(client); }
    catch { error = 'Sign-in was not completed. You can try again.'; }
    finally { busy = false; }
  }
  async function leave() {
    if (uiReview) {
      if (writing && text.trim()) await persistDraft();
      reviewSession++; repository?.stop(); repository = null; user = null; preparedFile = null;
      text = ''; editing = null; draft = null; todayDraft = null; todayDraftDay = ''; editorDraftKey = ''; draftStatus = ''; error = ''; tab = 'today'; writing = false; savedId = null; settingsPage = 'menu';
      return;
    }
    if (!client) return;
    if (writing && text.trim()) await persistDraft();
    try { await signOut(client.auth); } catch { error = 'Sign-out failed. Please try again.'; }
  }
  async function save() {
    if (!repository) return;
    const savingRepository = repository;
    const savingKey = editorDraftKey;
    busy = true; error = '';
    try {
      if (!draft) await persistDraft();
      const savedEntryId = draft!.payload.entryId;
      await savingRepository.save($state.snapshot(draft!));
      if (repository !== savingRepository) return;
      await savingRepository.clearDraft(savingKey);
      if (savingKey === todayKey) todayDraft = null;
      if (repository !== savingRepository) return;
      draftWrite++; draft = null; draftStatus = '';
      text = ''; editing = null; writing = false; savedId = view.pending ? null : savedEntryId; tab = view.pending ? 'journal' : 'today';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Save failed. Your text is still here.'; }
    finally { busy = false; }
  }
  async function edit(entry: Entry) { await openComposer(keyForEntry(entry), entry); }
  async function recoverPending() {
    const pending = view.pending;
    if (!pending || !repository) return;
    if (text.trim() && !confirm('Replace the editor text with your pending save?')) return;
    try {
      await repository.discardPending();
      rememberEditorOrigin();
      text = pending.payload.text;
      editing = view.state.entries.find((entry) => entry.id === pending.payload.entryId) ?? null;
      editorColour = editing ? colours[editing.colour] : todayColour;
      editorDraftKey = editing ? keyForEntry(editing) : todayKey;
      draft = null; tab = 'today'; writing = true; await persistDraft();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Please try again.'; }
  }
</script>

<svelte:head><title>Your journal · Gratitude</title><meta name="robots" content="noindex" /></svelte:head>
<main class:composing={writing}>
  {#if !initialized}
    <p role="status" class="loading">Opening Gratitude…</p>
  {:else if !configured}
    <a class="brand" href={`${base}/`}>Gratitude</a><h1>Your private space</h1><section class="glass"><p>Account sign-in is not available on this site yet.</p></section>
  {:else if !user}
    <a class="brand" href={`${base}/`}>Gratitude</a><div class="welcome"><h1>A little space<br />for gratitude.</h1><p>Notice the small things.<br />Keep them close.</p><section class="glass"><h2>Your moments. Yours to keep.</h2><p>Sign in to keep your reflections together across your devices.</p><button class="primary" onclick={signIn} disabled={busy}>Continue with Google</button></section></div>
  {:else}
    {#if tab === 'today'}
      {#if writing}
        <button class="back" onclick={returnFromEditor} disabled={busy}><Icon name="back" />{editorOrigin.label}</button>
        <h1 class="page-heading reflection-heading">Your reflection</h1>
        <section class="tinted composer" style:--entry-colour={editorColour}>
          <p class="writing-prompt">{editing?.prompt ?? STARTER_PROMPT}</p>
          <ReflectionEditor value={text} oninput={value => void persistDraft(value)} disabled={busy || !draftRestored} />
        </section>
        <p class="hint draft-status" aria-live="polite">{draftStatus || 'Drafts stay on this device until you save.'}</p>
        <button class="primary" onclick={save} disabled={busy || !text.trim() || !!view.pending}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save reflection'}</button>
        {#if text}<button class="text-button muted" onclick={() => discardOpen = true}>Discard draft</button>{/if}
      {:else if savedEntry}
        <div class="saved-heading"><h1 class="page-heading">Reflection saved</h1><time datetime={savedEntry.recordedAt}>{shortDate(savedEntry.recordedAt)}</time></div>
        <article class="tinted card saved-card" style:--entry-colour={colours[savedEntry.colour]}>
          <h2>Prompt</h2><p class="entry-prompt">{savedEntry.prompt}</p>
          <h2>Reflection</h2><p class="entry-text"><ReflectionText text={savedEntry.text} /></p>
        </article>
        <div class="saved-actions"><button class="primary" onclick={() => navigate('journal')}>Done</button><button class="outline" onclick={() => edit(savedEntry)}>Edit reflection</button></div>
      {:else}
        <header class="today-header"><a class="brand" href={`${base}/`}>Gratitude<svg class="brand-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z" /></svg></a><div class="today-date"><span>{todayLabel}</span></div></header>
        <h1 class="today-heading">Reflection time</h1>
        {#if view.ready}
          <section class="tinted daily-prompt" style:--entry-colour={todayColour}><span class="badge">Starter prompt</span><h2>{daily.entry?.prompt ?? STARTER_PROMPT}</h2></section>
          <button class="primary today-response" onclick={beginWriting} disabled={busy || !draftLoaded || todayDraftDay !== today}>{hasTodayDraft || daily.entry ? 'Continue your reflection' : 'Write a response'}</button>
          <button class="text-button today-secondary" onclick={() => navigate('journal')}>Browse your journal</button>
          <div class="prompt-explanation"><button class="underlined today-secondary" aria-expanded={showPromptInfo} onclick={() => showPromptInfo = !showPromptInfo}>Why this prompt?</button>{#if showPromptInfo}<p class="glass explanation">A simple starting point for noticing something good. You can write as little or as much as you like. Personalized AI prompts will be available in a future update.</p>{/if}</div>
        {/if}
      {/if}
    {:else if tab === 'journal'}
      {#if selected}
        <button class="back" onclick={closeEntry}><Icon name="back" />Journal</button>
        <h1 class="sr-only" id="entry-heading" tabindex="-1">Your reflection</h1>
        <article class="tinted detail" style:--entry-colour={colours[selected.colour]}>
          <time datetime={selected.recordedAt}>{entryDateTime(selected.recordedAt)}</time>
          <h2>Prompt</h2><p class="entry-prompt"><HighlightedText text={selected.prompt} {query} /></p>
          <h2>Reflection</h2><p class="entry-text"><ReflectionText text={selected.text} {query} /></p>
          <button class="entry-action" onclick={() => edit(selected)} disabled={!!view.pending || busy}><Icon name="edit" />Edit reflection</button>
        </article>
      {:else}
        <h1 class="page-heading">Your journal</h1>
        <div class="search glass"><Icon name="search" /><input id="search" type="search" aria-label="Search reflections" bind:value={query} placeholder="Search reflections" />{#if query}<button class="icon-button" aria-label="Clear search" onclick={() => query = ''}><Icon name="close" /></button>{/if}</div>
        {#if query || view.status !== 'Synced'}<p class="result-count" aria-live="polite">{results.length} {results.length === 1 ? 'reflection' : 'reflections'}{view.status !== 'Synced' ? ' on this device' : ''}</p>{/if}
        {#if view.ready && view.state.entries.length === 0}<section class="glass empty"><Icon name="journal" size={44} /><h2>Your story starts small.</h2><p>A moment, a kindness, a little light.<br />Your reflections will find a home here.</p><button class="primary" onclick={() => navigate('today')}>Write your first reflection</button></section>
        {:else if results.length === 0}<section class="glass empty"><Icon name="search" size={40} /><h2>No matching reflections</h2><p>Try another word or return to your full journal.</p><button class="outline" onclick={() => query = ''}>Clear search</button></section>{/if}
        <div class="entries">
          {#each results as entry (entry.id)}
            <article class="tinted card" class:expanded={expandedEntries.has(entry.id)} style:--entry-colour={colours[entry.colour]}>
              <h2>Prompt</h2><p class="entry-prompt prompt-preview"><HighlightedText text={entry.prompt} {query} /></p>
              <h2>Reflection</h2><ReflectionPreview text={entry.text} {query} entryId={entry.id} recordedAt={entry.recordedAt} expanded={expandedEntries.has(entry.id)} onexpand={() => expandedEntries = new Set([...expandedEntries, entry.id])} oncollapse={() => expandedEntries = new Set([...expandedEntries].filter(id => id !== entry.id))} onopen={() => openEntry(entry)} />
            </article>
          {/each}
        </div>
      {/if}
    {:else}
      {#if settingsPage !== 'menu'}<button class="back" onclick={() => openSettings('menu')}><Icon name="back" />Settings</button>{/if}
      {#if settingsPage === 'menu'}
        <h1 class="page-heading">Settings</h1>
        <div class="settings-menu">
          {#each [{ id: 'ai', icon: 'sparkles', title: 'AI settings', subtitle: 'Answers, memory and sharing' }, { id: 'export', icon: 'file', title: 'Export journal', subtitle: 'Markdown or JSON' }, { id: 'privacy', icon: 'shield', title: 'Privacy & data', subtitle: 'Your journal, your control' }, { id: 'account', icon: 'account', title: 'Your account', subtitle: user.email ?? 'Signed in' }] as item}
            <button class="glass settings-row" onclick={() => openSettings(item.id as typeof settingsPage)}><span class="row-icon" class:yellow={item.id === 'ai'}><Icon name={item.icon} size={30} /></span><span class="row-copy"><strong>{item.title}</strong><span>{item.subtitle}</span></span><Icon name="next" size={20} /></button>
          {/each}
        </div>
        <p class="app-credit">Gratitude · GPLv3</p>
        {#if uiReview}<details class="review-tools glass"><summary>UI review</summary><p class="hint">Fictional journal on this browser only.</p><button class="outline" onclick={() => resetReview?.()}>Restore sample journal</button><button class="text-button" onclick={() => resetReview?.(true)}>Show empty journal</button></details>{/if}
      {:else if settingsPage === 'ai'}
        <h1>AI settings</h1>
        <section class="glass preferences">
          {#each ['Personalization', 'Use answers and feedback', 'Use journal entries', 'Summarize attached photos'] as label}<div class="preference"><span>{label}</span><button class="switch" role="switch" aria-checked="false" aria-label={label} disabled><span></span></button></div>{/each}
        </section>
        <p class="hint">Personalized prompts and photo summaries are not available yet. Your reflections are not sent to an AI service.</p>
        <section class="glass"><h2>What I remember</h2><p class="muted">Nothing yet. This journal currently uses a starter prompt.</p></section>
      {:else if settingsPage === 'export'}
        <h1>Export your journal</h1>
        <fieldset class="export-choices"><legend class="sr-only">Export format</legend>
          {#each [{ id: 'markdown', name: 'Markdown (.md)', detail: 'Readable journal', icon: 'file' }, { id: 'json', name: 'JSON (.json)', detail: 'Structured archive', icon: 'braces' }] as format}
            <label class="glass export-choice" class:chosen={exportFormat === format.id}><input type="radio" name="format" value={format.id} bind:group={exportFormat} onchange={() => { preparedFile = null; exportStatus = ''; }} /><Icon name={format.icon} size={30} /><span><strong>{format.name}</strong><small>{format.detail}</small></span></label>
          {/each}
        </fieldset>
        <p class="hint export-note">All saved reflections. Unfinished drafts are excluded.</p>
        <button class="primary" onclick={() => prepareExport(exportFormat)} disabled={exporting || !!view.pending}>{exporting ? 'Preparing…' : 'Prepare export'}</button>
        {#if preparedFile}<div class="ready glass" role="status"><span class="ready-icon"><Icon name="check" /></span>Export ready</div><button class="outline download" onclick={downloadPrepared}><Icon name="download" />Download {exportFormat === 'markdown' ? 'Markdown' : 'JSON'}</button>{:else if exportStatus}<p aria-live="polite">{exportStatus}</p>{/if}
        <p class="hint export-warning">This file contains your private reflections.</p>
      {:else if settingsPage === 'privacy'}
        <h1>Privacy & data</h1><section class="glass"><h2>Your moments are yours.</h2><p>Your saved reflections belong to your account. Search happens on this device, and your writing is not shared with AI.</p><button class="outline" onclick={() => openSettings('export')}>Export your journal</button></section>
        <section class="glass"><h2>Journal recovery</h2><p class="muted">Rebuild this device’s view from your saved account history.</p><button class="outline" onclick={() => repository?.rebuild().catch(() => error = 'Could not rebuild. Please reload and try again.')} disabled={busy}>Rebuild local view</button></section>
      {:else}
        <h1>Your account</h1><section class="glass"><span class="account-avatar"><Icon name="account" size={32} /></span><p class="account-email">{user.email}</p><p class="muted">{uiReview ? 'Your fictional journal stays in this browser.' : 'Your reflections stay together across your devices.'}</p><button class="outline" onclick={leave} disabled={busy}>Sign out</button></section>
      {/if}
    {/if}
    {#if view.pending}<section class="glass pending"><h2>A reflection is waiting to sync</h2><p class="entry-text"><ReflectionText text={view.pending.payload.text} /></p><button class="primary" onclick={() => repository?.retry()} disabled={busy}>Retry sync</button><button class="text-button" onclick={recoverPending}>Return text to editor</button></section>{/if}
    {#if view.status !== 'Synced'}<p class="sync-status" role="status">{view.status}</p>{/if}
    <dialog bind:this={discardDialog} onclose={() => discardOpen = false} aria-labelledby="discard-title"><h2 id="discard-title">Discard this draft?</h2><p>Your saved reflections will remain in your journal.</p><button class="primary" onclick={() => discardOpen = false}>Keep writing</button><button class="outline" onclick={discardDraft}>Discard draft permanently</button></dialog>
    {#if !writing}<nav class="glass" aria-label="Journal navigation">{#each [{ id: 'today', label: 'Today' }, { id: 'journal', label: 'Journal' }, { id: 'settings', label: 'Settings' }] as item}<button aria-current={tab === item.id ? 'page' : undefined} onclick={() => navigate(item.id as typeof tab)}><Icon name={item.id} size={28} filled={tab === item.id} /><span>{item.label}</span></button>{/each}</nav>{/if}
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
</main>
<style>
  :global(html) { color-scheme: dark; background: #0c0d10; }
  :global(body) { margin: 0; color: #f4f5fa; font-family: Arial, Helvetica, sans-serif; font-size: 16px; }
  :global(*) { box-sizing: border-box; }
  main { --yellow: #ffdf48; max-width: 480px; min-height: 100svh; margin: 0 auto; padding: 40px 20px 120px; background: #080b0d3d; text-align: justify; }
  main.composing { padding-bottom: 32px; }
  h1 { font: 600 2.4rem/1.15 Georgia, 'Times New Roman', serif; letter-spacing: -.035em; margin: 24px 0; }
  h2 { font: 400 1.5rem/1.35 Georgia, 'Times New Roman', serif; margin: 0 0 16px; }
  p { line-height: 1.55; margin: 0 0 20px; }
  button, input { font: inherit; }
  button { cursor: pointer; color: inherit; border: 0; background: none; min-height: 44px; }
  button:disabled { cursor: default; opacity: .5; }
  .brand { display: inline-flex; align-items: center; gap: 7px; color: inherit; text-decoration: none; font: 600 1.9rem/1.2 Georgia, serif; letter-spacing: -.04em; }
  .brand-star { width: .6em; height: .6em; flex-shrink: 0; fill: var(--yellow); }
  .today-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 42px; }
  .today-date { text-align: right; display: grid; gap: 10px; font-size: .9rem; line-height: 1.3; }
  .today-heading { margin: 0 0 14px; font: 700 2.15rem/1.15 Arial, Helvetica, sans-serif; letter-spacing: .015em; text-align: center; color: #c6c8ce; }
  .glass { background: linear-gradient(130deg, #55585b52, #191d1fc9 60%, #55514b57); border: 1px solid #c2c7ca65; border-radius: 16px; box-shadow: inset 0 1px 0 #ffffff15, 0 8px 24px #00000020; -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
  section.glass { padding: 22px; margin: 24px 0; }
  .tinted { border: 1px solid color-mix(in srgb, var(--entry-colour) 86%, white); border-radius: 17px; background: linear-gradient(125deg, color-mix(in srgb, var(--entry-colour) 28%, #0e1016) 0%, color-mix(in srgb, var(--entry-colour) 14%, #090d14) 65%, color-mix(in srgb, var(--entry-colour) 24%, #0c1017) 100%); box-shadow: inset 0 0 24px color-mix(in srgb, var(--entry-colour) 22%, transparent), inset 0 1px 0 #ffffff25, 0 0 12px color-mix(in srgb, var(--entry-colour) 12%, transparent); }
  .daily-prompt { padding: 20px; margin: 0 0 22px; display: flex; flex-direction: column; gap: 12px; }
  .badge { align-self: flex-start; color: var(--yellow); background: #7962229c; box-shadow: inset 0 1px 0 #e4c87025; border-radius: 30px; padding: 8px 13px; font-size: .85rem; }
  .daily-prompt h2 { font: 400 1.65rem/1.35 Georgia, serif; margin: 0; letter-spacing: -.025em; }
  .primary, .outline { display: flex; gap: 12px; align-items: center; justify-content: center; width: 100%; min-height: 58px; padding: 13px 18px; border: 1px solid #fff09a; border-radius: 13px; font-size: 1.08rem; }
  .primary { background: linear-gradient(115deg, #ffe76b, #ffdc43 75%, #ffe773); color: #14140d; font-weight: 600; box-shadow: inset 0 1px 0 #fff8c780, 0 3px 18px #ffd94a12; }
  .outline { background: #10141850; border-color: #e8d478; }
  .text-button { color: var(--yellow); display: block; width: 100%; margin: 12px 0; padding: 12px; font-size: 1.05rem; }
  .underlined { text-decoration: underline; text-underline-offset: 4px; padding: 8px 0; }
  .today-secondary { font-size: .95rem; }
  .today-response { font-size: 1.18rem; }
  .prompt-explanation { border-top: 1px solid #c5c8ce50; margin-top: 28px; padding-top: 12px; text-align: center; }
  .explanation { text-align: justify; padding: 18px; margin-top: 12px; font-size: .9rem; }
  .back { display: inline-flex; gap: 8px; align-items: center; padding: 0; margin: 0 0 12px -4px; font-size: 1rem; }
  .back + h1 { margin-top: 12px; }
  .page-heading.reflection-heading { margin-bottom: 14px; }
  .writing-prompt { font: italic 400 1.17rem/1.4 Georgia, serif; color: color-mix(in srgb, var(--entry-colour) 38%, #ecf4ff); margin: 0 0 20px; }
  .composer { padding: 18px 20px; }
  .hint { font-size: .88rem; color: #b7bdc6; line-height: 1.5; }
  .draft-status { margin: 16px 0; }
  .saved-heading { text-align: center; margin: 38px 0 26px; }
  .saved-heading h1 { margin-bottom: 16px; }
  .saved-heading time { font-size: .85rem; color: #b7bdc6; }
  .saved-actions { display: grid; gap: 16px; margin-top: 32px; }
  .page-heading { font: 600 2.3rem/1.2 Arial, Helvetica, sans-serif; letter-spacing: -.035em; margin: 8px 0 24px; }
  .search { min-height: 54px; border-radius: 32px; display: flex; gap: 12px; align-items: center; padding: 0 16px; margin-bottom: 22px; }
  .search > :global(svg) { flex-shrink: 0; }
  .search input { min-width: 0; width: 100%; padding: 14px 0; border: 0; background: transparent; color: inherit; }
  .search input:focus-visible { outline: none; }
  .search:focus-within { border-color: #c3c9d3; }
  .search input::placeholder { color: #c3c9d3; }
  .search input::-webkit-search-cancel-button { display: none; }
  .icon-button { display: grid; place-items: center; padding: 0; min-width: 28px; }
  .result-count { font-size: 1rem; margin: 0 0 18px; }
  .entries { display: grid; gap: 16px; }
  .card { padding: 12px 16px 8px; display: flex; flex-direction: column; }
  .card > h2, .card > .prompt-preview { flex-shrink: 0; }
  .detail time { color: #b7bdc6; font-size: .85rem; margin-bottom: 8px; display: block; }
  .card h2, .detail h2 { font: 700 1.1rem/1.25 Arial, Helvetica, sans-serif; color: color-mix(in srgb, color-mix(in srgb, var(--entry-colour) 38%, #ecf4ff) 80%, black); margin: 8px 0 4px; }
  .card > h2:first-child { margin-top: 0; }
  .card .entry-prompt + h2, .detail .entry-prompt + h2 { margin-top: 12px; }
  .card p, .detail p { font-size: .9rem; line-height: 1.4; margin: 0; overflow-wrap: anywhere; }
  .prompt-preview { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
  .prompt-preview { -webkit-line-clamp: 2; line-clamp: 2; }
  .card .entry-prompt, .detail .entry-prompt { font-size: .975rem; font-style: italic; font-weight: 400; color: color-mix(in srgb, var(--entry-colour) 38%, #ecf4ff); }
  .detail { padding: 22px; margin-top: 12px; }
  .entry-text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .entry-action { display: flex; align-items: center; gap: 16px; color: var(--yellow); border-top: 1px solid #ffffff35; width: 100%; padding: 18px 0 0; margin-top: 24px; font-size: .85rem; }
  .empty { text-align: center; padding: 36px 22px !important; }
  .empty :global(svg) { color: var(--yellow); margin-bottom: 20px; }
  .empty h2 { font-size: 1.65rem; }
  .empty p { color: #c5cad2; }
  .settings-menu { display: grid; gap: 14px; }
  .settings-row { display: flex; text-align: left; align-items: center; gap: 14px; padding: 18px 16px; width: 100%; min-height: 94px; }
  .row-icon, .account-avatar { display: grid; place-items: center; flex-shrink: 0; width: 50px; height: 50px; border-radius: 50%; background: #cbd2d51a; }
  .row-icon.yellow { color: var(--yellow); background: #e8d99620; }
  .row-copy { display: grid; gap: 6px; flex: 1; min-width: 0; }
  .row-copy strong { font-weight: 400; font-size: 1.08rem; }
  .row-copy span { color: #bac6d4; font-size: .85rem; overflow-wrap: anywhere; }
  .app-credit { text-align: center; font-size: .83rem; color: #b7bec8; margin: 42px 0 20px; }
  .review-tools { padding: 16px; margin-top: 24px; }
  summary { cursor: pointer; min-height: 30px; }
  .preferences { padding: 6px 20px !important; }
  .preference { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 64px; border-bottom: 1px solid #ffffff30; }
  .preference:last-child { border: 0; }
  .switch { padding: 3px; width: 46px; min-height: 27px; flex-shrink: 0; border-radius: 20px; background: #6e7378; }
  .switch span { display: block; width: 21px; height: 21px; border-radius: 50%; background: white; }
  .export-choices { border: 0; padding: 0; margin: 0; display: grid; gap: 14px; }
  .export-choice { display: flex; align-items: center; gap: 20px; padding: 22px 18px; min-height: 94px; cursor: pointer; }
  .export-choice.chosen { border-color: var(--yellow); box-shadow: inset 0 0 18px #ffe14c15, 0 0 8px #ffe14c25; }
  .export-choice input { accent-color: var(--yellow); width: 22px; height: 22px; margin: 0; flex-shrink: 0; }
  .export-choice span { display: grid; gap: 6px; }
  .export-choice strong { font-weight: 400; font-size: 1.1rem; }
  .export-choice small { color: #bcc6d4; font-size: .85rem; }
  .export-note { margin: 20px 0; }
  .export-warning { margin: 32px 0; text-align: center; }
  .ready { display: flex; align-items: center; gap: 18px; padding: 18px; margin: 18px 0; border-color: #73c59590; background: #254e3670; }
  .ready-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #7ccd9625; }
  .download { color: var(--yellow); }
  .account-email { overflow-wrap: anywhere; margin: 20px 0 12px; }
  .muted { color: #bdc4ce; }
  .sync-status { margin: 24px 0 0; font-size: .85rem; color: #d2cfbb; }
  nav.glass { position: fixed; z-index: 10; bottom: 0; left: 50%; transform: translateX(-50%); width: min(100%, 480px); display: flex; justify-content: space-around; border-radius: 24px 24px 0 0 !important; padding: 12px 8px max(12px, env(safe-area-inset-bottom)); background: linear-gradient(120deg, #34383bf2, #161a1cf5, #474342eb) !important; -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); }
  nav button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 30%; min-height: 59px; padding: 4px; font-size: .85rem; color: #cbd0de; }
  nav button[aria-current] { color: var(--yellow); }
  nav button[aria-current]::after { content: ''; position: absolute; bottom: -7px; height: 3px; width: 28px; background: var(--yellow); border-radius: 4px; }
  .welcome { padding-top: 30px; }
  .welcome h1 { font-size: 3rem; }
  .welcome > p { color: #c5cad2; font-size: 1.15rem; }
  .welcome section { margin-top: 40px; }
  dialog { width: min(390px, calc(100vw - 40px)); padding: 26px; color: inherit; background: linear-gradient(130deg, #333738ed, #14181af5); border: 1px solid #b6bec980; border-radius: 24px; backdrop-filter: blur(24px); }
  dialog::backdrop { background: #02040599; }
  dialog .outline { margin-top: 14px; }
  [role=alert] { color: #ffd4cc; background: #471f21e8; padding: 18px; border: 1px solid #e88c8c70; border-radius: 14px; margin-top: 24px; }
  :focus-visible { outline: 2px solid var(--yellow); outline-offset: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @media (min-width: 540px) { main { margin: 20px auto; min-height: calc(100svh - 40px); padding: 38px 26px 120px; border: 1px solid #c5c8c250; border-radius: 28px; box-shadow: 0 20px 80px #0008, inset 0 1px 0 #ffffff12; } nav.glass { bottom: 20px; width: 480px; border-radius: 24px !important; } }
  @media (max-width: 350px) { main { padding-inline: 16px; } .today-header { gap: 8px; } .brand { font-size: 1.65rem; } .today-date { font-size: .8rem; } h1 { font-size: 2.1rem; } .today-heading { font-size: 1.8rem; } .settings-row { gap: 10px; padding: 16px 12px; } .row-icon { width: 40px; height: 40px; } .export-choice { gap: 12px; } }
  @media (prefers-reduced-transparency: reduce) { .glass, nav.glass, dialog { background: #1c2024 !important; backdrop-filter: none; } }
</style>
