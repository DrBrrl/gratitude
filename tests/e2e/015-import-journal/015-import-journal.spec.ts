import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync,strFromU8 } from 'fflate';
import { TestStepHelper } from '../helpers/test-step-helper';
import { editor,expectEditor,expectSynced,navigate,startJournal } from '../helpers/journal-session';
import { decodedImages,fixture,openImport,selectArchive,zip } from '../helpers/import-fixture';

test('import historical entries and photos, edit without losing origin and export the complete journal',async({page},info)=>{
  test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
  const steps=new TestStepHelper(page,info);let aiRequests=0;
  await page.context().route(/firebasevertexai|firebaseai|generativelanguage/,route=>{aiRequests++;return route.abort();});
  await startJournal(page,info,steps,'journal-import');await openImport(page,steps,'first');
  await steps.action('invalid','Reject an invalid ZIP without writing journal history',()=>page.getByLabel('Choose journal ZIP').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('not a zip')}),async()=>{
    await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('region',{name:'Import preview'})).toHaveCount(0);
  });
  await selectArchive(page,steps,'preview');
  const preview=page.getByRole('region',{name:'Import preview'});
  const value=(label:string)=>preview.locator('dl div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
  await steps.step('counts','Review dates, photos and the missing-prompt policy before confirmation',[{description:'Three new historical entries include one photo-only entry and two missing prompts; confirmation is required',check:async()=>{
    await expect(value('Entries')).toHaveText('3');await expect(value('Photos')).toHaveText('1');await expect(value('Photo-only entries')).toHaveText('1');await expect(value('Missing prompts → [No prompt]')).toHaveText('2');await expect(value('New entries')).toHaveText('3');await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toBeDisabled();expect(aiRequests).toBe(0);
  }}]);
  await steps.action('confirm-account','Confirm the signed-in destination account',()=>page.getByRole('checkbox',{name:/Import into/}).check(),async()=>{await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toBeEnabled();});
  await steps.action('import','Import confirmed entries and private photos without AI',()=>page.getByRole('button',{name:'Confirm import',exact:true}).click(),async()=>{
    await expect(page.locator('.message[role=status]')).toHaveText('Import complete. Your entries and photos are saved.',{timeout:30_000});await expect(value('Already imported')).toHaveText('3');await expectSynced(page);expect(aiRequests).toBe(0);
  });
  await steps.action('journal','Open the imported journal',()=>page.getByRole('navigation').getByRole('button',{name:'Journal',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your journal',exact:true})).toBeVisible();await decodedImages(page,1);});
  const cards=page.locator('article.card');
  await steps.step('entries','Read historical reflections in local date order',[{description:'Three cards retain source writing and prompts, including the photo-only reflection and placeholder',check:async()=>{
    await expect(cards).toHaveCount(3);await expect(cards.nth(0)).toContainText(fixture.records[2].noteText);await expect(cards.nth(1).locator('.entry-prompt')).toHaveText('[No prompt]');await expect(cards.nth(2)).toContainText('Photo reflection');await expect(cards.nth(2).locator('time')).toHaveText('Mon 01 Jan 2024, 3:00 PM');
  }}]);
  await steps.action('photo-entry','Open the imported photo-only reflection',()=>cards.nth(2).getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await decodedImages(page,1);await expect(page.locator('.detail .entry-prompt')).toHaveText('[No prompt]');await expect(page.locator('.detail .entry-text')).toHaveText('');});
  const photoHash=await page.locator('.photo-image img').evaluate(async node=>{
    const bytes=await (await fetch((node as HTMLImageElement).src)).arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  });
  await steps.action('back','Return to the historical journal',()=>page.locator('button.back').click(),async()=>{await expect(cards).toHaveCount(3);await decodedImages(page,1);});
  await steps.action('text-entry','Open an entry with a missing source prompt',()=>cards.nth(1).getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.detail .entry-prompt')).toHaveText('[No prompt]');});
  await steps.action('edit','Edit the imported reflection',()=>page.getByRole('button',{name:'Edit reflection',exact:true}).click(),async()=>{await expectEditor(page,fixture.records[1].noteText);});
  await steps.action('write','Change the reflection without altering its source record',()=>editor(page).fill('A newly remembered kindness.'),async()=>{await expectEditor(page,'A newly remembered kindness.');});
  await steps.action('prompt','Open prompt editing',()=>page.getByRole('button',{name:'Edit prompt',exact:true}).click(),async()=>{await expect(page.getByRole('textbox',{name:'Prompt text',exact:true})).toHaveValue('[No prompt]');});
  await steps.action('prompt-text','Write an explicit question',()=>page.getByRole('textbox',{name:'Prompt text',exact:true}).fill('Who helped me that morning?'),async()=>{await expect(page.getByRole('textbox',{name:'Prompt text',exact:true})).toHaveValue('Who helped me that morning?');});
  await steps.action('prompt-save','Keep the question in the draft',()=>page.getByRole('button',{name:'Save prompt',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Edit prompt text',exact:true})).toHaveText('Who helped me that morning?');});
  await steps.action('date','Choose a different historical local time',()=>page.getByLabel('Entry date and time').fill('2024-01-02T10:30'),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2024-01-02T10:30');});
  await steps.action('save','Save explicit changes while preserving import provenance',()=>page.getByRole('button',{name:'Save changes',exact:true}).click(),async()=>{await expect(page.locator('.saved-card')).toContainText('A newly remembered kindness.');await expectSynced(page);});
  await steps.action('done','Return to the journal with the edited entry',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(cards).toHaveCount(3);await decodedImages(page,1);});
  await openImport(page,steps,'repeat');
  await steps.step('deduplicated','Reopen the same ZIP without reimporting or overwriting edits',[{description:'All three original source records are already imported, and there is no confirmation button',check:async()=>{
    await expect(value('Already imported')).toHaveText('3');await expect(value('New entries')).toHaveText('0');await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toHaveCount(0);expect(aiRequests).toBe(0);
  }}]);
  await steps.action('reselect','Reselect the same ZIP and keep the same receipt identities',()=>page.getByLabel('Choose journal ZIP').setInputFiles(zip),async()=>{await expect(page.locator('.message[role=status]')).toHaveText('All entries in this ZIP are already imported.',{timeout:15_000});await expect(value('Already imported')).toHaveText('3');});
  await navigate(page,steps,'export-settings','Settings');
  await steps.action('export','Open journal export',()=>page.getByRole('button',{name:/^Export journal/}).click(),async()=>{await expect(page.getByRole('radio',{name:/JSON/})).toBeVisible();});
  await steps.action('json','Choose structured JSON with provenance',()=>page.getByRole('radio',{name:/JSON/}).check(),async()=>{await expect(page.getByRole('radio',{name:/JSON/})).toBeChecked();});
  await steps.action('prepare','Prepare the complete journal and private photo',()=>page.getByRole('button',{name:'Prepare export',exact:true}).click(),async()=>{await expect(page.getByRole('status')).toHaveText('Export ready',{timeout:15_000});});
  const download=page.waitForEvent('download');
  await steps.action('download','Download and verify entries, origin fields and photo bytes',()=>page.getByRole('button',{name:'Download JSON ZIP',exact:true}).click(),async()=>{
    const files=unzipSync(new Uint8Array(await readFile((await (await download).path())!)));const json=JSON.parse(strFromU8(files['gratitude-journal.json']));
    expect(json.version).toBe(3);expect(json.entries).toHaveLength(3);const entry=json.entries.find((e:{text:string})=>e.text==='A newly remembered kindness.');
    expect(entry.prompt).toBe('Who helped me that morning?');expect(entry.entryAt).toBe('2024-01-01T23:30:00.000Z');expect(entry.origin.source).toEqual(fixture.records[1]);
    const photo=json.entries.flatMap((e:{photos:unknown[]})=>e.photos??[])[0];expect(createHash('sha256').update(files[photo.path]).digest('hex')).toBe(photoHash);expect(Object.keys(files)).toHaveLength(2);expect(aiRequests).toBe(0);
  });
  await navigate(page,steps,'today','Today');
  await steps.step('historical','Leave Today available after historical import',[{description:'Historical reflections do not complete today or trigger AI generation',check:async()=>{await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeVisible();expect(aiRequests).toBe(0);}}]);
  steps.generateDocs('Import a historical journal with photos','A fictional ZIP is validated locally, confirmed for the signed-in account, imported through source events and exported with private photos and immutable provenance. Missing prompts display [No prompt]. Explicit edits survive identical reimport. Historical entries leave Today available. Every action has a full-page, unmasked screenshot comparison at zero tolerance; checks appear below each image.');
});
