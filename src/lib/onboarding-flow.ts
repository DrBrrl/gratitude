import type {AIChoices} from './domain.ts';
export type SetupAIChoices=Pick<AIChoices,'enabled'|'useJournal'|'useFeedback'|'guidance'>;
export function onboardingPath(enabled:boolean,decided:boolean){return enabled||!decided?[0,1,2,3,4,5,6,7]:[0,1,2,3,6,7];}
/** Only local choice fields may resume; saved providers and credentials have their own stores. */
export function readSetupAI(value:unknown):SetupAIChoices|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const p=value as Record<string,unknown>;
 if(Object.keys(p).length!==4||!Object.keys(p).every(k=>['enabled','useJournal','useFeedback','guidance'].includes(k))||typeof p.enabled!=='boolean'||typeof p.useJournal!=='boolean'||typeof p.useFeedback!=='boolean'||typeof p.guidance!=='string'||p.guidance.length>500)return null;
 return {enabled:p.enabled,useJournal:p.useJournal,useFeedback:p.useFeedback,guidance:p.guidance};
}
