import {test,expect as baseExpect,type Locator} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,openEditor,editor,expectSynced,expectDecodedPhotos} from '../helpers/journal-session';
const expect=baseExpect.configure({timeout:15000});
async function portrait(image:Locator){
 await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0&&img.classList.contains('portrait'))).toBe(true);
 const sizes=await image.evaluate((img:HTMLImageElement)=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}));
 expect(sizes.naturalHeight).toBeGreaterThan(sizes.naturalWidth);
 expect(sizes.height/sizes.width).toBeCloseTo(sizes.naturalHeight/sizes.naturalWidth,2);
}
test('portrait attachments retain their whole natural frame in previews, saved entries, journal cards and editing',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});
 await startJournal(page,info,steps,'portrait-photos');await openEditor(page,steps,'editor');
 await steps.action('write','Write a fictional reflection',()=>editor(page).fill('The colours at the top and bottom belong with the whole picture.'),async()=>{await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();});
 await steps.action('select','Preview the whole portrait, including both coloured ends',()=>page.getByLabel('Add photo',{exact:true}).setInputFiles('tests/fixtures/portrait-colour-study.png'),async()=>{await portrait(page.getByRole('img',{name:'Attachment preview',exact:true}));});
 await steps.action('attach','Attach a portrait without requesting AI',()=>page.getByRole('button',{name:'Attach without AI',exact:true}).click(),async()=>{await expect(page.getByRole('img',{name:'Attachment preview',exact:true})).toHaveCount(0);await expectDecodedPhotos(page,1);await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.action('save','Save the full portrait with the reflection',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection saved',exact:true})).toBeVisible();await expectSynced(page);await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.action('journal','Keep the portrait proportions in the journal thumbnail',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expectDecodedPhotos(page,1);await portrait(page.locator('.card-thumbnail img'));});
 await steps.action('view','View the complete portrait beside the entry',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.action('edit','Keep the full portrait when editing',()=>page.getByRole('button',{name:'Edit reflection',exact:true}).click(),async()=>{await expect(editor(page)).toContainText('The colours at the top');await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.action('reload','Recover the portrait after reload',()=>page.reload(),async()=>{await expectSynced(page);});
 await steps.action('reopen-entry','Reopen the saved portrait from the journal',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.action('resume','Return to editing the retained portrait',()=>page.getByRole('button',{name:'Edit reflection',exact:true}).click(),async()=>{await expect(editor(page)).toBeVisible();await portrait(page.locator('.photo-card .photo-image img'));});
 await steps.step('recovered-photo','Read the full retained portrait after restoring the editor',[{description:'The decoded image frame still matches its intrinsic portrait proportions',check:async()=>{await portrait(page.locator('.photo-card .photo-image img'));}}]);
 steps.generateDocs('Whole portrait photographs','A deterministic fictional portrait has distinct top and bottom colour bands. Its preview and every attached-image display retain the intrinsic portrait ratio, including journal thumbnails, saved/detail views and editing after reload. No AI call is needed. Every user action has a full-page unmasked zero-pixel screenshot with checks underneath.');
});
