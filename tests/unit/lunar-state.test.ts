import {phaseForDay} from '../../src/lib/ai/lunar-phase.ts';
import {dayInZone} from '../../src/lib/civil-date.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProjection,applyEvent,parseAction,replay,type SourceAction,type Projection,type JournalEvent} from '../../src/lib/domain.ts';
import {makeRequest} from '../../src/lib/ai/context.ts';
import {scheduledOffer,scheduledPrompt,occasionDeclined,scheduledPhase,sameOccasion,LUNAR_VERSION} from '../../src/lib/ai/lunar-state.ts';
const now=new Date('2026-09-26T20:00:00Z'),day='2026-09-27',zone='Australia/Hobart',selection={timeZone:zone,selectionSeed:'0123456789abcdef0123456789abcdef'};
function append(s:Projection,a:SourceAction){return applyEvent(s,{...a,sequence:s.cursor+1,recordedAt:now.toISOString()} as JournalEvent);}
function setup(){let s=append(emptyProjection(),{eventId:'choices',type:'AIChoicesConfirmed',schemaVersion:1,payload:{previousEventId:null,enabled:true,useJournal:false,useFeedback:false,guidance:''}});return append(s,{eventId:'lunar',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:null,enabled:true,timeZone:zone,lunarVersion:LUNAR_VERSION}});}
function request(s:Projection,id='request',displayDay=day){return makeRequest(s,day,'generic',id,undefined,selection,undefined,false,undefined,{promptMode:'review',scheduleId:s.lunar.settingsId,displayDay,lunarVersion:LUNAR_VERSION});}
function result(s:Projection,id='request'){return append(s,{eventId:id+'_response',type:'PromptResponseReceived',schemaVersion:2,payload:{requestId:id,text:'What did you appreciate this month?',model:'fixture',finishReason:'STOP'}});}
test('scheduling is opt-in, civil-day/zone based, and does not dispatch or catch up',()=>{
 assert.equal(scheduledOffer(emptyProjection(),now),null);const s=setup();assert.equal(scheduledOffer(s,now)?.mode,'review');assert.equal(scheduledOffer(s,new Date('2026-09-27T20:00:00Z')),null);assert.equal(scheduledOffer({...s,ai:{...s.ai,choices:{...s.ai.choices,enabled:false}}},now),null);assert.equal(s.ai.control.requestId,null);
});
test('failures retry, received output is reused across local days, visibility consumes once and manual requests remain possible',()=>{
 let s=setup();const first=request(s);s=append(s,first);assert.equal(scheduledOffer(s,now),null);assert.throws(()=>append(s,request(s,'racing')),/already being generated/);
 s=append(s,{eventId:'request_failure',type:'AIRequestFailed',schemaVersion:1,payload:{requestId:'request',reason:'unavailable'}});assert.equal(scheduledOffer(s,now)?.mode,'review');const retry=request(s,'retry','2026-09-26');s=append(s,retry);s=result(s,'retry');assert.equal(scheduledOffer(s,now),null);assert.equal(scheduledPrompt(s,now,'2026-09-27'),'retry_response');
 s=append(s,{eventId:`v${day}_tretry_response`,type:'PromptViewed',schemaVersion:2,payload:{day,promptId:'retry_response',surface:'today'}});assert.equal(scheduledOffer(s,now),null);assert.equal(scheduledPrompt(s,now,'2026-09-26'),'retry_response');assert.throws(()=>request(s,'again'),/already been offered/);
 const manual=makeRequest(s,day,'generic','manual',undefined,selection,undefined,false,'retry_response',{promptMode:'review',scheduleId:null,displayDay:day,lunarVersion:LUNAR_VERSION});assert.equal(manual.payload.day,day);assert.ok('scheduleId'in manual.payload&&manual.payload.scheduleId===null);
});
test('declines and settings resaves preserve occasion identity across timezone changes; malformed literal actions fail',()=>{
 let s=setup();s=append(s,{eventId:'decline',type:'LunarPromptDeclined',schemaVersion:1,payload:{previousEventId:'lunar',settingsId:'lunar',day,timeZone:zone,lunarVersion:LUNAR_VERSION}});assert.equal(scheduledOffer(s,now),null);
 s=append(s,{eventId:'resave',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'decline',enabled:true,timeZone:'America/Los_Angeles',lunarVersion:LUNAR_VERSION}});assert.equal(scheduledPhase(s,now)?.day,'2026-09-26');assert.equal(occasionDeclined(s,scheduledPhase(s,now)!),true);assert.equal(scheduledOffer(s,now),null);
 for(const p of [{enabled:true,timeZone:'Not/AZone',lunarVersion:LUNAR_VERSION},{enabled:true,timeZone:zone,lunarVersion:'next'},{enabled:true,timeZone:zone,lunarVersion:LUNAR_VERSION,phaseDate:day}])assert.throws(()=>parseAction({eventId:'bad',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'resave',...p}}));
 assert.throws(()=>append(s,{eventId:'stale',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'lunar',enabled:false,timeZone:zone,lunarVersion:LUNAR_VERSION}}),/another device/);
});
test('disabling or declining pending lunar output rejects late selection without inference; cached replay is exact',()=>{
 for(const decline of [false,true]){let s=setup();const actions:SourceAction[]=[request(s)];s=append(s,actions[0]);const change:SourceAction=decline?{eventId:'change',type:'LunarPromptDeclined',schemaVersion:1,payload:{previousEventId:'lunar',settingsId:'lunar',day,timeZone:zone,lunarVersion:LUNAR_VERSION}}:{eventId:'change',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'lunar',enabled:false,timeZone:zone,lunarVersion:LUNAR_VERSION}};s=append(s,change);assert.throws(()=>result(s),/disabled, declined/);assert.deepEqual(replay([{...change,sequence:s.cursor,recordedAt:now.toISOString()}] as JournalEvent[],append(setup(),actions[0])),s);}
});

test('timezone changes identify the same occasion despite subsecond root-search convergence differences',()=>{
 const phase=phaseForDay('1900-06-13','UTC')!,otherDay=dayInZone(phase.instant,'America/Los_Angeles'),other=phaseForDay(otherDay,'America/Los_Angeles')!;assert.notEqual(phase.instant,other.instant);assert.ok(Math.abs(Date.parse(phase.instant)-Date.parse(other.instant))<1000);
 let s=append(setup(),{eventId:'utc',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'lunar',enabled:true,timeZone:'UTC',lunarVersion:LUNAR_VERSION}});
 const r=makeRequest(s,phase.day,'generic','phase',undefined,{...selection,timeZone:'UTC'},undefined,false,undefined,{promptMode:phase.mode,scheduleId:'utc',displayDay:phase.day,lunarVersion:LUNAR_VERSION});assert.equal(sameOccasion(r,other),true);
 s=append(s,{eventId:'decline',type:'LunarPromptDeclined',schemaVersion:1,payload:{previousEventId:'utc',settingsId:'utc',day:phase.day,timeZone:'UTC',lunarVersion:LUNAR_VERSION}});s=append(s,{eventId:'west',type:'LunarScheduleChosen',schemaVersion:1,payload:{previousEventId:'decline',enabled:true,timeZone:'America/Los_Angeles',lunarVersion:LUNAR_VERSION}});assert.equal(occasionDeclined(s,other),true);assert.equal(scheduledOffer(s,new Date(phase.instant)),null);
});
