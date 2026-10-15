import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export function createFirebaseClient() {
  const emulators = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
  if (emulators && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('Emulator mode is only available on localhost.');
  }
  const options = emulators ? {
    projectId: 'demo-gratitude', apiKey: 'demo-key', authDomain: 'demo-gratitude.firebaseapp.com', appId: 'demo-app', storageBucket: 'demo-gratitude.firebasestorage.app'
  } : {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  if (Object.values(options).every((value) => !value)) return null;
  if (Object.values(options).some((value) => !value)) throw new Error('Firebase configuration is incomplete.');
  const existing = getApps().find((app) => app.name === 'gratitude');
  const app = existing ?? initializeApp(options, 'gratitude');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app, `gs://${options.projectId}.firebasestorage.app`);
  storage.maxUploadRetryTime = 30_000;
  storage.maxOperationRetryTime = 15_000;
  if (emulators && !existing) {
    connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 18080);
    connectStorageEmulator(storage, '127.0.0.1', 19199);
  }
  return { app, emulators, auth, db, storage, projectId: options.projectId as string };
}
export function googleSignIn(client: NonNullable<ReturnType<typeof createFirebaseClient>>) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(client.auth, provider);
}
export type FirebaseClient = NonNullable<ReturnType<typeof createFirebaseClient>>;
