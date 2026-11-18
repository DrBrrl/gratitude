import {requestMode,type PromptMode} from './modes.ts';
import type { Projection, RequestAction } from '../domain.ts';
import { TOPICS } from '../onboarding.ts';
import { reflectionTopic } from '../reflection-topics.ts';
import { civilDate, dayInZone } from '../civil-date.ts';
import { randomSource, type SelectionInput } from './selection.ts';

export type PromptTopic={id:string;label:string;description:string};
/** One consented description. Counts and seen topics are derived from source actions. */
export function chooseTopic(state:Projection,input:SelectionInput,personal:boolean,mode:PromptMode='regular'):PromptTopic|null {
 const a=state.onboarding.answers;
 if(!personal||!a.useAnswers)return null;
 let choices:PromptTopic[]=[...TOPICS.filter(([id])=>a.selectedTopics.includes(id)).map(([id,label])=>({id,label,description:a.descriptions[id]})),...a.customTopics.filter(t=>t.selected).map(({id,label,description})=>({id,label,description}))].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 if(!choices.length)return null;
 const counts=new Map(choices.map(t=>[t.id,0]));const end=+civilDate(input.day);
 for(const e of state.entries){
  if(e.id===input.entryId||mode==='review'&&!e.text.trim())continue;
  const days=(end-+civilDate(dayInZone(e.entryAt??e.recordedAt,input.timeZone)))/86400000,t=reflectionTopic(state.topics,e.id);
  if(days>=1&&days<=(mode==='regular'?14:30)&&t?.topicId&&counts.has(t.topicId)&&(t.origin!=='ai'||t.revision===e.revision))counts.set(t.topicId,counts.get(t.topicId)!+1);
 }
 if(mode==='review')choices=choices.filter(t=>counts.get(t.id)!>0);
 if(!choices.length)return null;
 const offeredPrompts=new Set<string>();
 const offers=state.rotation.offers.filter(o=>{const response=state.ai.responses[o.promptId],request=response?state.ai.requests[response.payload.requestId]:undefined;const day=mode!=='regular'&&request?request.payload.day:o.day;if(day!==input.day||mode!=='regular'&&requestMode(request)!==mode||!o.topicId||!choices.some(t=>t.id===o.topicId)||offeredPrompts.has(o.promptId))return false;offeredPrompts.add(o.promptId);return true;});
 // A round ends once every currently selected interest has appeared, including backups.
 let seen=new Set<string>();for(const o of offers){if(seen.size===choices.length)seen=new Set();seen.add(o.topicId!);}
 const newRound=seen.size===choices.length;if(newRound)seen.clear();
 const previous=input.avoidTopicId??offers.at(-1)?.topicId;
 let eligible=choices.filter(t=>!seen.has(t.id)&&(!newRound||choices.length===1||t.id!==previous));
 if(mode!=='regular'&&input.avoidTopicId&&eligible.length>1)eligible=eligible.filter(t=>t.id!==input.avoidTopicId);
 if(!eligible.length)eligible=choices.filter(t=>choices.length===1||t.id!==previous);
 const minimum=Math.min(...counts.values());
 let pool=mode==='review'?eligible:eligible.filter(t=>counts.get(t.id)===minimum);
 if(!pool.length)pool=eligible;
 if(pool.length>1&&previous)pool=pool.filter(t=>t.id!==previous);
 return pool[randomSource(input.selectionSeed)(pool.length)];
}
export function requestTopic(state:Projection,request:RequestAction):PromptTopic|null {
 if(!('snapshotId' in request.payload))return null;
 return chooseTopic(state,{day:request.payload.day,timeZone:request.payload.timeZone,selectionSeed:request.payload.selectionSeed,...('promptMode' in request.payload&&'differentFromPromptId' in request.payload?{avoidTopicId:state.ai.requestTopics[state.ai.responses[request.payload.differentFromPromptId]?.payload.requestId]?.id}:{}),entryId:'entryId' in request.payload?request.payload.entryId:undefined},request.payload.contextMode==='personal',requestMode(request));
}

/** Explicit corrections (including Unknown/unclassified) take precedence over provenance. */
export function promptTopicId(state:Projection,promptId:string):string|null {
 const assigned=reflectionTopic(state.classification.backupTopics,promptId);
 if(assigned)return assigned.topicId;
 const response=state.ai.responses[promptId];
 return response?state.ai.requestTopics[response.payload.requestId]?.id??null:null;
}
