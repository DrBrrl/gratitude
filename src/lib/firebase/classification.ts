import {doc,runTransaction,serverTimestamp,getDocFromServer,type Firestore} from 'firebase/firestore';
import {CLASSIFICATION_LEASE_MS,targetKey,targetRef,isClassificationAction,type ClassificationAction,type ClassificationTarget} from '../classification.ts';
import {GENERATION,parseAction} from '../domain.ts';
import {TOPICS} from '../onboarding.ts';
import {stableJSON} from '../import-source.ts';

/** Source append plus independently rule-checked coordination heads. No inference in transactions. */
export async function appendClassification(db:Firestore,uid:string,input:ClassificationAction){
 const a=parseAction(input);if(!isClassificationAction(a))throw new Error('Invalid classification action.');
 const root=doc(db,`users/${uid}/streams/${GENERATION}`),event=(id:string)=>doc(db,`${root.path}/events/${id}`),control=doc(db,`${root.path}/classification/control`);
 const topic=(t:ClassificationTarget)=>doc(db,`${root.path}/${t.kind==='reflection'?'topics':'backupTopics'}/${t.id}`);
 return runTransaction(db,async tx=>{
  const [prior,head,c]=await Promise.all([tx.get(event(a.eventId)),tx.get(root),tx.get(control)]);
  if(prior.exists()){const d=prior.data();if(stableJSON({eventId:d.eventId,type:d.type,schemaVersion:d.schemaVersion,payload:d.payload})!==stableJSON(a))throw new Error('Action ID already used.');return {eventId:a.eventId,sequence:d.sequence,created:false};}
  const before=c.exists()?c.data():{lastEventId:null,consentId:null,batchId:null,requestId:null,provider:'gemini',model:'gemini-3.6-flash',connectionId:null,connectionRevision:null};
  if(a.payload.previousEventId!==before.lastEventId)throw new Error('Classification changed on another device. Refresh and try again.');
  const next:Record<string,unknown>={...before,lastEventId:a.eventId};
  const read=async(id:string|null)=>id?tx.get(event(id)):null;
  const setup=await tx.get(doc(db,`${root.path}/onboarding/control`));
  const answersId=setup.get('answersId')??null;
  const vocabulary=async(id:string)=>{
   if(id==='unknown'||TOPICS.some(([key])=>key===id))return true;
   const source=await read(answersId);return source?.get('type')==='OnboardingAnswersConfirmed'&&source.get('payload.customOrder')?.includes(id);
  };
  const current=async(t:ClassificationTarget)=>{
   const [item,chosen]=await Promise.all([tx.get(doc(db,`${root.path}/${t.kind==='reflection'?'entries':'backups'}/${t.id}`)),tx.get(topic(t))]);
   const source=t.kind==='reflection'?await read(item.get('lastEventId')??null):await read(t.id);
   const previous=await read(chosen.get('lastEventId')??null);
   let available=!!source?.exists();
   if(t.kind==='reflection')available=available&&source!.get('payload.expectedRevision')+1===t.revision;
   else {const removal=await read(item.get('lastEventId')??null);available=available&&['BackupPromptImported','PromptResponseReceived'].includes(source!.get('type'))&&removal?.get('type')!=='BackupPromptRemoved';}
   return {matches:available&&(chosen.get('lastEventId')??null)===t.previousTopicId,manual:previous?.get('type')==='ReflectionTopicChosen'||previous?.get('type')==='BackupTopicChosen'};
  };
  let assignment:ClassificationTarget|null=null;
  let itemWrite:{path:string;data:Record<string,unknown>}|null=null;
  let batchWrite:{id:string;status:string}|null=null;
  let claimWrite:{id:string;data:Record<string,unknown>}|null=null;
  if(a.type==='ClassificationConsentChosen')Object.assign(next,{consentId:a.eventId,provider:a.payload.provider,model:a.payload.model,connectionId:a.payload.connectionId,connectionRevision:a.payload.connectionRevision});
  if(a.type==='ClassificationBatchRequested'){
   const consent=await read(before.consentId);
   if(!consent?.get('payload.enabled')||before.consentId!==a.payload.consentId||a.payload.answersId!==answersId)throw new Error('Classification consent or topics changed.');
   next.batchId=a.eventId;batchWrite={id:a.eventId,status:'running'};
  }
  if(a.type==='ClassificationBatchControlled'){
   if(before.batchId!==a.payload.batchId)throw new Error('This batch is no longer current.');
   batchWrite={id:a.payload.batchId,status:a.payload.operation==='cancel'?'cancelled':a.payload.operation==='pause'?'paused':'running'};
  }
  if(a.type==='ClassificationRequested'){
   const p=a.payload,[batch,status,consent,pending]=await Promise.all([read(p.batchId),tx.get(doc(db,`${root.path}/classificationBatches/${p.batchId}`)),read(before.consentId),read(before.requestId)]);
   const snapshot=batch?.get('payload');
   if(before.batchId!==p.batchId||status.get('status')!=='running'||!consent?.get('payload.enabled')||snapshot?.consentId!==before.consentId||snapshot?.answersId!==answersId||snapshot.targets[targetKey(p.target)]!==targetRef(p.target))throw new Error('Classification consent, topics or batch changed.');
   if(pending&&Date.now()-pending.get('recordedAt').toMillis()<CLASSIFICATION_LEASE_MS)throw new Error('Classification is still running. Wait before retrying.');
   const state=await current(p.target);if(!state.matches||state.manual)throw new Error('This item or its manual category changed. Start a new batch.');
   const itemPath=`${root.path}/classificationItems/${p.batchId}_${p.target.kind}_${p.target.id}`;
   const previous=await tx.get(doc(db,itemPath));
   if((previous.get('requestId')??null)!==p.retryOf||previous.get('outcome')==='classified')throw new Error('This classification was already handled.');
   next.requestId=a.eventId;itemWrite={path:itemPath,data:{requestId:a.eventId,resultId:null}};
  }
  if(a.type==='ClassificationResponseReceived'||a.type==='ClassificationFailed'){
   const p=a.payload,request=await read(p.requestId);if(request?.get('type')!=='ClassificationRequested')throw new Error('Unknown classification request.');
   const r=request.get('payload'),[batch,consent,status,settled,target]=await Promise.all([read(r.batchId),read(before.consentId),tx.get(doc(db,`${root.path}/classificationBatches/${r.batchId}`)),tx.get(doc(db,`${root.path}/classificationClaims/${p.requestId}`)),current(r.target)]);
   if(settled.get('resultId'))throw new Error('This response is already saved.');
   const b=batch!.get('payload');
   const claim=await tx.get(doc(db,`${root.path}/classificationClaims/${p.requestId}`));
   if(!claim.exists())throw new Error('This request was not claimed for dispatch.');
   if(before.consentId===b.consentId){const destination=consent!.get('payload');if(!['gemini','lm-studio'].includes(destination.provider)){const binding=await tx.get(doc(db,`users/${uid}/privateConnections/${destination.connectionId}`));if(binding.get('revision')!==destination.connectionRevision||binding.get('model')!==destination.model||binding.get('provider')!==destination.provider)throw new Error('The classification connection changed. Turn classification off before syncing this late result.');}}
   claimWrite={id:p.requestId,data:{...claim.data(),resultId:a.eventId}};
   const allowed=before.batchId===r.batchId&&before.requestId===p.requestId&&consent?.get('payload.enabled')&&b.consentId===before.consentId&&b.answersId===answersId&&status.get('status')!=='cancelled'&&target.matches&&!target.manual;
   if(a.type==='ClassificationResponseReceived'&&allowed&&await vocabulary(a.payload.text))assignment=r.target;
   if(before.requestId===p.requestId)next.requestId=null;

  }
  if(a.type==='BackupTopicChosen'){
   const p=a.payload;if(p.answersId!==answersId||!(await current(p.target)).matches||p.topicId!==null&&!await vocabulary(p.topicId))throw new Error('This backup or category changed.');
   assignment=p.target;
  }
  // All reads finish before the first write.
  const sequence=(head.get('sequence')??0)+1;
  tx.set(event(a.eventId),{...a,sequence,recordedAt:serverTimestamp()});tx.set(root,{sequence,lastEventId:a.eventId});tx.set(control,next);
  if(batchWrite)tx.set(doc(db,`${root.path}/classificationBatches/${batchWrite.id}`),{lastEventId:a.eventId,status:batchWrite.status});
  if(itemWrite)tx.set(doc(db,itemWrite.path),itemWrite.data);
  if(claimWrite)tx.set(doc(db,`${root.path}/classificationClaims/${claimWrite.id}`),claimWrite.data);
  if(assignment)tx.set(topic(assignment),{lastEventId:a.eventId});
  return {eventId:a.eventId,sequence,created:true};
 });
}
/** A request can be dispatched only by the worker that created this disposable claim. */
export async function claimClassification(db:Firestore,uid:string,requestId:string,owner:string){
 const path=`users/${uid}/streams/${GENERATION}`,claim=doc(db,`${path}/classificationClaims/${requestId}`);
 try{return await runTransaction(db,async tx=>{const previous=await tx.get(claim);if(previous.exists())return false;tx.set(doc(db,`${path}/classificationTargetClaims/${requestId}`),{owner,claimedAt:serverTimestamp()});tx.set(claim,{owner,claimedAt:serverTimestamp(),resultId:null});return true;});}
 catch(cause){if((await getDocFromServer(claim)).exists())return false;throw cause;}
}
