import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { appendReflection, decodeEvent } from './append';
import { openDB, type IDBPDatabase } from 'idb';
import { base } from '$app/paths';
import { applyEvent, emptyProjection, replay, GENERATION, PROJECTION_VERSION, type Action, type AIAction, type ResponseAction, type Projection } from '../domain';
import type { FirebaseClient } from './client';
import { makeRequest, buildContext, type GeneratePrompt } from '../ai/context';

type Checkpoint = { state: Projection; digest: string };
export type JournalView = { state: Projection; pending: Action | null; status: string; error: string; ready: boolean; aiResultPending?: boolean };
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
  private aiResult: ResponseAction | null = null;
  private generating = false;
  private status = 'Opening your journal…';
  private error = '';
  constructor(private client: FirebaseClient, private uid: string, private notify: (view: JournalView) => void) {}
  private emit() {
    if (!this.stopped) this.notify({ state: this.state, pending: this.pending, status: this.status, error: this.error, ready: this.ready, aiResultPending: !!this.aiResult });
  }
  async start() {
    const generation = ++this.listenerGeneration;
    this.db = await openDB(`gratitude:${this.client.projectId}:${base}:${this.uid}:${GENERATION}`, 1, {
      upgrade(db) { db.createObjectStore('cache'); db.createObjectStore('outbox'); }
    });
    if (this.stopped) { this.db.close(); return; }
    this.pending = await this.db.get('outbox', 'pending') ?? null;
    this.aiResult = await this.db.get('outbox', 'ai-result') ?? null;
    const checkpoint = await this.db.get('cache', 'checkpoint') as Checkpoint | undefined;
    if (checkpoint) {
      try {
        const s = checkpoint.state;
        if (s.version !== PROJECTION_VERSION || !Number.isSafeInteger(s.cursor) || s.cursor < 0 || !Array.isArray(s.entries) || !s.ai?.control || !s.ai.responses || !s.ai.requests ||
            await digest(s) !== checkpoint.digest) throw new Error('Invalid checkpoint');
        if (s.cursor > 0) {
          const anchor = await getDocFromServer(doc(this.client.db, `users/${this.uid}/streams/${GENERATION}/events/${s.lastEventId}`));
          if (!anchor.exists() || anchor.get('sequence') !== s.cursor) throw new Error('Stale checkpoint');
        }
        this.state = s;
      } catch { await this.db.delete('cache', 'checkpoint'); }
    }
    if (this.stopped) return;
    const events = collection(this.client.db, `users/${this.uid}/streams/${GENERATION}/events`);
    // A warm open queries only the tail. Each listener session has a fixed starting cursor.
    this.unsubscribe = onSnapshot(query(events, where('sequence', '>', this.state.cursor), orderBy('sequence')),
      { includeMetadataChanges: true }, (snapshot) => {
        this.chain = this.chain.then(async () => {
          if (this.stopped || generation !== this.listenerGeneration || snapshot.metadata.hasPendingWrites) return;
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
  async commitAI(action: AIAction) {
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
  async requestPrompt(day: string, mode: 'generic' | 'personal', generate: GeneratePrompt) {
    if (this.generating) return;
    if (this.aiResult) throw new Error('Sync the received prompt before requesting another.');
    const snapshot = this.state;
    const request = makeRequest(snapshot, day, mode, crypto.randomUUID());
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
export type JournalStore = Pick<JournalRepository, 'start' | 'stop' | 'readDraft' | 'writeDraft' | 'clearDraft' | 'save' | 'retry' | 'discardPending' | 'exportSnapshot' | 'rebuild' | 'commitAI' | 'requestPrompt' | 'syncPromptResult'>;
