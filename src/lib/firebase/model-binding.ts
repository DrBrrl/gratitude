import {doc,getDocFromServer,setDoc,serverTimestamp,type Firestore} from 'firebase/firestore';
import {isExternalProvider,validConnectionId,externalTarget,type ExternalTarget,type ModelConnection} from '../ai/connection-contract.ts';

/** Opaque revisions pin a request without placing destinations or secrets in journal events. */
export async function saveModelBinding(db:Firestore,uid:string,input:ModelConnection):Promise<ModelConnection>{
  if(!isExternalProvider(input.provider))return input;
  if(input.provider==='personal-gemini'){
    await checkModelBinding(db,uid,externalTarget(input));
    return input;
  }
  const connectionId=validConnectionId(input.connectionId)?input.connectionId:crypto.randomUUID();
  const connectionRevision=crypto.randomUUID();
  await setDoc(doc(db,`users/${uid}/privateConnections/${connectionId}`),{schemaVersion:1,provider:input.provider,model:input.model,revision:connectionRevision,updatedAt:serverTimestamp()});
  return {...input,connectionId,connectionRevision};
}
export async function checkModelBinding(db:Firestore,uid:string,target:Pick<ExternalTarget,'provider'|'model'|'connectionId'|'connectionRevision'>){
  if(!validConnectionId(target.connectionId)||!validConnectionId(target.connectionRevision))throw new Error('Save this model connection before generating.');
  const value=await getDocFromServer(doc(db,`users/${uid}/privateConnections/${target.connectionId}`));
  if(value.get('provider')!==target.provider||value.get('model')!==target.model||value.get('revision')!==target.connectionRevision)throw new Error('Model connection changed or was removed. Review its settings before retrying.');
}
