<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { FirebaseClient } from '$lib/firebase/client';
  import type { JournalStore, JournalView } from '$lib/firebase/repository';
  import { entryPhotos, photoKey, type Photo } from '$lib/domain';
  import { preparePhoto, uploadPhoto, readPhoto, type StagedPhoto } from '$lib/photos';
  import { aiAvailable, summarizePhoto, personalContextAvailable } from '$lib/ai/gemini';
  import PhotoImage from './PhotoImage.svelte';
  import HighlightedText from './HighlightedText.svelte';
  let { client, repository, view, uid, entryId, ensureEntry, query = '', disabled = false, draft = false, onbusy = () => {}, colour }: {
    client: FirebaseClient; repository: JournalStore; view: JournalView; uid: string; entryId: string | null;
    ensureEntry?: () => Promise<string>; query?: string; disabled?: boolean; draft?: boolean; onbusy?: (busy: boolean) => void; colour?: string;
  } = $props();
  let active = true;
  onDestroy(() => { active = false; });
  let staged = $state<StagedPhoto | null>(null);
  let preview = $state('');
  let busy = $state(false);
  let online = $state(true);
  let message = $state('');
  let editing = $state<string | null>(null);
  let summary = $state('');
  let summaryField = $state<HTMLTextAreaElement>();
  $effect(() => { if (editing) summaryField?.focus(); });
  let removing = $state<string | null>(null);
  const photos = $derived(entryId ? entryPhotos(view.state, entryId) : []);
  const lastRequiredPhoto = $derived(photos.length === 1 && view.state.entries.some(entry => entry.id === entryId && !entry.text.trim()));
  $effect(() => { onbusy(busy || !!staged); });
  $effect(() => {
    if (!staged) { preview = ''; return; }
    const url = URL.createObjectURL(staged.blob); preview = url;
    return () => URL.revokeObjectURL(url);
  });
  onMount(() => {
    let stopped = false;
    const connection = () => { online = navigator.onLine; };
    connection();
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    if (entryId) void repository.readStagedPhoto(entryId).then(photo => { if (!stopped) staged = photo; }).catch(() => message = 'Could not restore the selected photo.');
    return () => { stopped = true; window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  });
  async function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    busy = true; message = '';
    try {
      const blob = await preparePhoto(file);
      if (!active) return;
      const id = entryId ?? await ensureEntry?.();
      if (!active) return;
      if (!id) throw new Error('Open a reflection first.');
      const slot = [0,1,2,3].find(slot => !photos.some(photo => photo.slot === slot));
      if (slot === undefined) throw new Error('Each reflection can have up to four photos.');
      const photo: StagedPhoto = { photoId: crypto.randomUUID(), eventId: crypto.randomUUID(), blob, slot, previousEventId: view.state.photos[photoKey(id, slot)]?.lastEventId ?? null };
      await repository.stagePhoto(id, photo); staged = photo;
    } catch (cause) { message = cause instanceof Error ? cause.message : 'Could not prepare the photo.'; }
    finally { busy = false; }
  }
  async function cancel() {
    if (!entryId) return;
    try { await repository.cancelStagedPhoto(entryId); staged = null; message = ''; }
    catch { message = 'Could not clear the selected photo. Try again.'; }
  }
  function failure(cause: unknown, fallback: string) { return cause instanceof Error && !(cause as { code?: string }).code ? cause.message : fallback; }
  function target(photo: Photo) { return { entryId: photo.entryId, slot: photo.slot, photoId: photo.photoId, previousEventId: photo.lastEventId }; }
  async function attach(withSummary: boolean) {
    if (!staged || !entryId) return;
    const photo = staged, id = entryId;
    busy = true; message = '';
    try {
      if (!navigator.onLine) throw new Error('Connect to attach this photo. Your selection is saved on this device.');
      await uploadPhoto(client, uid, photo.photoId, photo.blob);
      await repository.commitAI({ eventId: photo.eventId, type: 'PhotoAttached', schemaVersion: 1,
        payload: { entryId: id, slot: photo.slot, photoId: photo.photoId, previousEventId: photo.previousEventId } });
      await repository.clearStagedPhoto(id); staged = null;
      if (withSummary) void request(id, photo.slot);
    } catch (cause) { message = failure(cause, 'Photo not attached. Your selection is saved on this device. Check your connection and retry.'); }
    finally { busy = false; }
  }
  async function request(id: string, slot: number) {
    message = '';
    try {
      const photo = view.state.photos[photoKey(id, slot)];
      await repository.requestPhotoSummary(id, slot, async () => summarizePhoto(client, await readPhoto(client, uid, photo.photoId)));
    } catch (cause) { message = failure(cause, 'Could not summarize the photo. Reconnect and try again.'); }
  }
  async function saveSummary(photo: Photo) {
    busy = true; message = '';
    try {
      await repository.commitAI({ eventId: crypto.randomUUID(), type: 'PhotoSummaryEdited', schemaVersion: 1, payload: { ...target(photo), text: summary } }); editing = null;
    } catch (cause) { message = failure(cause, 'Could not save the summary. Your changes are still here. Reconnect and try again.'); }
    finally { busy = false; }
  }
  async function remove(photo: Photo) {
    busy = true; message = '';
    try {
      await repository.removePhoto({ eventId: crypto.randomUUID(), type: 'PhotoRemoved', schemaVersion: 1, payload: target(photo) }); removing = null;
    } catch (cause) { message = failure(cause, 'Photo removal could not finish. Reconnect and retry photo cleanup.'); }
    finally { busy = false; }
  }
</script>
<section class="photos" style:--entry-colour={colour} aria-label="Entry photos">
  {#each photos as photo (photo.photoId)}
    <article class="photo-card">
      <PhotoImage {client} {uid} photoId={photo.photoId} summary={photo.summary} />
      <p class="summary-label">{photo.origin === 'user' ? 'Image summary · edited by you' : photo.origin === 'ai' || photo.status === 'pending' ? 'AI image summary' : 'Image summary'}</p>
      {#if editing === photo.photoId}
        <label class="sr-only" for={`summary-${photo.slot}`}>Image summary</label>
        <textarea bind:this={summaryField} id={`summary-${photo.slot}`} aria-label="Image summary" rows="3" maxlength="1000" bind:value={summary} disabled={busy}></textarea>
        <div class="actions"><button onclick={() => saveSummary(photo)} disabled={busy}>Save summary</button><button onclick={() => editing = null} disabled={busy}>Cancel edit</button></div>
      {:else}
        {#if photo.summary}<p class="summary"><HighlightedText text={photo.summary} {query} /></p>{/if}
        {#if photo.origin === 'user' && photo.status === 'idle' && view.photoGenerating?.includes(photoKey(photo.entryId, photo.slot))}<p class="hint" role="status">Your edited summary is saved. The pending AI response will not replace it.</p>{/if}
        {#if photo.status === 'pending'}<p class="hint" role="status">{view.photoGenerating?.includes(photoKey(photo.entryId, photo.slot)) ? 'Summarizing photo…' : view.photoResultsPending?.includes(photo.lastEventId) ? 'Summary received on this device; waiting to sync.' : 'Summary interrupted. Retry when you’re ready.'}</p>
        {:else if photo.status === 'failed'}<p class="hint" role="status">Couldn’t summarize this photo. You can retry or write a summary.</p>
        {:else if !photo.summary}<p class="hint">No image summary yet.</p>{/if}
        <div class="actions"><button onclick={() => { editing = photo.photoId; summary = photo.summary; }} disabled={busy || disabled}>{photo.summary ? 'Edit summary' : 'Write summary'}</button>
          {#if !photo.summary || photo.status !== 'idle'}<button onclick={() => request(photo.entryId, photo.slot)} disabled={busy || !aiAvailable || !personalContextAvailable || view.photoResultsPending?.includes(photo.lastEventId) || view.photoGenerating?.includes(photoKey(photo.entryId, photo.slot))}>{photo.status === 'idle' ? 'Summarize photo' : 'Retry summary'}</button>{/if}
          <button onclick={() => removing = photo.photoId} disabled={busy || disabled}>Remove photo</button></div>
        {#if !photo.summary && photo.status === 'idle'}<p class="hint">Summarize photo sends only this photo to Gemini.</p>{/if}
      {/if}
      {#if removing === photo.photoId}<div class="remove-confirm"><p>Remove this photo and its summary?</p>{#if lastRequiredPhoto}<p class="hint">Add reflection text before removing its last photo.</p>{/if}<div class="actions"><button onclick={() => remove(photo)} disabled={busy || lastRequiredPhoto}>Confirm removal</button><button onclick={() => removing = null} disabled={busy}>Keep photo</button></div></div>{/if}
    </article>
  {/each}
  {#if staged}
    <div class="photo-card selection">
      {#if preview}<img class="selected-photo" src={preview} alt="Attachment preview" />{/if}
      <p>This photo will be sent to Gemini to create a text summary if you choose to summarize it. Only this photo is sent, without location metadata or journal text. Google processes it using this site’s paid service.</p>
      <p class="hint">Photos sync to your account when attached. Reflection text stays on this device until saved.</p>
      {#if !online}<p class="hint" role="status">Connect to attach this photo. Your selection is saved on this device.</p>{/if}
      <a href="https://ai.google.dev/gemini-api/terms#paid-services" target="_blank" rel="noreferrer">AI service & data use</a>
      <button class="attach" onclick={() => attach(true)} disabled={busy || disabled || !online || !aiAvailable || !personalContextAvailable}>{busy ? 'Attaching…' : 'Attach & summarize'}</button>
      <div class="actions"><button onclick={() => attach(false)} disabled={busy || disabled || !online}>Attach without AI</button><button onclick={cancel} disabled={busy}>Cancel photo</button></div>
    </div>
  {:else if photos.length < 4}
    <label class="add-photo" class:disabled={busy || disabled}>
      Add photo<input type="file" aria-label="Add photo" accept="image/jpeg,image/png,image/webp" onchange={pick} disabled={busy || disabled} />
    </label>
    <p class="limits">JPEG, PNG or WebP · up to 4 photos · 10 MB each</p>
    {#if draft && photos.length}<p class="hint">Photos are saved to your account. Save this reflection to include them in your journal.</p>{/if}
  {/if}

  {#if message}<p class="hint" role="alert">{message}</p>{/if}
</section>
<style>
  .photos { margin: 18px 0; text-align: left; }
  .photo-card { margin-bottom: 16px; padding: 12px; border: 1px solid color-mix(in srgb, var(--entry-colour, #e8cb51) 30%, transparent); border-radius: 16px; background: #11151dcc; }
  .summary-label { color: #bfc5ce; font-size: .8rem; font-weight: 700; margin: 12px 0 6px; }
  .summary { margin: 0 0 8px; white-space: pre-wrap; line-height: 1.5; font-size: .9rem; }
  .hint, .limits { font-size: .8rem; color: #bfc5ce; line-height: 1.5; margin: 8px 0; }
  .limits { text-align: center; }
  .actions { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  button, a { color: var(--yellow, #ffdf48); font: inherit; font-size: .85rem; }
  button { min-height: 44px; border: 0; background: none; padding: 4px 0; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  textarea { width: 100%; font: inherit; font-size: .9rem; color: #eee; resize: vertical; border: 1px solid #737781; background: #ffffff09; border-radius: 8px; padding: 10px; }
  textarea:focus { outline: none; border-color: var(--entry-colour, #e8cb51); }
  .selected-photo { width: 100%; max-height: 220px; object-fit: contain; border-radius: 10px; }
  .selection p { line-height: 1.5; font-size: .85rem; }
  .attach, .add-photo { display: block; width: 100%; padding: 12px; margin-top: 14px; border: 1px solid #bda74688; border-radius: 12px; text-align: center; }
  .add-photo { position: relative; color: var(--yellow, #ffdf48); cursor: pointer; font-size: .9rem; overflow: hidden; }
  input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .disabled { opacity: .5; }
  .add-photo:focus-within, button:focus-visible, a:focus-visible { outline: 2px solid #bfc5ce; outline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .remove-confirm { border-top: 1px solid #ffffff20; padding-top: 10px; }
</style>
