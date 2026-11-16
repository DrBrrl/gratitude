import {sha256} from '../import-archive.ts';
import type {ClassificationDestination} from '../classification.ts';
import type {ModelConnection} from './connection-contract.ts';
/** A technical handle for the literal selected LM Studio address, never a projected category.
 * The URL and token stay out of source events. Equal server/model choices work across devices. */
export async function classificationDestination(connection:ModelConnection):Promise<ClassificationDestination>{
 if(connection.provider==='gemini')return {provider:'gemini',model:'gemini-3.6-flash',connectionId:null,connectionRevision:null};
 if(connection.provider==='lm-studio'){
  if(!connection.baseUrl.trim()||!connection.model.trim())throw new Error('Configure this LM Studio connection first.');
  return {provider:'lm-studio',model:connection.model,connectionId:'lm-studio',connectionRevision:await sha256(JSON.stringify([connection.baseUrl.replace(/\/+$/,''),connection.model]))};
 }
 return {provider:connection.provider,model:connection.model,connectionId:connection.connectionId??null,connectionRevision:connection.connectionRevision??null};
}
