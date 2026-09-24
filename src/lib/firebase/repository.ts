import { collection, doc, getDocFromServer, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { openDB, type IDBPDatabase } from 'idb';
import { base } from '$app/paths';
import { applyEvent, emptyProjection, GENERATION, type Action, type JournalEvent, type Projection } from '../../../functions/src/domain';
import type { FirebaseClient } from './client';

type Checkpoint = { state: Projection; digest: string };
export type JournalView = { state: Projection; pending: Action | null; status: string; error: string; ready: boolean };
async function digest(state: Projection) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state)));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export class JournalRepository {
  private db!: IDBPDatabase;
  private state = emptyProjection();
  private pending: Action | null = null;
  private stopped = false;
  private sending = false;
  private unsubscribe: (() => void) | undefined;
  private chain = Promise.resolve();
  private ready = false;
  private status = 'Opening your journal…';
  private error = '';
  constructor(private client: FirebaseClient, private uid: string, private notify: (view: JournalView) => void) {}
  private emit() {
    if (!this.stopped) this.notify({ state: this.state, pending: this.pending, status: this.status, error: this.error, ready: this.ready });
  }
  async start() {
    this.db = await openDB(`gratitude:${this.client.projectId}:${base}:${this.uid}:${GENERATION}`, 1, {
      upgrade(db) { db.createObjectStore('cache'); db.createObjectStore('outbox'); }
    });
    if (this.stopped) { this.db.close(); return; }
    this.pending = await this.db.get('outbox', 'pending') ?? null;
    const checkpoint = await this.db.get('cache', 'checkpoint') as Checkpoint | undefined;
    if (checkpoint) {
      try {
        const s = checkpoint.state;
        if (s.version !== 1 || !Number.isSafeInteger(s.cursor) || s.cursor < 0 || !Array.isArray(s.entries) ||
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
          if (this.stopped) return;
          let next = this.state;
          for (const item of snapshot.docs) {
            const event = item.data() as JournalEvent;
            if (event.sequence > next.cursor) next = applyEvent(next, event);
          }
          const checkpoint: Checkpoint = { state: next, digest: await digest(next) };
          if (this.stopped) return;
          await this.db.put('cache', checkpoint, 'checkpoint');
          this.state = next;
          this.ready = true;
          // A stream read does not acknowledge an outstanding write.
          if (!this.pending) this.status = snapshot.metadata.fromCache ? 'Showing entries on this device; waiting to sync' : 'Synced';
          this.emit();
        }).catch((error) => { this.error = `Journal could not be loaded: ${error.message}`; this.ready = false; this.emit(); });
      }, () => { this.error = 'Your journal could not be synchronized. Reload to try again.'; this.emit(); });
    this.emit();
    if (this.pending) void this.retry();
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
      const append = httpsCallable<Action, { sequence: number; eventId: string }>(this.client.functions, 'appendReflection');
      await append(this.pending);
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
  async rebuild() {
    if (this.stopped) return;
    this.unsubscribe?.();
    await this.chain;
    await this.db.delete('cache', 'checkpoint');
    this.db.close();
    this.state = emptyProjection(); this.ready = false; this.error = '';
    this.status = 'Rebuilding your journal…'; this.emit();
    await this.start();
  }
  stop() {
    this.stopped = true;
    this.unsubscribe?.();
    void this.chain.finally(() => this.db?.close());
  }
}
