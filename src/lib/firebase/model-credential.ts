import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { validateConnection, type ModelConnection } from '../ai/lm-studio.ts';

export type CredentialStatus = { ready: boolean; saved: boolean; error: string };
export type SavedConnection = Pick<ModelConnection, 'baseUrl' | 'model' | 'token'>;
type Changed = (connection: SavedConnection | null | undefined, status: CredentialStatus) => void;

/** Mutable credentials never enter the source stream or journal cache.
 * undefined preserves a tab-only connection; null clears a previously restored token.
 */
export class ModelCredentialStore {
  private unsubscribe = () => {};
  private stopped = false;
  private restored = false;
  private reference;
  private changed: Changed;

  constructor(db: Firestore, uid: string, changed: Changed, restored = false) {
    this.restored = restored;
    this.changed = changed;
    this.reference = doc(db, `users/${uid}/privateSettings/lmStudio`);
  }

  start() {
    this.unsubscribe = onSnapshot(this.reference, { includeMetadataChanges: true }, snapshot => {
      if (this.stopped || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      try {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.schemaVersion !== 1) throw new Error('Unsupported credential version');
          const connection = validateSavedConnection(data as SavedConnection);
          this.restored = true;
          this.changed(connection, { ready: true, saved: true, error: '' });
        } else {
          const clear = this.restored;
          this.restored = false;
          this.changed(clear ? null : undefined, { ready: true, saved: false, error: '' });
        }
      } catch {
        const clear = this.restored;
        this.restored = false;
        this.changed(clear ? null : undefined, {
          ready: true, saved: true,
          error: 'The saved model connection could not be read. Save it again or forget it.'
        });
      }
    }, () => {
      if (!this.stopped) this.changed(undefined, {
        ready: false, saved: false,
        error: 'Account token sync is unavailable. Reconnect to manage it; tab-only settings still work.'
      });
    });
  }

  async save(input: ModelConnection) {
    const value = validateSavedConnection(input);
    await setDoc(this.reference, { schemaVersion: 1, ...value, updatedAt: serverTimestamp() });
  }

  async forget() { await deleteDoc(this.reference); }
  stop() { this.stopped = true; this.unsubscribe(); }
}

export function validateSavedConnection(input: SavedConnection): SavedConnection {
  const connection = validateConnection({ ...input, provider: 'lm-studio' });
  if (!connection.token) throw new Error('Enter an LM Studio token before remembering it.');
  const url = new URL(connection.baseUrl);
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Use HTTPS to remember a connection beyond this computer.');
  }
  return { baseUrl: connection.baseUrl, model: connection.model, token: connection.token };
}
