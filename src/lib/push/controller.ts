import {base} from '$app/paths';
import {doc,onSnapshot,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {FirebaseClient} from '../firebase/client';
import {pushDeviceId,readPushBinding,writePushBinding} from './device-store';
import {choosePush,type PushRegistration} from './repository';
import type {PushBinding} from './protocol';
// Public fixture key only. The emulator never contacts a live notification sender.
export const EMULATOR_PUSH_KEY='BG_wO5SSQc4drdQ1GeaWDgqFtBppoFwygQOqK84VlMoWPE91OlW_AdxT9sCwx-7ni0DG_30lqW4igrmJzvccFEo';
export type PushState={ready:boolean;supported:boolean;configured:boolean;enabled:boolean;busy:boolean;online:boolean;permission:NotificationPermission|'unsupported';error:string};
export const pushScope=()=>new URL(`${base}/`,location.origin).href;
export function pushSupport(){return typeof window!=='undefined'&&isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;}
function bytes(key:string){const text=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(text,c=>c.charCodeAt(0));}
async function waitForWorker(worker:ServiceWorker,ready:()=>boolean,timeoutMs:number){
 if(ready())return;
 await new Promise<void>((resolve,reject)=>{const finish=(error?:Error)=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};const changed=()=>{if(ready())finish();else if(worker.state==='redundant')finish(Error('Notification worker could not start.'));};const timer=setTimeout(()=>finish(Error('Notification worker is not ready. Close and reopen Gratitude, then try again.')),timeoutMs);worker.addEventListener('statechange',changed);changed();});
}
async function registrationFor(scope:string){
 let registration=await navigator.serviceWorker.getRegistration(scope);
 if(registration?.scope!==scope)registration=await navigator.serviceWorker.register(new URL('service-worker.js',scope),{scope});
 await registration.update();
 const installing=registration.installing;
 if(installing)await waitForWorker(installing,()=>['installed','activated'].includes(installing.state),30_000);
 const waiting=registration.waiting;
 if(waiting){waiting.postMessage({type:'ACTIVATE_HUG_WORKER'});await waitForWorker(waiting,()=>waiting.state==='activated',15_000);}
 const active=registration.active;if(!active)throw Error('Notification worker is not ready. Close and reopen Gratitude, then try again.');
 if(active.state!=='activated')await waitForWorker(active,()=>active.state==='activated',15_000);
 await new Promise<void>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Close and reopen Gratitude to update hug notifications, then try again.'));},3_000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.supported===true?resolve():reject(Error('Notification worker could not start.'));};active.postMessage({type:'HUG_PUSH_CAPABILITIES'},[channel.port2]);});
 return registration;
}
export async function suspendDevicePush(scope=pushScope()){
 // Clear locally before a network operation, including when signing out offline.
 await writePushBinding(scope,null);
 try{if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.getRegistration(scope);if(registration?.scope===scope){for(const notification of await registration.getNotifications())notification.close();}}}catch{/* A cleared binding still rejects delivery when native notification access is unavailable. */}
}
export class PushController{
 readonly scope=pushScope();
 private deviceId='';private stopped=false;private operation=0;private stopHead=()=>{};private channel:BroadcastChannel|null=null;
 private state:PushState;
 constructor(private client:FirebaseClient,private uid:string,private notify:(state:PushState)=>void){this.state={ready:false,supported:pushSupport(),configured:!!this.publicKey,enabled:false,busy:false,online:navigator.onLine,permission:pushSupport()?Notification.permission:'unsupported',error:''};}
 get publicKey(){return this.client.emulators?EMULATOR_PUSH_KEY:import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY??'';}
 private emit(){if(!this.stopped)this.notify({...this.state});}
 private changed=()=>{void this.refresh().catch(()=>{if(!this.stopped){this.state.ready=true;this.state.error='Notification status could not be refreshed. Check your connection.';this.emit();}});};
 async start(){
  this.emit();this.deviceId=await pushDeviceId(this.scope);if(this.stopped)return;
  this.channel=new BroadcastChannel(`gratitude-push:${this.scope}`);this.channel.onmessage=this.changed;
  window.addEventListener('online',this.changed);window.addEventListener('offline',this.changed);window.addEventListener('focus',this.changed);
  this.stopHead=onSnapshot(doc(this.client.db,`users/${this.uid}/pushChoices/${this.deviceId}`),{includeMetadataChanges:true},snapshot=>{
   if(this.stopped||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
   if(snapshot.exists()&&!snapshot.get('enabled'))void readPushBinding(this.scope).then(async binding=>{if(binding?.uid===this.uid&&snapshot.get('sequence')>=(binding.choiceSequence??0)){await suspendDevicePush(this.scope);this.state.enabled=false;this.emit();}});
  },()=>{});
  await this.refresh();
 }
 async refresh(){
  if(this.stopped||this.state.busy||!this.deviceId)return;
  const binding=await readPushBinding(this.scope);if(this.stopped)return;
  this.state.online=navigator.onLine;const previousPermission=this.state.permission;this.state.permission=pushSupport()?Notification.permission:'unsupported';if(this.state.permission==='granted'&&previousPermission==='denied')this.state.error='';
  this.state.enabled=!!binding&&binding.uid===this.uid&&this.state.permission==='granted';
  if(binding?.uid===this.uid&&this.state.online){
   const status=await runTransaction(this.client.db,async tx=>{const [head,device]=await Promise.all([tx.get(doc(this.client.db,`users/${this.uid}/pushChoices/${this.deviceId}`)),tx.get(doc(this.client.db,`users/${this.uid}/pushDevices/${this.deviceId}`))]);return{sequence:head.get('sequence')??0,enabled:head.get('enabled'),choiceEventId:head.get('lastEventId'),device:device.data()};});
   const current=await readPushBinding(this.scope);
   if(this.stopped)return;
   if(current?.uid===this.uid&&current.generation===binding.generation&&status.sequence>=(binding.choiceSequence??0)){
    if(!status.enabled||status.choiceEventId!==binding.choiceEventId||status.device?.generation!==binding.generation||status.device?.publicKey!==this.publicKey||this.state.permission!=='granted'){
     await suspendDevicePush(this.scope);this.state.enabled=false;
    }else if(Date.now()-(status.device.updatedAt?.toMillis()??0)>86_400_000){
     await runTransaction(this.client.db,async tx=>{const ref=doc(this.client.db,`users/${this.uid}/pushDevices/${this.deviceId}`),head=doc(this.client.db,`users/${this.uid}/pushChoices/${this.deviceId}`);const [device,choice]=await Promise.all([tx.get(ref),tx.get(head)]);if(choice.get('enabled')&&choice.get('lastEventId')===binding.choiceEventId&&device.get('generation')===binding.generation)tx.update(ref,{updatedAt:serverTimestamp()});});
    }
   }
  }
  this.state.ready=true;this.emit();
 }
 async enable(){
  if(this.stopped||this.state.busy||!this.state.supported||!this.publicKey)return;
  this.state.busy=true;this.state.error='';const operation=++this.operation;this.emit();
  try{
   // Request directly from this button gesture, before awaiting storage/network work.
   const permission=await Notification.requestPermission();this.state.permission=permission;
   if(permission!=='granted')throw Error(permission==='denied'?'Notifications are blocked. Allow them in your browser’s site settings, then try again.':'Notification permission was not granted. You can try again whenever you like.');
   if(!navigator.onLine)throw Error('Connect to turn on hug notifications.');
   const registration=await registrationFor(this.scope);
   let subscription=await registration.pushManager.getSubscription();
   const currentKey=subscription?.options?.applicationServerKey;
   if(subscription&&currentKey&&btoa(String.fromCharCode(...new Uint8Array(currentKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==this.publicKey){await subscription.unsubscribe();subscription=null;}
   subscription??=await Promise.race([registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(this.publicKey)}),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('The browser push service did not respond. Check your connection and try again.')),30_000))]);
   const value=subscription.toJSON();if(!value.endpoint||!value.keys?.p256dh||!value.keys?.auth)throw Error('The browser did not provide a valid notification subscription.');
   const generation=crypto.randomUUID(),input:PushRegistration={subscription:{endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}},scope:this.scope,generation,publicKey:this.publicKey};
   if(this.stopped||operation!==this.operation)return;
   const choice=await choosePush(this.client.db,this.uid,this.deviceId,true,'button',input);
   if(this.stopped||operation!==this.operation)return;
   const binding:PushBinding={uid:this.uid,deviceId:this.deviceId,generation,choiceEventId:choice.lastEventId!,choiceSequence:choice.sequence,scope:this.scope};
   await writePushBinding(this.scope,binding);this.state.enabled=true;this.channel?.postMessage('changed');
  }catch(cause){this.state.error=cause instanceof Error&& !('code'in cause)?cause.message:'Hug notifications could not be saved. Check your connection and try again.';}
  finally{this.state.busy=false;this.state.ready=true;this.emit();}
 }
 async disable(reason:'button'|'sign-out'='button'){
  if(this.state.busy&&reason!=='sign-out')return;
  this.state.busy=true;this.state.error='';this.operation++;this.emit();
  try{
   const prior=await readPushBinding(this.scope),revoke=prior?.uid===this.uid||this.state.enabled;
   await suspendDevicePush(this.scope);this.state.enabled=false;this.channel?.postMessage('changed');
   const registration=await navigator.serviceWorker?.getRegistration(this.scope);if(registration?.scope===this.scope)void registration.pushManager.getSubscription().then(sub=>sub?.unsubscribe()).catch(()=>{});
   if(revoke&&navigator.onLine&&this.deviceId)await Promise.race([choosePush(this.client.db,this.uid,this.deviceId,false,reason),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Device revocation is waiting for a connection.')),8_000))]);
  }catch{this.state.error=this.state.enabled?'Could not turn off notifications here. Block them in your browser’s site settings.':'Notifications are off on this device. Reconnect to update its saved registration.';}
  finally{this.state.busy=false;this.emit();}
 }
 stop(){this.stopped=true;this.operation++;this.stopHead();this.channel?.close();window.removeEventListener('online',this.changed);window.removeEventListener('offline',this.changed);window.removeEventListener('focus',this.changed);}
}
