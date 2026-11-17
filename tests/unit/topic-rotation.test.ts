import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProjection,replay,parseAction,STARTER_ID,type Projection,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
import {answersInput,defaultAnswers} from '../../src/lib/onboarding.ts';
import {chooseTopic} from '../../src/lib/ai/topic-selection.ts';
import {selectReflections,selectedEntries} from '../../src/lib/ai/selection.ts';
const at='2026-10-27T00:00:00.000Z',input={day:'2026-10-27',timeZone:'UTC',selectionSeed:'0123456789abcdef0123456789abcdef'};
const apply=(s:Projection,a:SourceAction)=>replay([{...parseAction(a),sequence:s.cursor+1,recordedAt:at} as JournalEvent],s);
function setup(){let s=apply(emptyProjection(),{eventId:'answers',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),selectedTopics:['nature','music'],useAnswers:true}),previousEventId:null}});return apply(s,{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:3,payload:{previousEventId:null,enabled:true,useJournal:true,useFeedback:true,guidance:'Fictional preference',provider:'gemini',backupEnabled:true,backupProvider:'gemini'}});}
function write(s:Projection,id:string,day:string,topic:string|null,text='A fictional reflection.'){s=apply(s,{eventId:'w_'+id,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,text,expectedRevision:0,promptId:STARTER_ID,promptText:null,entryAt:day+'T00:00:00.000Z',photoSlot:null}});return topic?apply(s,{eventId:'t_'+id,type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:id,expectedRevision:1,previousEventId:null,answersId:s.onboarding.answersId,topicId:topic}}):s;}
test('topic counts use fourteen complete logical days, excluding target, current/future and stale AI labels',()=>{
 let s=setup();s=write(s,'recent','2026-10-26','nature');s=write(s,'old','2026-10-12','music');s=write(s,'today','2026-10-27','music');
 assert.equal(chooseTopic(s,input,true)?.id,'music');
 assert.equal(chooseTopic(s,{...input,entryId:'recent'},true)?.id,chooseTopic(setup(),input,true)?.id);
 assert.equal(chooseTopic(s,input,false),null);assert.equal(chooseTopic({...s,onboarding:{...s.onboarding,answers:{...s.onboarding.answers,useAnswers:false}}},input,true),null);
 s={...s,topics:{...s.topics,recent:{...s.topics.recent,origin:'ai',revision:0}}};assert.equal(chooseTopic(s,input,true)?.id,chooseTopic(setup(),input,true)?.id);
});
test('visible offers exhaust least-used pool then remaining interests before starting another round',()=>{
 let s=write(setup(),'nature','2026-10-26','nature');
 const offer=(topicId:string,i:number)=>{s={...s,rotation:{...s.rotation,offers:[...s.rotation.offers,{eventId:'o'+i,promptId:'b'+i,text:'Fictional?',surface:'backup',kind:'backup',sequence:i,day:input.day,topicId}]}};};
 assert.equal(chooseTopic(s,input,true)?.id,'music');offer('music',1);assert.equal(chooseTopic(s,input,true)?.id,'nature');offer('nature',2);assert.equal(chooseTopic(s,input,true)?.id,'music');
 s={...s,onboarding:{...s.onboarding,answers:{...s.onboarding.answers,selectedTopics:['nature']}}};assert.equal(chooseTopic(s,input,true)?.id,'nature');
 s={...s,onboarding:{...s.onboarding,answers:{...s.onboarding.answers,selectedTopics:[]}}};assert.equal(chooseTopic(s,input,true),null);
});
test('topic windows reserve recent30, anniversary28, Unknown fallback; unrelated and unclassified stay out',()=>{
 let s=setup();for(const [id,date,topic] of [['edge','2026-09-27','music'],['outside','2026-09-26','music'],['ann','2025-09-29','music'],['far','2025-09-28','music'],['unknown','2020-01-01','unknown'],['other','2026-10-26','nature'],['unclassified','2026-10-26',null]] as const)s=write(s,id,date,topic);
 const groups=selectReflections(s,{...input,weighted:true,topic:{id:'music'}});
 assert.deepEqual(groups.recent.map(e=>e.id),['edge']);assert.deepEqual(groups.anniversary.map(e=>e.id),['ann']);
 assert.deepEqual(new Set(selectedEntries(groups).map(e=>e.id)),new Set(['edge','outside','ann','far','unknown']));
 assert.deepEqual(selectedEntries(selectReflections(s,{...input,weighted:true,topic:{id:null}})),[]);
 const leap=write(write(setup(),'feb','2025-02-01','music'),'mar','2025-03-28','music');
 assert.deepEqual(selectReflections(leap,{...input,day:'2028-02-29',weighted:true,topic:{id:'music'}}).anniversary.map(e=>e.id),['feb','mar']);
});
test('topic selection charges full trimmed text at 600/601, excludes duplicate sources and obeys twenty units',()=>{
 let s=setup();for(let i=0;i<35;i++)s=write(s,'e'+i,`2026-10-${String(i%25+1).padStart(2,'0')}`,'music','x'.repeat(i%2?600:601));
 const g=selectReflections(s,{...input,weighted:true,topic:{id:'music'}}),entries=selectedEntries(g);
 const cost=(e:{text:string})=>e.text.trim().length>600?2:1;
 assert.ok(entries.reduce((n,e)=>n+cost(e),0)<=20);assert.equal(entries.length,new Set(entries.map(e=>e.id)).size);assert.ok(g.recent.reduce((n,e)=>n+cost(e),0)<=5);
});
test('date/topic edits, local midnight and custom retirement change only subsequent draws',()=>{
 let s=write(setup(),'edge','2026-10-12','music');s=write(s,'nature','2026-10-26','nature');
 const changed={...s,entries:s.entries.map(e=>e.id==='edge'?{...e,entryAt:'2026-10-12T13:30:00.000Z'}:e)};
 // 13 October in Hobart is fourteen complete civil days before 27 October.
 assert.equal(chooseTopic(s,{...input,timeZone:'Australia/Hobart'},true)?.id,'music');
 assert.equal(chooseTopic(changed,{...input,timeZone:'Australia/Hobart'},true)?.id,chooseTopic(setup(),input,true)?.id);
 assert.equal(chooseTopic(changed,input,true)?.id,'music');
 const a={...s.onboarding.answers,selectedTopics:[] as ('nature'|'music')[],customTopics:[{id:'custom_quiet',label:'Quiet moments',description:'Small calm experiences.',selected:true}]};
 const custom={...s,onboarding:{...s.onboarding,answers:a}};assert.equal(chooseTopic(custom,input,true)?.id,'custom_quiet');
 assert.equal(chooseTopic({...custom,onboarding:{...custom.onboarding,answers:{...a,customTopics:[{...a.customTopics[0],selected:false}]}}},input,true),null);
});
test('new rounds avoid the immediately previous topic even if it has the lowest reflection count',()=>{
 const s=write(setup(),'nature','2026-10-26','nature');
 const offers=['nature','music'].map((topicId,i)=>({eventId:'o'+i,promptId:'b'+i,text:'Fictional?',surface:'backup' as const,kind:'backup' as const,sequence:i+1,day:input.day,topicId}));
 assert.equal(chooseTopic({...s,rotation:{...s.rotation,offers}},input,true)?.id,'nature');
});
test('revisiting one prompt on another surface does not rotate its topic a second time',()=>{
 const s=write(setup(),'nature','2026-10-26','nature');
 const offers=['nature','music'].map((topicId,i)=>({eventId:'o'+i,promptId:'p'+i,text:'Fictional?',surface:'today' as const,kind:'ai' as const,sequence:i+1,day:input.day,topicId}));
 const once={...s,rotation:{...s.rotation,offers}},twice={...s,rotation:{...s.rotation,offers:[...offers,{...offers[0],eventId:'again',sequence:3,surface:'editor' as const}]}};
 assert.equal(chooseTopic(once,input,true)?.id,'nature');assert.deepEqual(chooseTopic(twice,input,true),chooseTopic(once,input,true));
});
