import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
const jpeg=new Uint8Array(readFileSync(new URL('./import-mug.jpg',import.meta.url)));
/** @param {number} index @param {Partial<import('../../src/lib/import-source.ts').ImportSource>} changes */
export function sourceRecord(index, changes={}) {
  const createdOn=Date.parse('2024-01-01T04:00:00.000Z')+index*86400000;
  /** @param {number} value */
  const date=value=>new Date(value+10*3600000).toISOString().replace('Z','+10:00');
  return {id:index+1,noteId:`fictional-note-${index+1}`,noteText:`A fictional reflection ${index+1}.`,createdOn,createdOnStr:date(createdOn),updatedOn:createdOn+60000,updatedOnStr:date(createdOn+60000),noteColor:`#${((index%43+1)*123457).toString(16).padStart(6,'0')}`,imagePath:null,driveImagePath:null,addressTo:'',prompt:'What brought you a little comfort?',promptId:'fictional-prompt',moodId:null,backgroundId:null,...changes};
}
/** @param {{count?:number, photos?:number[], missing?:number[], changes?:Record<number,Partial<import('../../src/lib/import-source.ts').ImportSource>>}} options */
export function archiveFixture({count=3, photos=[0], missing=[0,1], changes={}}={}) {
  /** @type {Record<string,Uint8Array>} */
  const members={};
  const records=Array.from({length:count},(_,i)=>{
    const name=photos.includes(i)?`photo-${i}.jpg`:null;
    if(name)members[`photos/${name}`]=jpeg;
    return sourceRecord(i,{...(name?{imagePath:name,driveImagePath:name}:{}),...(i===photos[0]?{noteText:''}:{}),...(missing.includes(i)?{prompt:null,promptId:null}:{}),...changes[i]});
  });
  members['gratitudeEntries.json']=strToU8(JSON.stringify(records));
  return {bytes:zipSync(members),records,jpeg};
}
