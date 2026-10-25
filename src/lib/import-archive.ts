import { Unzip, UnzipInflate } from 'fflate';
import { IMPORT_FORMAT, SOURCE_KEYS, validImportSource, hasSourcePhoto, type ImportInput } from './import-source.ts';
export const IMPORT_LIMITS = { compressed: 20 * 1024 * 1024, expanded: 64 * 1024 * 1024, members: 512, records: 5000, image: 10 * 1024 * 1024, json: 20 * 1024 * 1024 };
export type PlannedImport = { input: ImportInput; confirmationId: string; completionId: string; attachmentIds: string[] };
export type ImportSelection = { file: File; prepared: Record<string, { blob: Blob; digest: string }> };
export type ImportArchive = { records: PlannedImport[]; files: Map<string, File>; missingPrompts: number; photos: number; photoOnly: number; firstDate: string; lastDate: string };
export async function sha256(bytes: Uint8Array | string) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2,'0')).join('');
}
function safePath(name: string) {
  const path = name.endsWith('/') ? name.slice(0,-1) : name;
  return !!path && path.length <= 512 && !/[\\\x00-\x1f:]/.test(path) && !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..');
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit=0;bit<8;bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Validate central directory before streaming inflation; enforce actual output sizes and CRC too. */
export function readBoundedZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!bytes.length || bytes.length > IMPORT_LIMITS.compressed) throw new Error('Choose a ZIP smaller than 20 MB.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end = -1;
  for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if (view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length) { end=i; break; }
  if (end<0 || view.getUint16(end+4,true) || view.getUint16(end+6,true)) throw new Error('Unsupported or incomplete ZIP.');
  const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), size=view.getUint32(end+12,true);
  if (!count || count>IMPORT_LIMITS.members || count!==view.getUint16(end+8,true) || start+size!==end) throw new Error('Unsupported ZIP directory or too many files.');
  const expected=new Map<string,{ size:number; crc:number }>(); let offset=start, expanded=0;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  for (let i=0;i<count;i++) {
    if (offset+46>end || view.getUint32(offset,true)!==0x02014b50) throw new Error('Invalid ZIP directory.');
    const flags=view.getUint16(offset+8,true), method=view.getUint16(offset+10,true), length=view.getUint16(offset+28,true);
    const next=offset+46+length+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
    if (next>end) throw new Error('Invalid ZIP member.');
    const name=decoder.decode(bytes.subarray(offset+46,offset+46+length));
    const uncompressed=view.getUint32(offset+24,true), compressed=view.getUint32(offset+20,true), local=view.getUint32(offset+42,true);
    const kind=view.getUint32(offset+38,true)>>>16 & 0xf000;
    if (!safePath(name) || expected.has(name) || flags & 1 || ![0,8].includes(method) || ![0,0x8000,0x4000].includes(kind) || local>=start || compressed===0xffffffff || uncompressed===0xffffffff) throw new Error('ZIP contains an unsafe, duplicate or unsupported member.');
    expanded+=uncompressed;
    const limit=name.endsWith('gratitudeEntries.json') ? IMPORT_LIMITS.json : IMPORT_LIMITS.image;
    if (uncompressed>limit || expanded>IMPORT_LIMITS.expanded) throw new Error('ZIP expands beyond the import limits.');
    expected.set(name,{size:uncompressed,crc:view.getUint32(offset+16,true)}); offset=next;
  }
  if (offset!==end) throw new Error('Invalid ZIP directory length.');
  const files=new Map<string,Uint8Array>(), seen=new Set<string>(); let total=0;
  const unzip=new Unzip(file => {
    const declared=expected.get(file.name);
    if (!declared || seen.has(file.name)) throw new Error('ZIP member does not match its directory.');
    seen.add(file.name); const chunks:Uint8Array[]=[]; let length=0;
    file.ondata=(error,data,final) => {
      if (error) throw new Error('A ZIP member could not be decompressed.');
      length+=data.length; total+=data.length;
      if (length>declared.size || total>IMPORT_LIMITS.expanded) throw new Error('ZIP expands beyond its declared limits.');
      chunks.push(data);
      if (final) {
        if (length!==declared.size) throw new Error('Incomplete ZIP member.');
        const content=new Uint8Array(length); let at=0; for (const chunk of chunks) {content.set(chunk,at); at+=chunk.length;}
        if (crc32(content)!==declared.crc) throw new Error('ZIP member checksum mismatch.');
        files.set(file.name,content);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Small compressed chunks bound transient inflate allocations as well as retained bytes.
  for (let at=0;at<bytes.length;at+=1024) unzip.push(bytes.subarray(at,at+1024),at+1024>=bytes.length);
  if (files.size!==expected.size) throw new Error('The ZIP is incomplete.');
  return files;
}
/** Reject enormous decoded allocations before handing a JPEG to the browser. */
export function validateJpeg(bytes: Uint8Array) {
  if (bytes.length<4 || bytes[0]!==255 || bytes[1]!==216) throw new Error('Unsupported JPEG.');
  let at=2;
  while (at+3<bytes.length) {
    if (bytes[at++]!==255) throw new Error('Invalid JPEG structure.');
    while (bytes[at]===255) at++;
    const marker=bytes[at++];
    if (marker===0xda || marker===0xd9) break;
    if (marker===0x01 || marker>=0xd0 && marker<=0xd7) continue;
    const size=bytes[at]*256+bytes[at+1];
    if (size<2 || at+size>bytes.length) throw new Error('Incomplete JPEG.');
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      const height=bytes[at+3]*256+bytes[at+4], width=bytes[at+5]*256+bytes[at+6];
      if (size<8 || !height || !width || height*width>40000000 || width>20000 || height>20000) throw new Error('A photo exceeds the 40-megapixel import limit.');
      return;
    }
    at+=size;
  }
  throw new Error('The photo is not a supported JPEG.');
}
export async function parseImportArchive(file: Blob, now=new Date()): Promise<ImportArchive> {
  if (file.size>IMPORT_LIMITS.compressed) throw new Error('Choose a ZIP smaller than 20 MB.');
  let members:Map<string,Uint8Array>;
  try { members=readBoundedZip(new Uint8Array(await file.arrayBuffer())); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'This ZIP could not be opened.'); }
  const json=[...members.keys()].filter(name => name.split('/').at(-1)==='gratitudeEntries.json');
  if (json.length!==1) throw new Error('Choose an alternate gratitude export containing one gratitudeEntries.json file.');
  let raw:unknown;
  try {raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(members.get(json[0])!));} catch {throw new Error('The journal JSON could not be read.');}
  if (!Array.isArray(raw) || !raw.length || raw.length>IMPORT_LIMITS.records) throw new Error('The export must contain between 1 and 5,000 records.');
  const records:PlannedImport[]=[], files=new Map<string,File>(), ids=new Set<string>();
  for (let i=0;i<raw.length;i++) {
    const source=raw[i];
    if (!validImportSource(source) || source.updatedOn>now.getTime() || !source.noteText.trim() && !hasSourcePhoto(source)) throw new Error(`Record ${i+1} has unsupported fields, dates, text or prompt. Nothing was imported.`);
    if (ids.has(source.noteId)) throw new Error('The export contains duplicate source identities.'); ids.add(source.noteId);
    const key=await sha256(JSON.stringify([IMPORT_FORMAT,source.noteId]));
    const input:ImportInput={format:IMPORT_FORMAT,sourceKey:key,entryId:`e_${key}`,source:Object.fromEntries(SOURCE_KEYS.map(k=>[k,source[k]])) as typeof source,attachments:[]};
    if (hasSourcePhoto(source)) {
      const basename=(source.imagePath || source.driveImagePath)!.split(/[\\/]/).at(-1);
      const matches=[...members.keys()].filter(name=>name.split('/').at(-1)===basename);
      if (matches.length!==1) throw new Error(`Record ${i+1} has a missing or ambiguous photo. Nothing was imported.`);
      const bytes=members.get(matches[0])!;
      if (bytes.length<4 || bytes.length>IMPORT_LIMITS.image || bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) throw new Error(`Record ${i+1} does not contain a supported JPEG.`);
      validateJpeg(bytes);
      const sourceDigest=await sha256(bytes), photoId=`ip_${await sha256(JSON.stringify([key,sourceDigest]))}`;
      input.attachments.push({photoId,sourceDigest});
      files.set(photoId,new File([new Uint8Array(bytes)],'import-photo.jpg',{type:'image/jpeg'}));
    }
    records.push({input,confirmationId:`ic_${key}`,completionId:`iw_${key}`,attachmentIds:input.attachments.map((_,slot)=>`ia_${key}_${slot}`)});
  }
  records.sort((a,b)=>a.input.source.createdOn-b.input.source.createdOn || a.input.source.noteId.localeCompare(b.input.source.noteId,'en'));
  return {records,files,missingPrompts:records.filter(r=>r.input.source.prompt===null).length,photos:files.size,photoOnly:records.filter(r=>!r.input.source.noteText.trim()).length,firstDate:new Date(records[0].input.source.createdOn).toISOString(),lastDate:new Date(records.at(-1)!.input.source.createdOn).toISOString()};
}
