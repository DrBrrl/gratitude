import type { ImportSelection } from '../import-archive';
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { appendReflection, decodeEvent } from './append';
import { openDB, type IDBPDatabase } from 'idb';
import { base } from '$app/paths';
import { applyEvent, emptyProjection, replay, GENERATION, PROJECTION_VERSION, type Action, type AIAction, type ResponseAction, type Projection, type PhotoAction, type ImportAction, photoKey } from '../domain';
import type { FirebaseClient } from './client';
import { makeRequest, buildContext, type GeneratePrompt } from '../ai/context';

import { erasePhoto, type StagedPhoto } from '../photos';

type Checkpoint = { state: Projection; digest: string };
export type JournalView = { state: Projection; pending: Action | null; status: string; error: string; ready: boolean; aiResultPending?: boolean; photoResultsPending?: string[]; photoGenerating?: string[]; photoCleanupPending?: boolean };
async function digest(state: Projection) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state)));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export class JournalRepository {
  private db!: IDBPDatabase;
  private state = emptyProjection();
  private pending: Action | null = null;
  private stopped = false;
  private listenerGeneration = 0;
  private sending = false;
  private unsubscribe: (() => void) | undefined;
  private chain = Promise.resolve();
  private draftChain = Promise.resolve();
  private ready = false;
  private rebuilding = false;
  private pendingAnchor: { id: string; sequence: number } | null = null;
  private aiResult: ResponseAction | null = null;
  private generating = false;
  private photoResults: Record<string, PhotoAction> = {};
  private photoCleanup: Record<string, string> = {};
  private photoRequests = new Set<string>();
  private status = 'Opening your journal…';
  private error = '';
  constructor(private client: FirebaseClient, private uid: string, private notify: (view: JournalView) => void) {}
  private emit() {
    if (!this.stopped) this.notify({ state: this.state, pending: this.pending, status: this.status, error: this.error, ready: this.ready, aiResultPending: !!this.aiResult, photoResultsPending: Object.keys(this.photoResults), photoGenerating: [...this.photoRequests], photoCleanupPending: !!Object.keys(this.photoCleanup).length });
  }
  async start() {
    const generation = ++this.listenerGeneration;
    this.pendingAnchor = null;
    this.db = await openDB(`gratitude:${this.client.projectId}:${base}:${this.uid}:${GENERATION}`, 1, {
      upgrade(db) { db.createObjectStore('cache'); db.createObjectStore('outbox'); }
    });
    if (this.stopped) { this.db.close(); return; }
    this.pending = await this.db.get('outbox', 'pending') ?? null;
    this.aiResult = await this.db.get('outbox', 'ai-result') ?? null;
    this.photoResults = await this.db.get('outbox', 'photo-results') ?? {};
    this.photoCleanup = await this.db.get('outbox', 'photo-cleanup') ?? {};
    if (Object.keys(this.photoCleanup).length) void this.retryPhotoCleanup().catch(() => {});
    const checkpoint = await this.db.get('cache', 'checkpoint') as Checkpoint | undefined;
    if (checkpoint) {
      try {
        const s = checkpoint.state;
        if (s.version !== PROJECTION_VERSION || !Number.isSafeInteger(s.cursor) || s.cursor < 0 || !Array.isArray(s.entries) || !s.ai?.control || !s.ai.responses || !s.ai.requests || !s.photos || !s.prompts || !s.imports ||
            await digest(s) !== checkpoint.digest) throw new Error('Invalid checkpoint');
        if (s.cursor > 0) {
          if (!s.lastEventId) throw new Error('Invalid checkpoint anchor');
          try {
            const anchor = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${s.lastEventId}`));
            if (!anchor.exists() || anchor.get('sequence') !== s.cursor) throw new Error('Stale checkpoint');
          } catch (cause) {
            // Unavailability is not evidence of corruption. Retain a digest-checked
            // prefix provisionally, then verify its anchor before accepting a server tail.
            const code = (cause as { code?: string }).code;
            if (code !== 'unavailable' && code !== 'deadline-exceeded') throw cause;
            this.pendingAnchor = { id: s.lastEventId, sequence: s.cursor };
          }
        }
        this.state = s;
        this.ready = true;
        this.status = 'Showing entries on this device; waiting to sync';
        this.emit();
      } catch { await this.db.delete('cache', 'checkpoint'); }
    }
    if (this.stopped) return;
    const events = collection(this.client.db, `users/${this.uid}/streams/${GENERATION}/events`);
    // A warm open queries only the tail. Each listener session has a fixed starting cursor.
    this.unsubscribe = onSnapshot(query(events, where('sequence', '>', this.state.cursor), orderBy('sequence')),
      { includeMetadataChanges: true }, (snapshot) => {
        this.chain = this.chain.then(async () => {
          if (this.stopped || generation !== this.listenerGeneration || snapshot.metadata.hasPendingWrites) return;
          if (this.pendingAnchor && !snapshot.metadata.fromCache) {
            const pending = this.pendingAnchor;
            const anchor = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${pending.id}`));
            if (!anchor.exists() || anchor.get('sequence') !== pending.sequence) throw new Error('Stale checkpoint. Rebuild the local view.');
            if (this.stopped || generation !== this.listenerGeneration) return;
            this.pendingAnchor = null;
          }
          let next = this.state;
          for (const item of snapshot.docs) {
            const event = decodeEvent(item.data());
            // Firestore's in-memory cache may contain only an anchor/tail from a warm open.
            // A full rebuild must wait for the server's complete query, not diagnose that
            // partial cached query as a corrupt authoritative stream.
            if (event.sequence > next.cursor + 1 && snapshot.metadata.fromCache) return;
            if (event.sequence > next.cursor) next = applyEvent(next, event);
          }
          const checkpoint: Checkpoint = { state: next, digest: await digest(next) };
          if (this.stopped || generation !== this.listenerGeneration) return;
          await this.db.put('cache', checkpoint, 'checkpoint');
          if (this.stopped || generation !== this.listenerGeneration) return;
          this.state = next;
          this.ready = true; this.error = '';
          // A stream read does not acknowledge an outstanding write.
          if (!this.pending) this.status = snapshot.metadata.fromCache ? 'Showing entries on this device; waiting to sync' : 'Synced';
          this.emit();
        }).catch((error) => { if (generation !== this.listenerGeneration) return; this.error = `Journal could not be loaded: ${error.message}`; this.ready = false; this.emit(); });
      }, () => { if (generation !== this.listenerGeneration) return; this.error = 'Your journal could not be synchronized. Reload to try again.'; this.emit(); });
    this.emit();
    if (this.pending) void this.retry();
  }
  async cancelStagedPhoto(entryId: string) {
    const staged = await this.readStagedPhoto(entryId);
    if (!staged) return;
    const committed = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${staged.eventId}`));
    if (!committed.exists()) await erasePhoto(this.client, this.uid, staged.photoId);
    await this.clearStagedPhoto(entryId);
  }
  async removePhoto(action: Extract<PhotoAction, { type: 'PhotoRemoved' }>) {
    this.photoCleanup[action.eventId] = action.payload.photoId;
    await this.db.put('outbox', this.photoCleanup, 'photo-cleanup');
    try { await this.commitAI(action); await this.retryPhotoCleanup(); }
    finally { this.emit(); }
  }
  async retryPhotoCleanup() {
    for (const [eventId, photoId] of Object.entries(this.photoCleanup)) {
      const committed = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${eventId}`));
      if (this.stopped) return;
      if (committed.exists()) await erasePhoto(this.client, this.uid, photoId);
      delete this.photoCleanup[eventId];
      await this.db.put('outbox', this.photoCleanup, 'photo-cleanup');
    }
    this.emit();
  }
  async readStagedPhoto(entryId: string): Promise<StagedPhoto | null> { return await this.db.get('outbox', `photo:${entryId}`) ?? null; }
  async stagePhoto(entryId: string, photo: StagedPhoto) { await this.db.put('outbox', photo, `photo:${entryId}`); }
  async clearStagedPhoto(entryId: string) { await this.db.delete('outbox', `photo:${entryId}`); }
  async readImportArchive(): Promise<ImportSelection | null> { return await this.db.get('outbox', 'import-archive') ?? null; }
  async storeImportArchive(file: ImportSelection | null) { if (file) await this.db.put('outbox', file, 'import-archive'); else await this.db.delete('outbox', 'import-archive'); }
  async readDraft(key = 'draft'): Promise<Action | null> {
    await this.draftChain;
    const draft = await this.db.get('outbox', key) as Action | undefined;
    if (!draft) return null;
    if (this.pending?.eventId === draft.eventId) { await this.clearDraft(key); return null; }
    try {
      const committed = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${draft.eventId}`));
      if (committed.exists()) { await this.clearDraft(key); return null; }
    } catch { /* Offline drafts remain recoverable; append deduplicates the stable action ID. */ }
    return draft;
  }
  writeDraft(draft: Action, key = 'draft') {
    const copy = structuredClone(draft);
    const write = this.draftChain.then(() => this.db.put('outbox', copy, key)).then(() => {});
    this.draftChain = write.catch(() => {});
    return write;
  }
  clearDraft(key = 'draft') {
    const write = this.draftChain.then(() => this.db.delete('outbox', key));
    this.draftChain = write.catch(() => {});
    return write;
  }
  async save(action: Action) {
    if (this.pending) throw new Error('Retry or discard the pending save first.');
    if (!this.ready || this.stopped) throw new Error('Wait for your journal to load.');
    await this.db.put('outbox', action, 'pending');
    this.pending = action;
    this.emit();
    await this.retry();
  }
  async retry() {
    if (!this.pending || this.sending || this.stopped) return;
    this.sending = true;
    this.error = '';
    this.status = 'Saved on this device; syncing…';
    this.emit();
    try {
      if (!navigator.onLine) throw new Error('You are offline. Your text is saved on this device.');
      await appendReflection(this.client.db, this.uid, this.pending);
      if (this.stopped) return;
      await this.db.delete('outbox', 'pending');
      this.pending = null;
      this.status = 'Synced';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not sync. Your text is saved on this device.';
      this.status = 'Saved on this device; not synced';
    } finally { this.sending = false; this.emit(); }
  }
  async discardPending() {
    if (this.sending) throw new Error('Wait for the current save to finish.');
    await this.db.delete('outbox', 'pending');
    this.pending = null; this.error = ''; this.status = 'Pending save returned to editor'; this.emit();
  }
  async commitAI(action: AIAction | PhotoAction | ImportAction) {
    if (!this.ready || this.stopped || !navigator.onLine) throw new Error('Connect and wait for your journal to sync first.');
    const result = await appendReflection(this.client.db, this.uid, action);
    // Await the confirmed projection, never invoke an AI adapter from a listener.
    const deadline = performance.now() + 15_000;
    while (!this.stopped && this.state.cursor < result.sequence) {
      if (performance.now() > deadline) throw new Error('Your change was saved. Reload to refresh this device.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (this.stopped) throw new Error('This journal session has closed.');
    return result;
  }
  async requestPrompt(day: string, mode: 'generic' | 'personal', generate: GeneratePrompt, entryId?: string) {
    if (this.generating) return;
    if (this.aiResult) throw new Error('Sync the received prompt before requesting another.');
    const snapshot = this.state;
    const request = makeRequest(snapshot, day, mode, crypto.randomUUID(), entryId);
    this.generating = true;
    try {
      const committed = await this.commitAI(request);
      if (!committed.created) return; // Only the transaction winner may dispatch this request.
      const control = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/ai/control`));
      if (this.stopped || control.get('requestId') !== request.eventId || control.get('choicesId') !== request.payload.choicesId) throw new Error('AI sharing choices changed.');
      let output;
      try { output = await generate(buildContext(snapshot, request)); }
      catch (cause) {
        if (this.stopped) return;
        const reason = cause instanceof Error && ['blocked', 'invalid-response'].includes(cause.message) ? cause.message as 'blocked' | 'invalid-response' : 'unavailable';
        await this.commitAI({ eventId: `${request.eventId}_failure`, type: 'AIRequestFailed', schemaVersion: 1, payload: { requestId: request.eventId, reason } });
        throw new Error('No new prompt arrived. You can try again or use the starter prompt.');
      }
      if (this.stopped) return;
      const response: ResponseAction = { eventId: `${request.eventId}_response`, type: 'PromptResponseReceived', schemaVersion: 1,
        payload: { requestId: request.eventId, ...output } };
      // Save the already received output before attempting its cloud append.
      await this.db.put('outbox', response, 'ai-result');
      this.aiResult = response; this.emit();
      await this.syncPromptResult();
    } finally { this.generating = false; }
  }
  async syncPromptResult() {
    if (!this.aiResult) return;
    const result = this.aiResult;
    try { await this.commitAI(result); }
    catch (cause) {
      // Revocation/replacement invalidates a late result. Network failures retain it.
      if (!(cause instanceof Error) || !cause.message.includes('no longer current')) throw cause;
      await this.db.delete('outbox', 'ai-result'); this.aiResult = null; this.emit();
      throw new Error('That request was replaced or AI sharing changed. The late prompt was discarded.');
    }
    await this.db.delete('outbox', 'ai-result'); this.aiResult = null; this.emit();
  }

  async requestPhotoSummary(entryId: string, slot: number, generate: () => Promise<{ text: string; model: string; finishReason: 'STOP' }>) {
    const key = photoKey(entryId, slot);
    if (this.photoRequests.has(key)) return;
    const photo = this.state.photos[key];
    if (!photo || photo.removed) throw new Error('This photo is no longer attached.');
    if (Object.values(this.photoResults).some(action => action.payload.entryId === entryId && action.payload.slot === slot)) throw new Error('Sync the received summary first.');
    const request: PhotoAction = { eventId: crypto.randomUUID(), type: 'PhotoSummaryRequested', schemaVersion: 1,
      payload: { entryId, slot, photoId: photo.photoId, previousEventId: photo.lastEventId } };
    this.photoRequests.add(key); this.emit();
    try {
      const result = await this.commitAI(request);
      if (!result.created || this.stopped) return;
      const control = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/photos/${key}`));
      if (control.get('lastEventId') !== request.eventId || this.stopped) return;
      let output;
      try { output = await generate(); }
      catch (cause) {
        if (this.stopped || this.state.photos[key]?.lastEventId !== request.eventId) return;
        const reason = cause instanceof Error && ['blocked', 'invalid-response'].includes(cause.message) ? cause.message as 'blocked' | 'invalid-response' : 'unavailable';
        await this.commitAI({ eventId: `${request.eventId}_failure`, type: 'PhotoSummaryFailed', schemaVersion: 1,
          payload: { ...request.payload, previousEventId: request.eventId, reason } });
        return;
      }
      if (this.stopped) return;
      const response: PhotoAction = { eventId: `${request.eventId}_response`, type: 'PhotoSummaryResponseReceived', schemaVersion: 1,
        payload: { ...request.payload, previousEventId: request.eventId, ...output } };
      this.photoResults[request.eventId] = response;
      await this.db.put('outbox', this.photoResults, 'photo-results'); this.emit();
      await this.syncPhotoResult(request.eventId);
    } finally { this.photoRequests.delete(key); this.emit(); }
  }
  async syncPhotoResult(requestId: string) {
    const action = this.photoResults[requestId];
    if (!action) return;
    try { await this.commitAI(action); }
    catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('photo changed on another device')) throw cause;
      // A manual correction, removal or newer request wins; never overwrite it.
    }
    delete this.photoResults[requestId];
    await this.db.put('outbox', this.photoResults, 'photo-results'); this.emit();
  }
  async exportSnapshot() {
    if (this.pending || this.sending) throw new Error('Sync your pending save before exporting.');
    if (!navigator.onLine) throw new Error('Connect to export your complete saved journal.');
    const path = `users/${this.uid}/streams/${GENERATION}`;
    const head = await getDocFromServer(doc(this.client.db, path));
    if (!head.exists()) return emptyProjection();
    const cursor = head.get('sequence');
    const snapshot = await getDocsFromServer(query(collection(this.client.db, `${path}/events`), where('sequence', '<=', cursor), orderBy('sequence')));
    const state = replay(snapshot.docs.map((item) => decodeEvent(item.data())));
    if (state.cursor !== cursor || state.lastEventId !== head.get('lastEventId')) throw new Error('Journal history is incomplete. Try exporting again after synchronization.');
    if (this.stopped) throw new Error('Sign in again before exporting.');
    return state;
  }
  async rebuild() {
    if (this.stopped || this.rebuilding) return;
    this.rebuilding = true;
    try {
      this.listenerGeneration++;
      this.ready = false; this.status = 'Rebuilding your journal…'; this.emit();
      this.unsubscribe?.();
      await this.chain;
      await this.db.delete('cache', 'checkpoint');
      this.db.close();
      this.state = emptyProjection(); this.error = '';
      await this.start();
    } finally { this.rebuilding = false; }
  }
  stop() {
    this.stopped = true; this.listenerGeneration++;
    this.unsubscribe?.();
    void Promise.all([this.chain, this.draftChain]).finally(() => this.db?.close());
  }
}

/** UI-facing contract shared with the development event-fixture adapter. */
export type JournalStore = Pick<JournalRepository, 'readImportArchive' | 'storeImportArchive' | 'start' | 'stop' | 'readDraft' | 'writeDraft' | 'clearDraft' | 'save' | 'retry' | 'discardPending' | 'exportSnapshot' | 'rebuild' | 'commitAI' | 'requestPrompt' | 'syncPromptResult' | 'requestPhotoSummary' | 'syncPhotoResult' | 'readStagedPhoto' | 'stagePhoto' | 'clearStagedPhoto' | 'cancelStagedPhoto' | 'removePhoto' | 'retryPhotoCleanup'>;
