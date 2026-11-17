import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,STARTER_ID,type SourceAction,type JournalEvent} from '../../src/lib/domain.ts';
import {unknownTargets} from '../../src/lib/unknown-review.ts';
import {importedBackup} from '../../src/lib/backup-prompts.ts';
const at='2026-10-01T04:31:07.000Z';
const events=(actions:SourceAction[]):JournalEvent[]=>actions.map((a,i)=>({...a,sequence:i+1,recordedAt:at}));
test('Unknown review excludes unclassified and known writing, preserves source prompts and includes edited Unknown',()=>{
 const writing=(id:string):SourceAction=>({eventId:'write_'+id,type:'ReflectionWritten',schemaVersion:6,payload:{entryId:id,expectedRevision:0,text:'A fictional memory.',promptId:STARTER_ID,promptText:null,entryAt:at,photoSlot:null}});
 const topic=(id:string,topicId:string):SourceAction=>({eventId:'topic_'+id,type:'ReflectionTopicChosen',schemaVersion:1,payload:{entryId:id,expectedRevision:1,previousEventId:null,answersId:null,topicId}});
 const log=events([writing('unknown'),writing('known'),writing('unclassified'),topic('unknown','unknown'),topic('known','music'),{...writing('unknown'),eventId:'edit',payload:{...writing('unknown').payload,expectedRevision:1,text:'A changed memory.'}} as SourceAction]);
 const state=replay(log);assert.deepEqual(unknownTargets(state,'reflection').map(t=>[t.id,t.revision]),[['unknown',2]]);assert.equal(state.entries[0].prompt,replay(log.slice(0,3)).entries[0].prompt);
});
test('backup review never resurrects removed, consumed or pending-removal questions',async()=>{
 const imported=await importedBackup('A fictional question?');
 const chosen:SourceAction={eventId:'topic',type:'BackupTopicChosen',schemaVersion:1,payload:{previousEventId:null,target:{kind:'backup',id:imported.eventId,revision:1,previousTopicId:null},answersId:null,topicId:'unknown'}};
 const state=replay(events([imported,chosen]));assert.equal(unknownTargets(state,'backup').length,1);assert.equal(unknownTargets(state,'backup',[imported.eventId]).length,0);
 const removed:SourceAction={eventId:'remove',type:'BackupPromptRemoved',schemaVersion:1,payload:{promptId:imported.eventId}};assert.equal(unknownTargets(replay(events([imported,chosen,removed])),'backup').length,0);
 const used:SourceAction={eventId:'write',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:'entry',expectedRevision:0,text:'A memory.',promptId:imported.eventId,promptText:null,entryAt:at,photoSlot:null}};assert.equal(unknownTargets(replay(events([imported,chosen,used])),'backup').length,0);
});
