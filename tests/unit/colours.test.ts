import {test} from 'node:test';
import assert from 'node:assert/strict';
import {colours,colourForDay,colourIndexForDay} from '../../src/lib/colours.ts';
import {entryColour,todayReflection} from '../../src/lib/journal.ts';
import {shiftDay} from '../../src/lib/calendar.ts';
import {replay,STARTER_ID,type JournalEvent,type Entry} from '../../src/lib/domain.ts';
import {exportJournal} from '../../src/lib/export.ts';
process.env.TZ='Australia/Hobart';

const entry:Entry={id:'moment',text:'A fictional moment.',prompt:'What helped?',revision:1,colour:6,recordedAt:'2026-10-01T04:31:07Z',entryAt:'2026-09-27T02:00:00Z'};
test('28 unique colours loop smoothly with a yellow Sunday every four weeks in either direction',()=>{
 assert.equal(colours.length,28);assert.equal(new Set(colours).size,28);assert.ok(colours.every(c=>/^#[0-9a-f]{6}$/.test(c)));
 for(const day of ['2026-08-30','2026-09-27','2026-10-25','2026-11-22'])assert.equal(colourForDay(day),'#e5e561');
 const days=Array.from({length:28},(_,i)=>shiftDay('2026-10-25',i));assert.equal(new Set(days.map(colourForDay)).size,28);
 assert.equal(colourIndexForDay('2026-10-24'),27);assert.equal(colourIndexForDay('2026-11-22'),0);
 const rgb=(hex:string)=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
 for(let i=0;i<28;i++)assert.ok(rgb(colours[i]).every((v,c)=>Math.abs(v-rgb(colours[(i+1)%28])[c])<=30),'There is no large jump at the loop boundary');
});
test('logical dates, same-day entries and edited dates determine colour independently of receipt order',()=>{
 assert.equal(entryColour(entry,'Australia/Hobart'),'#e5e561');
 assert.equal(entryColour({...entry,id:'another',colour:0,recordedAt:'2026-10-02T00:00:00Z'},'Australia/Hobart'),entryColour(entry,'Australia/Hobart'));
 assert.equal(entryColour({...entry,entryAt:'2026-09-28T02:00:00Z'},'Australia/Hobart'),'#c9e561');
 assert.equal(entryColour({...entry,text:''},'Australia/Hobart'),entryColour(entry,'Australia/Hobart'));
 assert.equal(todayReflection([],'2026-09-27').colour,0);
 assert.equal(entryColour({...entry,entryAt:undefined},'Australia/Hobart'),colourForDay('2026-10-01'));
});
test('local date boundaries and DST use civil days rather than midnight-duration arithmetic',()=>{
 const boundary={...entry,entryAt:'2026-09-26T15:00:00Z'};
 assert.equal(entryColour(boundary,'Australia/Hobart'),'#e5e561');assert.notEqual(entryColour(boundary,'UTC'),'#e5e561');
 for(const day of ['2026-10-03','2026-10-04','2026-04-04','2026-04-05','2024-02-29','2026-12-31'])assert.equal(colourIndexForDay(shiftDay(day,1)),(colourIndexForDay(day)+1)%28);
 for(const day of ['0001-01-01','9999-12-31'])assert.ok(colourIndexForDay(day)>=0 && colourIndexForDay(day)<28);
 assert.throws(()=>colourForDay('2026-02-30'));
});
test('full and cached replay and JSON export use the same logical-date colours',()=>{
 const log:JournalEvent[]=Array.from({length:7},(_,i)=>({eventId:`colour-${i}`,type:'ReflectionWritten',schemaVersion:3,sequence:i+1,recordedAt:'2026-10-01T04:31:07.000Z',payload:{entryId:`colour-${i}`,text:'A fictional day.',expectedRevision:0,promptId:STARTER_ID,entryAt:`${shiftDay('2026-09-21',i)}T02:00:00.000Z`}}));
 const full=replay(log),cached=replay(log.slice(4),replay(log.slice(0,4)));
 assert.deepEqual(full.entries.map(e=>entryColour(e)),cached.entries.map(e=>entryColour(e)));
 assert.equal(full.entries.at(-1)!.colour,6);assert.equal(entryColour(full.entries.at(-1)!),'#e5e561');
 const exported=JSON.parse(exportJournal(full,'json').content);
 assert.equal(exported.entries[0].colour,'#e5e561');assert.ok(!Object.keys(log[0].payload).includes('colour'));
});
