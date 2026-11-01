import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import type { JournalView } from '../firebase/repository';
import { publishGratitude } from './sharing';
import { emptySharing, type SharingProjection } from './streaks';
import { searchProjection } from './search';
import type { Profile } from './domain';

/** Lightweight owner-only listeners; no friend histories load on journal routes. */
export class GratitudePublisher {
  private stopped = false;
  private sharing: SharingProjection;
  private view: JournalView | null = null;
  private busy = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 5_000;
  private publishedEntries: JournalView['state']['entries'] | null = null;
  private publishedSharing: string | null = null;
  private again = false;
  private stops: (() => void)[] = [];
  constructor(private db: Firestore, private uid: string) { this.sharing = emptySharing(uid); }
  start() {
    this.stops.push(onSnapshot(doc(this.db, `friendSharing/${this.uid}`), snapshot => {
      this.sharing = snapshot.exists() ? snapshot.data() as SharingProjection : emptySharing(this.uid);
      this.schedule();
    }, () => { this.sharing = emptySharing(this.uid); }));
    this.stops.push(onSnapshot(doc(this.db, `friendProfiles/${this.uid}`), snapshot => {
      if (!snapshot.exists() || !snapshot.get('discoverable')) return;
      const profile = snapshot.data() as Profile;
      void runTransaction(this.db, async tx => {
        const indexRef = doc(this.db, `friendSearch/${this.uid}`);
        const [head, index] = await Promise.all([tx.get(snapshot.ref), tx.get(indexRef)]);
        if (this.stopped || head.get('lastEventId') !== profile.lastEventId || !head.get('discoverable')) return;
        const next = searchProjection(profile);
        if (!index.exists() || JSON.stringify(index.get('terms')) !== JSON.stringify(next.terms) || index.get('profileEventId') !== profile.lastEventId) tx.set(indexRef, next);
      }).catch(() => { /* A later profile update or visit repairs the disposable index. */ });
    }, () => {}));
  }
  update(view: JournalView) { this.view = view; this.schedule(); }
  private schedule() {
    if (this.stopped) return;
    this.again = true;
    if (!this.busy) void this.flush();
  }
  private async flush() {
    this.busy = true;
    try {
      while (this.again && !this.stopped) {
        this.again = false;
        const view = this.view;
        if (view?.ready && view.status === 'Synced' && this.sharing.enabled && navigator.onLine && (view.state.entries !== this.publishedEntries || this.sharing.lastEventId !== this.publishedSharing)) {
          const sharing = this.sharing;
          if (await publishGratitude(this.db, this.uid, sharing, view.state)) { this.publishedEntries = view.state.entries; this.publishedSharing = sharing.lastEventId; this.retryDelay=5_000; }
        }
      }
    } catch {
      // Retry transient failures without blocking the private journal or rapid polling.
      if (!this.stopped && !this.retryTimer) {
        this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.schedule();},this.retryDelay);
        this.retryDelay=Math.min(this.retryDelay*2,60_000);
      }
    } finally { this.busy=false; if(this.again&&!this.stopped)this.schedule(); }
  }
  stop() { this.stopped = true; if(this.retryTimer)clearTimeout(this.retryTimer); this.stops.forEach(stop => stop()); }
}
