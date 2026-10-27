import type { Entry, Projection } from '../domain.ts';
import { civilDate, dayInZone, validDay } from '../civil-date.ts';

export const SELECTOR_VERSION = 'mixed-v1';
export type SelectionInput = { day: string; timeZone: string; selectionSeed: string; entryId?: string };
export type Selection = { anniversary: Entry[]; rediscovery: Entry[]; fallback: Entry[]; recent: Entry[] };
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
export function validSelection(input: SelectionInput) {
  return validDay(input.day) && validTimeZone(input.timeZone) && typeof input.selectionSeed === 'string' && /^[a-f0-9]{32}$/.test(input.selectionSeed);
}
/** Literal random request input. Never called by the reducer or a transaction retry. */
export function newSelectionSeed() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
/** sfc32 with four 32-bit hex words and 12 warmup rounds. */
function randomSource(seed: string) {
  let [a,b,c,d] = seed.match(/.{8}/g)!.map(word => parseInt(word,16));
  const next = () => {
    const t = ((a + b | 0) + d | 0) >>> 0;
    d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11) + t | 0;
    return t;
  };
  for (let i=0;i<12;i++) next();
  return (bound: number) => {
    // Rejection prevents modulo bias in Fisher–Yates, including non-power-of-two bounds.
    const limit = 0x100000000 - 0x100000000 % bound;
    let value; do { value=next(); } while (value >= limit);
    return value % bound;
  };
}
function shuffle<T>(values: T[], draw: (bound: number) => number) {
  const result=[...values];
  for(let i=result.length-1;i>0;i--) { const j=draw(i+1); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
const ordinal = (day: string) => +civilDate(day) / 86400000;
const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Pure request preparation over one immutable confirmed snapshot, never inference/replay. */
export function selectReflections(state: Projection, input: SelectionInput): Selection {
  if (!validSelection(input)) throw new Error('Invalid reflection selection inputs.');
  const draw=randomSource(input.selectionSeed);
  const candidates=state.entries.filter(entry => entry.id !== input.entryId && entry.text.trim()).map(entry => ({
    entry, day: dayInZone(entry.entryAt ?? entry.recordedAt,input.timeZone)
  })).filter(item => item.day < input.day).sort((a,b)=>compare(a.day,b.day)||compare(a.entry.id,b.entry.id));
  const used=new Set<string>();
  const take=(entries: Entry[], count: number) => {
    const result=entries.filter(entry=>!used.has(entry.id)).slice(0,count);
    result.forEach(entry=>used.add(entry.id)); return result;
  };
  const ref=ordinal(input.day);
  const recent=take(shuffle(candidates.filter(item=>ref-ordinal(item.day)<=14).map(item=>item.entry),draw),5);
  const [year,month,date]=input.day.split('-').map(Number);
  const groups=new Map<number,{entry:Entry;distance:number}[]>();
  for(const item of candidates) {
    if(used.has(item.entry.id)) continue;
    const candidateYear=Number(item.day.slice(0,4));
    for(const centreYear of [candidateYear-1,candidateYear,candidateYear+1]) {
      if(centreYear<1 || centreYear>=year) continue;
      let centre=`${String(centreYear).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
      if(month===2 && date===29 && !validDay(centre)) centre=`${String(centreYear).padStart(4,'0')}-02-28`;
      const distance=Math.abs(ordinal(item.day)-ordinal(centre));
      if(distance<=3) { const group=groups.get(centreYear)??[]; group.push({entry:item.entry,distance});groups.set(centreYear,group); }
    }
  }
  const years=shuffle([...groups.keys()].sort((a,b)=>a-b),draw);
  for(const y of years) groups.set(y,shuffle(groups.get(y)!,draw).sort((a,b)=>a.distance-b.distance));
  const anniversary:Entry[]=[];
  while(anniversary.length<8) {
    let found=false;
    for(const y of years) {
      const item=groups.get(y)!.shift();
      if(item && !used.has(item.entry.id)) {anniversary.push(item.entry);used.add(item.entry.id);found=true;}
      if(anniversary.length===8) break;
    }
    if(!found) break;
  }
  const leastUsed=shuffle(candidates.map(item=>item.entry),draw).sort((a,b)=>(state.ai.usage[a.id]?.lastSequence??0)-(state.ai.usage[b.id]?.lastSequence??0));
  const rediscovery=take(leastUsed,7);
  const fallback=take(leastUsed,20-recent.length-anniversary.length-rediscovery.length);
  return {anniversary,rediscovery,fallback,recent};
}
export function selectedEntries(selection: Selection) {
  return [...selection.anniversary,...selection.rediscovery,...selection.fallback,...selection.recent];
}
