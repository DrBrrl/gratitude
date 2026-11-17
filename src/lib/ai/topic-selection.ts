import type { Projection } from '../domain.ts';
import { TOPICS } from '../onboarding.ts';
import { reflectionTopic } from '../reflection-topics.ts';
import { civilDate, dayInZone } from '../civil-date.ts';
import { randomSource, type SelectionInput } from './selection.ts';

export type PromptTopic={id:string;label:string;description:string};
/** One consented description. Counts and seen topics are derived from source actions. */
export function chooseTopic(state:Projection,input:SelectionInput,personal:boolean):PromptTopic|null {
 const a=state.onboarding.answers;
 if(!personal||!a.useAnswers)return null;
 const choices:PromptTopic[]=[...TOPICS.filter(([id])=>a.selectedTopics.includes(id)).map(([id,label])=>({id,label,description:a.descriptions[id]})),...a.customTopics.filter(t=>t.selected).map(({id,label,description})=>({id,label,description}))].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 if(!choices.length)return null;
 const counts=new Map(choices.map(t=>[t.id,0]));const end=+civilDate(input.day);
 for(const e of state.entries){
  if(e.id===input.entryId)continue;
  const days=(end-+civilDate(dayInZone(e.entryAt??e.recordedAt,input.timeZone)))/86400000,t=reflectionTopic(state.topics,e.id);
  if(days>=1&&days<=14&&t?.topicId&&counts.has(t.topicId)&&(t.origin!=='ai'||t.revision===e.revision))counts.set(t.topicId,counts.get(t.topicId)!+1);
 }
 const offeredPrompts=new Set<string>();
 const offers=state.rotation.offers.filter(o=>{if(o.day!==input.day||!o.topicId||!counts.has(o.topicId)||offeredPrompts.has(o.promptId))return false;offeredPrompts.add(o.promptId);return true;});
 // A round ends once every currently selected interest has appeared, including backups.
 let seen=new Set<string>();for(const o of offers){if(seen.size===choices.length)seen=new Set();seen.add(o.topicId!);}
 const newRound=seen.size===choices.length;if(newRound)seen.clear();
 const previous=offers.at(-1)?.topicId;
 const eligible=choices.filter(t=>!seen.has(t.id)&&(!newRound||choices.length===1||t.id!==previous));
 const minimum=Math.min(...counts.values());
 let pool=eligible.filter(t=>counts.get(t.id)===minimum);
 if(!pool.length)pool=eligible;
 if(pool.length>1&&previous)pool=pool.filter(t=>t.id!==previous);
 return pool[randomSource(input.selectionSeed)(pool.length)];
}
