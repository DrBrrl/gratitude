import type {Projection} from '../domain.ts';
import {reflectionTopic,topicChoices,topicLabel} from '../reflection-topics.ts';
import {promptTopicId} from './topic-selection.ts';

/** Only default to a topic still present in the user's current vocabulary. */
export function defaultPromptTopic(state:Projection,promptId:string):string|null {
 const id=promptTopicId(state,promptId);
 return topicChoices(state.onboarding.answers).some(t=>t.id===id)?id:null;
}
export function generatedPromptTopicLabel(state:Projection,promptId:string):string {
 const assigned=reflectionTopic(state.classification.backupTopics,promptId);
 if(assigned)return topicLabel(assigned,state.onboarding.answers);
 const response=state.ai.responses[promptId];
 return response?state.ai.requestTopics[response.payload.requestId]?.label??'Not yet classified':'Not yet classified';
}
