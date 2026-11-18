import type {Projection,RequestAction} from '../domain.ts';
import {selectReflections,randomSource,type SelectionInput,type Selection} from './selection.ts';
import {reflectionTopic} from '../reflection-topics.ts';
import {civilDate,dayInZone} from '../civil-date.ts';
export type PromptMode='regular'|'discovery'|'review';
export type ModeInput={promptMode:Exclude<PromptMode,'regular'>;scheduleId:string|null;displayDay:string;lunarVersion:'ae-2.1.19-v1'};
export function requestMode(request:RequestAction|undefined|null):PromptMode{return request&&'promptMode' in request.payload?request.payload.promptMode:'regular';}
export const modeLabel=(mode:PromptMode)=>mode==='review'?'Monthly review':mode==='discovery'?'Discovery':'Regular';
export function selectModeReflections(state:Projection,input:SelectionInput,mode:PromptMode):Selection {
 if(mode!=='review')return selectReflections(state,input);
 const result:Selection={anniversary:[],rediscovery:[],fallback:[],recent:[]};
 if(!input.topic?.id)return result;
 const avoid=new Set(input.avoidEntryIds??[]),end=+civilDate(input.day),draw=randomSource(input.selectionSeed);
 const candidates=state.entries.filter(e=>{
  const t=reflectionTopic(state.topics,e.id),days=(end-+civilDate(dayInZone(e.entryAt??e.recordedAt,input.timeZone)))/86400000;
  return e.id!==input.entryId&&!!e.text.trim()&&days>=1&&days<=30&&t?.topicId===input.topic!.id&&(t.origin!=='ai'||t.revision===e.revision);
 }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 for(let i=candidates.length-1;i>0;i--){const j=draw(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 candidates.sort((a,b)=>Number(avoid.has(a.id))-Number(avoid.has(b.id)));
 let budget=20;
 for(const e of candidates){const cost=e.text.trim().length>600?2:1;if(cost<=budget){result.recent.push(e);budget-=cost;}if(!budget)break;}
 return result;
}
export function reviewWindow(day:string){const end=civilDate(day);return {from:new Date(+end-30*86400000).toISOString().slice(0,10),through:new Date(+end-86400000).toISOString().slice(0,10)};}
