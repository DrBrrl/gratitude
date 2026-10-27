import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { appendReflection, decodeEvent } from '../../src/lib/firebase/append.ts';
import { ref, uploadBytes } from 'firebase/storage';
import { uploadPhoto } from '../../src/lib/photos.ts';
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

test('AI transaction claim has one winner, response deduplicates and saved prompts stay immutable', async () => {
  const a = await device('ai-claim@example.test', 'ai-claim-a');
  const b = await device('ai-claim@example.test', 'ai-claim-b');
  const choices = { eventId: 'choices', type: 'AIChoicesConfirmed', schemaVersion: 1, payload: { previousEventId: null, enabled: true, useJournal: false, useFeedback: false, guidance: '' } };
  await a.append(choices);
  const { makeRequest } = await import('../../src/lib/ai/context.ts');
  const state = replay(await events(a));
  const request = makeRequest(state, '2026-10-01', 'generic', 'request');
  const duplicate = await Promise.all([a.append(request), b.append(request)]);
  assert.equal(duplicate.filter(result => result.data.created).length, 1);
  await assert.rejects(b.append({ ...request, eventId: 'competing-request' }), /changed on another device/);
  const response = { eventId: 'request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: 'request', text: ' What made you smile?\n', model: 'gemini-fixture-1', finishReason: 'STOP' } };
  await Promise.all([a.append(response), b.append(response)]);
  await a.append({ eventId: 'ai-entry', type: 'ReflectionWritten', schemaVersion: 2, payload: { entryId: 'ai-entry', text: 'A wave.', promptId: response.eventId, expectedRevision: 0 } });
  assert.equal(replay(await events(b)).entries[0].prompt, response.payload.text);
  await assert.rejects(a.append(action('swap-prompt', 'ai-entry', 'Swap it', 1)), /original prompt/);
  assert.equal((await events(a)).length, 4);
  await a.append({ eventId: 'ai-backfill', type: 'ReflectionWritten', schemaVersion: 3, payload: { entryId: 'ai-backfill', text: 'Another moment.', promptId: response.eventId, expectedRevision: 0, entryAt: '2026-09-29T00:00:00.000Z' } });
  assert.equal(replay(await events(b)).entries[1].prompt, response.payload.text);
});

test('AI Rules reject stale consent, fabricated response references, extra computed fields and detached controls', async () => {
  const a = await device('ai-consent@example.test', 'ai-consent');
  const { writeBatch, serverTimestamp } = await import('firebase/firestore');
  const root = `users/${a.uid}/streams/v1`;
  const choices = { eventId: 'choices', type: 'AIChoicesConfirmed', schemaVersion: 1, payload: { previousEventId: null, enabled: true, useJournal: false, useFeedback: false, guidance: '' } };
  await a.append(choices);
  const { makeRequest } = await import('../../src/lib/ai/context.ts');
  const request = makeRequest(replay(await events(a)), '2026-10-01', 'generic', 'request');
  await a.append(request);
  const revoked = { ...choices, eventId: 'revoke', payload: { ...choices.payload, previousEventId: 'request', enabled: false } };
  await a.append(revoked);
  const response = { eventId: 'request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: 'request', text: 'Late question?', model: 'gemini-fixture', finishReason: 'STOP' } };
  await assert.rejects(a.append(response), /no longer current/);
  // Bypass the append helper to exercise Rules, including forged operational metadata.
  async function forge(event, control) {
    const batch = writeBatch(a.db);
    batch.set(doc(a.db, `${root}/events/${event.eventId}`), { ...event, sequence: 4, recordedAt: serverTimestamp() });
    batch.set(doc(a.db, root), { sequence: 4, lastEventId: event.eventId });
    batch.set(doc(a.db, `${root}/ai/control`), control);
    await assertFails(batch.commit());
  }
  await forge(response, { lastEventId: response.eventId, choicesId: 'revoke', requestId: null });
  const bad = { ...choices, eventId: 'computed', payload: { ...choices.payload, previousEventId: 'revoke', memory: 'derived profile' } };
  await forge(bad, { lastEventId: bad.eventId, choicesId: bad.eventId, requestId: null });
  const next = { ...choices, eventId: 'next', payload: { ...choices.payload, previousEventId: 'revoke' } };
  await forge(next, { lastEventId: 'revoke', choicesId: 'revoke', requestId: 'request' });
  await assertFails(setDoc(doc(a.db, `${root}/ai/control`), { lastEventId: 'revoke', choicesId: 'revoke', requestId: 'request' }));
});

test('dated reflections append across devices, deduplicate, retain their date and reconstruct from events', async () => {
  const a = await device('dated@example.test', 'dated-a');
  const b = await device('dated@example.test', 'dated-b');
  const dated = (id, entryAt, revision = 0) => ({ eventId: `${id}-${revision}`, type: 'ReflectionWritten', schemaVersion: 3,
    payload: { entryId: id, expectedRevision: revision, promptId: STARTER_ID, text: id, entryAt } });
  const first = dated('past', '2026-09-28T23:15:00.000Z');
  await Promise.all([a.append(first), b.append(first)]);
  await a.append(dated('second', '2026-09-28T23:15:00.000Z'));
  await b.append(dated('past', first.payload.entryAt, 1));
  const log = await events(a);
  assert.equal(log.length, 3);
  const full = replay(log);
  assert.equal(full.entries.length, 2);
  assert.equal(full.entries[0].entryAt, first.payload.entryAt);
  assert.notEqual(full.entries[0].recordedAt, first.payload.entryAt);
  assert.equal(full.entries[0].revision, 2);
  for (let split = 0; split <= log.length; split++) assert.deepEqual(replay(log.slice(split), replay(log.slice(0, split))), full);
  await assert.rejects(a.append(dated('past', '2026-09-29T00:00:00.000Z', 2)), /original entry date/);
  await assert.rejects(a.append(action('downgrade', 'past', 'Changed', 2)), /original entry date/);
});

test('Rules reject future, malformed and changed dates even when the append helper is bypassed', async () => {
  const { writeBatch, serverTimestamp, Timestamp } = await import('firebase/firestore');
  const a = await device('dated-rules@example.test', 'dated-rules');
  const root = `users/${a.uid}/streams/v1`;
  const valid = { eventId: 'dated', type: 'ReflectionWritten', schemaVersion: 3,
    payload: { entryId: 'dated', expectedRevision: 0, promptId: STARTER_ID, text: 'Remembered moment', entryAt: '2026-09-28T23:15:00.000Z' } };
  async function forge(payload, schemaVersion = 3, sequence = 1) {
    const batch = writeBatch(a.db);
    batch.set(doc(a.db, `${root}/events/forged`), { ...valid, eventId: 'forged', schemaVersion, payload, sequence, recordedAt: serverTimestamp() });
    batch.set(doc(a.db, root), { sequence, lastEventId: 'forged' });
    batch.set(doc(a.db, `${root}/entries/dated`), { lastEventId: 'forged' });
    await assertFails(batch.commit());
  }
  await forge(valid.payload); // A wire date must be a Timestamp, not an unchecked string.
  await forge({ ...valid.payload, entryAt: Timestamp.fromDate(new Date('2026-10-02T00:00:00Z')) });
  await forge({ ...valid.payload, entryAt: Timestamp.fromDate(new Date(valid.payload.entryAt)), colour: 2 });
  await a.append(valid);
  await forge({ ...valid.payload, expectedRevision: 1, entryAt: Timestamp.fromDate(new Date('2026-09-29T00:00:00Z')) }, 3, 2);
  await forge({ entryId: 'dated', expectedRevision: 1, text: 'Downgrade', starterId: STARTER_ID }, 1, 2);
});

test('private immutable photos, AI summaries and photo-only source events survive cross-device replay', async () => {
  const first = await device('photos@example.test', 'photos-first');
  const second = await device('photos@example.test', 'photos-second');
  const own = environment.authenticatedContext(first.uid, { firebase: { sign_in_provider: 'google.com' } });
  const stranger = environment.authenticatedContext('photos-stranger', { firebase: { sign_in_provider: 'google.com' } });
  const { getBytes, deleteObject } = await import('firebase/storage');
  const path = `users/${first.uid}/v1/test-photo`;
  const storage = own.storage('demo-gratitude.firebasestorage.app');
  await assertSucceeds(uploadPhoto({ storage }, first.uid, 'test-photo', new Blob([new Uint8Array([255,216,255])], { type: 'image/jpeg' })));
  // Lost acknowledgement: the retry must not attempt an overwrite denied by Rules.
  await assertSucceeds(uploadPhoto({ storage }, first.uid, 'test-photo', new Blob([new Uint8Array([255,216,255])], { type: 'image/jpeg' })));
  await assertSucceeds(getBytes(ref(storage, path)));
  await assertFails(getBytes(ref(stranger.storage('demo-gratitude.firebasestorage.app'), path)));
  await assertFails(getBytes(ref(environment.unauthenticatedContext().storage('demo-gratitude.firebasestorage.app'), path)));
  await assertFails(uploadBytes(ref(storage, path), new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storage, `users/${first.uid}/v1/bad-mime`), new Uint8Array([1]), { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(storage, `users/${first.uid}/v1/too-large`), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
  const attached = { eventId: 'photo-attach', type: 'PhotoAttached', schemaVersion: 1, payload: { entryId: 'photo-entry', slot: 3, photoId: 'test-photo', previousEventId: null } };
  await first.append(attached);
  await assert.rejects(second.append({ ...attached, eventId: 'other-attach' }), /photo changed/);
  const written = { eventId: 'photo-write', type: 'ReflectionWritten', schemaVersion: 4, payload: { entryId: 'photo-entry', text: '', expectedRevision: 0, promptId: STARTER_ID, entryAt: '2026-09-29T04:00:00.000Z', photoSlot: 3 } };
  await first.append(written);
  const target = { ...attached.payload, previousEventId: attached.eventId };
  const request = { eventId: 'photo-request', type: 'PhotoSummaryRequested', schemaVersion: 1, payload: target };
  await first.append(request);
  const response = { eventId: 'photo-request_response', type: 'PhotoSummaryResponseReceived', schemaVersion: 1, payload: { ...target, previousEventId: request.eventId, text: 'A yellow mug beside a window.', model: 'fictional-image-model', finishReason: 'STOP' } };
  await first.append(response);
  await second.append({ eventId: 'photo-edit-summary', type: 'PhotoSummaryEdited', schemaVersion: 1, payload: { ...target, previousEventId: response.eventId, text: 'A turquoise cup.' } });
  const log = await events(second);
  const full = replay(log);
  assert.equal(full.photos['photo-entry_3'].summary, 'A turquoise cup.');
  for (let i = 0; i <= log.length; i++) assert.deepEqual(replay(log.slice(i), replay(log.slice(0, i))), full);
  await assert.rejects(first.append({ eventId: 'photo-remove-last', type: 'PhotoRemoved', schemaVersion: 1, payload: { ...target, previousEventId: 'photo-edit-summary' } }), /permission-denied|Missing or insufficient/);
  await first.append({ ...attached, eventId: 'photo-second-attach', payload: { ...attached.payload, slot: 0, photoId: 'another-photo' } });
  await first.append({ eventId: 'photo-remove-one', type: 'PhotoRemoved', schemaVersion: 1, payload: { ...target, previousEventId: 'photo-edit-summary' } });
  await first.append({ ...written, eventId: 'photo-write-text', payload: { ...written.payload, text: 'A warm drink.', expectedRevision: 1 } });
  await first.append({ eventId: 'photo-remove', type: 'PhotoRemoved', schemaVersion: 1, payload: { ...target, slot: 0, photoId: 'another-photo', previousEventId: 'photo-second-attach' } });
  await assertSucceeds(deleteObject(ref(storage, path)));
});

test('photo Rules reject stale responses, computed fields, detached pointers and empty reflection forgeries', async () => {
  const client = await device('photo-rules@example.test', 'photo-rules');
  const target = { entryId: 'entry', slot: 0, photoId: 'photo', previousEventId: null };
  await client.append({ eventId: 'attach', type: 'PhotoAttached', schemaVersion: 1, payload: target });
  await client.append({ eventId: 'request', type: 'PhotoSummaryRequested', schemaVersion: 1, payload: { ...target, previousEventId: 'attach' } });
  await client.append({ eventId: 'edit', type: 'PhotoSummaryEdited', schemaVersion: 1, payload: { ...target, previousEventId: 'request', text: 'My preferred words.' } });
  await assert.rejects(client.append({ eventId: 'request_response', type: 'PhotoSummaryResponseReceived', schemaVersion: 1, payload: { ...target, previousEventId: 'request', text: 'Late model text', model: 'fixture', finishReason: 'STOP' } }), /photo changed/);
  const { writeBatch, serverTimestamp } = await import('firebase/firestore');
  const root = `users/${client.uid}/streams/v1`;
  async function forged(event, pointer = 'photos/entry_0', detached = false) {
    const batch = writeBatch(client.db);
    batch.set(doc(client.db, `${root}/events/${event.eventId}`), { ...event, sequence: 4, recordedAt: serverTimestamp() });
    batch.set(doc(client.db, root), { sequence: 4, lastEventId: event.eventId });
    if (!detached) batch.set(doc(client.db, `${root}/${pointer}`), { lastEventId: event.eventId });
    return batch.commit();
  }
  const edit = { eventId: 'attack', type: 'PhotoSummaryEdited', schemaVersion: 1, payload: { ...target, previousEventId: 'edit', text: 'Another description' } };
  await assertFails(forged({ ...edit, payload: { ...edit.payload, summaryStatus: 'done' } }));
  await assertFails(forged(edit, 'photos/entry_0', true));
  await assertFails(forged({ ...edit, payload: { ...edit.payload, slot: 4 } }, 'photos/entry_4'));
  await assertFails(forged({ eventId: 'attack', type: 'ReflectionWritten', schemaVersion: 4, payload: { entryId: 'other', text: '', expectedRevision: 0, promptId: STARTER_ID, entryAt: null, photoSlot: 0 } }, 'entries/other'));
  assert.equal(replay(await events(client)).photos.entry_0.summary, 'My preferred words.');
});

test('photo-only removal keeps a sparse remaining slot within Rules lookup limits', async () => {
  const client = await device('photo-sparse@example.test', 'photo-sparse');
  for (const slot of [0, 3]) await client.append({ eventId: `attach-${slot}`, type: 'PhotoAttached', schemaVersion: 1, payload: { entryId: 'entry', slot, photoId: `photo-${slot}`, previousEventId: null } });
  await client.append({ eventId: 'save', type: 'ReflectionWritten', schemaVersion: 4, payload: { entryId: 'entry', text: '', promptId: STARTER_ID, expectedRevision: 0, entryAt: null, photoSlot: 0 } });
  await client.append({ eventId: 'remove-first', type: 'PhotoRemoved', schemaVersion: 1, payload: { entryId: 'entry', slot: 0, photoId: 'photo-0', previousEventId: 'attach-0' } });
  const state = replay(await events(client));
  assert.equal(state.photos.entry_0.removed, true);
  assert.equal(state.photos.entry_3.removed, false);
});

test('editor prompts save manual source text and AI references across devices without changing Today', async () => {
  const a = await device('editor-prompts@example.test', 'editor-prompts-a');
  const b = await device('editor-prompts@example.test', 'editor-prompts-b');
  const written = (eventId, promptId, promptText, expectedRevision) => ({ eventId, type: 'ReflectionWritten', schemaVersion: 5,
    payload: { entryId: 'entry', text: 'A small moment.', expectedRevision, promptId, promptText, entryAt: null, photoSlot: null } });
  await a.append(written('original', STARTER_ID, null, 0));
  await a.append(written('manual', 'manual', 'What colour brightened my afternoon?', 1));
  await b.append(written('text-edit', 'manual', null, 2));
  let state = replay(await events(b));
  assert.equal(state.entries[0].prompt, 'What colour brightened my afternoon?');
  assert.equal(state.entries[0].colour, 0);
  await assert.rejects(a.append(written('missing-reference', 'unknown', null, 3)));
  const { writeBatch, serverTimestamp } = await import('firebase/firestore');
  const root = `users/${a.uid}/streams/v1`;
  const forged = writeBatch(a.db);
  forged.set(doc(a.db, `${root}/events/forged`), { ...written('forged', 'forged', 'x'.repeat(601), 3), sequence: 4, recordedAt: serverTimestamp() });
  forged.set(doc(a.db, root), { sequence: 4, lastEventId: 'forged' });
  forged.set(doc(a.db, `${root}/entries/entry`), { lastEventId: 'forged' });
  await assertFails(forged.commit());
  await a.append({ eventId: 'choices', type: 'AIChoicesConfirmed', schemaVersion: 1, payload: { previousEventId: null, enabled: true, useJournal: false, useFeedback: false, guidance: '' } });
  const { makeRequest } = await import('../../src/lib/ai/context.ts');
  const request = makeRequest(replay(await events(a)), '2026-10-01', 'generic', 'editor-request', 'entry');
  await a.append(request);
  const response = { eventId: 'editor-request_response', type: 'PromptResponseReceived', schemaVersion: 1, payload: { requestId: request.eventId, text: 'What everyday sound did you enjoy?', model: 'fictional-model', finishReason: 'STOP' } };
  await Promise.all([a.append(response), b.append(response)]);
  await a.append(written('ai-edit', response.eventId, null, 3));
  state = replay(await events(b));
  assert.equal(state.entries[0].prompt, response.payload.text);
  assert.deepEqual(state.ai.days, {});
  assert.equal(state.prompts.manual, 'What colour brightened my afternoon?');
  assert.equal(state.entries[0].revision, 4);
});

test('explicit schema 6 date edits synchronize across devices with revision checks and strict Rules', async () => {
  const { writeBatch, serverTimestamp, Timestamp } = await import('firebase/firestore');
  const a = await device('edit-dates@example.test', 'edit-dates-a');
  const b = await device('edit-dates@example.test', 'edit-dates-b');
  const first = action('date-original', 'entry', 'A quiet moment.');
  await a.append(first);
  const changed = { eventId: 'date-changed', type: 'ReflectionWritten', schemaVersion: 6, payload: { entryId: 'entry', text: 'A quiet moment.', expectedRevision: 1, promptId: STARTER_ID, promptText: null, entryAt: '2026-09-28T23:15:00.000Z', photoSlot: null } };
  await Promise.all([a.append(changed), b.append(changed)]);
  await assert.rejects(b.append({ ...changed, eventId: 'stale-date', payload: { ...changed.payload, entryAt: '2026-09-29T23:15:00.000Z' } }), /another device/);
  const root = `users/${a.uid}/streams/v1`;
  for (const entryAt of [Timestamp.fromDate(new Date('2026-10-02T00:00:00Z')), '2026-09-29T00:00:00.000Z']) {
    const batch = writeBatch(a.db);
    batch.set(doc(a.db, `${root}/events/forged-date`), { ...changed, eventId: 'forged-date', payload: { ...changed.payload, expectedRevision: 2, entryAt }, sequence: 3, recordedAt: serverTimestamp() });
    batch.set(doc(a.db, root), { sequence: 3, lastEventId: 'forged-date' });
    batch.set(doc(a.db, `${root}/entries/entry`), { lastEventId: 'forged-date' });
    await assertFails(batch.commit());
  }
  const log = await events(b); const full = replay(log);
  assert.equal(log.length, 2); assert.equal(full.entries[0].entryAt, changed.payload.entryAt);
  assert.equal(full.entries[0].recordedAt, log[0].recordedAt); assert.equal(full.entries[0].colour, 0);
  for (let split = 0; split <= log.length; split++) assert.deepEqual(replay(log.slice(split), replay(log.slice(0, split))), full);
});

async function importFixture(options={}) {
  const { archiveFixture }=await import('../fixtures/import-journal.mjs');
  const { parseImportArchive }=await import('../../src/lib/import-archive.ts');
  return parseImportArchive(new Blob([archiveFixture(options).bytes]),new Date('2026-10-01T04:31:07Z'));
}
function claim(plan) {return {eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input};}
function finish(plan) {return {eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:plan.input.source.noteText.trim()?null:0}};}
function photoFor(plan,slot=0,previousEventId=null) {return {eventId:plan.attachmentIds[0],type:'PhotoAttached',schemaVersion:1,payload:{entryId:plan.input.entryId,slot,photoId:plan.input.attachments[0].photoId,previousEventId}};}

test('concurrent import clients resume identical claims and preserve source origin through prompt/date edits',async()=>{
  const first=await device('import@example.test','import-first'), second=await device('import@example.test','import-second');
  const archive=await importFixture();
  for(const plan of archive.records){
    const results=await Promise.all([first.append(claim(plan)),second.append(claim(plan))]);
    assert.equal(results[0].data.sequence,results[1].data.sequence);
    if(plan.input.attachments.length)await first.append(photoFor(plan));
    const completed=await Promise.all([first.append(finish(plan)),second.append(finish(plan))]);
    assert.equal(completed[0].data.sequence,completed[1].data.sequence);
  }
  let state=replay(await events(first));assert.equal(state.entries.length,3);
  assert.equal(state.entries[0].prompt,'[No prompt]');assert.equal(state.entries[0].text,'');
  const plan=archive.records[1],original=state.entries[1].origin;
  await first.append({eventId:'import-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:plan.input.entryId,text:'An explicit edit.',expectedRevision:1,promptId:'import-edit',promptText:'My new question?',entryAt:'2024-02-01T04:00:00.000Z',photoSlot:null}});
  await first.append({eventId:'import-edit-again',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:plan.input.entryId,text:'A second edit.',expectedRevision:2,promptId:'import-edit',promptText:null,entryAt:'2024-02-01T04:00:00.000Z',photoSlot:null}});
  const before=(await events(first)).length;
  for(const p of archive.records){await second.append(claim(p));await second.append(finish(p));}
  state=replay(await events(second));assert.equal(state.cursor,before);assert.deepEqual(state.entries[1].origin,original);assert.equal(state.entries[1].text,'A second edit.');
  await assert.rejects(second.append({...claim(plan),payload:{...plan.input,source:{...plan.input.source,noteText:'Changed archive input.'}}}),/already used/);
  await assert.rejects(first.append({eventId:'import-downgrade',type:'ReflectionWritten',schemaVersion:5,payload:{entryId:plan.input.entryId,text:'Not permitted.',expectedRevision:3,promptId:'import-edit',promptText:null,entryAt:'2024-02-01T04:00:00.000Z',photoSlot:null}}),/current editor/);
  const log=await events(first);for(const cut of [0,1,4,log.length])assert.deepEqual(replay(log.slice(cut),replay(log.slice(0,cut))),state);
  const other=environment.authenticatedContext('not-import-owner',{firebase:{sign_in_provider:'google.com'}});
  await assertFails(getDocs(collection(other.firestore(),`users/${first.uid}/streams/v1/imports`)));
});

test('import completion requires its photo and photo-only removal guards work after an imported initial entry',async()=>{
  const first=await device('import-photo@example.test','import-photo');
  const plan=(await importFixture()).records[0];
  await first.append(claim(plan));
  await assert.rejects(first.append(finish(plan)));
  await first.append(photoFor(plan));await first.append(finish(plan));
  await assert.rejects(first.append({eventId:'remove-import-last',type:'PhotoRemoved',schemaVersion:1,payload:{entryId:plan.input.entryId,slot:0,photoId:plan.input.attachments[0].photoId,previousEventId:plan.attachmentIds[0]}}));
  await first.append({eventId:'import-extra-photo',type:'PhotoAttached',schemaVersion:1,payload:{entryId:plan.input.entryId,slot:3,photoId:'import-another-photo',previousEventId:null}});
  await first.append({eventId:'remove-import-first',type:'PhotoRemoved',schemaVersion:1,payload:{entryId:plan.input.entryId,slot:0,photoId:plan.input.attachments[0].photoId,previousEventId:plan.attachmentIds[0]}});
  assert.equal(replay(await events(first)).entries[0].text,'');
});

test('import uploads verify immutable identity and bytes, reuse a winning encoding and reject mismatched objects',async()=>{
  const { uploadImportedPhoto }=await import('../../src/lib/photos.ts');
  const { sha256 }=await import('../../src/lib/import-archive.ts');
  const { getBytes, updateMetadata }=await import('firebase/storage');
  const first=await device('import-storage@example.test','import-storage');
  const own=environment.authenticatedContext(first.uid,{firebase:{sign_in_provider:'google.com'}});
  const storage=own.storage('demo-gratitude.firebasestorage.app'), client={storage};
  const key='a'.repeat(64),sourceDigest='b'.repeat(64),bytes=new Uint8Array([255,216,255,1]);
  await uploadImportedPhoto(client,first.uid,'import-storage-photo',key,sourceDigest,new Blob([bytes],{type:'image/jpeg'}));
  await uploadImportedPhoto(client,first.uid,'import-storage-photo',key,sourceDigest,new Blob([new Uint8Array([255,216,255,2])],{type:'image/jpeg'}));
  assert.deepEqual(new Uint8Array(await getBytes(ref(storage,`users/${first.uid}/v1/import-storage-photo`))),bytes);
  await assert.rejects(uploadImportedPhoto(client,first.uid,'import-storage-photo',key,'c'.repeat(64),new Blob([bytes])),/identity/);
  await assertFails(updateMetadata(ref(storage,`users/${first.uid}/v1/import-storage-photo`),{customMetadata:{sourceDigest:'c'.repeat(64)}}));
  await uploadBytes(ref(storage,`users/${first.uid}/v1/import-corrupt`),bytes,{contentType:'image/jpeg',customMetadata:{importSourceKey:key,sourceDigest,storedDigest:'d'.repeat(64)}});
  await assert.rejects(uploadImportedPhoto(client,first.uid,'import-corrupt',key,sourceDigest,new Blob([bytes])),/integrity/);
  const fresh='import-storage-concurrent';
  await Promise.all([uploadImportedPhoto(client,first.uid,fresh,key,sourceDigest,new Blob([bytes])),uploadImportedPhoto(client,first.uid,fresh,key,sourceDigest,new Blob([bytes]))]);
  assert.equal(await sha256(new Uint8Array(await getBytes(ref(storage,`users/${first.uid}/v1/${fresh}`)))),await sha256(bytes));
});

test('import Rules reject forged phases, detached receipts, computed state and provenance removal',async()=>{
  const {writeBatch,serverTimestamp,Timestamp}=await import('firebase/firestore');
  const client=await device('import-forgeries@example.test','import-forgeries');
  const archive=await importFixture({photos:[],missing:[]}), plan=archive.records[0],root=`users/${client.uid}/streams/v1`;
  const forged=async(event,sequence,{receipt=true,entry=true,importId=plan.confirmationId}={})=>{
    const batch=writeBatch(client.db);
    batch.set(doc(client.db,`${root}/events/${event.eventId}`),{...event,sequence,recordedAt:serverTimestamp()});
    batch.set(doc(client.db,root),{sequence,lastEventId:event.eventId});
    if(receipt)batch.set(doc(client.db,`${root}/imports/${plan.input.sourceKey}`),{confirmationId:plan.confirmationId,lastEventId:event.eventId});
    if(entry && event.type!=='ImportRecordConfirmed')batch.set(doc(client.db,`${root}/entries/${plan.input.entryId}`),{lastEventId:event.eventId,...(importId?{importId}:{})});
    return batch.commit();
  };
  await assertFails(forged(finish(plan),1));
  await assertFails(forged(claim(plan),1,{receipt:false}));
  for(const payload of [{...plan.input,colour:0},{...plan.input,source:{...plan.input.source,createdOn:Date.parse('2026-10-02T00:00:00Z'),updatedOn:Date.parse('2026-10-02T00:00:00Z')}},{...plan.input,source:{...plan.input.source,prompt:'x'.repeat(601)}}])await assertFails(forged({...claim(plan),payload},1));
  await client.append(claim(plan));
  await assertFails(forged(finish(plan),2,{receipt:false}));
  await assertFails(forged(finish(plan),2,{entry:false}));
  await assertFails(forged({...finish(plan),payload:{...finish(plan).payload,photoSlot:0}},2));
  await assertFails(forged({...finish(plan),payload:{...finish(plan).payload,expectedRevision:1}},2));
  await assertFails(forged(finish(plan),2,{importId:null}));
  await client.append(finish(plan));
  const edit={eventId:'forged-import-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:plan.input.entryId,text:'An edit.',promptId:plan.confirmationId,promptText:null,expectedRevision:1,entryAt:Timestamp.fromDate(new Date('2024-01-01T04:00:00Z')),photoSlot:null}};
  await assertFails(forged(edit,3,{receipt:false,importId:null}));
  await assertFails(forged({...edit,schemaVersion:5},3,{receipt:false}));
  assert.equal((await events(client)).length,2);
  await client.append({eventId:'import-ai-choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:''}});
  const {makeRequest}=await import('../../src/lib/ai/context.ts');
  const state=replay(await events(client));
  const request=makeRequest(state,'2026-10-01','personal','import-ai-request',plan.input.entryId);
  await client.append(request);
  assert.equal(request.payload.entryRevision,1);assert.deepEqual(request.payload.entryRefs,{}); // The target reflection cannot be its own context.
});

test('AI Rules accept both instruction versions and reject an unknown version', async () => {
  const client = await device('ai-template-versions@example.test', 'ai-template-versions');
  const { makeRequest } = await import('../../src/lib/ai/context.ts');
  const { writeBatch, serverTimestamp } = await import('firebase/firestore');
  await client.append({eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:''}});
  const mixed = makeRequest(replay(await events(client)), '2026-10-01', 'generic', 'legacy-template');
  const {selectorVersion,timeZone,selectionSeed,...payload}=mixed.payload;
  const initial={...mixed,schemaVersion:1,payload:{...payload,entryRefs:[]}};
  await client.append({...initial,payload:{...initial.payload,templateVersion:'gratitude-v1'}});
  await client.append({eventId:'legacy-template_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'legacy-template',text:'The old saved question.',model:'fixture',finishReason:'STOP'}});
  const editorLegacy={...initial,eventId:'legacy-editor',schemaVersion:2,payload:{...initial.payload,previousEventId:'legacy-template_response',day:'2026-09-30',entryId:'draft',entryRevision:0}};
  await client.append(editorLegacy);
  await client.append({eventId:'legacy-editor_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'legacy-editor',text:'An old editor option.',model:'fixture',finishReason:'STOP'}});
  const current = makeRequest(replay(await events(client)), '2026-10-01', 'generic', 'new-template');
  assert.equal(current.payload.templateVersion,'gratitude-v2');
  await client.append(current);
  const state = replay(await events(client));
  assert.equal(state.ai.requests['legacy-template'].payload.templateVersion,'gratitude-v1');
  assert.equal(state.ai.days['2026-09-30'],undefined);
  assert.equal(state.ai.responses['legacy-template_response'].payload.text,'The old saved question.');
  const unknown = {...current,eventId:'unknown-template',payload:{...current.payload,previousEventId:'new-template',templateVersion:'gratitude-v99'}};
  const root = `users/${client.uid}/streams/v1`;
  const batch = writeBatch(client.db);
  batch.set(doc(client.db,`${root}/events/${unknown.eventId}`),{...unknown,sequence:state.cursor+1,recordedAt:serverTimestamp()});
  batch.set(doc(client.db,root),{sequence:state.cursor+1,lastEventId:unknown.eventId});
  batch.set(doc(client.db,`${root}/ai/control`),{lastEventId:unknown.eventId,choicesId:'choices',requestId:unknown.eventId});
  await assertFails(batch.commit());
});

test('twenty-source requests fit Rules budgets with full feedback, reject malformed writes and pin revisions', async () => {
  const a=await device('ai-twenty@example.test','ai-twenty-a');
  const b=await device('ai-twenty@example.test','ai-twenty-b');
  const {makeRequest,buildContext}=await import('../../src/lib/ai/context.ts');
  const {writeBatch,serverTimestamp}=await import('firebase/firestore');
  await a.append({eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'x'.repeat(500)}});
  let previous='choices';
  for(let i=0;i<21;i++) {
    await a.append({eventId:`w${i}`,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:`e${i}`,expectedRevision:0,text:'x'.repeat(10000),promptId:`w${i}`,promptText:`Question ${i}?`,entryAt:'2025-04-01T00:00:00.000Z',photoSlot:null}});
    if(i<20) {await a.append({eventId:`f${i}`,type:'PromptFeedbackSubmitted',schemaVersion:1,payload:{previousEventId:previous,promptId:`w${i}`,text:'y'.repeat(500)}});previous=`f${i}`;}
  }
  const snapshot=replay(await events(a));
  const request=makeRequest(snapshot,'2026-10-01','personal','twenty',undefined,{timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'});
  assert.equal(Object.keys(request.payload.entryRefs).length,20);assert.equal(request.payload.feedbackIds.length,20);
  const context=JSON.parse(buildContext(snapshot,request));
  assert.equal(Object.values(context.reflections).flat().length,20);assert.equal(context.promptFeedback.length,20);
  async function forge(change) {
    const bad={...request,eventId:'bad',...change};
    const batch=writeBatch(a.db);const root=`users/${a.uid}/streams/v1`;
    batch.set(doc(a.db,`${root}/events/bad`),{...bad,sequence:snapshot.cursor+1,recordedAt:serverTimestamp()});
    batch.set(doc(a.db,root),{sequence:snapshot.cursor+1,lastEventId:'bad'});
    batch.set(doc(a.db,`${root}/ai/control`),{lastEventId:'bad',choicesId:'choices',requestId:'bad'});
    await assertFails(batch.commit());
  }
  await forge({payload:{...request.payload,entryRefs:{...request.payload.entryRefs,extra:'1'}}});
  await forge({schemaVersion:1}); // Legacy schemas reject the new keys.
  const {selectorVersion,timeZone,selectionSeed,...legacyPayload}=request.payload;
  await forge({schemaVersion:1,payload:{...legacyPayload,entryRefs:Object.entries(request.payload.entryRefs).map(([entryId,revision])=>({entryId,revision:Number(revision)}))}}); // Legacy bounds stay at five.
  await forge({payload:{...request.payload,selectionSeed:'bad'}});
  await forge({payload:{...request.payload,selectorVersion:'mixed-v99'}});
  await forge({payload:{...request.payload,feedbackIds:[1]}});
  await forge({payload:{...request.payload,feedbackIds:['one two']}});
  await forge({payload:{...request.payload,feedbackIds:['f0','f0']}});
  await forge({payload:{...request.payload,feedbackIds:Array.from({length:21},(_,i)=>`f${i}`)}});
  await forge({payload:{...request.payload,entryRefs:{bad:1}}});
  await forge({payload:{...request.payload,entryRefs:{bad:'1 2'}}});
  await forge({payload:{...request.payload,entryRefs:{'bad id':'1'}}});
  await forge({payload:{...request.payload,entryRefs:{bad:'1',extraComputed:'2\n3'}}});
  await forge({payload:{...request.payload,entryRefs:{...request.payload.entryRefs,[Object.keys(request.payload.entryRefs)[19]]:'0'}}});
  await forge({payload:{...request.payload,entryRefs:[{entryId:'e0',revision:1},{entryId:'e0',revision:2}]}});
  await forge({payload:{...request.payload,groups:{computed:'anniversary'}}});
  const duplicate=await Promise.all([a.append(request),b.append(request)]);
  assert.equal(duplicate.filter(r=>r.data.created).length,1);
  const response={eventId:'twenty_response',type:'PromptResponseReceived',schemaVersion:1,payload:{requestId:'twenty',text:'A saved question?',model:'fixture',finishReason:'STOP'}};
  await Promise.all([a.append(response),b.append(response)]);
  let state=replay(await events(b));assert.equal(Object.keys(state.ai.usage).length,20);
  assert.ok(Object.values(state.ai.usage).every(usage=>usage.count===1));
  const stale=makeRequest(state,'2026-10-01','personal','stale',undefined,{timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'});
  const [entryId]=Object.keys(stale.payload.entryRefs);const selected={entryId};
  await b.append({eventId:'source-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:selected.entryId,expectedRevision:1,text:'Changed after preparation',promptId:state.entries.find(e=>e.id===selected.entryId).promptId,promptText:null,entryAt:'2025-04-01T00:00:00.000Z',photoSlot:null}});
  await assert.rejects(a.append(stale),/AI context changed/);
  const missing={...stale,eventId:'missing',payload:{...stale.payload,entryRefs:{'not-real':'1'}}};
  await assert.rejects(a.append(missing),/AI context changed/);
  state=replay(await events(a));
  const editor=makeRequest(state,'2026-10-01','personal','editor-twenty','e0',{timeZone:'Australia/Hobart',selectionSeed:'0123456789abcdef0123456789abcdef'});
  assert.equal(editor.schemaVersion,4);assert.equal(Object.keys(editor.payload.entryRefs).length,20);
  assert.equal(editor.payload.entryRefs.e0,undefined);await a.append(editor);
  await b.append({...response,eventId:'editor-twenty_response',payload:{...response.payload,requestId:'editor-twenty'}});
  state=replay(await events(a));assert.equal(state.ai.days['2026-10-01'],'twenty_response');
  const staleEditor=makeRequest(state,'2026-10-01','personal','stale-editor','e0');
  const target=state.entries.find(entry=>entry.id==='e0');
  await b.append({eventId:'target-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'e0',expectedRevision:target.revision,text:'A target edited on another device.',promptId:target.promptId,promptText:null,entryAt:target.entryAt,photoSlot:null}});
  await assert.rejects(a.append(staleEditor),/reflection changed before/);
  const log=await events(a);state=replay(log);
  assert.deepEqual(replay(log.slice(20),replay(log.slice(0,20))),state);
});
