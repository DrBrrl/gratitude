import {openDB} from 'idb';
import type {PushBinding} from './protocol.ts';
const name=(scope:string)=>`gratitude-push:${scope}:v1`;
async function store(scope:string){return openDB(name(scope),1,{upgrade(db){db.createObjectStore('metadata');db.createObjectStore('seen');}});}
export async function readPushBinding(scope:string):Promise<PushBinding|undefined>{const db=await store(scope);try{return await db.get('metadata','binding');}finally{db.close();}}
export async function writePushBinding(scope:string,binding:PushBinding|null){const db=await store(scope);try{if(binding)await db.put('metadata',binding,'binding');else await db.delete('metadata','binding');}finally{db.close();}}
export async function pushDeviceId(scope:string){const db=await store(scope);try{let id=await db.get('metadata','deviceId');if(!id){id=crypto.randomUUID();await db.put('metadata',id,'deviceId');}return id as string;}finally{db.close();}}
/** Reserve before display so transport retries cannot show the same hug twice. */
export async function reserveHug(scope:string,binding:PushBinding,pairId:string,eventId:string,now:number){
 const db=await store(scope);try{const tx=db.transaction(['metadata','seen'],'readwrite');const current=await tx.objectStore('metadata').get('binding');
 if(!current||JSON.stringify(current)!==JSON.stringify(binding)){await tx.done;return false;}
 const key=`${binding.uid}:${pairId}:${eventId}`;
 if(await tx.objectStore('seen').get(key)){await tx.done;return false;}
 await tx.objectStore('seen').put(now,key);
 for(const key of await tx.objectStore('seen').getAllKeys()){const at=await tx.objectStore('seen').get(key);if(now-at>86_400_000)await tx.objectStore('seen').delete(key);}
 await tx.done;return true;
 }finally{db.close();}
}
export async function releaseHug(scope:string,binding:PushBinding,pairId:string,eventId:string){const db=await store(scope);try{await db.delete('seen',`${binding.uid}:${pairId}:${eventId}`);}finally{db.close();}}
