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
