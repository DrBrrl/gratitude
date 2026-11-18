import {SearchMoonPhase} from 'astronomy-engine';
import {dayInZone,validDay} from '../civil-date.ts';
import {validTimeZone} from './selection.ts';
export const LUNAR_VERSION='ae-2.1.19-v1' as const;
export type LunarPhase={mode:'discovery'|'review';day:string;timeZone:string;instant:string};
const cache=new Map<string,LunarPhase|null>();
/** Offline, pinned phase calculation. Cached results are disposable projections. */
export function phaseForDay(day:string,timeZone:string,version:string=LUNAR_VERSION):LunarPhase|null {
 if(version!==LUNAR_VERSION)throw new Error('Unsupported lunar calculation version.');
 if(!validDay(day)||!validTimeZone(timeZone))throw new Error('Choose a valid lunar date and timezone.');
 if(day<'1900-01-01'||day>'2100-12-31')return null;
 const key=day+'|'+timeZone;
 if(cache.has(key))return cache.get(key)!;
 const start=new Date(Date.parse(day+'T12:00:00Z')-2*86400000);
 let phase:LunarPhase|null=null;
 for(const [angle,mode]of [[0,'discovery'],[180,'review']] as const){
  const found=SearchMoonPhase(angle,start,5);
  if(found&&dayInZone(found.date,timeZone)===day)phase={mode,day,timeZone,instant:found.date.toISOString()};
 }
 if(cache.size>=256)cache.delete(cache.keys().next().value!);
 cache.set(key,phase);return phase;
}
