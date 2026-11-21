import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayInZone,indexCalendarDays,summarizeStretches,weekCells,monthCells,shiftDay,shiftMonth,monthOrdinal,monthFromOrdinal,validDay,dateEntries,cellFor} from '../../src/lib/calendar.ts';
import {replay,STARTER_ID,type JournalEvent,type Entry} from '../../src/lib/domain.ts';
const entry=(day:string,id=day):Entry=>({id,text:'A fictional moment.',prompt:'What helped?',revision:1,colour:0,recordedAt:'2026-10-01T04:31:07Z',entryAt:`${day}T12:00:00Z`});
test('backfills bridge stretches, today has grace, duplicate days count once and date edits move credit',()=>{
 const items=['01','02','03','05','06','07','08'].map(d=>entry(`2026-10-${d}`));
 let index=indexCalendarDays(items,'UTC');assert.equal(summarizeStretches(index,'2026-10-08').current,4);
 index=indexCalendarDays([...items,entry('2026-10-04'),entry('2026-10-04','second')],'UTC');
 assert.deepEqual(summarizeStretches(index,'2026-10-09'),{current:8,longest:8,latest:8,total:8,latestDay:'2026-10-08'});
 assert.equal(summarizeStretches(index,'2026-10-10').current,0);
 assert.equal(summarizeStretches(index,'2026-10-10').latest,8);
 assert.equal(summarizeStretches(indexCalendarDays(items.map(e=>e.id==='2026-10-03'?{...e,entryAt:'2026-09-01T12:00:00Z'}:e),'UTC'),'2026-10-03').current,2);
 assert.equal(summarizeStretches(new Map(),'2026-10-01').total,0);
});
test('logical dates, creation colours, photo-only entries and viewer zones are respected',()=>{
 const a={...entry('2026-01-01','first'),text:'',colour:3,entryAt:'2026-01-01T23:30:00Z'};
 const b={...a,id:'second',colour:5,entryAt:'2026-01-01T01:30:00Z'};
 const index=indexCalendarDays([a,b],'UTC');assert.equal(index.get('2026-01-01')![0].colour,3);assert.equal(dateEntries(index,'2026-01-01')[0].id,'first');
 assert.equal(dayInZone(a.entryAt!,'Australia/Hobart'),'2026-01-02');assert.equal(dayInZone(a.entryAt!,'America/Los_Angeles'),'2026-01-01');
 assert.equal(indexCalendarDays([{...a,entryAt:undefined}],'UTC').has('2026-10-01'),true);
 assert.equal(summarizeStretches(index,'2025-12-31').total,0);assert.equal(cellFor(index,'2026-01-01','2025-12-31').entries.length,0);
});
test('a browsed week uses the actual present day for future and today flags',()=>{
 const index=indexCalendarDays([entry('2026-09-20'),entry('2026-10-05')],'UTC');
 const previous=weekCells(index,'2026-09-24','2026-10-01');
 assert.equal(previous[0].day,'2026-09-20');assert.equal(previous[0].entries.length,1);
 assert.ok(previous.every(cell=>!cell.future&&!cell.today));
 const future=weekCells(index,'2026-10-08','2026-10-01');
 assert.equal(future[0].day,'2026-10-04');assert.ok(future.every(cell=>cell.future&&!cell.today&&!cell.entries.length));
 const present=weekCells(index,'2026-09-27','2026-10-01');
 assert.equal(present.filter(cell=>cell.today)[0].day,'2026-10-01');
});
test('Sunday weeks cross month/year and leap/DST days use civil adjacency',()=>{
 assert.equal(weekCells(new Map(),'2026-10-01')[0].day,'2026-09-27');assert.equal(weekCells(new Map(),'2026-10-04')[0].day,'2026-10-04');
 assert.equal(weekCells(new Map(),'2027-01-01')[0].day,'2026-12-27');
 assert.equal(shiftDay('2024-02-28',1),'2024-02-29');assert.equal(shiftDay('2024-02-29',1),'2024-03-01');assert.equal(validDay('2025-02-29'),false);
 for(const days of [['2026-10-03','2026-10-04','2026-10-05'],['2026-04-04','2026-04-05','2026-04-06']])assert.equal(summarizeStretches(indexCalendarDays(days.map(d=>entry(d)),'Australia/Hobart'),days[2]).current,3);
 const cells=monthCells(new Map(),'2026-10','2026-10-01');assert.equal(cells.length,42);assert.equal(cells[4]?.number,1);assert.equal(cells[5]?.future,true);
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('0001-01',-1),null);
 for(const month of ['0001-01','2026-10','9999-12'])assert.equal(monthFromOrdinal(monthOrdinal(month)),month);
});
test('full and cached-tail replay yield identical calendar credit without receipt-day shortcuts',()=>{
 const events:JournalEvent[]=['2026-09-29','2026-09-30','2026-10-01'].map((day,i)=>({eventId:`cal-${i}`,type:'ReflectionWritten',schemaVersion:3,payload:{entryId:`cal-${i}`,text:'A remembered moment.',expectedRevision:0,promptId:STARTER_ID,entryAt:`${day}T${i===2?'01':'12'}:00:00.000Z`},sequence:i+1,recordedAt:'2026-10-01T04:31:07Z'}));
 // Chosen instants must not be later than the server receipt.
 const full=replay(events),cached=replay(events.slice(2),replay(events.slice(0,2)));
 assert.deepEqual(indexCalendarDays(full.entries,'UTC'),indexCalendarDays(cached.entries,'UTC'));
 assert.equal(summarizeStretches(indexCalendarDays(full.entries,'UTC'),'2026-10-01').current,3);
});

test('navigation context rejects other accounts, malformed dates and unsafe identifiers',async()=>{
 const {readCalendarFlow}=await import('../../src/lib/calendar-navigation.ts');
 const flow={owner:'preview:base:owner:v1',root:{tab:'journal',query:'',expanded:[],scroll:0,anchor:{month:'2026-09',offset:80}},trail:[{kind:'day',day:'2026-09-29',query:'',expanded:[],scroll:0}]};
 assert.deepEqual(readCalendarFlow(flow,flow.owner),flow);
 assert.equal(readCalendarFlow(flow,'production:base:owner:v1'),null);
 assert.equal(readCalendarFlow(flow,'preview:base:other:v1'),null);
 assert.equal(readCalendarFlow({...flow,root:{...flow.root,focusDay:'bad-selector'}},flow.owner),null);
 assert.equal(readCalendarFlow({...flow,trail:[{kind:'entry',id:'bad"selector'}]},flow.owner),null);
 assert.equal(readCalendarFlow({...flow,trail:[{...flow.trail[0],day:'2026-02-30'}]},flow.owner),null);
 assert.equal(readCalendarFlow({...flow,root:{...flow.root,anchor:{month:'2026-09',offset:9999}}},flow.owner),null);
 assert.equal(readCalendarFlow({...flow,root:{...flow.root,weekDay:'2026-02-30'}},flow.owner),null);
 assert.equal(readCalendarFlow({...flow,root:{...flow.root,weekDay:'2026-09-24'}},flow.owner)?.root.weekDay,'2026-09-24');
});

test('all seven week starts rotate labels and date positions without changing streaks or day credit',async()=>{
 const {weekdayLabels,WEEKDAYS}=await import('../../src/lib/calendar-preferences.ts');
 const index=indexCalendarDays([entry('2026-09-30'),entry('2026-10-01')],'UTC');
 const before=summarizeStretches(index,'2026-10-01');
 for(let start=0;start<7;start++){
  assert.equal(weekdayLabels(start)[0],WEEKDAYS[start].slice(0,3));
  const week=weekCells(index,'2026-10-01','2026-10-01',start);
  assert.equal(new Date(week[0].day+'T12:00:00Z').getUTCDay(),start);
  assert.equal(week.filter(cell=>cell.today).length,1);
  assert.equal(week[6].day,shiftDay(week[0].day,6));
  for(const month of ['2024-02','2026-10','2027-01']){
   const cells=monthCells(index,month,'2026-10-01',start),days=cells.filter(c=>c!==null);
   const offset=(new Date(month+'-01T12:00:00Z').getUTCDay()-start+7)%7;
   assert.equal(cells[offset]?.number,1);assert.equal(cells.length,42);
   assert.equal(days.length,month==='2024-02'?29:31);
  }
  assert.deepEqual(summarizeStretches(index,'2026-10-01'),before);
 }
 assert.equal(weekCells(index,'2027-01-01','2027-01-01',1)[0].day,'2026-12-28');
 assert.equal(weekCells(index,'2026-10-04','2026-10-04',3)[0].day,'2026-09-30');
});

test('week choices are literal, validated, concurrency guarded and replayable without changing other preferences',async()=>{
 const {parseAction,emptyProjection}=await import('../../src/lib/domain.ts');
 assert.equal(emptyProjection().calendarPreferences.weekStartsOn,0);
 const events:Extract<JournalEvent,{type:'WeekStartChosen'}>[]=Array.from({length:7},(_,i)=>({eventId:`week-${i}`,type:'WeekStartChosen',schemaVersion:1,payload:{previousEventId:i?`week-${i-1}`:null,weekStartsOn:i},sequence:i+1,recordedAt:'2026-10-01T04:31:07.000Z'}));
 const full=replay(events);assert.deepEqual(full.calendarPreferences,{weekStartsOn:6,lastEventId:'week-6'});
 assert.deepEqual(replay(events.slice(4),replay(events.slice(0,4))),full);
 assert.deepEqual(full.appearance,emptyProjection().appearance);assert.deepEqual(full.onboarding,emptyProjection().onboarding);
 const {sequence,recordedAt,...action}=events[0];
 for(const weekStartsOn of [-1,7,1.5,'1',null])assert.throws(()=>parseAction({...action,payload:{previousEventId:null,weekStartsOn}}));
 assert.throws(()=>parseAction({...action,payload:{...action.payload,computedWeekStart:'2026-09-27'}}));
 assert.throws(()=>replay([{...events[0],payload:{previousEventId:'stale',weekStartsOn:1}}]),/another device/);
});
