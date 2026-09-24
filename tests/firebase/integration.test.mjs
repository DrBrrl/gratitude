import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { emptyProjection, replay, parseAction, STARTER_ID } from '../../functions/lib/domain.js';

let environment;
const apps = [];
const projectId = 'demo-gratitude';
before(async () => {
  environment = await initializeTestEnvironment({ projectId,
    firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 19199, rules: await readFile('storage.rules', 'utf8') }
  });
  await environment.clearFirestore();
});
after(async () => { await Promise.all(apps.map(deleteApp)); await environment?.cleanup(); });
async function device(email, name) {
  const app = initializeApp({ projectId, apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com` }, name);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  const token = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: email, email, email_verified: true, name: 'Test visitor' })).toString('base64url')}.`;
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 18080);
  const functions = getFunctions(app, 'australia-southeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 15001);
  return { uid: user.uid, db, append: httpsCallable(functions, 'appendReflection') };
}
function action(id, entryId, text, expectedRevision = 0) {
  return { eventId: id, type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId, text, expectedRevision, starterId: STARTER_ID } };
}
async function events(device) {
  const snapshot = await getDocs(query(collection(device.db, `users/${device.uid}/streams/v1/events`), orderBy('sequence')));
  return snapshot.docs.map((item) => item.data());
}

test('same Google account shares an ordered stream, retries once, and rejects forged input', async () => {
  const first = await device('shared@example.test', 'first');
  const second = await device('shared@example.test', 'second');
  assert.equal(first.uid, second.uid);
  const write = action('shared-write', 'shared-entry', 'A quiet cup of tea.');
  const results = await Promise.all([first.append(write), second.append(write)]);
  assert.equal(results[0].data.sequence, 1); assert.equal(results[1].data.sequence, 1);
  const log = await events(second);
  assert.equal(log.length, 1);
  assert.equal(replay(log).entries[0].text, write.payload.text);
  await assert.rejects(second.append({ ...write, payload: { ...write.payload, text: 'Different content' } }), /already used/);
  await assert.rejects(first.append({ ...action('forged', 'x', 'x'), uid: 'another-user' }), /Invalid reflection/);
  await assert.rejects(first.append({ eventId: 'ai', schemaVersion: 1, type: 'PromptResponseReceived', payload: { text: 'Forged' } }), /Invalid reflection/);
  await assert.rejects(first.append(action('stale', 'shared-entry', 'Stale edit', 0)), /changed on another device/);
});

test('revision projection can be deleted and rebuilt from events before validating an edit', async () => {
  const client = await device('rebuild@example.test', 'rebuild');
  await client.append(action('rebuild-first', 'entry', 'Original'));
  await environment.withSecurityRulesDisabled(async (context) => {
    const { deleteDoc, updateDoc } = await import('firebase/firestore');
    await deleteDoc(doc(context.firestore(), `users/${client.uid}/entryRevisions/entry`));
    // Avoid a timing sleep: advance the operational rate-limit fixture only.
    await updateDoc(doc(context.firestore(), `users/${client.uid}/streams/v1`), { lastWriteMillis: 0 });
  });
  await client.append(action('rebuild-second', 'entry', 'Edited', 1));
  const log = await events(client);
  const full = replay(log);
  assert.equal(full.entries[0].revision, 2);
  assert.equal(full.entries[0].text, 'Edited');
  for (let split = 0; split <= log.length; split++) {
    assert.deepEqual(replay(log.slice(split), replay(log.slice(0, split))), full);
  }
  assert.deepEqual(emptyProjection().entries, []);
});

test('rules deny anonymous, cross-user, client event mutation, internal projections and uploads', async () => {
  const owner = await device('owner@example.test', 'owner');
  await owner.append(action('owner-write', 'owner-entry', 'Private reflection'));
  const path = `users/${owner.uid}/streams/v1/events/owner-write`;
  const { getDoc, deleteDoc } = await import('firebase/firestore');
  const own = environment.authenticatedContext(owner.uid);
  const stranger = environment.authenticatedContext('stranger');
  await assertSucceeds(getDoc(doc(own.firestore(), path)));
  await assertFails(getDoc(doc(stranger.firestore(), path)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(own.firestore(), path), { text: 'tampered' }));
  await assertFails(deleteDoc(doc(own.firestore(), path)));
  await assertFails(getDoc(doc(own.firestore(), `users/${owner.uid}/entryRevisions/owner-entry`)));
  await assertFails(uploadBytes(ref(own.storage(), `users/${owner.uid}/v1/photo`), new Uint8Array([1])));
});

test('unauthenticated callable cannot create a stream', async () => {
  const response = await fetch('http://127.0.0.1:15001/demo-gratitude/australia-southeast1/appendReflection', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: action('anonymous', 'entry', 'No') })
  });
  assert.equal(response.status, 401);
});

test('schema excludes computed state and reducer refuses gaps/unknown versions', () => {
  assert.throws(() => parseAction({ ...action('x', 'y', 'text'), colour: 3 }));
  assert.throws(() => parseAction(action('x', 'y', '   ')));
  assert.throws(() => replay([{ ...action('x', 'y', 'text'), sequence: 2, recordedAt: '2026-09-24T00:00:00Z' }]));
  assert.throws(() => replay([{ ...action('x', 'y', 'text'), schemaVersion: 2, sequence: 1, recordedAt: '2026-09-24T00:00:00Z' }]));
});
