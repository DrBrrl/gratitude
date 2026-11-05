import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onboardingPath,readSetupAI,resumeSetupStep} from '../../src/lib/onboarding-flow.ts';
test('AI remains an open choice before setup and determines both forward and backward paths afterwards',()=>{
 assert.deepEqual(onboardingPath(false,false),[0,1,2,3,4,5,6,7]);
 const starters=onboardingPath(false,true);assert.deepEqual(starters,[0,1,2,3,6,7]);assert.equal(starters[starters.indexOf(6)-1],3);
 const ai=onboardingPath(true,true);assert.deepEqual(ai,[0,1,2,3,4,5,6,7]);assert.equal(ai[ai.indexOf(6)-1],5);
});
test('local onboarding choices restore without allowing a provider, binding or credential to be inferred',()=>{
 const draft={enabled:true,useJournal:false,useFeedback:true,guidance:'Gentle questions, please.'};
 assert.deepEqual(readSetupAI(draft),draft);
 for(const extra of [{provider:'personal-gemini'},{token:'fictional-private-token'},{connectionId:'unknown'},{apiKey:'fictional-key'}])assert.equal(readSetupAI({...draft,...extra}),null);
 for(const value of [null,[],{},'on',{...draft,enabled:'yes'},{...draft,guidance:'x'.repeat(501)}])assert.equal(readSetupAI(value),null);
});

test('old unfinished drafts revisit AI before preferences while new drafts retain their exact step',()=>{
 for(let step=0;step<8;step++){assert.equal(resumeSetupStep(step,undefined),Math.min(step,3));assert.equal(resumeSetupStep(step,2),step);}
 for(const step of [null,'3',-1,8,3.5])assert.equal(resumeSetupStep(step,2),0);
});
