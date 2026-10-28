import {sha256,readBoundedZip} from './import-archive.ts';
import type {BackupAction,Projection} from './domain.ts';
export const BACKUP_MINIMUM=30;
export const BACKUP_LEASE_MS=180_000;
export const CLOUD_REFILL_INTERVAL=15_000;
export function promptKey(text:string) {return text.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('en');}
/** Availability is disposable state derived from raw questions, removals and saved reflections. */
export function availableBackups(state:Projection,removed:string[]=[],pendingPrompt?:string) {
  const used=new Set([...state.entries.map(entry=>entry.promptId),...removed,pendingPrompt]);
  const excluded=new Set(Object.entries(state.backups).filter(([id,p])=>p.removed||p.used||used.has(id)).map(([,p])=>promptKey(p.text)));
  const seen=new Set<string>();
  return Object.entries(state.backups).filter(([,p])=>{const key=promptKey(p.text);if(excluded.has(key)||seen.has(key))return false;seen.add(key);return true;}).map(([id,p])=>({id,text:p.text}));
}
export async function importedBackup(text:string):Promise<Extract<BackupAction,{type:'BackupPromptImported'}>> {
  const clean=text.trim();if(!clean||clean.length>600)throw new Error('Each prompt must contain 1–600 characters.');
  return {eventId:`bp_${await sha256(clean)}`,type:'BackupPromptImported',schemaVersion:1,payload:{text:clean}};
}
/** A deliberately small OOXML importer: one text column, no formulas, macros or external data. */
export function readPromptWorkbook(bytes:Uint8Array):string[] {
  if(bytes.length>2*1024*1024)throw new Error('Choose an XLSX smaller than 2 MB.');
  const members=readBoundedZip(bytes);
  if([...members.keys()].some(path=>/vbaProject|externalLinks/i.test(path)))throw new Error('Macros and external links are not supported.');
  const xml=(path:string)=>{const data=members.get(path);if(!data||data.length>2*1024*1024)throw new Error('Missing or oversized worksheet.');const source=new TextDecoder('utf-8',{fatal:true}).decode(data);if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('Unsupported XML.');const document=new DOMParser().parseFromString(source,'application/xml');if(document.getElementsByTagName('parsererror').length)throw new Error('Invalid worksheet XML.');return document;};
  const sheets=[...members.keys()].filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/.test(path));
  if(sheets.length!==1)throw new Error('Use a workbook with one worksheet and one prompt column.');
  const strings=members.has('xl/sharedStrings.xml')?Array.from(xml('xl/sharedStrings.xml').getElementsByTagName('si')).map(si=>Array.from(si.getElementsByTagName('t')).map(t=>t.textContent??'').join('')):[];
  const cells=Array.from(xml(sheets[0]).getElementsByTagName('c'));if(cells.length>2001)throw new Error('Import up to 2,000 prompts at a time.');
  const prompts:string[]=[];let column='';
  for(const cell of cells) {
    if(cell.getElementsByTagName('f').length)throw new Error('Use literal prompt text, without formulas.');
    const type=cell.getAttribute('t');const raw=cell.getElementsByTagName('v')[0]?.textContent??'';
    const text=(type==='s'?strings[Number(raw)]:type==='inlineStr'?Array.from(cell.getElementsByTagName('t')).map(t=>t.textContent??'').join(''):raw)?.trim();
    if(!text)continue;
    const key=cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];if(!key||column&&key!==column)throw new Error('Use one prompt column.');column=key;
    if(!prompts.length&&['prompt','prompts','gratitude prompts'].includes(text.toLowerCase()))continue;
    if(text.length>600)throw new Error('Each prompt must contain 1–600 characters.');
    prompts.push(text);
  }
  if(!prompts.length)throw new Error('No prompts found.');
  return [...new Map(prompts.map(text=>[promptKey(text),text])).values()];
}
