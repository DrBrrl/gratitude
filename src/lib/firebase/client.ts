import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

export function createFirebaseClient() {
  const emulators = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
  if (emulators && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('Emulator mode is only available on localhost.');
  }
  const options = emulators ? {
    projectId: 'demo-gratitude', apiKey: 'demo-key', authDomain: 'demo-gratitude.firebaseapp.com', appId: 'demo-app'
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
  const functions = getFunctions(app, 'australia-southeast1');
  if (emulators && !existing) {
    connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 18080);
    connectFunctionsEmulator(functions, '127.0.0.1', 15001);
  }
  return { auth, db, functions, projectId: options.projectId as string };
}
export function googleSignIn(client: NonNullable<ReturnType<typeof createFirebaseClient>>) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(client.auth, provider);
}
export type FirebaseClient = NonNullable<ReturnType<typeof createFirebaseClient>>;
