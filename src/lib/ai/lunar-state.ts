import type {Projection,RequestAction} from '../domain.ts';
import {dayInZone,validDay} from '../civil-date.ts';
import {validTimeZone} from './selection.ts';
import {LUNAR_VERSION,phaseForDay,type LunarPhase} from './lunar-phase.ts';
export {LUNAR_VERSION};
export type LunarState={lastEventId:string|null;settingsId:string|null;enabled:boolean;timeZone:string;lunarVersion:typeof LUNAR_VERSION;declines:Record<string,string>};
type E<T extends string,P>={eventId:string;type:T;schemaVersion:1;payload:P&{previousEventId:string|null}};
export type LunarAction=E<'LunarScheduleChosen',{enabled:boolean;timeZone:string;lunarVersion:typeof LUNAR_VERSION}>|E<'LunarPromptDeclined',{settingsId:string;day:string;timeZone:string;lunarVersion:typeof LUNAR_VERSION}>;
export function emptyLunar():LunarState{return {lastEventId:null,settingsId:null,enabled:false,timeZone:'UTC',lunarVersion:LUNAR_VERSION,declines:{}};}
export function isLunarAction(action:{type:string}):action is LunarAction{return action.type==='LunarScheduleChosen'||action.type==='LunarPromptDeclined';}
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function validLunarAction(v:Record<string,unknown>){
 const p=v.payload as Record<string,unknown>,keys=v.type==='LunarScheduleChosen'?['previousEventId','enabled','timeZone','lunarVersion']:['previousEventId','settingsId','day','timeZone','lunarVersion'];
 return v.schemaVersion===1&&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k))&&(p.previousEventId===null||id(p.previousEventId))&&validTimeZone(p.timeZone)&&p.lunarVersion===LUNAR_VERSION&&(v.type==='LunarScheduleChosen'?typeof p.enabled==='boolean':id(p.settingsId)&&typeof p.day==='string'&&validDay(p.day));
}
// Independent root searches for the same phase can differ by milliseconds.
// A minute is unambiguous: distinct new/full phases are many days apart.
const sameInstant=(a:string|undefined,b:string)=>!!a&&Math.abs(Date.parse(a)-Date.parse(b))<60000;
export const lunarKey=(day:string,timeZone:string)=>timeZone+'|'+day;
export function applyLunar(s:LunarState,a:LunarAction):LunarState {
 if(a.payload.previousEventId!==s.lastEventId)throw new Error('Lunar settings changed on another device. Reopen them before saving.');
 if(a.type==='LunarScheduleChosen')return {...s,lastEventId:a.eventId,settingsId:a.eventId,enabled:a.payload.enabled,timeZone:a.payload.timeZone,lunarVersion:a.payload.lunarVersion};
 const p=a.payload;
 if(!s.enabled||s.settingsId!==p.settingsId||s.timeZone!==p.timeZone||s.lunarVersion!==p.lunarVersion||!phaseForDay(p.day,p.timeZone,p.lunarVersion))throw new Error('This lunar occasion changed. Reopen Today before choosing Regular.');
 return {...s,lastEventId:a.eventId,declines:{...s.declines,[lunarKey(p.day,p.timeZone)]:a.eventId}};
}
type Context=Pick<Projection,'ai'|'rotation'>&{lunar:LunarState};
export function sameOccasion(request:RequestAction|undefined,phase:LunarPhase){
 if(!request||!('promptMode' in request.payload)||!request.payload.scheduleId||request.payload.promptMode!==phase.mode)return false;
 const p=request.payload;
 if(Math.abs(Date.parse(p.day+'T12:00:00Z')-Date.parse(phase.day+'T12:00:00Z'))>2*86400000)return false;
 return sameInstant(phaseForDay(p.day,p.timeZone,p.lunarVersion)?.instant,phase.instant);
}
export function scheduledPhase(state:Context,now:Date):LunarPhase|null{
 const s=state.lunar;
 return s.enabled&&state.ai.choices.enabled?phaseForDay(dayInZone(now.toISOString(),s.timeZone),s.timeZone,s.lunarVersion):null;
}
export function occasionDeclined(state:Context,phase:LunarPhase){return Object.keys(state.lunar.declines).some(key=>{const day=key.slice(-10),zone=key.slice(0,-11);if(Math.abs(Date.parse(day+'T12:00:00Z')-Date.parse(phase.day+'T12:00:00Z'))>2*86400000)return false;return sameInstant(phaseForDay(day,zone)?.instant,phase.instant);});}
export function occasionOffered(state:Context,phase:LunarPhase){return state.rotation.offers.some(o=>o.kind==='ai'&&sameOccasion(state.ai.requests[state.ai.responses[o.promptId]?.payload.requestId],phase));}
function phaseResponse(state:Context,phase:LunarPhase){return Object.values(state.ai.responses).findLast(r=>sameOccasion(state.ai.requests[r.payload.requestId],phase));}
export function scheduledPrompt(state:Context,now:Date,surfaceDay:string):string|undefined {
 const phase=scheduledPhase(state,now);if(!phase||occasionDeclined(state,phase))return;
 const response=phaseResponse(state,phase);if(!response)return;
 const sequence=state.rotation.requests[response.payload.requestId]??0;
 if(state.rotation.offers.some(o=>o.kind!=='ai'&&o.surface==='today'&&o.day===surfaceDay&&o.sequence>sequence))return;
 const current=state.ai.responses[state.ai.days[surfaceDay]];
 return current&&(state.rotation.requests[current.payload.requestId]??0)>sequence?undefined:response.eventId;
}
export function scheduledOffer(state:Context,now:Date):LunarPhase|null {
 const phase=scheduledPhase(state,now);if(!phase||occasionDeclined(state,phase)||occasionOffered(state,phase)||phaseResponse(state,phase))return null;
 const pending=state.ai.control.requestId;
 if(pending&&+now-Date.parse(state.ai.requestedAt[pending])<180000)return null;
 return phase;
}
export function assertScheduledRequest(state:Context,request:RequestAction,at:string){
 if(!('promptMode' in request.payload)||request.payload.scheduleId===null)return;
 const p=request.payload,s=state.lunar,phase=phaseForDay(p.day,p.timeZone,p.lunarVersion);
 if(!s.enabled||s.settingsId!==p.scheduleId||s.timeZone!==p.timeZone||s.lunarVersion!==p.lunarVersion||!phase||phase.mode!==p.promptMode||'entryId' in p)throw new Error('Lunar settings or occasion changed. Choose a manual prompt instead.');
 if(occasionDeclined(state,phase)||occasionOffered(state,phase)||phaseResponse(state,phase))throw new Error('This lunar prompt has already been offered or declined. You can request another manually.');
 const pending=state.ai.control.requestId;
 if(pending&&Date.parse(at)-Date.parse(state.ai.requestedAt[pending])<180000)throw new Error('A prompt is already being generated. Wait or choose a manual request.');
}
export function assertScheduledResponse(state:Context,request:RequestAction){
 if(!('promptMode' in request.payload)||request.payload.scheduleId===null)return;
 const p=request.payload,phase=phaseForDay(p.day,p.timeZone,p.lunarVersion);
 if(!state.lunar.enabled||state.lunar.settingsId!==p.scheduleId||!phase||occasionDeclined(state,phase)||occasionOffered(state,phase))throw new Error('This lunar request was disabled, declined or already offered. The late response was not selected.');
}
