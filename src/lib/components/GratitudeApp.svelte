<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto, pushState, replaceState } from '$app/navigation';
  import WelcomePage from './WelcomePage.svelte';
  import WeekBox from './WeekBox.svelte';
  import GratitudeCalendar from './GratitudeCalendar.svelte';
  import LandingCalendar from './LandingCalendar.svelte';
  import { indexCalendarDays, summarizeStretches, validDay, dayLabel } from '$lib/calendar';
  import { readCalendarFlow, type CalendarFlow, type CalendarFrame, type CalendarAnchor } from '$lib/calendar-navigation';
  let { landing=false }: {landing?:boolean}=$props();
  import ImportPanel from '$lib/components/ImportPanel.svelte';
  import { base } from '$app/paths';
  import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
  import { createFirebaseClient, googleSignIn, type FirebaseClient } from '$lib/firebase/client';
  import { JournalRepository, type JournalView, type JournalStore } from '$lib/firebase/repository';
  import { entryPhotos, emptyProjection, STARTER_ID, STARTER_PROMPT, promptId, resolvePrompt, type AIChoices, type Entry, type Action } from '$lib/domain';

  import { aiAvailable, personalContextAvailable, geminiGenerator } from '$lib/ai/gemini';

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
  let client = $state.raw<FirebaseClient | null>(null);
  let repository = $state.raw<JournalStore | null>(null);
  let user = $state<Pick<User, 'uid' | 'email'> | null>(null);
  let configured = $state(false);
  let initialized = $state(false);
  let busy = $state(false);
  let photoBusy = $state(false);
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
  let dateFilter = $state<string|null>(null);
  let writing = $state(false);
  let savedId = $state<string | null>(null);
  let query = $state('');
  let selectedId = $state<string | null>(null);
  let journalScroll = 0;
  const selected = $derived(view.state.entries.find((entry) => entry.id === selectedId));
  const results = $derived(searchEntries(dateFilter ? view.state.entries.filter(entry=>localDay(entryTimestamp(entry))===dateFilter) : view.state.entries, query, Object.values(view.state.photos)));
  let currentInstant = $state(new Date());
  const today = $derived(localDay(currentInstant));
  let todayDraft = $state<Action | null>(null);
  let todayDraftDay = $state('');
  let editorDraftKey = $state('');
  const todayKey = $derived(`draft:today:${today}`);
  const newEntryKey = 'draft:new';
  let editorDateTime = $state('');
  let editorEntryAt = $state('');
  let editorDateChanged = $state(false);
  function chosenEntryAt(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || localDateTime(date) !== (value.length === 16 ? `${value}:00` : value) || date.getFullYear() < 1) return null;
    return date.toISOString();
  }
  // Validate the visible second; an untouched server timestamp may retain milliseconds.
  const entryDateError = $derived(!chosenEntryAt(editorDateTime) ? 'Choose a valid entry date and time.'
    : new Date(chosenEntryAt(editorDateTime)!) > currentInstant ? 'Choose a date and time that is now or earlier.' : '');
  const daily = $derived(todayReflection(view.state.entries, today));
  const hasTodayDraft = $derived(todayDraftDay === today && !!todayDraft && (!!todayDraft.payload.text.trim() || entryPhotos(view.state, todayDraft.payload.entryId).length > 0 || todayDraft.schemaVersion === 6 && todayDraft.payload.entryAt !== null || (todayDraft.schemaVersion === 5 || todayDraft.schemaVersion === 6) && (todayDraft.payload.promptText !== null || todayDraft.payload.promptId !== (daily.entry?.promptId ?? view.state.ai.days[today] ?? STARTER_ID))));
  const todayDraftEntry = $derived(hasTodayDraft ? view.state.entries.find(entry => entry.id === todayDraft?.payload.entryId) : undefined);
  const todayColour = $derived(colours[hasTodayDraft ? todayDraftEntry?.colour ?? view.state.entries.length % colours.length : daily.colour]);
  let editorColour = $state(colours[0]);
  let editorPromptId = $state(STARTER_ID);
  const currentPromptId = $derived((hasTodayDraft && todayDraft ? promptId(todayDraft) : daily.entry?.promptId ?? view.state.ai.days[today]) ?? STARTER_ID);
  const currentPrompt = $derived(hasTodayDraft && todayDraft ? ((todayDraft.schemaVersion === 5 || todayDraft.schemaVersion === 6) ? todayDraft.payload.promptText : null) ?? resolvePrompt(view.state, promptId(todayDraft)) ?? todayDraftEntry?.prompt ?? STARTER_PROMPT : daily.entry?.prompt ?? resolvePrompt(view.state, currentPromptId) ?? STARTER_PROMPT);
  let editorManualPrompt = $state<string | null>(null);
  let editingPrompt = $state(false);
  let promptBuffer = $state('');
  let dismissedPrompt = $state('');
  const editorPrompt = $derived(editorManualPrompt ?? resolvePrompt(view.state, editorPromptId) ?? STARTER_PROMPT);
  const promptCandidate = $derived(Object.values(view.state.ai.responses).filter(response => {
    const request = view.state.ai.requests[response.payload.requestId];
    return request?.schemaVersion === 2 && request.payload.entryId === (draft?.payload.entryId ?? editing?.id) && request.payload.entryRevision === (editing?.revision ?? 0);
  }).at(-1));
  const showPromptCandidate = $derived(promptCandidate && promptCandidate.eventId !== editorPromptId && promptCandidate.eventId !== dismissedPrompt);
  async function beginPromptEdit() { if (busy || !draftRestored) return; promptBuffer = editorPrompt; editingPrompt = true; await tick(); document.getElementById('prompt-text')?.focus(); }
  async function savePromptEdit() {
    if (busy || !promptBuffer.trim() || promptBuffer.length > 600) return;
    editorManualPrompt = promptBuffer; editingPrompt = false; await persistDraft();
  }
  async function generateEditorPrompt() {
    const active = repository;
    if (!active || !client) return;
    generatingPrompt = true; aiMessage = ''; dismissedPrompt = '';
    try {
      if (!draft) await persistDraft();
      if (!draft || !draftStatus.startsWith('Draft saved')) throw new Error('Save this draft on your device before requesting a prompt.');
      await active.requestPrompt(localDay(editorEntryAt), personalContextAvailable ? 'personal' : 'generic', geminiGenerator(client), draft.payload.entryId);
    } catch (cause) { if (repository === active) aiMessage = cause instanceof Error ? cause.message : 'Could not request a prompt.'; }
    finally { if (repository === active) generatingPrompt = false; }
  }
  async function useEditorPrompt() {
    if (!promptCandidate || editingPrompt || busy) return;
    editorPromptId = promptCandidate.eventId; editorManualPrompt = null; await persistDraft();
  }
  const currentResponse = $derived(view.state.ai.responses[currentPromptId]);
  const currentRequest = $derived(currentResponse ? view.state.ai.requests[currentResponse.payload.requestId] : null);
  const pendingDailyRequest = $derived(view.state.ai.control.requestId ? view.state.ai.requests[view.state.ai.control.requestId] : null);
  const dailyRequestPending = $derived(pendingDailyRequest?.schemaVersion === 1 && pendingDailyRequest.payload.day === today);
  const failedDailyRequest = $derived(view.state.ai.failure ? view.state.ai.requests[view.state.ai.failure.payload.requestId] : null);
  const dailyRequestFailed = $derived(failedDailyRequest?.schemaVersion === 1 && failedDailyRequest.payload.day === today);
  let aiBusy = $state(false);
  let generatingPrompt = $state(false);
  let aiMessage = $state('');
  let choices = $state<AIChoices>({ enabled: false, useJournal: false, useFeedback: false, guidance: '' });
  let feedbackOpen = $state(false);
  let feedbackText = $state('');
  async function saveChoices() {
    if (!repository) return;
    aiBusy = true; aiMessage = '';
    try {
      await repository.commitAI({ eventId: crypto.randomUUID(), type: 'AIChoicesConfirmed', schemaVersion: 1,
        payload: { previousEventId: view.state.ai.control.lastEventId, ...$state.snapshot(choices) } });
      aiMessage = 'AI choices saved.';
    } catch (cause) { aiMessage = cause instanceof Error ? cause.message : 'Could not save AI choices.'; }
    finally { aiBusy = false; }
  }
  async function generatePrompt() {
    const active = repository;
    if (!active || !client) return;
    generatingPrompt = true; aiMessage = '';
    try { await active.requestPrompt(today, personalContextAvailable ? 'personal' : 'generic', geminiGenerator(client)); }
    catch (cause) { if (repository === active) aiMessage = cause instanceof Error ? cause.message : 'Could not request a prompt.'; }
    finally { if (repository === active) generatingPrompt = false; }
  }
  async function useStarter() {
    if (!repository) return;
    aiBusy = true; aiMessage = '';
    try { await repository.commitAI({ eventId: crypto.randomUUID(), type: 'StarterPromptChosen', schemaVersion: 1,
      payload: { previousEventId: view.state.ai.control.lastEventId, day: today, starterId: STARTER_ID } }); }
    catch (cause) { aiMessage = cause instanceof Error ? cause.message : 'Could not choose the starter prompt.'; }
    finally { aiBusy = false; }
  }
  async function syncPrompt() {
    aiBusy = true; aiMessage = '';
    try { await repository?.syncPromptResult(); }
    catch (cause) { aiMessage = cause instanceof Error ? cause.message : 'Could not sync the prompt.'; }
    finally { aiBusy = false; }
  }
  function openFeedback() {
    feedbackText = view.state.ai.feedback.find(f => f.payload.promptId === currentPromptId)?.payload.text ?? '';
    feedbackOpen = !feedbackOpen;
  }
  async function saveFeedback() {
    if (!repository) return;
    aiBusy = true; aiMessage = '';
    try {
      await repository.commitAI({ eventId: crypto.randomUUID(), type: 'PromptFeedbackSubmitted', schemaVersion: 1,
        payload: { previousEventId: view.state.ai.control.lastEventId, promptId: currentPromptId, text: feedbackText } });
      aiMessage = feedbackText.trim() ? 'Prompt feedback saved.' : 'Prompt feedback cleared.'; feedbackOpen = false;
    } catch (cause) { aiMessage = cause instanceof Error ? cause.message : 'Could not save feedback.'; }
    finally { aiBusy = false; }
  }

  let zone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const dayIndex = $derived(indexCalendarDays(view.state.entries, zone));
  const stretches = $derived(summarizeStretches(dayIndex, today));
  let homeAnchor = $state<CalendarAnchor>({month:localDay(new Date()).slice(0,7),offset:0});
  let flow = $state.raw<CalendarFlow|null>(null);
  let conflictDay = $state<string|null>(null);
  let draftDialog = $state<HTMLDialogElement>();
  $effect(() => { if (conflictDay && draftDialog && !draftDialog.open) draftDialog.showModal(); else if (!conflictDay && draftDialog?.open) draftDialog.close(); });
  let appliedFlow = '';
  const frame = $derived(flow?.trail.at(-1));
  const calendarShown = $derived(frame?.kind === 'calendar' && !writing && !savedId);
  const navOwner = $derived(user ? `${client?.projectId ?? 'ui-review'}:${base}:${user.uid}:v1` : '');
  const navKey = $derived(`gratitude:calendar:${navOwner}`);
  function rememberFlow(next:CalendarFlow) {try {sessionStorage.setItem(navKey,JSON.stringify(next));} catch { /* History state remains usable without session storage. */ }}
  async function writeFlow(next:CalendarFlow,replace=false) {
    flow=next;rememberFlow(next);
    const state={...page.state,calendar:next};
    if(landing && next.trail.length) await goto(`${base}/journal/?calendar=1`,{state,noScroll:true});
    else (replace?replaceState:pushState)(`${base}${landing?'/':'/journal/'}${next.trail.length?'?calendar=1':''}`,state);
  }
  function rootFlow():CalendarFlow {
    return {owner:navOwner,root:{tab:landing?'home':tab==='today'?'today':'journal',query,expanded:[...expandedEntries],scroll:window.scrollY,anchor:{...homeAnchor}},trail:[]};
  }
  async function appendFrame(next:CalendarFrame,focusDay?:string) {
    let current=flow;
    if(!current){current=rootFlow();if(focusDay)current.root.focusDay=focusDay;}
    if(focusDay && current.trail.at(-1)?.kind==='calendar') current={...current,trail:current.trail.map((f,i)=>i===current!.trail.length-1 && f.kind==='calendar'?{...f,focusDay}:f)};
    if(current.trail.at(-1)?.kind==='day') {
      current={...current,trail:current.trail.map((f,i)=>i===current!.trail.length-1 && f.kind==='day'?{...f,query,expanded:[...expandedEntries],scroll:window.scrollY,...(next.kind==='entry'?{focusId:next.id}:{})}:f)};
    }
    replaceState('',{...page.state,calendar:current});
    await writeFlow({...current,trail:[...current.trail,next]});
  }
  async function openCalendar() {chooseInitialPage=false;await appendFrame({kind:'calendar',anchor:{month:today.slice(0,7),offset:0}});}
  function rememberAnchor(anchor:CalendarAnchor) {
    if(landing){homeAnchor=anchor;const next:CalendarFlow={owner:navOwner,root:{...(flow && !flow.trail.length?flow.root:rootFlow().root),tab:'home',anchor},trail:[]};appliedFlow=JSON.stringify(next);rememberFlow(next);replaceState('',{...page.state,calendar:next});return;}
    if(frame?.kind!=='calendar' || !flow)return;
    const next={...flow,trail:flow.trail.map((f,i)=>i===flow!.trail.length-1?{kind:'calendar' as const,anchor}:f)};
    flow=next;appliedFlow=JSON.stringify(next);rememberFlow(next);replaceState('',{...page.state,calendar:next});
  }
  async function selectDate(day:string) {
    if(!view.ready || !validDay(day) || day>today)return;
    chooseInitialPage=false;
    const entries=dayIndex.get(day)??[];
    await appendFrame(entries.length===1?{kind:'entry',id:entries[0].id}:{kind:'day',day,query:'',expanded:[],scroll:0},day);
  }
  function backFlow(){window.history.back();}
  async function applyFlow(next:CalendarFlow) {
    const signature=JSON.stringify(next);if(signature===appliedFlow)return;appliedFlow=signature;
    const last=next.trail.at(-1);
    flow=next;chooseInitialPage=false;rememberFlow(next);
    if(last?.kind==='edit' && writing && editorDraftKey===last.key)return;
    writing=false;savedId=null;selectedId=null;dateFilter=null;settingsPage='menu';
    const dayFrame=next.trail.findLast(f=>f.kind==='day');
    if(dayFrame?.kind==='day')dateFilter=dayFrame.day;
    query=dayFrame?.kind==='day'?dayFrame.query:'';
    if(!last){
      flow=null;homeAnchor=next.root.anchor;dateFilter=null;query=next.root.query;expandedEntries=new Set(next.root.expanded);
      tab=next.root.tab==='home'?'today':next.root.tab;
      if(next.root.tab==='home' && !landing)await goto(`${base}/`,{state:{...page.state,calendar:next},noScroll:true});
      await tick();window.scrollTo(0,next.root.scroll);document.querySelector<HTMLElement>(`[data-day="${next.root.focusDay??today}"]`)?.focus({preventScroll:true});
    }else if(last.kind==='calendar'){
      tab=next.root.tab==='today'?'today':'journal';await tick();window.scrollTo(0,0);if(last.focusDay)document.querySelector<HTMLElement>(`[data-day="${last.focusDay}"]`)?.focus({preventScroll:true});
    }else if(last.kind==='day'){
      tab='journal';query=last.query;expandedEntries=new Set(last.expanded);await tick();window.scrollTo(0,last.scroll);if(last.focusId)document.getElementById(`view-${last.focusId}`)?.focus({preventScroll:true});
    }else if(last.kind==='entry'){
      tab='journal';selectedId=last.id;await tick();document.getElementById('entry-heading')?.focus();window.scrollTo(0,0);
    }else if(last.kind==='saved'){
      tab='today';savedId=last.id;
    }else if(last.kind==='edit'){
      tab='journal';selectedId=last.id;await openComposer(last.key,last.id?view.state.entries.find(e=>e.id===last.id):undefined,false);
    }
  }
  $effect(()=>{
    const value=page.state.calendar;const ready=view.ready;const owner=navOwner;const path=page.url.searchParams.has('calendar');const isLanding=landing;
    if(!ready || !owner)return;
    untrack(()=>{
      let next=readCalendarFlow(value,owner);
      if(!next && path){try{const saved=readCalendarFlow(JSON.parse(sessionStorage.getItem(navKey)??'null'),owner);next=saved;}catch{ /* Ignore invalid recovery context. */ }}
      if(next)void applyFlow(next);
      else if(isLanding){homeAnchor={month:localDay(new Date()).slice(0,7),offset:0};flow=null;appliedFlow='';}
    });
  });
  async function done() {
    if(!flow){await navigate('journal');return;}
    let target=flow.trail.length-1;
    while(target>=0 && ['saved','edit','entry'].includes(flow.trail[target].kind))target--;
    const count=flow.trail.length-(target+1);window.history.go(-Math.max(1,count));
  }
  async function startDateReflection(day:string,resolve:'ask'|'resume'|'discard'='ask') {
    if(!repository || view.pending)return;
    const stored=await repository.readDraft(newEntryKey);
    const storedAt=stored && 'entryAt' in stored.payload?stored.payload.entryAt:null;
    const different=stored && (!storedAt || localDay(storedAt)!==day);
    if(different && resolve==='ask'){conflictDay=day;return;}
    if(different && resolve==='discard'){
      await openComposer(newEntryKey,undefined,false);await discardDraft();if(error)return;
    }
    conflictDay=null;
    await openComposer(newEntryKey,undefined);
    if(!stored || resolve==='discard'){
      const value=day===today?localDateTime(currentInstant):`${day}T12:00:00`;
      editorDateTime=value;editorDateChanged=true;
      const instant=chosenEntryAt(value);
      if(!instant){error='Choose a valid local time for this date.';return;}
      editorEntryAt=instant;await persistDraft();
    }
  }

  function keyForEntry(entry: Entry) {
    const occupied = todayDraftDay === today && todayDraft && todayDraft.payload.entryId !== entry.id;
    return entry.id === daily.entry?.id && !occupied ? todayKey : `draft:entry:${entry.id}`;
  }
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
    const updateDay = () => { currentInstant = new Date(); zone = Intl.DateTimeFormat().resolvedOptions().timeZone; };
    const timer = window.setInterval(updateDay, 30_000);
    window.addEventListener('focus', updateDay);
    document.addEventListener('visibilitychange', updateDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', updateDay); document.removeEventListener('visibilitychange',updateDay); };
  });
  import { exportArchive } from '$lib/export';
  import { readPhoto } from '$lib/photos';
  let exportStatus = $state('');
  let exporting = $state(false);
  let preparedFile = $state<Awaited<ReturnType<typeof exportArchive>> | null>(null);
  import { colours, searchEntries, localDay, localDateTime, entryTimestamp, todayReflection } from '$lib/journal';
  import HighlightedText from '$lib/components/HighlightedText.svelte';
  import ReflectionText from '$lib/components/ReflectionText.svelte';
  import ReflectionEditor from '$lib/components/ReflectionEditor.svelte';
  import ReflectionPreview from '$lib/components/ReflectionPreview.svelte';
  let expandedEntries = $state<Set<string>>(new Set());
  import PhotoPanel from '$lib/components/PhotoPanel.svelte';
  import PhotoImage from '$lib/components/PhotoImage.svelte';
  import Icon from '$lib/components/Icon.svelte';
  let settingsPage = $state<'menu' | 'ai' | 'export' | 'privacy' | 'account' | 'import'>('menu');
  let exportFormat = $state<'markdown' | 'json'>('markdown');
  let showPromptInfo = $state(false);
  let editorOrigin = $state<{ tab: typeof tab; selectedId: string | null; savedId: string | null; label: string; scroll: number }>({ tab: 'today', selectedId: null, savedId: null, label: 'Today', scroll: 0 });
  function rememberEditorOrigin() {
    editorOrigin = { tab, selectedId, savedId, label: tab === 'journal' ? 'Journal' : tab === 'settings' ? 'Settings' : savedId ? 'Saved reflection' : 'Today', scroll: window.scrollY };
  }
  async function returnFromEditor() {
    if(flow){backFlow();return;}
    writing = false; tab = editorOrigin.tab; selectedId = editorOrigin.selectedId; savedId = editorOrigin.savedId;
    await tick(); window.scrollTo(0, editorOrigin.scroll);
  }
  const savedEntry = $derived(view.state.entries.find((entry) => entry.id === savedId));
  const todayLabel = $derived(new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${today}T12:00:00`)));
  function shortDate(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long' }).format(new Date(value)); }
  function entryDateTime(value: string) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
  async function openComposer(key: string, entry: Entry | undefined, recordHistory=true) {
    const active = repository;
    if (!active) return;
    busy = true; error = ''; aiMessage = '';
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
      editorPromptId = stored ? promptId(stored) : original?.promptId ?? (resolvePrompt(view.state, currentPromptId) ? currentPromptId : STARTER_ID);
      editorManualPrompt = (stored?.schemaVersion === 5 || stored?.schemaVersion === 6) ? stored.payload.promptText : null;
      editingPrompt = false; dismissedPrompt = '';
      editorColour = original ? colours[original.colour] : key === newEntryKey ? colours[view.state.entries.length % colours.length] : todayColour;
      currentInstant = new Date();
      editorDateTime = localDateTime((stored?.schemaVersion === 3 || stored?.schemaVersion === 4 || stored?.schemaVersion === 5 || stored?.schemaVersion === 6) && stored.payload.entryAt ? stored.payload.entryAt : original ? entryTimestamp(original) : currentInstant);
      editorDateChanged = !!stored && 'entryAt' in stored.payload && stored.payload.entryAt !== null;
      editorEntryAt = (stored?.schemaVersion === 3 || stored?.schemaVersion === 4 || stored?.schemaVersion === 5 || stored?.schemaVersion === 6) && stored.payload.entryAt ? stored.payload.entryAt : original ? entryTimestamp(original) : currentInstant.toISOString();
      text = stored?.payload.text ?? original?.text ?? '';
      draftStatus = stored ? 'Draft saved on this device' : '';
      draftWrite++; tab = 'today'; writing = true; savedId = null; selectedId = null;
      busy = false; await tick(); window.scrollTo(0, 0);
      document.getElementById('reflection')?.focus();
      if(flow && recordHistory)await appendFrame({kind:'edit',key,id:original?.id??null});
    } catch { error = 'Could not open this reflection. Your drafts are still saved.'; }
    finally { busy = false; }
  }
  async function beginWriting() {
    const key = daily.entry && (!hasTodayDraft || todayDraft?.payload.entryId === daily.entry.id) ? keyForEntry(daily.entry) : todayKey;
    await openComposer(key, daily.entry);
  }
  async function newEntry() { if(dateFilter)await startDateReflection(dateFilter);else await openComposer(newEntryKey, undefined); }
  async function openSettings(next: typeof settingsPage) { settingsPage = next; exportStatus = ''; preparedFile = null; aiMessage = ''; if (next === 'ai') choices = { ...view.state.ai.choices }; await tick(); window.scrollTo(0, 0); }

  async function navigate(next: typeof tab) { if(flow || page.state.calendar || page.url.searchParams.has('calendar')){flow=null;appliedFlow='';dateFilter=null;try{sessionStorage.removeItem(navKey);}catch{}pushState(`${base}/journal/`,{...page.state,calendar:null});} chooseInitialPage = false; tab = next; selectedId = null; writing = false; savedId = null; settingsPage = 'menu'; aiMessage = ''; feedbackOpen = false; await tick(); window.scrollTo(0, 0); }
  async function openEntry(entry: Entry) { if(flow){await appendFrame({kind:'entry',id:entry.id});return;} journalScroll = window.scrollY; selectedId = entry.id; await tick(); document.getElementById('entry-heading')?.focus(); window.scrollTo(0, 0); }
  async function closeEntry() { if(flow){backFlow();return;} const id = selectedId; selectedId = null; await tick(); document.getElementById(`view-${id}`)?.focus({ preventScroll: true }); window.scrollTo(0, journalScroll); }

  async function ensurePhotoEntry() {
    if (!draft) await persistDraft();
    if (!draft || !draftStatus.startsWith('Draft saved')) throw new Error('Save the draft on this device before attaching a photo.');
    return draft.payload.entryId;
  }
  async function persistDraft(value = text) {
    text = value;
    if (!repository || !draftRestored || !editorDraftKey) return;
    const version = ++draftWrite;
    const eventId = draft?.eventId ?? crypto.randomUUID();
    if (editorManualPrompt !== null) editorPromptId = eventId;
    draft = { eventId, type: 'ReflectionWritten', schemaVersion: 6, payload: {
      entryId: editing?.id ?? draft?.payload.entryId ?? crypto.randomUUID(), text,
      expectedRevision: editing?.revision ?? draft?.payload.expectedRevision ?? 0,
      promptId: editorPromptId, promptText: editorManualPrompt,
      entryAt: editorDateChanged || editorDraftKey === newEntryKey ? editorEntryAt : editing?.entryAt ?? null,
      photoSlot: entryPhotos(view.state, editing?.id ?? draft?.payload.entryId ?? '')[0]?.slot ?? null
    } };
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
      const exportingClient = client, owner = user?.uid;
      const file = await exportArchive(state, format, photoId => {
        if (!exportingClient || !owner) throw new Error('Sign in to include your photos.');
        return readPhoto(exportingClient, owner, photoId);
      });
      if (repository !== active) return;
      preparedFile = file;
      exportStatus = `Export ready: ${state.entries.length} saved ${state.entries.length === 1 ? 'reflection' : 'reflections'}.`;
    } catch (cause) { if (repository === active) exportStatus = cause instanceof Error ? cause.message : 'Export failed. Please try again.'; }
    finally { if (repository === active) exporting = false; }
  }
  function downloadPrepared() {
    if (!preparedFile) return;
    const url = URL.createObjectURL(new Blob([preparedFile.content], { type: typeof preparedFile.content === 'string' ? `${preparedFile.type};charset=utf-8` : preparedFile.type }));
    const link = document.createElement('a'); link.href = url; link.download = preparedFile.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function discardDraft() {
    const active = repository;
    if (!active || busy) return;
    const wasEditing = !!editing;
    busy = true;
    try {
      if (!editing && draft) {
        for (const photo of entryPhotos(view.state, draft.payload.entryId)) {
          await active.removePhoto({ eventId: crypto.randomUUID(), type: 'PhotoRemoved', schemaVersion: 1,
            payload: { entryId: photo.entryId, slot: photo.slot, photoId: photo.photoId, previousEventId: photo.lastEventId } });
        }
        await active.cancelStagedPhoto(draft.payload.entryId);
      }
      await active.clearDraft(editorDraftKey);
      if (repository !== active) return;
      if (editorDraftKey === todayKey) todayDraft = null;
      draftWrite++; draft = null; text = ''; editing = null; discardOpen = false; draftStatus = '';
      if (wasEditing) await returnFromEditor();
    }
    catch { if (repository === active) error = 'Could not discard the draft. Your text is still here.'; }
    finally { if (repository === active) busy = false; }
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
          aiBusy = false; generatingPrompt = false; aiMessage = ''; feedbackOpen = false; feedbackText = ''; choices = { enabled: false, useJournal: false, useFeedback: false, guidance: '' };
          if(user && user.uid!==next?.uid){try{sessionStorage.removeItem(navKey);}catch{}}
          flow=null;dateFilter=null;appliedFlow='';conflictDay=null;homeAnchor={month:localDay(new Date()).slice(0,7),offset:0};
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
    currentInstant = new Date();
    if (!chosenEntryAt(editorDateTime) || new Date(chosenEntryAt(editorDateTime)!) > currentInstant) {
      error = 'Choose a valid entry date and time that is now or earlier.'; return;
    }
    const savingRepository = repository;
    const savingKey = editorDraftKey;
    busy = true; error = '';
    try {
      await persistDraft();
      const savedEntryId = draft!.payload.entryId;
      await savingRepository.save($state.snapshot(draft!));
      if (repository !== savingRepository) return;
      await savingRepository.clearDraft(savingKey);
      if (savingKey === todayKey) todayDraft = null;
      if (repository !== savingRepository) return;
      draftWrite++; draft = null; draftStatus = '';
      text = ''; editing = null; writing = false; savedId = view.pending ? null : savedEntryId; tab = view.pending ? 'journal' : 'today';
      if(flow && !view.pending)await writeFlow({...flow,trail:[...flow.trail.slice(0,-1),{kind:'saved',id:savedEntryId}]},true);
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
      editorPromptId = promptId(pending);
      editorManualPrompt = (pending.schemaVersion === 5 || pending.schemaVersion === 6) ? pending.payload.promptText : null; editingPrompt = false;
      editorColour = editing ? colours[editing.colour] : (pending.schemaVersion === 3 || pending.schemaVersion === 4 || pending.schemaVersion === 5 || pending.schemaVersion === 6) && !!pending.payload.entryAt ? colours[view.state.entries.length % colours.length] : todayColour;
      editorDraftKey = editing ? keyForEntry(editing) : (pending.schemaVersion === 3 || pending.schemaVersion === 4 || pending.schemaVersion === 5 || pending.schemaVersion === 6) && !!pending.payload.entryAt ? newEntryKey : todayKey;
      editorDateTime = localDateTime((pending.schemaVersion === 3 || pending.schemaVersion === 4 || pending.schemaVersion === 5 || pending.schemaVersion === 6) && !!pending.payload.entryAt ? pending.payload.entryAt : currentInstant);
      editorEntryAt = (pending.schemaVersion === 3 || pending.schemaVersion === 4 || pending.schemaVersion === 5 || pending.schemaVersion === 6) && !!pending.payload.entryAt ? pending.payload.entryAt : chosenEntryAt(editorDateTime)!;
      editorDateChanged = 'entryAt' in pending.payload && pending.payload.entryAt !== null;
      draft = { ...pending, eventId: crypto.randomUUID() }; tab = 'today'; writing = true; await persistDraft();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Please try again.'; }
  }
</script>

<svelte:head><title>{landing?'Gratitude':'Your journal · Gratitude'}</title>{#if !landing}<meta name="robots" content="noindex" />{/if}</svelte:head>
{#if landing}
  <WelcomePage>
    {#snippet calendar()}
      {#if user && view.ready}<LandingCalendar index={dayIndex} {today} anchor={homeAnchor} onanchor={rememberAnchor} onchoose={selectDate} />{#if view.status!=='Synced'}<p class="hint">Saved on this device · waiting to sync</p>{/if}
      {:else if !initialized || user}<p role="status">Opening your calendar…</p>{:else}<p>Sign in to see your gratitude calendar.</p>{/if}
    {/snippet}
  </WelcomePage>
{:else}
<main class:composing={writing}>
  {#if !initialized}
    <p role="status" class="loading">Opening Gratitude…</p>
  {:else if !configured}
    <a class="brand" href={`${base}/`}>Gratitude</a><h1>Your private space</h1><section class="glass"><p>Account sign-in is not available on this site yet.</p></section>
  {:else if !user}
    <a class="brand" href={`${base}/`}>Gratitude</a><div class="welcome"><h1>A little space<br />for gratitude.</h1><p>Notice the small things.<br />Keep them close.</p><section class="glass"><h2>Your moments. Yours to keep.</h2><p>Sign in to keep your reflections together across your devices.</p><button class="primary" onclick={signIn} disabled={busy}>Continue with Google</button></section></div>
  {:else}
    {#if calendarShown && frame?.kind==='calendar'}
      <button class="back" onclick={backFlow}><Icon name="back" />{flow && flow.trail.length>1?'Journal':flow?.root.tab==='today'?'Today':'Journal'}</button>
      <h1 class="page-heading">Your calendar</h1>
      <p class="calendar-summary">{stretches.current} {stretches.current===1?'day':'days'} of gratitude in a row{#if view.status!=='Synced'}<small class="calendar-cache-note">Saved on this device · waiting to sync</small>{/if}</p>
      <GratitudeCalendar index={dayIndex} {today} anchor={frame.anchor} onanchor={rememberAnchor} onchoose={selectDate} />
    {:else if tab === 'today'}
      {#if writing}
        <button class="back" onclick={returnFromEditor} disabled={busy}><Icon name="back" />{editorOrigin.label}</button>
        <h1 class="page-heading reflection-heading">Your reflection</h1>
        <label class="entry-date-label" for="entry-date">Entry date and time</label>
        <input class="entry-date-input glass" id="entry-date" type="datetime-local" step="1" min="0001-01-01T00:00" max={localDateTime(currentInstant)} value={editorDateTime}
          oninput={event => { editorDateTime = event.currentTarget.value; const chosen = chosenEntryAt(editorDateTime); if (chosen) editorEntryAt = chosen; editorDateChanged = true; void persistDraft(); }} disabled={busy} aria-describedby={entryDateError ? 'entry-date-error' : undefined} aria-invalid={!!entryDateError} />
        {#if flow && !editing && dateFilter && dateFilter<today && editorDateTime.slice(0,10)===dateFilter}<p class="hint">Historical reflections start at noon. Choose the time you remember.</p>{/if}
        {#if entryDateError}<p id="entry-date-error" class="hint date-error">{entryDateError}</p>{/if}
        <section class="tinted composer" style:--entry-colour={editorColour}>
          {#if editingPrompt}
            <label class="prompt-edit-label" for="prompt-text">Prompt</label>
            <textarea id="prompt-text" class="prompt-text" aria-label="Prompt text" rows="3" maxlength="600" bind:value={promptBuffer}></textarea>
            <p class="hint">Prompt changes stay in this draft until you save the reflection.</p>
            <div class="prompt-actions"><button class="card-action" type="button" onclick={savePromptEdit} disabled={busy || !promptBuffer.trim()}>Save prompt</button><button class="card-action" type="button" onclick={() => editingPrompt = false}>Cancel prompt edit</button></div>
          {:else}
            <div class="writing-prompt editable-prompt" role="button" tabindex="0" aria-label="Edit prompt text" onclick={event => { if (event.detail === 0) void beginPromptEdit(); }} ondblclick={beginPromptEdit} onkeydown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void beginPromptEdit(); } }}>{editorPrompt}</div>
            <div class="prompt-actions"><button class="card-action" type="button" onclick={beginPromptEdit} disabled={busy}>Edit prompt</button><button class="card-action" type="button" onclick={generateEditorPrompt} disabled={busy || generatingPrompt || !!view.aiResultPending || !view.state.ai.choices.enabled || !aiAvailable || uiReview}>{generatingPrompt ? 'Finding a prompt…' : 'Generate AI prompt'}</button></div>
            {#if !view.state.ai.choices.enabled}<p class="hint prompt-hint">Enable AI prompts in Settings to generate a question. You can still edit it yourself.</p>{/if}
          {/if}
          {#if showPromptCandidate && promptCandidate}
            <aside class="prompt-option" aria-label="Generated prompt option"><p class="hint">Generated option</p><p class="writing-prompt">{promptCandidate.payload.text}</p><div class="prompt-actions"><button class="card-action" type="button" onclick={useEditorPrompt} disabled={busy || editingPrompt}>Use this prompt</button><button class="card-action" type="button" onclick={() => dismissedPrompt = promptCandidate!.eventId}>Keep current prompt</button></div></aside>
          {/if}
          <ReflectionEditor value={text} oninput={value => void persistDraft(value)} disabled={busy || !draftRestored} />
        </section>
        {#if client && repository}<PhotoPanel {client} {repository} {view} uid={user.uid} entryId={draft?.payload.entryId ?? editing?.id ?? null} ensureEntry={ensurePhotoEntry} colour={editorColour} disabled={busy || !draftRestored} draft={!editing} onbusy={value => photoBusy = value} />{/if}
        <p class="hint draft-status" aria-live="polite">{draftStatus || 'Drafts stay on this device until you save.'}</p>
        <button class="primary" onclick={save} disabled={busy || photoBusy || editingPrompt || !text.trim() && !entryPhotos(view.state, draft?.payload.entryId ?? editing?.id ?? '').length || !!view.pending || !!entryDateError}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save reflection'}</button>
        {#if text || draft}<button class="text-button muted" disabled={photoBusy} onclick={() => discardOpen = true}>Discard draft</button>{/if}
      {:else if savedEntry}
        <div class="saved-heading"><h1 class="page-heading">Reflection saved</h1><time datetime={entryTimestamp(savedEntry)}>{shortDate(entryTimestamp(savedEntry))}</time></div>
        <article class="tinted card saved-card" style:--entry-colour={colours[savedEntry.colour]}>
          <h2>Prompt</h2><p class="entry-prompt">{savedEntry.prompt}</p>
          <h2>Reflection</h2><p class="entry-text"><ReflectionText text={savedEntry.text} /></p>
        </article>
        {#if client && repository}<PhotoPanel {client} {repository} {view} uid={user.uid} entryId={savedEntry.id} colour={colours[savedEntry.colour]} />{/if}
        <div class="saved-actions"><button class="primary" onclick={done}>Done</button><button class="outline" onclick={() => edit(savedEntry)}>Edit reflection</button></div>
      {:else}
        <header class="today-header"><a class="brand" href={`${base}/`}>Gratitude<svg class="brand-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z" /></svg></a><div class="today-date"><span>{todayLabel}</span></div></header>
        <WeekBox index={dayIndex} {today} ready={view.ready} cached={view.status!=='Synced'} onopen={openCalendar} onchoose={selectDate} />
        <h1 class="today-heading">Reflection time</h1>
        {#if view.ready}
          <section class="tinted daily-prompt" style:--entry-colour={todayColour}><span class="badge">{currentPromptId === STARTER_ID ? 'Starter prompt' : currentResponse ? 'AI prompt' : 'Your prompt'}</span><h2>{currentPrompt}</h2></section>
          <button class="primary today-response" onclick={beginWriting} disabled={busy || !draftLoaded || todayDraftDay !== today}>{hasTodayDraft || daily.entry ? 'Continue your reflection' : 'Write a response'}</button>
          {#if daily.entry}<button class="outline additional-response" onclick={newEntry} disabled={busy || !draftLoaded || !!view.pending}>Write another reflection</button>{/if}
          {#if !daily.entry && !hasTodayDraft}
            {#if view.state.ai.choices.enabled}
              <button class="outline ai-generate" onclick={generatePrompt} disabled={aiBusy || generatingPrompt || !!view.aiResultPending || !aiAvailable || uiReview}>{generatingPrompt ? 'Finding a prompt…' : dailyRequestPending || dailyRequestFailed ? 'Try another request' : currentResponse ? 'Another prompt' : 'Find me a prompt'}</button>
              {#if dailyRequestPending && !generatingPrompt && !view.aiResultPending}<p class="hint">A request is unfinished. It will not restart by itself. Try another request or use the starter.</p>{/if}
              {#if currentResponse || dailyRequestPending || dailyRequestFailed}<button class="text-button today-secondary" onclick={useStarter} disabled={aiBusy}>Use starter prompt</button>{/if}
            {:else}<button class="text-button today-secondary" onclick={async () => { await navigate('settings'); await openSettings('ai'); }}>Set up AI prompts</button>{/if}
          {/if}
          {#if view.aiResultPending}<section class="glass"><p>A prompt arrived and is saved on this device. Sync it without another AI request.</p><button class="outline" onclick={syncPrompt} disabled={aiBusy}>Sync received prompt</button></section>{/if}
          <button class="text-button today-secondary" onclick={() => navigate('journal')}>Browse your journal</button>
          <div class="prompt-explanation"><button class="underlined today-secondary" aria-expanded={showPromptInfo} onclick={() => showPromptInfo = !showPromptInfo}>Why this prompt?</button>{#if showPromptInfo}<div class="glass explanation">{#if currentRequest}<p>This question was generated by Gemini.{currentRequest.payload.contextMode === 'generic' ? ' No journal text, preferences or feedback was shared.' : ` It used your saved preferences, ${currentRequest.payload.entryRefs.length} recent reflections and ${currentRequest.payload.feedbackIds.length} pieces of feedback.`}</p>{:else if currentPromptId !== STARTER_ID}<p>You wrote this prompt. It is saved with your reflection.</p>{:else}<p>A simple starting point for noticing something good. You can write as little or as much as you like. This starter works without sending anything to AI.</p>{/if}<button class="underlined" onclick={openFeedback} disabled={!resolvePrompt(view.state, currentPromptId)}>Give prompt feedback</button>{#if feedbackOpen}<label class="ai-label" for="prompt-feedback">What would make prompts better for you?</label><textarea id="prompt-feedback" maxlength="500" rows="3" bind:value={feedbackText}></textarea><p class="hint">A short note in your own words. Clear the text to remove it from future personalization.</p><button class="outline" onclick={saveFeedback} disabled={aiBusy}>Save feedback</button>{/if}</div>{/if}</div>
        {/if}
      {/if}
    {:else if tab === 'journal'}
      {#if frame?.kind==='entry' && !selected && view.ready}<button class="back" onclick={backFlow}><Icon name="back" />Back</button><section class="glass empty"><h2>This entry is unavailable.</h2><p>Return to the calendar to choose another reflection.</p></section>
      {:else if selected}
        <button class="back" onclick={closeEntry}><Icon name="back" />{flow ? flow.trail.at(-2)?.kind==='day'?'Journal':flow.trail.at(-2)?.kind==='calendar'?'Calendar':flow.root.tab==='home'?'Home':flow.root.tab==='today'?'Today':'Journal' : 'Journal'}</button>
        <h1 class="sr-only" id="entry-heading" tabindex="-1">Your reflection</h1>
        <article class="tinted detail" style:--entry-colour={colours[selected.colour]}>
          <time datetime={entryTimestamp(selected)}>{entryDateTime(entryTimestamp(selected))}</time>
          <h2>Prompt</h2><p class="entry-prompt"><HighlightedText text={selected.prompt} {query} /></p>
          <h2>Reflection</h2><p class="entry-text"><ReflectionText text={selected.text} {query} /></p>
          {#if client && repository}<PhotoPanel {client} {repository} {view} uid={user.uid} entryId={selected.id} {query} />{/if}
          <button class="entry-action card-action" onclick={() => edit(selected)} disabled={!!view.pending || busy}><Icon name="edit" size={16} />Edit reflection</button>
        </article>
      {:else}
        <h1 class="page-heading">Your journal</h1>
        {#if dateFilter}<button class="back day-back" onclick={backFlow}><Icon name="back" />{flow?.trail.at(-2)?.kind==='calendar'?'Calendar':flow?.root.tab==='home'?'Home':flow?.root.tab==='today'?'Today':'Journal'}</button><h2 class="date-heading">{dayLabel(dateFilter)}</h2>{/if}
        <WeekBox index={dayIndex} {today} ready={view.ready} cached={view.status!=='Synced'} onopen={openCalendar} onchoose={selectDate} />
        <button class="outline new-entry" onclick={newEntry} disabled={busy || !view.ready || !draftLoaded || !!view.pending}>New entry</button>
        <div class="search glass"><Icon name="search" /><input id="search" type="search" aria-label="Search reflections" bind:value={query} placeholder="Search reflections" />{#if query}<button class="icon-button" aria-label="Clear search" onclick={() => query = ''}><Icon name="close" /></button>{/if}</div>
        {#if query || view.status !== 'Synced'}<p class="result-count" aria-live="polite">{results.length} {results.length === 1 ? 'reflection' : 'reflections'}{view.status !== 'Synced' ? ' on this device' : ''}</p>{/if}
        {#if dateFilter && view.ready && results.length===0 && !query}<section class="glass empty"><h2>A moment for this day.</h2><p>No saved reflections for {dayLabel(dateFilter)}.</p><button class="primary" onclick={()=>startDateReflection(dateFilter!)} disabled={!!view.pending}>Write a reflection for this date</button></section>
        {:else if view.ready && view.state.entries.length === 0}<section class="glass empty"><Icon name="journal" size={44} /><h2>Your story starts small.</h2><p>A moment, a kindness, a little light.<br />Your reflections will find a home here.</p><button class="primary" onclick={() => navigate('today')}>Write your first reflection</button></section>
        {:else if results.length === 0}<section class="glass empty"><Icon name="search" size={40} /><h2>No matching reflections</h2><p>Try another word or return to your full journal.</p><button class="outline" onclick={() => query = ''}>Clear search</button></section>{/if}
        <div class="entries">
          {#each results as entry (entry.id)}
            <article class="tinted card" class:expanded={expandedEntries.has(entry.id)} style:--entry-colour={colours[entry.colour]}>
              <h2>Prompt</h2><p class="entry-prompt prompt-preview"><HighlightedText text={entry.prompt} {query} /></p>
              {#if client && entryPhotos(view.state, entry.id).length}
                <div class="card-photos">{#each entryPhotos(view.state, entry.id) as photo (photo.photoId)}<div class="card-thumbnail"><PhotoImage {client} uid={user.uid} photoId={photo.photoId} summary={photo.summary} /></div>{/each}</div>
                {#if query && entry.text.trim()}<p class="photo-search"><HighlightedText text={entryPhotos(view.state, entry.id).map(photo => photo.summary).filter(Boolean).join(' · ')} {query} /></p>{/if}
              {/if}
              <h2>Reflection</h2><ReflectionPreview text={entry.text || entryPhotos(view.state, entry.id).map(photo => photo.summary).filter(Boolean).join(' · ') || 'Photo reflection'} {query} entryId={entry.id} entryAt={entryTimestamp(entry)} expanded={expandedEntries.has(entry.id)} onexpand={() => expandedEntries = new Set([...expandedEntries, entry.id])} oncollapse={() => expandedEntries = new Set([...expandedEntries].filter(id => id !== entry.id))} onopen={() => openEntry(entry)} />
            </article>
          {/each}
        </div>
      {/if}
    {:else}
      {#if settingsPage !== 'menu'}<button class="back" onclick={() => openSettings('menu')}><Icon name="back" />Settings</button>{/if}
      {#if settingsPage === 'menu'}
        <h1 class="page-heading">Settings</h1>
        <div class="settings-menu">
          {#each [{ id: 'ai', icon: 'sparkles', title: 'AI settings', subtitle: 'Answers, memory and sharing' }, { id: 'export', icon: 'file', title: 'Export journal', subtitle: 'Markdown or JSON' }, { id: 'import', icon: 'file', title: 'Import journal', subtitle: 'ZIP export, photos and dates' }, { id: 'privacy', icon: 'shield', title: 'Privacy & data', subtitle: 'Your journal, your control' }, { id: 'account', icon: 'account', title: 'Your account', subtitle: user.email ?? 'Signed in' }] as item}
            <button class="glass settings-row" onclick={() => openSettings(item.id as typeof settingsPage)}><span class="row-icon" class:yellow={item.id === 'ai'}><Icon name={item.icon} size={30} /></span><span class="row-copy"><strong>{item.title}</strong><span>{item.subtitle}</span></span><Icon name="next" size={20} /></button>
          {/each}
        </div>
        <p class="app-credit">Gratitude · GPLv3</p>
        {#if uiReview}<details class="review-tools glass"><summary>UI review</summary><p class="hint">Fictional journal on this browser only.</p><button class="outline" onclick={() => resetReview?.()}>Restore sample journal</button><button class="text-button" onclick={() => resetReview?.(true)}>Show empty journal</button></details>{/if}
      {:else if settingsPage === 'ai'}
        <h1 class="page-heading">AI settings</h1>
        <p class="hint">Ask Gemini for a gentle gratitude question. Prompt context is sent only when you request one.</p>
        {#if !aiAvailable || uiReview}<p class="hint">Live AI is available only on a configured Firebase site.</p>{/if}
        <section class="glass preferences">
          <div class="preference"><span>AI prompts</span><button class="switch" role="switch" aria-checked={choices.enabled} aria-label="AI prompts" onclick={() => choices.enabled = !choices.enabled} disabled={aiBusy || !aiAvailable || uiReview}><span></span></button></div>
          <div class="preference"><span>Use prompt feedback</span><button class="switch" role="switch" aria-checked={choices.useFeedback} aria-label="Use prompt feedback" onclick={() => choices.useFeedback = !choices.useFeedback} disabled={aiBusy || !personalContextAvailable}><span></span></button></div>
          <div class="preference"><span>Use journal entries</span><button class="switch" role="switch" aria-checked={choices.useJournal} aria-label="Use journal entries" onclick={() => choices.useJournal = !choices.useJournal} disabled={aiBusy || !personalContextAvailable}><span></span></button></div>
        </section>
        {#if personalContextAvailable}
          <label class="ai-label" for="ai-guidance">What should prompts focus on or avoid? <span class="hint">Optional</span></label>
          <textarea id="ai-guidance" bind:value={choices.guidance} maxlength="500" rows="3" placeholder="For example: everyday moments; fewer questions about work"></textarea>
          <p class="hint">Your saved preferences are shared when requesting a prompt. The switches optionally include up to 5 recent reflections and 20 notes of feedback. Google processes this context to generate your prompt.</p>
        {:else}<p class="hint">This site uses Gemini’s free service: Google may review inputs and outputs to improve its products. Only a generic instruction is sent. Journal entries, preferences and feedback stay out of Gemini. Personalization needs a privately configured paid service.</p>{/if}
        <button class="primary" onclick={saveChoices} disabled={aiBusy || !aiAvailable || uiReview}>Save AI choices</button>
        <section class="glass"><h2>What informs your prompts</h2><p class="muted">{view.state.ai.choices.enabled ? personalContextAvailable ? 'Only the sources you have chosen above. There is no hidden profile.' : 'Generic instructions only. No personal context.' : 'AI prompts are off. Your journal uses a starter prompt.'}</p><p class="hint">Changes take effect when saved and cancel unfinished requests. Previously saved reflections keep their original prompts. Photo summaries are separate: attaching a photo never shares other journal content. You choose Gemini processing for each photo.</p></section>
      {:else if settingsPage === 'import'}
        <h1 class="page-heading">Import journal</h1>
        {#if client && repository}<ImportPanel {client} {repository} {view} uid={user.uid} email={user.email ?? 'your signed-in account'} />{:else}<p>Sign in to your synced journal to import an export.</p>{/if}
      {:else if settingsPage === 'export'}
        <h1>Export your journal</h1>
        <fieldset class="export-choices"><legend class="sr-only">Export format</legend>
          {#each [{ id: 'markdown', name: 'Markdown (.md)', detail: 'Readable journal', icon: 'file' }, { id: 'json', name: 'JSON (.json)', detail: 'Structured archive', icon: 'braces' }] as format}
            <label class="glass export-choice" class:chosen={exportFormat === format.id}><input type="radio" name="format" value={format.id} bind:group={exportFormat} onchange={() => { preparedFile = null; exportStatus = ''; }} /><Icon name={format.icon} size={30} /><span><strong>{format.name}</strong><small>{format.detail}</small></span></label>
          {/each}
        </fieldset>
        <p class="hint export-note">All saved reflections. Unfinished drafts are excluded.</p>
        <button class="primary" onclick={() => prepareExport(exportFormat)} disabled={exporting || !!view.pending}>{exporting ? 'Preparing…' : 'Prepare export'}</button>
        {#if preparedFile}<div class="ready glass" role="status"><span class="ready-icon"><Icon name="check" /></span>Export ready</div><button class="outline download" onclick={downloadPrepared}><Icon name="download" />Download {exportFormat === 'markdown' ? 'Markdown' : 'JSON'}{preparedFile.type === 'application/zip' ? ' ZIP' : ''}</button>{:else if exportStatus}<p aria-live="polite">{exportStatus}</p>{/if}
        <p class="hint export-warning">This file contains your private reflections.</p>
      {:else if settingsPage === 'privacy'}
        <h1>Privacy & data</h1><section class="glass"><h2>Your moments are yours.</h2><p>Your saved reflections belong to your account. Search happens on this device. Daily AI prompt sharing starts off disabled in AI settings. Photo summaries are a separate choice for each photo.</p><button class="outline" onclick={() => openSettings('export')}>Export your journal</button></section>
        <section class="glass"><h2>Journal recovery</h2><p class="muted">Rebuild this device’s view from your saved account history.</p><button class="outline" onclick={() => repository?.rebuild().catch(() => error = 'Could not rebuild. Please reload and try again.')} disabled={busy}>Rebuild local view</button></section>
      {:else}
        <h1>Your account</h1><section class="glass"><span class="account-avatar"><Icon name="account" size={32} /></span><p class="account-email">{user.email}</p><p class="muted">{uiReview ? 'Your fictional journal stays in this browser.' : 'Your reflections stay together across your devices.'}</p><button class="outline" onclick={leave} disabled={busy}>Sign out</button></section>
      {/if}
    {/if}
    {#if view.aiResultPending && (writing || tab !== 'today' || savedEntry)}<section class="glass photo-recovery"><p>A prompt arrived and is saved on this device. Sync it without another AI request.</p><button class="outline" onclick={syncPrompt} disabled={aiBusy}>Sync received prompt</button></section>{/if}
    {#if view.photoResultsPending?.length}<section class="glass photo-recovery"><p>An image summary arrived and is saved on this device.</p><button class="outline" onclick={async () => { try { for (const id of view.photoResultsPending ?? []) await repository?.syncPhotoResult(id); } catch { error = 'Could not sync image summaries. Reconnect and try again.'; } }}>Sync received summaries</button></section>{/if}
    {#if view.photoCleanupPending}<section class="glass photo-recovery"><p>Photo cleanup needs a connection to finish.</p><button class="outline" onclick={() => repository?.retryPhotoCleanup().catch(() => error = 'File deletion failed. Reconnect and retry.')}>Retry photo cleanup</button></section>{/if}
    <dialog bind:this={draftDialog} class="draft-choice" oncancel={()=>conflictDay=null} aria-label="Existing reflection draft">{#if conflictDay}<h2>A draft is already waiting.</h2><p>Your independent draft belongs to another date. Keep it or explicitly discard it before writing for {dayLabel(conflictDay)}.</p><button class="outline" onclick={()=>startDateReflection(conflictDay!,'resume')}>Resume existing draft</button><button class="outline" onclick={()=>conflictDay=null}>Keep draft and return to this date</button><button class="outline" onclick={()=>startDateReflection(conflictDay!,'discard')}>Discard draft and write for this date</button>{/if}</dialog>
    {#if aiMessage}<p class="ai-message hint" role="status">{aiMessage}</p>{/if}
    <!-- A screen change needs a fresh notice, avoiding Chromium’s cached gradient from its previous position. -->
    {#key writing}
    {#if view.pending}<section class="glass pending"><h2>A reflection is waiting to sync</h2><p class="entry-text"><ReflectionText text={view.pending.payload.text} /></p><button class="primary" onclick={() => repository?.retry()} disabled={busy}>Retry sync</button><button class="text-button" onclick={recoverPending}>Return text to editor</button></section>{/if}
    {/key}
    {#if view.status !== 'Synced'}<p class="sync-status" role="status">{view.status}</p>{/if}
    <dialog bind:this={discardDialog} oncancel={event => { if (busy) event.preventDefault(); }} onclose={() => discardOpen = false} aria-labelledby="discard-title"><h2 id="discard-title">Discard this draft?</h2><p>Your saved reflections will remain in your journal.</p><button class="primary" onclick={() => discardOpen = false} disabled={busy}>Keep writing</button><button class="outline" onclick={discardDraft} disabled={busy}>Discard draft permanently</button></dialog>
    {#if !writing}<nav class="glass" aria-label="Journal navigation">{#each [{ id: 'today', label: 'Today' }, { id: 'journal', label: 'Journal' }, { id: 'settings', label: 'Settings' }] as item}<button aria-current={tab === item.id ? 'page' : undefined} onclick={() => navigate(item.id as typeof tab)}><Icon name={item.id} size={28} filled={tab === item.id} /><span>{item.label}</span></button>{/each}</nav>{/if}
  {/if}
  {#if error || view.error}<p role="alert">{error || view.error}</p>{/if}
</main>
{/if}
<style>
  .calendar-cache-note{display:block;font-size:.7rem;font-weight:400;color:#b4bdca;margin-top:5px}
  .date-heading{font:600 1rem/1.5 Arial,Helvetica,sans-serif;color:#c1c7d1;margin:0 0 12px}.day-back{margin-top:12px}.calendar-summary{font:600 .94rem/1.5 Arial,Helvetica,sans-serif;color:#d4d9e1}.draft-choice button{margin-top:12px}
  :global(html) { color-scheme: dark; background: #0c0d10; }
  :global(body) { margin: 0; color: #f4f5fa; font-family: Arial, Helvetica, sans-serif; font-size: 16px; }
  :global(*) { box-sizing: border-box; }
  main { --yellow: #ffdf48; max-width: 480px; min-height: 100svh; margin: 0 auto; padding: 40px 20px 120px; background: #080b0d3d; text-align: justify; }
  main.composing { padding-bottom: 32px; }
  .card-photos { display: flex; gap: 8px; margin: 8px 0 12px; }
  .card-thumbnail { width: 72px; }
  .photo-search { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: .8rem; color: #bfc5ce; margin: 0 0 10px; }
  .new-entry { margin-bottom: 20px; }
  .additional-response { margin-top: 14px; }
  .entry-date-label { display: block; font-size: .875rem; color: #bfc5ce; margin-bottom: 8px; }
  .entry-date-input { display: block; width: 100%; min-width: 0; color: #e1e3e8; font: inherit; padding: 12px; margin-bottom: 16px; }
  .entry-date-input:focus { outline: none; border-color: #8b9099; }
  .date-error { color: #f6b3bf; }
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
  .photo-recovery p { line-height: 1.5; }
  .tinted { border: 1px solid color-mix(in srgb, var(--entry-colour) 86%, white); border-radius: 17px; background: linear-gradient(125deg, color-mix(in srgb, var(--entry-colour) 28%, #0e1016) 0%, color-mix(in srgb, var(--entry-colour) 14%, #090d14) 65%, color-mix(in srgb, var(--entry-colour) 24%, #0c1017) 100%); box-shadow: inset 0 0 24px color-mix(in srgb, var(--entry-colour) 22%, transparent), inset 0 1px 0 #ffffff25, 0 0 12px color-mix(in srgb, var(--entry-colour) 12%, transparent); }
  .daily-prompt { padding: 20px; margin: 0 0 22px; display: flex; flex-direction: column; gap: 12px; }
  .badge { align-self: flex-start; color: var(--yellow); background: #7962229c; box-shadow: inset 0 1px 0 #e4c87025; border-radius: 30px; padding: 8px 13px; font-size: .85rem; }
  .daily-prompt h2 { font: 400 1.65rem/1.35 Georgia, serif; margin: 0; letter-spacing: -.025em; }
  .primary, .outline { display: flex; gap: 12px; align-items: center; justify-content: center; width: 100%; min-height: 58px; padding: 13px 18px; border: 1px solid #fff09a; border-radius: 13px; font-size: 1.08rem; }
  .primary { background: linear-gradient(115deg, #ffe76b, #ffdc43 75%, #ffe773); color: #14140d; font-weight: 600; box-shadow: inset 0 1px 0 #fff8c780, 0 3px 18px #ffd94a12; }
  .outline { background: #10141850; border-color: #e8d478; }
  .ai-generate { background: #d5d7dc14; }
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
  .prompt-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: -12px 0 14px; }
  .prompt-actions button { padding: 4px 8px; color: var(--yellow); font-size: .8rem; line-height: 1.25; min-height: 30px; }
  .editable-prompt { cursor: text; }
  .editable-prompt:focus-visible { outline: 1px solid var(--entry-colour); outline-offset: 5px; border-radius: 4px; }
  .prompt-edit-label { display: block; font-size: .85rem; font-weight: 700; margin-bottom: 8px; }
  .prompt-text { background: #ffffff06; border-color: var(--entry-colour); margin-bottom: 16px; }
  .prompt-text:focus { outline: none; border-color: var(--entry-colour); }
  .prompt-option { border-top: 1px solid #ffffff25; padding-top: 12px; margin-bottom: 16px; }
  .prompt-option .writing-prompt { margin-bottom: 16px; }
  .prompt-hint { margin-top: -8px; }
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
  .entry-action { display: inline-flex; align-items: center; gap: 6px; color: var(--yellow); min-height: 28px; padding: 2px 8px; margin-top: 16px; font-size: .85rem; }
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
  .switch[aria-checked=true] { background: #d7b839; }
  .switch[aria-checked=true] span { margin-left: auto; }
  .ai-generate { margin: 14px 0; }
  .ai-label { display: block; margin: 18px 0 10px; line-height: 1.5; }
  textarea { width: 100%; resize: vertical; font: inherit; line-height: 1.5; color: inherit; background: #171c24b3; border: 1px solid #b9c1cb80; border-radius: 12px; padding: 12px; margin-bottom: 14px; }
  textarea:focus-visible { outline: none; border-color: #d5d7dc; }
  .explanation p:last-child { margin-bottom: 0; }
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
  @media(max-width:360px){main{padding-left:2px;padding-right:2px;}}
</style>
