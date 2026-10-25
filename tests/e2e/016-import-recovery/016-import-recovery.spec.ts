import { expect,test } from '@playwright/test';
import { archiveFixture } from '../../fixtures/import-journal.mjs';
import { TestStepHelper } from '../helpers/test-step-helper';
import { expectSynced,navigate,startJournal } from '../helpers/journal-session';
import { decodedImages,openImport,pendingImportFixture,selectArchive } from '../helpers/import-fixture';

test('resume a pending import explicitly, reject corrupt photos and changed source records',async({page},info)=>{
  test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(240_000);
  const steps=new TestStepHelper(page,info);
  await startJournal(page,info,steps,'import-recovery');
  const repair=await pendingImportFixture(page,true);
  await openImport(page,steps,'pending');await selectArchive(page,steps,'preview');
  const preview=page.getByRole('region',{name:'Import preview'});
  const value=(label:string)=>preview.locator('dl div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
  await steps.step('pending','Recover a server-confirmed import without starting automatically',[{description:'One pending record and two new records require explicit resume',check:async()=>{
    await expect(value('Ready to resume')).toHaveText('1');await expect(value('New entries')).toHaveText('2');await expect(page.getByRole('button',{name:'Resume import',exact:true})).toBeDisabled();
  }}]);
  await steps.action('reload','Reload while the import is still unconfirmed',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();});
  await openImport(page,steps,'recovery');
  await steps.step('restored','Recover the private ZIP selection on this device',[{description:'The ZIP and pending receipt reopen, but no import runs on reload',check:async()=>{
    await expect(value('Ready to resume')).toHaveText('1');await expect(value('Already imported')).toHaveText('0');await expect(page.getByRole('checkbox',{name:/Import into/})).not.toBeChecked();
  }}]);
  await steps.action('account','Confirm this account before resuming',()=>page.getByRole('checkbox',{name:/Import into/}).check(),async()=>{await expect(page.getByRole('button',{name:'Resume import',exact:true})).toBeEnabled();});
  await steps.action('integrity','Stop on a corrupt stored photo without overwriting it',()=>page.getByRole('button',{name:'Resume import',exact:true}).click(),async()=>{
    await expect(page.getByRole('alert')).toHaveText('An existing import photo failed its integrity check. Nothing was overwritten.',{timeout:15_000});await expect(value('Already imported')).toHaveText('0');await expect(value('Ready to resume')).toHaveText('1');
  });
  // Remove only the deliberately corrupt synthetic emulator object; a user cannot repair it by overwriting.
  await repair();
  await steps.action('reconfirm','Confirm a retry after the corrupt test object is removed',()=>page.getByRole('checkbox',{name:/Import into/}).check(),async()=>{await expect(page.getByRole('button',{name:'Resume import',exact:true})).toBeEnabled();});
  let releaseUpload!:()=>void, uploadHeld=false;
  const heldUpload=new Promise<void>(resolve=>releaseUpload=resolve);
  await page.context().route('http://127.0.0.1:19199/**',async route=>{
    if(route.request().method()==='POST' && !uploadHeld){uploadHeld=true;await heldUpload;}
    await route.continue();
  });
  await steps.action('start-resume','Resume and show progress during a photo upload',()=>page.getByRole('button',{name:'Resume import',exact:true}).click(),async()=>{
    await expect.poll(()=>uploadHeld).toBe(true);await expect(page.getByRole('button',{name:'Pause import',exact:true})).toBeEnabled();await expect(value('Ready to resume')).toHaveText('1');
  });
  await steps.action('pause','Pause after the current upload operation',()=>page.getByRole('button',{name:'Pause import',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Pausing after this operation…',exact:true})).toBeDisabled();});
  releaseUpload();
  await steps.step('paused','Retain the pending receipt and uploaded photo for recovery',[{description:'Import stops without completing the photo-only entry and requires renewed confirmation',check:async()=>{
    await expect(page.locator('.message[role=status]')).toHaveText('Import paused. Saved entries stay in your journal. Resume when you are ready.');await expect(value('Already imported')).toHaveText('0');await expect(page.getByRole('checkbox',{name:/Import into/})).not.toBeChecked();
  }}]);
  await steps.action('confirm-resume','Confirm continued import after pausing',()=>page.getByRole('checkbox',{name:/Import into/}).check(),async()=>{await expect(page.getByRole('button',{name:'Resume import',exact:true})).toBeEnabled();});
  await steps.action('resume','Finish the same pending import without duplicate records',()=>page.getByRole('button',{name:'Resume import',exact:true}).click(),async()=>{
    await expect(page.locator('.message[role=status]')).toHaveText('Import complete. Your entries and photos are saved.',{timeout:30_000});await expect(value('Already imported')).toHaveText('3');await expectSynced(page);
  });
  const changed=archiveFixture({changes:{1:{noteText:'Changed source writing.'}}});
  await steps.action('conflict','Reject changed source input under an existing source identity',()=>page.getByLabel('Choose journal ZIP').setInputFiles({name:'changed-fictional-gratitude.zip',mimeType:'application/zip',buffer:Buffer.from(changed.bytes)}),async()=>{
    await expect(value('Conflicts')).toHaveText('1');await expect(page.getByRole('alert')).toContainText('Some source records changed');await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Resume import',exact:true})).toHaveCount(0);
  });
  await steps.action('forget','Forget this device’s ZIP selection without deleting saved entries',()=>page.getByRole('button',{name:'Forget selected ZIP on this device',exact:true}).click(),async()=>{await expect(preview).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);});
  await navigate(page,steps,'settings','Settings');
  await steps.action('privacy','Open journal recovery',()=>page.getByRole('button',{name:/^Privacy & data/}).click(),async()=>{await expect(page.getByRole('button',{name:'Rebuild local view',exact:true})).toBeVisible();});
  await steps.action('rebuild','Replay import receipts and entries without the ZIP or AI',()=>page.getByRole('button',{name:'Rebuild local view',exact:true}).click(),async()=>{await expectSynced(page);});
  await steps.action('journal','Read all imported entries after complete replay',()=>page.getByRole('navigation').getByRole('button',{name:'Journal',exact:true}).click(),async()=>{
    await expect(page.locator('article.card')).toHaveCount(3);await expect(page.locator('article.card').nth(1)).toContainText('A fictional reflection 2.');await expect(page.locator('article.card').filter({hasText:'Changed source writing.'})).toHaveCount(0);await decodedImages(page,1);
  });
  await openImport(page,steps,'after-forget');
  await steps.step('forgotten','Keep the source ZIP off this device after forgetting it',[{description:'Saved entries remain, but local archive recovery has been cleared',check:async()=>{await expect(preview).toHaveCount(0);await expect(page.getByLabel('Choose journal ZIP')).toBeEnabled();}}]);
  await selectArchive(page,steps,'reselect');
  await steps.step('receipt-recovery','Recognize completed imports using the server history',[{description:'Reselecting the original ZIP shows three completed entries and no writes to resume',check:async()=>{await expect(value('Already imported')).toHaveText('3');await expect(value('New entries')).toHaveText('0');await expect(value('Ready to resume')).toHaveText('0');}}]);
  steps.generateDocs('Recover an interrupted journal import','A raw source-event fixture represents a lost connection. Reload restores the private ZIP but never starts import automatically. Explicit resume rejects a corrupt stored photo, then completes after the deliberately corrupt emulator object is removed. Changed source records cannot overwrite saved writing. Full replay and reselect work without duplicate entries or AI. Every user action has an unmasked, full-page screenshot at zero pixel tolerance and checks below the image.');
});
