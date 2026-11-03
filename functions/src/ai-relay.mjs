import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';

export class RelayError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new RelayError(code,message);};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
const modelId=value=>typeof value==='string'&&/^gemini-[A-Za-z0-9_.:-]{1,72}$/.test(value);
const keyValid=value=>typeof value==='string'&&value.length>=20&&value.length<=4096&&!/[\s]/u.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const finalText=(text,model,max)=>{if(typeof text!=='string'||!text.trim()||text.length>max||/<\/?think>|<\|channel[>|]|<\|turn[>|]|<channel\|>|<turn\|>/i.test(text)||typeof model!=='string'||!model.trim()||model.length>100)fail('data-loss','The model returned an invalid final answer.');return {text,model,finishReason:'STOP'};};

/** AES-GCM authenticates owner, destination and revision. The keyring is a server secret. */
export function sealKey(value,aad,keyring){
 const key=Buffer.from(keyring.keys?.[keyring.active]??'','base64');if(key.length!==32)throw Error('Relay encryption configuration is unavailable.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
 return {keyVersion:keyring.active,iv:iv.toString('base64'),ciphertext:Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function openKey(value,aad,keyring){
 const key=Buffer.from(keyring.keys?.[value.keyVersion]??'','base64');if(key.length!==32)throw Error('Relay encryption configuration is unavailable.');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8');
}

/** Injected boundaries keep tests offline and prevent arbitrary forwarding destinations. */
export function createAIRelay({db,project,keyring,fetcher=fetch,now=Date.now,timestamp=()=>new Date()}){
 const aad=(uid,connectionId,revision)=>`${project}:${uid}:${connectionId}:${revision}:personal-gemini`;
 async function google(path,key,body){
  let response;
  try{response=await fetcher('https://generativelanguage.googleapis.com/v1beta/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-goog-api-key':key},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(body?90_000:15_000)});}
  catch{fail('unavailable','Gemini could not be reached. Try again later.');}
  if([401,403].includes(response.status))fail('permission-denied','Gemini rejected this key or its model access. Check the key’s API restrictions and project.');
  if(response.status===429)fail('resource-exhausted','Gemini quota or billing limits have been reached. Check your provider account.');
  if(!response.ok)fail('unavailable','Gemini could not complete this request. Check your model and provider account.');
  const raw=await response.text();if(raw.length>8_000_000)fail('data-loss','Gemini returned an oversized response.');
  try{return JSON.parse(raw);}catch{fail('data-loss','Gemini returned an invalid response.');}
 }
 async function models(key){
  const data=await google('models?pageSize=100',key);
  if(!Array.isArray(data.models))fail('data-loss','Gemini model discovery is unavailable.');
  return [...new Set(data.models.filter(row=>row.supportedGenerationMethods?.includes('generateContent')).map(row=>row.name?.replace(/^models\//,'')).filter(modelId))];
 }
 async function credential(uid,connectionId,revision){
  const ref=db.doc(`users/${uid}/privateConnections/${connectionId}`),secret=db.doc(`users/${uid}/privateModelKeys/${connectionId}`);
  const [metadata,stored]=await Promise.all([ref.get(),secret.get()]);
  if(!metadata.exists||!stored.exists||metadata.get('provider')!=='personal-gemini'||metadata.get('revision')!==revision||stored.get('revision')!==revision)fail('failed-precondition','This cloud connection changed or was removed. Reopen its settings.');
  let key;try{key=openKey(stored.data(),aad(uid,connectionId,revision),keyring());}catch{fail('unavailable','The saved cloud key could not be opened. Replace it in AI settings.');}
  return {metadata,key,ref,secret};
 }
 async function acquire(uid,generation,requestId){
  const ref=db.doc(`users/${uid}/aiRelay/control`),at=now(),lease=randomUUID();
  await db.runTransaction(async tx=>{
   const previous=(await tx.get(ref)).data()??{},minute=Math.floor(at/60_000),hour=Math.floor(at/3_600_000),day=Math.floor(at/86_400_000);
   const minuteCount=previous.minute===minute?previous.minuteCount??0:0,hourCount=previous.hour===hour?previous.hourCount??0:0,dayCount=previous.day===day?previous.dayCount??0:0;
   if(generation&&previous.lastGenerationRequestId===requestId)fail('failed-precondition','This request was already dispatched. Request a new prompt rather than repeating inference.');
   if((previous.expiresAt??0)>at)fail('resource-exhausted','Another cloud-key request is running. Wait for it to finish.');
   if(minuteCount>=(generation?5:15)||hourCount>=90||dayCount>=400)fail('resource-exhausted','This account’s cloud relay limit has been reached. Try again later.');
   tx.set(ref,{...(previous.lastGenerationRequestId?{lastGenerationRequestId:previous.lastGenerationRequestId}:{}),...(generation?{lastGenerationRequestId:requestId}:{}),lease,expiresAt:at+125_000,minute,minuteCount:minuteCount+1,hour,hourCount:hourCount+1,day,dayCount:dayCount+1});
  });
  return async()=>{await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.get('lease')===lease)tx.update(ref,{expiresAt:0});});};
 }
 return async request=>{
  const uid=request.auth?.uid;
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||request.auth?.token?.firebase?.sign_in_provider!=='google.com')fail('unauthenticated','Sign in with Google to manage your own cloud key.');
  const data=request.data;
  if(!exact(data,['operation','connectionId','revision','key','model','allowPersonal','requestId','system','context','image','max'])||!['test','save','delete','generate'].includes(data.operation))fail('invalid-argument','Choose a supported cloud connection action.');
  if(data.operation==='generate'&&!id(data.requestId))fail('invalid-argument','The recorded request identifier is invalid.');
  const release=data.operation==='delete'?async()=>{}:await acquire(uid,data.operation==='generate',data.requestId);
  try{
   if(data.operation==='test'){
    let key=data.key;
    if(!key&&id(data.connectionId)&&id(data.revision))key=(await credential(uid,data.connectionId,data.revision)).key;
    if(!keyValid(key))fail('invalid-argument','Enter a valid Gemini key in the private key field.');
    return {models:await models(key)};
   }
   if(!id(data.connectionId)||!(data.revision===null||id(data.revision)))fail('invalid-argument','The cloud connection identifier is invalid.');
   if(data.operation==='save'){
    if(!modelId(data.model)||typeof data.allowPersonal!=='boolean')fail('invalid-argument','Choose a Gemini model and review its data-sharing terms.');
    let key=data.key;
    if(!key&&data.revision)key=(await credential(uid,data.connectionId,data.revision)).key;
    if(!keyValid(key))fail('invalid-argument','Enter a valid Gemini key in the private key field.');
    if(!(await models(key)).includes(data.model))fail('failed-precondition','This key does not expose the selected Gemini model.');
    const revision=randomUUID(),encrypted=sealKey(key,aad(uid,data.connectionId,revision),keyring());
    await db.runTransaction(async tx=>{
     const ref=db.doc(`users/${uid}/privateConnections/${data.connectionId}`),secret=db.doc(`users/${uid}/privateModelKeys/${data.connectionId}`),prior=await tx.get(ref);
     if(prior.exists?(prior.get('provider')!=='personal-gemini'||prior.get('revision')!==data.revision):data.revision!==null)fail('failed-precondition','This connection changed on another device. Reopen its settings.');
     tx.set(secret,{schemaVersion:1,revision,...encrypted,updatedAt:timestamp()});
     tx.set(ref,{schemaVersion:1,provider:'personal-gemini',model:data.model,revision,allowPersonal:data.allowPersonal,updatedAt:timestamp()});
    });
    return {connectionId:data.connectionId,revision,model:data.model,allowPersonal:data.allowPersonal};
   }
   const saved=await credential(uid,data.connectionId,data.revision);
   if(data.operation==='delete'){
    await db.runTransaction(async tx=>{const current=await tx.get(saved.ref);if(current.get('revision')!==data.revision)fail('failed-precondition','This connection changed on another device. Reopen its settings.');tx.delete(saved.ref);tx.delete(saved.secret);});
    return {deleted:true};
   }
   if(!id(data.requestId)||typeof data.system!=='string'||!data.system.trim()||data.system.length>5000||![600,1000,4000].includes(data.max))fail('invalid-argument','The inference request is invalid.');
   const stream=`users/${uid}/streams/v1`,source=await db.doc(`${stream}/events/${data.requestId}`).get(),p=source.get('payload');
   const photo=source.get('type')==='PhotoSummaryRequested';
   if(!(photo?source.get('schemaVersion')===4:source.get('type')==='PromptRequested'&&[23,24,25,26,27].includes(source.get('schemaVersion')))||p?.provider!=='personal-gemini'||p.connectionId!==data.connectionId||p.connectionRevision!==data.revision||p.model!==saved.metadata.get('model'))fail('permission-denied','The recorded request does not authorize this cloud connection.');
   const stillAuthorized=async()=>{
    const [control,current,setup]=await Promise.all([db.doc(`${stream}/ai/control`).get(),saved.ref.get(),db.doc(`${stream}/onboarding/control`).get()]);
    if(control.get('choicesId')!==p.choicesId||current.get('revision')!==data.revision||!photo&&(control.get('requestId')!==data.requestId||(setup.get('answersId')??null)!==p.answersId))fail('failed-precondition','The request or its sharing choices changed. The late result was discarded.');
    if(photo){const pointer=await db.doc(`${stream}/photos/${p.entryId}_${p.slot}`).get();if(pointer.get('lastEventId')!==data.requestId)fail('failed-precondition','The photo changed. The late result was discarded.');}
    const choices=await db.doc(`${stream}/events/${p.choicesId}`).get();if(!choices.get('payload.enabled')&&!photo)fail('permission-denied','Enable AI prompts before requesting a question.');
   };
   await stillAuthorized();
   let parts;
   if(photo){
    if(!saved.metadata.get('allowPersonal'))fail('failed-precondition','Review this cloud connection’s terms before sending a photo.');
    if(data.max!==1000||typeof data.image!=='string'||data.image.length>5_600_000||!/^\/9j\/[A-Za-z0-9+/=\r\n]+$/.test(data.image))fail('invalid-argument','Choose a supported JPEG photo.');
    parts=[{text:'Describe this photo.'},{inlineData:{mimeType:'image/jpeg',data:data.image}}];
   }else{
    if(typeof data.context!=='string'||data.context.length+data.system.length>160000||data.image!==undefined)fail('invalid-argument','The selected prompt context is too large or invalid.');
    if(p.contextMode==='personal'&&!saved.metadata.get('allowPersonal'))fail('failed-precondition','Review this cloud connection’s terms before sharing personal context.');
    parts=[{text:data.context}];
   }
   const result=await google(`models/${p.model}:generateContent`,saved.key,{systemInstruction:{parts:[{text:data.system}]},contents:[{role:'user',parts}],generationConfig:{candidateCount:1,maxOutputTokens:2048}});
   const candidate=result.candidates?.[0],output=candidate?.content?.parts;
   if(result.candidates?.length!==1||candidate.finishReason!=='STOP'||!Array.isArray(output)||output.some(part=>!part.thought&&typeof part.text!=='string'))fail('data-loss','The model returned an incomplete final answer.');
   const answer=finalText(output.filter(part=>!part.thought).map(part=>part.text).join(''),result.modelVersion,data.max);
   await stillAuthorized();
   return answer;
  }finally{await release();}
 };
}
