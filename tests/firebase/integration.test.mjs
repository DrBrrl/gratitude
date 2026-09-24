import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { appendReflection, decodeEvent } from '../../src/lib/firebase/append.ts';
import { ref, uploadBytes } from 'firebase/storage';
import { emptyProjection, replay, parseAction, STARTER_ID } from '../../src/lib/domain.ts';

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
  return { uid: user.uid, db, append: async (action) => ({ data: await appendReflection(db, user.uid, action) }) };
}
function action(id, entryId, text, expectedRevision = 0) {
  return { eventId: id, type: 'ReflectionWritten', schemaVersion: 1, payload: { entryId, text, expectedRevision, starterId: STARTER_ID } };
}
async function events(device) {
  const snapshot = await getDocs(query(collection(device.db, `users/${device.uid}/streams/v1/events`), orderBy('sequence')));
  return snapshot.docs.map((item) => decodeEvent(item.data()));
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
  await assert.rejects(first.append({ ...action('forged', 'x', 'x'), uid: 'another-user' }), /Invalid (reflection|action)/);
  await assert.rejects(first.append({ eventId: 'ai', schemaVersion: 1, type: 'PromptResponseReceived', payload: { text: 'Forged' } }), /Invalid (reflection|action)/);
  await assert.rejects(first.append(action('stale', 'shared-entry', 'Stale edit', 0)), /changed on another device/);
});

test('concurrent new reflections receive contiguous canonical sequences', async () => {
  const first = await device('concurrent@example.test', 'concurrent-first');
  const second = await device('concurrent@example.test', 'concurrent-second');
  const results = await Promise.all([
    first.append(action('new-one', 'entry-one', 'First')),
    second.append(action('new-two', 'entry-two', 'Second'))
  ]);
  assert.deepEqual(results.map((r) => r.data.sequence).sort(), [1, 2]);
  assert.equal(replay(await events(first)).entries.length, 2);
});

test('concurrent edits conflict and cached replay equals full replay', async () => {
  const client = await device('rebuild@example.test', 'rebuild');
  const other = await device('rebuild@example.test', 'rebuild-other');
  await client.append(action('rebuild-first', 'entry', 'Original'));
  const results = await Promise.allSettled([
    client.append(action('edit-one', 'entry', 'One', 1)),
    other.append(action('edit-two', 'entry', 'Two', 1))
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  const log = await events(client);
  const full = replay(log);
  assert.equal(full.entries[0].revision, 2);
  assert.equal(log.length, 2);
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
  const own = environment.authenticatedContext(owner.uid, { firebase: { sign_in_provider: 'google.com' } });
  const stranger = environment.authenticatedContext('stranger');
  await assertSucceeds(getDoc(doc(own.firestore(), path)));
  await assertFails(getDoc(doc(stranger.firestore(), path)));
  await assertFails(appendReflection(stranger.firestore(), owner.uid, action('cross-user', 'entry', 'No')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(own.firestore(), path), { text: 'tampered' }));
  await assertFails(deleteDoc(doc(own.firestore(), path)));
  await assertFails(getDoc(doc(own.firestore(), `users/${owner.uid}/entryRevisions/owner-entry`)));
  await assertFails(uploadBytes(ref(own.storage(), `users/${owner.uid}/v1/photo`), new Uint8Array([1])));
});

test('rules reject forged atomic appends, detached metadata and unknown generations', async () => {
  const { writeBatch, serverTimestamp } = await import('firebase/firestore');
  const uid = 'malicious-owner';
  const db = environment.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
  async function batchWrite(modify, generation = 'v1', omit = '') {
    const root = `users/${uid}/streams/${generation}`;
    const event = { ...action('attack', 'entry', 'Hello'), sequence: 1, recordedAt: serverTimestamp() };
    modify(event);
    const batch = writeBatch(db);
    if (omit !== 'event') batch.set(doc(db, `${root}/events/attack`), event);
    if (omit !== 'head') batch.set(doc(db, root), { sequence: event.sequence, lastEventId: 'attack' });
    if (omit !== 'pointer') batch.set(doc(db, `${root}/entries/entry`), { lastEventId: 'attack' });
    await assertFails(batch.commit());
  }
  await batchWrite((e) => { e.sequence = 2; });
  await batchWrite((e) => { e.payload.expectedRevision = 1; });
  await batchWrite((e) => { e.payload.colour = 2; });
  await batchWrite((e) => { e.type = 'PromptResponseReceived'; });
  await batchWrite((e) => { e.recordedAt = '2026-01-01'; });
  await batchWrite((e) => { e.payload.text = '   '; });
  await batchWrite((e) => { e.payload.text = 'x'.repeat(10001); });
  for (const missing of ['event', 'head', 'pointer']) await batchWrite(() => {}, 'v1', missing);
  await batchWrite(() => {}, 'v2');
  const anon = environment.unauthenticatedContext().firestore();
  await assertFails(appendReflection(anon, uid, action('anonymous', 'entry', 'No')));
  const nonGoogle = environment.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(appendReflection(nonGoogle, uid, action('password', 'entry', 'No')));
});

test('schema excludes computed state and reducer refuses gaps/unknown versions', () => {
  assert.throws(() => parseAction({ ...action('x', 'y', 'text'), colour: 3 }));
  assert.throws(() => parseAction(action('x', 'y', '   ')));
  assert.throws(() => replay([{ ...action('x', 'y', 'text'), sequence: 2, recordedAt: '2026-09-24T00:00:00Z' }]));
  assert.throws(() => replay([{ ...action('x', 'y', 'text'), schemaVersion: 2, sequence: 1, recordedAt: '2026-09-24T00:00:00Z' }]));
});
