import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phaseForDay,LUNAR_VERSION} from '../../src/lib/ai/lunar-phase.ts';
// Independent USNO UT table, retrieved 19 November 2026:
// https://aa.usno.navy.mil/calculated/moon/phases?year=2026
// Table values are rounded to minutes. Tolerance here is a fixture check, not a
// claimed error bound over the whole application-supported 1900–2100 range.
const fixtures=[['2026-01-18','discovery','19:52'],['2026-03-03','review','11:38'],['2026-06-29','review','23:56'],['2026-10-10','discovery','15:50'],['2026-10-26','review','04:12'],['2026-11-09','discovery','07:02'],['2026-11-24','review','14:53'],['2026-12-09','discovery','00:52'],['2026-12-24','review','01:28']] as const;
test('pinned offline phase instants agree with independent USNO minute fixtures within two minutes',()=>{for(const [day,mode,time]of fixtures){const phase=phaseForDay(day,'UTC');assert.equal(phase?.mode,mode);assert.ok(Math.abs(Date.parse(phase!.instant)-Date.parse(day+'T'+time+':00Z'))<120000,day);assert.deepEqual(phaseForDay(day,'UTC'),phase);}});
test('phase days use the captured timezone across midnight, DST and year boundaries',()=>{
 assert.equal(phaseForDay('2026-11-24','Australia/Hobart'),null);assert.equal(phaseForDay('2026-11-25','Australia/Hobart')?.mode,'review');
 assert.equal(phaseForDay('2026-06-29','Europe/London'),null);assert.equal(phaseForDay('2026-06-30','Europe/London')?.mode,'review');
 assert.equal(phaseForDay('2026-12-08','America/New_York')?.mode,'discovery');assert.equal(phaseForDay('2026-12-09','America/New_York'),null);
 assert.equal(phaseForDay('2026-10-10','Australia/Hobart'),null);assert.equal(phaseForDay('2026-10-11','Australia/Hobart')?.mode,'discovery');
 for(const day of ['2026-12-31','2027-01-01','1900-01-01','2100-12-31'])assert.doesNotThrow(()=>phaseForDay(day,'Pacific/Kiritimati'));
});
test('unsupported ranges do not schedule and malformed dates/zones/versions fail explicitly',()=>{
 assert.equal(phaseForDay('1899-12-31','UTC'),null);assert.equal(phaseForDay('2101-01-01','UTC'),null);
 for(const [day,zone,version]of [['2026-02-31','UTC',LUNAR_VERSION],['2026-11-24','not/a_timezone',LUNAR_VERSION],['2026-11-24','UTC','unversioned']])assert.throws(()=>phaseForDay(day,zone,version));
});
