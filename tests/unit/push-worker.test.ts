import 'fake-indexeddb/auto';
import{test}from'node:test';import assert from'node:assert/strict';
import{readPushBinding,writePushBinding}from'../../src/lib/push/device-store.ts';
import{receiveHugPush,openHugNotification}from'../../src/lib/push/worker.ts';
const now=Date.parse('2026-10-01T04:31:07Z');
const scope='https://drbrrl.github.io/gratitude/';
const bind={uid:'alice',deviceId:'device',generation:'generation',choiceEventId:'enabled',choiceSequence:1,scope};
const message={...bind,version:1,type:'hug',pairId:'pair',eventId:'hug',senderName:'Fictional friend',expiresAt:now+1000};
function registration(){const shown:any[]=[];const registration={scope,showNotification:async(title:string,options:any)=>{const value={title,...options,closed:false,close(){this.closed=true;}};shown.push(value);},getNotifications:async(options?:any)=>shown.filter(value=>!value.closed&&(!options?.tag||value.tag===options.tag))};return{registration:registration as unknown as ServiceWorkerRegistration,shown};}
test('worker reserves a hug across restarts, rejects stale owners/scopes, and clears a display if opt-out races it',async()=>{
 await writePushBinding(scope,bind);const first=registration();await receiveHugPush(first.registration,message,now);assert.equal(first.shown.length,1);
 // All state was read from IndexedDB; no page or in-memory inbox is required.
 const restarted=registration();await receiveHugPush(restarted.registration,message,now);assert.equal(restarted.shown.length,0);
 await receiveHugPush(restarted.registration,{...message,eventId:'wrong-account',uid:'bob'},now);assert.equal(restarted.shown.length,0);
 await writePushBinding(scope,null);await receiveHugPush(restarted.registration,{...message,eventId:'signed-out'},now);assert.equal(restarted.shown.length,0);
 await writePushBinding(scope,{...bind,generation:'new'});await receiveHugPush(restarted.registration,{...message,eventId:'old-binding'},now);assert.equal(restarted.shown.length,0);
 const raced=registration();const original=raced.registration.showNotification.bind(raced.registration);raced.registration.showNotification=async(...args)=>{await writePushBinding(scope,null);await original(...args);};
 await writePushBinding(scope,bind);await receiveHugPush(raced.registration,{...message,eventId:'race'},now);assert.equal(raced.shown[0].closed,true);
});
test('notification click stays in its deployment and rejects a signed-out or replaced device',async()=>{
 await writePushBinding(scope,bind);let focused='',opened='';const posted:any[]=[];
 const preview={url:scope+'pr-preview/pr-20/journal/',focus:async()=>{focused='preview';},postMessage:(value:any)=>posted.push(value)};
 const production={url:scope+'journal/',focus:async()=>{focused='production';},postMessage:(value:any)=>posted.push(value)};
 const worker={registration:{scope},clients:{matchAll:async()=>[preview,production],openWindow:async(url:string)=>{opened=url;}}} as unknown as ServiceWorkerGlobalScope;
 const notification={data:{...bind,url:'https://evil.example'},close(){}} as unknown as Notification;
 await openHugNotification(worker,notification);assert.equal(focused,'production');assert.equal(posted[0].type,'OPEN_HUG_FRIENDS');assert.equal(opened,'');
 (worker.clients as any).matchAll=async()=>[preview];await openHugNotification(worker,notification);assert.equal(opened,scope+'journal/?open=friends');
 await writePushBinding(scope,null);focused='';opened='';await openHugNotification(worker,notification);assert.equal(focused,'');assert.equal(opened,'');assert.equal(await readPushBinding(scope),undefined);
});
