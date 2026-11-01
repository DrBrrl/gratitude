/** Private transport metadata, separate from journal events and exports. */
export type PushBinding = { uid:string; deviceId:string; generation:string; choiceEventId:string; choiceSequence?:number; scope:string };
export type HugPush = PushBinding & { version:1; type:'hug'; pairId:string; eventId:string; senderName:string; expiresAt:number };
const id = (value:unknown):value is string => typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function validHugPush(value:unknown,binding:PushBinding,scope:string,now:number):value is HugPush {
  if(!value || typeof value!=='object')return false;
  const p=value as HugPush;
  return p.version===1 && p.type==='hug' && p.uid===binding.uid && p.deviceId===binding.deviceId && p.generation===binding.generation && p.choiceEventId===binding.choiceEventId && p.scope===scope && binding.scope===scope
    && id(p.pairId) && id(p.eventId) && typeof p.senderName==='string' && p.senderName.trim().length>0 && p.senderName.length<=60 && Number.isFinite(p.expiresAt) && p.expiresAt>now && p.expiresAt<=now+86_460_000;
}
export function friendsNotificationURL(scope:string) { return new URL('journal/?open=friends',scope).href; }
export type PushChoice = { sequence:number;lastEventId:string|null;enabled:boolean };
export const emptyPushChoice=():PushChoice=>({sequence:0,lastEventId:null,enabled:false});
export type PushChoiceEvent = {eventId:string;schemaVersion:1;type:'HugNotificationsChosen';actorUid:string;deviceId:string;sequence:number;recordedAt:string;payload:{previousEventId:string|null;enabled:boolean;reason:'button'|'sign-out'}};
export function applyPushChoice(before:PushChoice,event:PushChoiceEvent):PushChoice {
  if(event.type!=='HugNotificationsChosen'||event.schemaVersion!==1||!id(event.eventId)||!id(event.deviceId)||!event.actorUid||event.sequence!==before.sequence+1||!Number.isFinite(Date.parse(event.recordedAt))||event.payload.previousEventId!==before.lastEventId||typeof event.payload.enabled!=='boolean'||!['button','sign-out'].includes(event.payload.reason)||event.payload.reason==='sign-out'&&event.payload.enabled||Object.keys(event.payload).sort().join(',')!=='enabled,previousEventId,reason')throw Error('Invalid notification choice.');
  return {sequence:event.sequence,lastEventId:event.eventId,enabled:event.payload.enabled};
}

/** Exact app windows only: a production worker must never focus a PR preview. */
export function isAppWindow(url:string,scope:string){
 try {const candidate=new URL(url),root=new URL(scope);return candidate.origin===root.origin&&candidate.pathname.startsWith(root.pathname)&&['','index.html','journal','journal/','settings','settings/'].includes(candidate.pathname.slice(root.pathname.length));}catch{return false;}
}
