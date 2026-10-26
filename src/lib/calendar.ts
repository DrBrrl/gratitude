import type { Entry } from './domain';
import { entryTimestamp, chronologicalEntries } from './journal.ts';
export type DayKey = string;
export type DayIndex = Map<DayKey, Entry[]>;
export type CalendarCell = { day: DayKey; number: number; future: boolean; today: boolean; entries: Entry[] };
const parts = new Map<string, Intl.DateTimeFormat>();
export function dayInZone(value: Date | string, zone: string): DayKey {
  let format=parts.get(zone);
  if (!format) {format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});parts.set(zone,format);}
  const p=Object.fromEntries(format.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${p.year.padStart(4,'0')}-${p.month}-${p.day}`;
}
export function civilDate(day: string) {
  const date=new Date(`${day}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==day || date.getUTCFullYear()<1) throw new Error('Invalid calendar date');
  return date;
}
export function shiftDay(day: DayKey, delta: number): DayKey {
  const date=civilDate(day);date.setUTCDate(date.getUTCDate()+delta);return date.toISOString().slice(0,10);
}
export function validDay(day: unknown): day is string {try {return typeof day==='string' && !!civilDate(day);} catch {return false;}}
export function validMonth(month: unknown): month is string {return typeof month==='string' && /^\d{4}-\d{2}$/.test(month) && validDay(`${month}-01`);}
export function shiftMonth(month: string, delta: number) {
  const date=civilDate(`${month}-01`);date.setUTCMonth(date.getUTCMonth()+delta);
  const next=date.toISOString().slice(0,7);return validMonth(next)?next:null;
}
export function monthOrdinal(month: string) {const date=civilDate(`${month}-01`);return (date.getUTCFullYear()-1)*12+date.getUTCMonth();}
export function monthFromOrdinal(n: number) {return `${String(Math.floor(n/12)+1).padStart(4,'0')}-${String(n%12+1).padStart(2,'0')}`;}
export function indexCalendarDays(entries: Entry[], zone: string): DayIndex {
  const index:DayIndex=new Map();
  for (const entry of entries) {const day=dayInZone(entryTimestamp(entry),zone);const list=index.get(day)??[];list.push(entry);index.set(day,list);}
  return index;
}
export function summarizeStretches(index: DayIndex, today: DayKey) {
  const days=[...index.keys()].filter(day=>day<=today).sort();
  let length=0,longest=0,last='';
  for (const day of days) {length=last && shiftDay(last,1)===day?length+1:1;longest=Math.max(longest,length);last=day;}
  const anchor=index.has(today)?today:shiftDay(today,-1);
  let current=0,cursor=anchor;
  while(index.has(cursor)) {current++;if(cursor==='0001-01-01')break;cursor=shiftDay(cursor,-1);}
  return {current,longest,latest:length,total:days.length,latestDay:last||null};
}
export function cellFor(index: DayIndex, day: DayKey, today: DayKey): CalendarCell {return {day,number:Number(day.slice(-2)),future:day>today,today:day===today,entries:index.get(day)??[]};}
export function weekCells(index: DayIndex,today: DayKey) {
  const weekday=civilDate(today).getUTCDay();
  return Array.from({length:7},(_,i)=>cellFor(index,shiftDay(today,i-weekday),today));
}
export function monthCells(index: DayIndex, month: string,today: DayKey): (CalendarCell|null)[] {
  const first=civilDate(`${month}-01`), offset=first.getUTCDay();
  const end=new Date(+first);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
  return Array.from({length:42},(_,i)=>i<offset || i>=offset+end.getUTCDate()?null:cellFor(index,`${month}-${String(i-offset+1).padStart(2,'0')}`,today));
}
export function dateEntries(index:DayIndex,day:DayKey) {return chronologicalEntries(index.get(day)??[]);}
export function dayLabel(day: DayKey) {return new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(civilDate(day));}
export function monthLabel(month:string) {return new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',month:'long',year:'numeric'}).format(civilDate(`${month}-01`));}
