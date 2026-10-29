import { validDay,validMonth } from './calendar.ts';
export type CalendarAnchor={month:string;offset:number};
export type CalendarRoot={tab:'today'|'journal'|'home';query:string;expanded:string[];scroll:number;anchor:CalendarAnchor;focusDay?:string;weekDay?:string|null};
export type CalendarFrame={kind:'calendar';anchor:CalendarAnchor;focusDay?:string}|{kind:'day';day:string;query:string;expanded:string[];scroll:number;focusId?:string}|{kind:'entry';id:string}|{kind:'edit';key:string;id:string|null}|{kind:'saved';id:string};
export type CalendarFlow={owner:string;root:CalendarRoot;trail:CalendarFrame[]};
export function readCalendarFlow(value:unknown,owner:string):CalendarFlow|null {
 if(!value || typeof value!=='object')return null;
 const v=value as CalendarFlow;
 if(v.owner!==owner || !v.root || !['today','journal','home'].includes(v.root.tab) || typeof v.root.query!=='string' || !Array.isArray(v.root.expanded) || !v.root.expanded.every(id=>typeof id==='string') || !Number.isFinite(v.root.scroll) || !anchor(v.root.anchor) || (v.root.focusDay!==undefined && !validDay(v.root.focusDay)) || !Array.isArray(v.trail) || v.trail.length>1000)return null;
 if(v.root.weekDay!==undefined && v.root.weekDay!==null && !validDay(v.root.weekDay))return null;
 if(!v.trail.every(f=>f && (f.kind==='calendar'?anchor(f.anchor) && (f.focusDay===undefined || validDay(f.focusDay)):f.kind==='day'?validDay(f.day) && typeof f.query==='string' && Array.isArray(f.expanded) && f.expanded.every(id) && Number.isFinite(f.scroll):f.kind==='entry'||f.kind==='saved'?id(f.id):f.kind==='edit'?typeof f.key==='string' && /^(draft:new|draft:today:\d{4}-\d{2}-\d{2}|draft:entry:[a-zA-Z0-9_-]{1,80})$/.test(f.key) && (f.id===null || id(f.id)):false)))return null;
 return v;
}
function id(value:unknown){return typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);}
function anchor(v:CalendarAnchor){return !!v && validMonth(v.month) && Number.isFinite(v.offset) && v.offset>=0 && v.offset<368;}
