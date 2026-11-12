import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPair,applyPair,pairHead,cachedPairOrEmpty,type PairEvent} from '../../src/lib/friends/domain.ts';
import {friendshipGratitude} from '../../src/lib/friends/streaks.ts';
const now='2026-10-01T04:31:07.000Z',zone='Australia/Hobart';
test('table streaks start at acceptance and retroactively repair from reflection dates',()=>{
 const own=['2026-09-27','2026-09-28','2026-09-30'],peer=['2026-09-27','2026-09-28','2026-09-29','2026-09-30'];
 const args=['2026-09-28T01:00:00.000Z',now,zone,zone] as const;
 const before=friendshipGratitude(own,peer,...args);assert.equal(before.current,1);assert.equal(before.longest,1);assert.equal(before.ownGrateful,false);assert.equal(before.peerGrateful,false);
 const repaired=friendshipGratitude([...own,'2026-09-29'],peer,...args);assert.equal(repaired.current,3);assert.equal(repaired.total,3);
 const complete=friendshipGratitude([...own,'2026-09-29','2026-10-01'],[...peer,'2026-10-01'],...args);assert.equal(complete.current,4);assert.equal(complete.ownGrateful,true);assert.equal(complete.peerGrateful,true);
 assert.equal(friendshipGratitude(own,peer,args[0],'2026-10-03T04:31:07.000Z',zone,zone).current,0);
});
test('heart halves follow each person’s current local day while streak uses shared civil dates',()=>{
 const result=friendshipGratitude(['2026-10-01','2026-10-02'],['2026-10-01'],'2026-09-30T00:00:00.000Z','2026-10-01T14:30:00.000Z',zone,'UTC');
 assert.equal(result.ownToday,'2026-10-02');assert.equal(result.peerToday,'2026-10-01');assert.equal(result.ownGrateful,true);assert.equal(result.peerGrateful,true);assert.equal(result.current,1);
 const other=friendshipGratitude(['2026-10-01'],['2026-10-01'],'2026-09-30T00:00:00.000Z','2026-10-01T14:30:00.000Z',zone,'UTC');assert.equal(other.ownGrateful,false);assert.equal(other.peerGrateful,true);
 assert.throws(()=>friendshipGratitude([],[],'invalid',now,zone,zone));
});
test('recorded acceptance replays into the projection without changing canonical head fields',()=>{
 const initial=emptyPair('alice','bob');
 const request:PairEvent={eventId:'request',type:'FriendRequestSent',schemaVersion:1,actorUid:'alice',targetUid:'bob',sequence:1,recordedAt:'2026-09-27T00:00:00.000Z',payload:{previousEventId:null}};
 const accept:PairEvent={eventId:'accept',type:'FriendRequestAccepted',schemaVersion:1,actorUid:'bob',targetUid:'alice',sequence:2,recordedAt:'2026-09-28T01:00:00.000Z',payload:{previousEventId:'request'}};
 const friendship=[request,accept].reduce(applyPair,initial);assert.equal(friendship.acceptedAt,accept.recordedAt);assert.equal('acceptedAt' in pairHead(friendship),false);
 assert.deepEqual(applyPair(applyPair(initial,request),accept),friendship);
 const legacy={...friendship};delete (legacy as Partial<typeof legacy>).acceptedAt;assert.equal(cachedPairOrEmpty({pair:legacy},'pair',pairHead(friendship)).sequence,0);
 const removed=applyPair(friendship,{...accept,eventId:'remove',actorUid:'alice',targetUid:'bob',type:'FriendRemoved',sequence:3,payload:{previousEventId:'accept'}});assert.equal(removed.acceptedAt,null);
});

test('a renewed friendship starts at its new acceptance instead of joining two separate friendships',()=>{
 let pair=emptyPair('alice','bob');
 const step=(type:PairEvent['type'],actor:string,at:string)=>{pair=applyPair(pair,{eventId:`e${pair.sequence+1}`,type,schemaVersion:1,actorUid:actor,targetUid:actor==='alice'?'bob':'alice',sequence:pair.sequence+1,recordedAt:at,payload:{previousEventId:pair.lastEventId}});};
 step('FriendRequestSent','alice','2026-09-01T01:00:00.000Z');step('FriendRequestAccepted','bob','2026-09-01T02:00:00.000Z');step('FriendRemoved','alice','2026-09-15T01:00:00.000Z');
 step('FriendRequestSent','alice','2026-09-28T01:00:00.000Z');step('FriendRequestAccepted','bob','2026-09-28T02:00:00.000Z');
 assert.equal(pair.acceptedAt,'2026-09-28T02:00:00.000Z');
 const dates=['2026-09-27','2026-09-28','2026-09-29','2026-09-30'];assert.equal(friendshipGratitude(dates,dates,pair.acceptedAt!,now,zone,zone).current,3);
});

test('received-hug labels follow the recipient day, survive read state and reset at local midnight including DST',async()=>{
 const {receivedHugToday}=await import('../../src/lib/friends/domain.ts');
 const pair={...emptyPair('alice','bob'),status:'accepted' as const,lastHugA:'2026-10-01T13:59:00.000Z',lastHugOffsetA:-600};
 assert.equal(receivedHugToday(pair,'bob',Date.parse('2026-10-01T13:59:30Z'),zone),true);
 assert.equal(receivedHugToday(pair,'bob',Date.parse('2026-10-01T14:00:00Z'),zone),false);
 assert.equal(receivedHugToday(pair,'alice',Date.parse('2026-10-01T13:59:30Z'),zone),false);
 assert.equal(receivedHugToday(pair,'stranger',Date.parse(now),zone),false);
 assert.equal(receivedHugToday({...pair,status:'none'},'bob',Date.parse('2026-10-01T13:59:30Z'),zone),false);
 const dst={...pair,lastHugA:'2026-04-04T13:30:00.000Z'};
 assert.equal(receivedHugToday(dst,'bob',Date.parse('2026-04-04T16:30:00Z'),zone),true);
});


test('acceptance across midnight starts on the later shared civil date and excludes future dates',()=>{
 const dates=['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
 const result=friendshipGratitude(dates,dates,'2026-09-27T23:30:00.000Z',now,zone,'UTC');
 assert.equal(result.start,'2026-09-28');assert.equal(result.current,4);assert.equal(result.longest,4);assert.equal(result.total,4);
 assert.equal(result.ownToday,'2026-10-01');assert.equal(result.peerToday,'2026-10-01');
});
