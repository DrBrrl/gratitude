import type {Projection} from './domain.ts';
import {availableBackups} from './backup-prompts.ts';
import {targetTopic,type ClassificationTarget} from './classification.ts';
/** Only the current Unknown assignment enters review; unclassified is distinct. */
export function unknownTargets(state:Projection,kind:ClassificationTarget['kind'],removed:string[]=[]){
 const items=kind==='reflection'?state.entries.map(e=>({id:e.id,revision:e.revision})):availableBackups(state,removed).map(p=>({id:p.id,revision:1}));
 return items.flatMap(({id,revision})=>{const topic=targetTopic(state,{kind,id});return topic?.topicId==='unknown'?[{kind,id,revision,previousTopicId:topic.lastEventId}]:[];});
}
