import type {Page} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,writeBatch} from 'firebase/firestore';
import {importedBackup} from '../../../src/lib/backup-prompts';
/** Fictional raw source input only; never a private workbook or a projected reserve. */
export async function stageBackupQuestions(page:Page,questions:string[]) {
 const uid=await page.evaluate(async()=>{const database=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'));if(!database?.name)throw new Error('Missing fictional journal');return database.name.split(':').at(-2)!;});
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 try{await environment.withSecurityRulesDisabled(async context=>{const db=context.firestore(),batch=writeBatch(db);for(const question of questions){const action=await importedBackup(question);batch.set(doc(db,`users/${uid}/backupPromptImports/${action.eventId}`),action.payload);}await batch.commit();});}finally{await environment.cleanup();}
}
