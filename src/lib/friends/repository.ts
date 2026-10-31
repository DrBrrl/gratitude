import { applyInbox, applyReadState, emptyInbox, type InboxEvent, type InboxProjection } from './inbox.ts';
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, where, type Firestore, type DocumentData } from 'firebase/firestore';
import { openDB, type IDBPDatabase } from 'idb';
import { applyPair, applyProfile, cachedPairOrEmpty, emptyPair, emptyProfile, pairHead, usernameKey, validateProfile, type PairAction, type PairEvent, type PairHead, type PairProjection, type Profile, type ProfileEvent, type ProfileInput } from './domain.ts';

const profileRef = (db: Firestore, uid: string) => doc(db, `friendProfiles/${uid}`);
const linkRef = (db: Firestore, uid: string, peer: string) => doc(db, `friendLinks/${uid}/peers/${peer}`);
const date = (value: unknown): string | null => value instanceof Timestamp ? value.toDate().toISOString() : value === null ? null : (() => { throw new Error('Invalid friendship timestamp.'); })();
function decodePair(value: DocumentData): PairHead { return { ...value, requestedAt: date(value.requestedAt), lastHugA: date(value.lastHugA), lastHugB: date(value.lastHugB) } as PairHead; }
function decodePairEvent(value: DocumentData): PairEvent { return { ...value, recordedAt: date(value.recordedAt) } as PairEvent; }
function decodeProfileEvent(value: DocumentData): ProfileEvent { return { ...value, recordedAt: date(value.recordedAt) } as ProfileEvent; }
function same(a: unknown, b: unknown) {
  const sorted = (value: unknown) => Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b));
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

/** Atomically reserve the normalized lookup key alongside the literal user action. */
export async function saveFriendProfile(db: Firestore, uid: string, input: ProfileInput, eventId = crypto.randomUUID()) {
  validateProfile(input);
  const headRef = profileRef(db, uid), eventRef = doc(db, `${headRef.path}/events/${eventId}`), nameRef = doc(db, `friendUsernames/${usernameKey(input.username)}`);
  await runTransaction(db, async tx => {
    const [head, prior, claim] = await Promise.all([tx.get(headRef), tx.get(eventRef), tx.get(nameRef).catch(cause => {
      if (cause?.code === 'permission-denied') throw new Error('That username is already taken. Try another.');
      throw cause;
    })]);
    if (prior.exists()) {
      if (!same(prior.get('payload'), input)) throw new Error('Profile action ID already used.');
      return;
    }
    if (claim.exists() && claim.get('uid') !== uid) throw new Error('That username is already taken. Try another.');
    const before = head.exists() ? head.data() as Profile : emptyProfile(uid);
    const event: ProfileEvent = { eventId, schemaVersion: 1, type: 'FriendProfileChosen', actorUid: uid, sequence: before.sequence + 1, recordedAt: new Date().toISOString(), payload: input };
    const next = applyProfile(before, event);
    tx.set(eventRef, { ...event, recordedAt: serverTimestamp() });
    tx.set(headRef, next);
    tx.set(nameRef, { uid });
    if (before.username && before.username !== next.username) tx.delete(doc(db, `friendUsernames/${before.username}`));
  });
}

export type PairCommand = { eventId: string; type: PairAction['type']; targetUid: string; allowHugs?: boolean };
export async function appendFriendAction(db: Firestore, actorUid: string, command: PairCommand) {
  if (!command.targetUid || command.targetUid === actorUid) throw new Error('Choose another person.');
  const proposedId = crypto.randomUUID();
  return runTransaction(db, async tx => {
    const [ownLink, peerLink] = await Promise.all([tx.get(linkRef(db, actorUid, command.targetUid)), tx.get(linkRef(db, command.targetUid, actorUid))]);
    const pairId = ownLink.exists() ? ownLink.get('pairId') as string : proposedId;
    if (peerLink.exists() !== ownLink.exists() || peerLink.exists() && peerLink.get('pairId') !== pairId) throw new Error('Friendship links could not be verified.');
    const headRef = doc(db, `friendPairs/${pairId}`), eventRef = doc(db, `${headRef.path}/events/${command.eventId}`);
    const [head, prior] = await Promise.all([tx.get(headRef), tx.get(eventRef)]);
    if (prior.exists()) {
      const p = prior.data();
      if (p.type !== command.type || p.actorUid !== actorUid || p.targetUid !== command.targetUid || p.payload.allowHugs !== command.allowHugs) throw new Error('Friendship action ID already used.');
      return pairId;
    }
    let before: PairProjection;
    if (head.exists()) before = { ...decodePair(head.data()), hugs: [] };
    else {
      if (!['FriendRequestSent','FriendBlocked'].includes(command.type)) throw new Error('Send a friend request first.');
      before = emptyPair(actorUid, command.targetUid);
    }
    const payload: PairAction['payload'] = { previousEventId: before.lastEventId };
    if (command.type === 'HugPreferencesChosen') payload.allowHugs = command.allowHugs;
    const event: PairEvent = { ...command, actorUid, payload, schemaVersion: 1, sequence: before.sequence + 1, recordedAt: new Date().toISOString() };
    // Optional command arguments belong in the action payload only.
    delete (event as Partial<PairCommand>).allowHugs;
    const next = pairHead(applyPair(before, event));
    tx.set(eventRef, { ...event, recordedAt: serverTimestamp() });
    tx.set(headRef, { ...next,
      requestedAt: command.type === 'FriendRequestSent' ? serverTimestamp() : head.get('requestedAt') ?? null,
      lastHugA: command.type === 'HugSent' && actorUid === next.members[0] ? serverTimestamp() : head.get('lastHugA') ?? null,
      lastHugB: command.type === 'HugSent' && actorUid === next.members[1] ? serverTimestamp() : head.get('lastHugB') ?? null
    });
    if (!ownLink.exists()) {
      tx.set(linkRef(db, actorUid, command.targetUid), { pairId });
      tx.set(linkRef(db, command.targetUid, actorUid), { pairId });
    }
    return pairId;
  });
}

/** Read gestures are owner-only, never receipts in the shared pair history. */
export async function acknowledgeHug(db: Firestore, uid: string, pairId: string, hugId: string, eventId = crypto.randomUUID()) {
  if (![pairId,hugId,eventId].every(value => /^[a-zA-Z0-9_-]{1,80}$/.test(value))) throw new Error('Choose a valid hug.');
  const headRef=doc(db,`friendInboxes/${uid}`), eventRef=doc(db,`${headRef.path}/events/${eventId}`);
  await runTransaction(db,async tx=>{
    const [head,prior,hug]=await Promise.all([tx.get(headRef),tx.get(eventRef),tx.get(doc(db,`friendPairs/${pairId}/events/${hugId}`))]);
    if (prior.exists()) {if(prior.get('payload.pairId')!==pairId||prior.get('payload.hugId')!==hugId)throw new Error('Inbox action ID already used.');return;}
    if(!hug.exists()||hug.get('type')!=='HugSent'||hug.get('targetUid')!==uid)throw new Error('Choose an incoming hug.');
    const sequence=(head.get('sequence')??0)+1;
    tx.set(eventRef,{eventId,schemaVersion:1,type:'HugRead',actorUid:uid,sequence,recordedAt:serverTimestamp(),payload:{pairId,hugId}});
    tx.set(headRef,{sequence,lastEventId:eventId});
  });
}

export type FriendsView = { profile: Profile; pairs: Record<string, PairProjection>; peers: Record<string, Profile>; ready: boolean; synced: boolean; error: string };
type Checkpoint = { version: 2; uid: string; profile: Profile; pairs: Record<string, PairProjection>; inbox: InboxProjection };
async function digest(value: unknown) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), n => n.toString(16).padStart(2, '0')).join(''); }
export class FriendsRepository {
  private cache: IDBPDatabase | null = null;
  private stopped = false;
  private stops: (() => void)[] = [];
  private peerStops = new Map<string, () => void>();
  private chain = Promise.resolve();
  private state: FriendsView;
  private inbox=emptyInbox();
  private db: Firestore; private uid: string; private scope: string; private notify: (view: FriendsView) => void;
  constructor(db: Firestore, uid: string, scope: string, notify: (view: FriendsView) => void) {
    this.db = db; this.uid = uid; this.scope = scope; this.notify = notify;
    this.state = { profile: emptyProfile(uid), pairs: {}, peers: Object.create(null), ready: false, synced: false, error: '' };
  }
  private emit() { if (!this.stopped) this.notify({ ...this.state, pairs: { ...this.state.pairs }, peers: { ...this.state.peers } }); }
  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(async () => { if (!this.stopped) await task(); }).catch(() => {
      if (!this.stopped) { this.state.error = 'Friends could not be refreshed. Reconnect and try again.'; this.state.synced = false; this.state.ready = true; this.emit(); }
    });
    return this.chain;
  }
  async start() {
    this.cache = await openDB(`gratitude-friends:${this.scope}:${this.uid}:v1`, 1, { upgrade(db) { db.createObjectStore('projection'); } });
    if (this.stopped) { this.cache.close(); return; }
    const cached = await this.cache.get('projection', 'checkpoint');
    if (cached) {
      const c = cached.value as Checkpoint;
      if (c.version === 2 && c.uid === this.uid && c.profile?.uid === this.uid && c.pairs && c.inbox && cached.digest === await digest(c)) {
        this.inbox=c.inbox; this.state = { ...this.state, profile: c.profile, pairs: c.pairs, ready: true }; this.emit();
      } else await this.cache.delete('projection', 'checkpoint');
    }
    if (this.stopped) return;
    const changed = () => { void this.enqueue(() => this.refresh()); };
    const failed = () => { if (!this.stopped) { this.state.error = 'Friends are unavailable. Reconnect to refresh.'; this.state.ready = true; this.state.synced = false; this.emit(); } };
    this.stops = [onSnapshot(doc(this.db,`friendInboxes/${this.uid}`),changed,failed),onSnapshot(profileRef(this.db, this.uid), changed, failed), onSnapshot(query(collection(this.db, 'friendPairs'), where('members', 'array-contains', this.uid)), changed, failed)];
  }
  async refresh(rebuild = false) {
    const [profileHead, heads, inboxHead] = await Promise.all([getDocFromServer(profileRef(this.db, this.uid)), getDocsFromServer(query(collection(this.db, 'friendPairs'), where('members', 'array-contains', this.uid))), getDocFromServer(doc(this.db,`friendInboxes/${this.uid}`))]);
    if (this.stopped) return;
    let profile = rebuild ? emptyProfile(this.uid) : this.state.profile;
    const canonicalProfile = profileHead.exists() ? profileHead.data() as Profile : emptyProfile(this.uid);
    if (profile.sequence > canonicalProfile.sequence || profile.sequence === canonicalProfile.sequence && profile.lastEventId !== canonicalProfile.lastEventId) profile = emptyProfile(this.uid);
    if (profile.sequence < canonicalProfile.sequence) {
      const tail = await getDocsFromServer(query(collection(this.db, `friendProfiles/${this.uid}/events`), where('sequence', '>', profile.sequence), orderBy('sequence')));
      for (const item of tail.docs) profile = applyProfile(profile, decodeProfileEvent(item.data()));
    }
    const pairs: Record<string, PairProjection> = Object.create(null);
    for (const head of heads.docs) {
      const canonical = decodePair(head.data());
      let pair = cachedPairOrEmpty(this.state.pairs,head.id,canonical,rebuild);
      if (pair.sequence < canonical.sequence) {
        const tail = await getDocsFromServer(query(collection(this.db, `${head.ref.path}/events`), where('sequence', '>', pair.sequence), orderBy('sequence')));
        for (const item of tail.docs) pair = applyPair(pair, decodePairEvent(item.data()));
      }
      pairs[head.id] = pair;
    }
    if (this.stopped) return;
    let inbox=rebuild?emptyInbox():this.inbox;
    if(inbox.sequence>(inboxHead.get('sequence')??0)||inbox.sequence===(inboxHead.get('sequence')??0)&&inbox.lastEventId!==(inboxHead.get('lastEventId')??null))inbox=emptyInbox();
    if(inbox.sequence<(inboxHead.get('sequence')??0)){
      const tail=await getDocsFromServer(query(collection(this.db,`friendInboxes/${this.uid}/events`),where('sequence','>',inbox.sequence),orderBy('sequence')));
      for(const item of tail.docs)inbox=applyInbox(inbox,{...item.data(),recordedAt:date(item.get('recordedAt'))} as InboxEvent,this.uid);
    }
    if(this.stopped)return;
    this.inbox=inbox;
    const readPairs=applyReadState(pairs,inbox,this.uid);
    this.state = { ...this.state, profile, pairs:readPairs, ready: true, synced: true, error: '' };
    const checkpoint: Checkpoint = { version: 2, uid: this.uid, profile, pairs:readPairs, inbox };
    await this.cache?.put('projection', { value: checkpoint, digest: await digest(checkpoint) }, 'checkpoint');
    if (this.stopped) return;
    for (const peer of new Set(Object.values(pairs).flatMap(pair => pair.members.filter(uid => uid !== this.uid)))) {
      if (this.peerStops.has(peer)) continue;
      this.peerStops.set(peer, onSnapshot(profileRef(this.db, peer), snapshot => {
        if (this.stopped) return;
        if (snapshot.exists()) this.state.peers[peer] = snapshot.data() as Profile;
        else delete this.state.peers[peer];
        this.emit();
      }, () => { delete this.state.peers[peer]; this.peerStops.delete(peer); this.emit(); }));
    }
    this.emit();
  }
  async sync() { await this.enqueue(() => this.refresh()); if (!this.stopped && !this.state.synced) throw new Error(this.state.error); }
  async rebuild() { await this.enqueue(() => this.refresh(true)); if (!this.stopped && !this.state.synced) throw new Error(this.state.error); }
  async find(input: string) {
    const key = usernameKey(input);
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(key)) throw new Error('Enter a full username to find your friend.');
    try {
      const claim = await getDocFromServer(doc(this.db, `friendUsernames/${key}`));
      if (!claim.exists()) return null;
      const profile = await getDocFromServer(profileRef(this.db, claim.get('uid'))); return profile.exists() ? profile.data() as Profile : null; }
    catch (cause) { if ((cause as { code?: string }).code === 'permission-denied') return null; throw cause; }
  }
  stop() { this.stopped = true; this.stops.forEach(stop => stop()); this.peerStops.forEach(stop => stop()); this.peerStops.clear(); this.state.peers = Object.create(null); this.cache?.close(); }
}
