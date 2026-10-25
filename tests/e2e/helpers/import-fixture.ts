import { expect, type Page } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { archiveFixture } from '../../fixtures/import-journal.mjs';
import { parseImportArchive } from '../../../src/lib/import-archive';
import { TestStepHelper } from './test-step-helper';
import { navigate } from './journal-session';
export const fixture=archiveFixture();
export const zip={name:'fictional-gratitude.zip',mimeType:'application/zip',buffer:Buffer.from(fixture.bytes)};
export async function openImport(page:Page, steps:TestStepHelper, id:string) {
  await navigate(page,steps,`${id}-settings`,'Settings');
  await steps.action(`${id}-import`,'Open the private journal importer',()=>page.getByRole('button',{name:/^Import journal/}).click(),async()=>{
    await expect(page.getByRole('heading',{name:'Import journal',exact:true})).toBeVisible();
    await expect(page.getByLabel('Choose journal ZIP')).toBeEnabled();
  });
}
export async function selectArchive(page:Page, steps:TestStepHelper, id:string, file=zip) {
  await steps.action(id,'Check the selected fictional ZIP before importing',()=>page.getByLabel('Choose journal ZIP').setInputFiles(file),async()=>{
    await expect(page.getByRole('region',{name:'Import preview'})).toBeVisible({timeout:15_000});
    await expect(page.getByRole('status')).not.toContainText('Checking');
  });
}
export async function decodedImages(page:Page, count:number) {
  const images=page.locator('.photo-image img');await expect(images).toHaveCount(count,{timeout:15_000});
  await expect.poll(()=>images.evaluateAll(nodes=>nodes.every(n=>(n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth>0))).toBe(true);
  await images.evaluateAll(nodes=>Promise.all(nodes.map(n=>(n as HTMLImageElement).decode())));
}
export async function uidFor(page:Page) {
  return page.evaluate(async()=>{
    const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))?.name;
    if(!name)throw new Error('Missing signed-in database');return name.split(':').at(-2)!;
  });
}
/** Raw pending source event and corrupt asset simulate a lost connection, never seeded projected state. */
export async function pendingImportFixture(page:Page, corrupt:boolean) {
  const uid=await uidFor(page), archive=await parseImportArchive(new Blob([new Uint8Array(fixture.bytes)]),new Date('2026-10-01T04:31:07Z'));
  const plan=archive.records[0];
  const env=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080},storage:{host:'127.0.0.1',port:19199}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),root=`users/${uid}/streams/v1`,batch=writeBatch(db);
    batch.set(doc(db,`${root}/events/${plan.confirmationId}`),{eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,sequence:1,recordedAt:Timestamp.fromDate(new Date('2026-10-01T04:31:07Z')),payload:plan.input});
    batch.set(doc(db,root),{sequence:1,lastEventId:plan.confirmationId});
    batch.set(doc(db,`${root}/imports/${plan.input.sourceKey}`),{confirmationId:plan.confirmationId,lastEventId:plan.confirmationId});
    await batch.commit();
    if(corrupt)await uploadBytes(ref(context.storage('demo-gratitude.firebasestorage.app'),`users/${uid}/v1/${plan.input.attachments[0].photoId}`),fixture.jpeg,{contentType:'image/jpeg',customMetadata:{importSourceKey:plan.input.sourceKey,sourceDigest:plan.input.attachments[0].sourceDigest,storedDigest:'0'.repeat(64)}});
  });
  await env.cleanup();
  return async()=>{
    const repair=await initializeTestEnvironment({projectId:'demo-gratitude',storage:{host:'127.0.0.1',port:19199}});
    try{await repair.withSecurityRulesDisabled(context=>deleteObject(ref(context.storage('demo-gratitude.firebasestorage.app'),`users/${uid}/v1/${plan.input.attachments[0].photoId}`)));}finally{await repair.cleanup();}
  };
}
