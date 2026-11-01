import{test}from'node:test';import assert from'node:assert/strict';
import{applyPushChoice,emptyPushChoice,validHugPush,friendsNotificationURL,isAppWindow,type PushChoiceEvent}from'../../src/lib/push/protocol.ts';
const scope='https://drbrrl.github.io/gratitude/pr-preview/pr-20/';
const binding={uid:'alice',deviceId:'device',generation:'generation',choiceEventId:'enabled',scope};
const now=Date.parse('2026-10-01T04:31:07Z');
test('a hug is bound to the consented account, device, generation and deployment and expires',()=>{
 const payload={...binding,version:1,type:'hug',pairId:'pair',eventId:'hug',senderName:'Fictional friend',expiresAt:now+1000};
 assert.equal(validHugPush(payload,binding,scope,now),true);
 for(const key of ['uid','deviceId','generation','choiceEventId','scope'])assert.equal(validHugPush({...payload,[key]:'different'},binding,scope,now),false,key);
 assert.equal(validHugPush(payload,binding,scope,now+1000),false);assert.equal(validHugPush({...payload,expiresAt:now+2*86_400_000},binding,scope,now),false);
 assert.equal(friendsNotificationURL(scope),scope+'journal/?open=friends');
});
test('device choices replay literal consent while secrets and subscriptions stay outside the stream',()=>{
 const enabled:PushChoiceEvent={eventId:'enabled',schemaVersion:1,type:'HugNotificationsChosen',actorUid:'alice',deviceId:'device',sequence:1,recordedAt:'2026-10-01T04:31:07Z',payload:{previousEventId:null,enabled:true,reason:'button'}};
 const first=applyPushChoice(emptyPushChoice(),enabled),disabled:PushChoiceEvent={...enabled,eventId:'off',sequence:2,payload:{previousEventId:'enabled',enabled:false,reason:'sign-out'}};
 assert.deepEqual([enabled,disabled].reduce(applyPushChoice,emptyPushChoice()),{sequence:2,lastEventId:'off',enabled:false});
 assert.throws(()=>applyPushChoice(first,{...disabled,payload:{...disabled.payload,enabled:true}}));
 assert.throws(()=>applyPushChoice(first,{...disabled,payload:{...disabled.payload,subscription:'secret'} as never}));
 assert.throws(()=>applyPushChoice(first,{...disabled,payload:{...disabled.payload,previousEventId:'stale'}}));
});

test('notification windows are isolated between production and PR deployments',()=>{
 const root='https://drbrrl.github.io/gratitude/';
 for(const suffix of ['', 'journal/?open=friends','settings/'])assert.equal(isAppWindow(root+suffix,root),true);
 for(const other of [scope,scope+'journal/','https://elsewhere.example/gratitude/journal/',root+'api/data'])assert.equal(isAppWindow(other,root),false);
 assert.equal(isAppWindow(scope+'journal/',scope),true);assert.equal(isAppWindow(root+'journal/',scope),false);
});
