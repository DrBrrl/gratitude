import { parseAction, replay, type Action, type AIAction, type SourceAction, type JournalEvent } from '../domain';
import type { JournalStore, JournalView } from '../firebase/repository';
import fixture from './journal-events.json';

const STORAGE_KEY = 'gratitude:ui-review:v1';
export const reviewUser = { uid: 'ui-review', email: 'jamie@example.test' };

/** Development-only adapter: persist raw events, always derive the view by replay. */
export class ReviewRepository implements JournalStore {
  private events: JournalEvent[] = structuredClone(fixture) as JournalEvent[];
  private drafts: Record<string, Action> = {};
  private stopped = false;
  constructor(private notify: (view: JournalView) => void) {
    if (!import.meta.env.DEV) throw new Error('UI review is available only in the development server.');
  }
  private emit() {
    if (!this.stopped) this.notify({ state: replay(this.events), pending: null, ready: true, status: 'Synced', error: '' });
  }
  private persist(events = this.events, drafts = this.drafts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events, drafts }));
    this.events = events; this.drafts = drafts;
  }
  async start() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        replay(data.events);
        this.events = data.events; this.drafts = data.drafts ?? (data.draft ? { draft: data.draft } : {});
      } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    this.emit();
  }
  async readDraft(key = 'draft') {
    const draft = this.drafts[key];
    if (draft && this.events.some(event => event.eventId === draft.eventId)) { await this.clearDraft(key); return null; }
    return structuredClone(draft ?? null);
  }
  async writeDraft(draft: Action, key = 'draft') { this.persist(this.events, { ...this.drafts, [key]: structuredClone(draft) }); }
  async clearDraft(key = 'draft') { const drafts = { ...this.drafts }; delete drafts[key]; this.persist(this.events, drafts); }
  async save(input: SourceAction) {
    if (this.stopped) throw new Error('Open the review session again.');
    const action = parseAction(input);
    const prior = this.events.find((event) => event.eventId === action.eventId);
    if (prior) {
      if (JSON.stringify(parseAction({ eventId: prior.eventId, type: prior.type, schemaVersion: prior.schemaVersion, payload: prior.payload })) !== JSON.stringify(action)) throw new Error('Action ID already used with different input.');
      return;
    }
    const events = [...this.events, { ...action, sequence: this.events.length + 1, recordedAt: new Date().toISOString() }];
    replay(events); // Real reducer enforces ordering and edit revisions.
    this.persist(events); this.emit();
  }
  async commitAI(action: AIAction) { await this.save(action); return { sequence: this.events.length, eventId: action.eventId, created: true }; }
  async requestPrompt() { throw new Error('Use the Firebase preview to try Gemini. UI review stays entirely on this device.'); }
  async syncPromptResult() {}
  async retry() { this.emit(); }
  async discardPending() { this.emit(); }
  async exportSnapshot() { return replay(this.events); }
  async rebuild() { this.emit(); }
  async reset(empty = false) {
    this.persist(empty ? [] : structuredClone(fixture) as JournalEvent[], {});
    this.emit();
  }
  stop() { this.stopped = true; }
}
