import { STARTER_CATALOGUE } from './starter-catalogue.ts';
export type PromptKind = 'starter'|'backup';
export type PromptOffer = {eventId:string;day:string;promptId:string;kind:PromptKind;text:string;surface:'today'|'editor'|'backup';sequence:number};
export type RotationState = {offers:PromptOffer[];accepted:Record<string,string>;acceptedText:Record<string,string>;requests:Record<string,number>};
export const emptyRotation = ():RotationState=>({offers:[],accepted:{},acceptedText:{},requests:{}});
const starters=new Map<string,{id:string;category:string;text:string}>(STARTER_CATALOGUE.map(p=>[p.id,p]));
export const starterPrompt=(id:string)=>starters.get(id);
export function civilDayDistance(from:string,to:string){return (Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000;}
/** Choices are made at the user interaction, never during event replay. */
export function choosePrompt(pool:{id:string;text:string;category?:string}[],history:RotationState,day:string,kind:PromptKind,random:()=>number=Math.random){
 const key=(text:string)=>text.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('en');
 const cooling=new Set(Object.entries(history.accepted).filter(([,when])=>civilDayDistance(when,day)<30).map(([id])=>key(history.acceptedText[id]??starterPrompt(id)?.text??'')));
 const seen=history.offers.filter(o=>o.day===day),seenIds=new Set(seen.map(o=>o.promptId));
 let available=pool.filter(p=>!seenIds.has(p.id)&&!seen.some(o=>key(o.text)===key(p.text))&&!cooling.has(key(p.text)));
 if(!available.length)return null;
 if(kind==='starter'){
  const categories=seen.filter(o=>o.kind==='starter').map(o=>starterPrompt(o.promptId)?.category).filter((c):c is string=>!!c);
  const unused=available.filter(p=>!categories.includes(p.category!));
  if(unused.length)available=unused;
  else {const different=available.filter(p=>p.category!==categories.at(-1));if(different.length)available=different;}
  const choices=[...new Set(available.map(p=>p.category))];
  const category=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];available=available.filter(p=>p.category===category);
 }
 return available[Math.min(available.length-1,Math.floor(random()*available.length))];
}

// Browser walkthroughs supply a seed as a fixture input. Published builds omit it.
let draws=0;
export function promptRandom(){
 const seed=import.meta.env?.VITE_PROMPT_RANDOM_SEED;
 if(!seed)return Math.random();
 let hash=2166136261;
 for(const char of `${seed}:${draws++}`)hash=Math.imul(hash^char.charCodeAt(0),16777619);
 return (hash>>>0)/4294967296;
}
