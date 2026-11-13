import {test,expect as baseExpect,type Page} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate,expectSynced} from '../helpers/journal-session';
import {stageBackupQuestions} from '../helpers/backup-staging';
import {AI_ENDPOINT,FIRST_PROMPT,respond,aiSettings,toggleAI,saveChoices} from '../helpers/gemini';
const expect=baseExpect.configure({timeout:15_000});
async function layout(page:Page,ai:boolean){
 const response=page.getByRole('button',{name:'Write a response',exact:true});
 const starter=page.getByRole('button',{name:'Another starter prompt',exact:true});
 const backup=page.getByRole('button',{name:'Choose a backup prompt (98)',exact:true});
 const [a,b,c]=await Promise.all([response.boundingBox(),starter.boundingBox(),backup.boundingBox()]);
 expect(a&&b&&c).toBeTruthy();if(!a||!b||!c)throw new Error('Missing Today controls');
 expect(Math.abs(b.y-c.y)).toBeLessThan(1);expect(Math.abs(b.height-c.height)).toBeLessThan(1);
 expect(b.height).toBeGreaterThanOrEqual(44);expect(b.height).toBeLessThan(a.height);
 expect(c.x-(b.x+b.width)).toBeGreaterThanOrEqual(7.9);expect(Math.abs(c.x+c.width-a.x-a.width)).toBeLessThan(1);expect(Math.abs(b.x-a.x)).toBeLessThan(1);
 expect(b.y).toBeGreaterThan(a.y+a.height);
 if(ai){const generate=await page.locator('.ai-generate').boundingBox();expect(generate).toBeTruthy();if(!generate)throw new Error('Missing AI control');expect(Math.abs(generate.width-a.width)).toBeLessThan(1);expect(generate.y).toBeGreaterThan(a.y+a.height);expect(generate.y+generate.height).toBeLessThanOrEqual(b.y);}
 else await expect(page.locator('.ai-generate')).toHaveCount(0);
}
test('Today groups smaller starter and backup buttons beneath the full-width writing and optional AI actions',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let requests=0;
 await page.route(AI_ENDPOINT,async route=>{requests++;await respond(route);});
 await startJournal(page,info,steps,'today-buttons');
 await stageBackupQuestions(page,Array.from({length:98},(_,i)=>`What fictional everyday detail ${i+1} brought you joy?`));
 await steps.action('backups','Restore ninety-eight fictional backup prompts with AI switched off',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.getByRole('button',{name:'Choose a backup prompt (98)',exact:true})).toBeVisible({timeout:180_000});await expectSynced(page);await layout(page,false);expect(requests).toBe(0);});
 const original=(await page.locator('.daily-prompt h2').textContent())!;
 await steps.action('starter','Choose another starter from the smaller left button',()=>page.getByRole('button',{name:'Another starter prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).not.toHaveText(original);await layout(page,false);expect(requests).toBe(0);});
 await steps.action('open-backups','Open the reserve from the smaller right button',()=>page.getByRole('button',{name:'Choose a backup prompt (98)',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Saved backup prompts'})).toBeVisible();const panel=await page.locator('.backup-picker aside').boundingBox(),row=await page.locator('.today-prompt-options').boundingBox();expect(panel&&row).toBeTruthy();expect(Math.abs(panel!.width-row!.width)).toBeLessThan(1);await layout(page,false);expect(requests).toBe(0);});
 await steps.action('close-backups','Close the reserve without consuming a prompt',()=>page.getByRole('button',{name:'Choose a backup prompt (98)',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Saved backup prompts'})).toHaveCount(0);await layout(page,false);});
 await aiSettings(page,steps,'configure');await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'save');
 await navigate(page,steps,'ai-today','Today');
 await steps.step('ai-layout','Place full-width AI generation above the smaller prompt choices',[{description:'Write a response and Generate a prompt span the card width; starter and backup buttons share the next row',check:async()=>{await layout(page,true);expect(requests).toBe(0);}}]);
 await steps.action('generate','Generate a prompt using the full-width middle button',()=>page.getByRole('button',{name:'Generate a prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT);await layout(page,true);expect(requests).toBe(1);});
 await aiSettings(page,steps,'disable');await toggleAI(page,steps,'turn-off',false);await saveChoices(page,steps,'save-off');await navigate(page,steps,'off-today','Today');
 await steps.step('off-layout','Keep the compact prompt choices when AI is disabled',[{description:'The generation button is absent and all ninety-eight backups remain available beside Another starter prompt',check:async()=>{await layout(page,false);expect(requests).toBe(1);}}]);
 steps.generateDocs('Today button layout with and without AI','Matches Jamie’s Today Page buttons presentation: full-width writing, optional full-width AI generation, then a smaller side-by-side starter and backup row. The reserve opens across the full row, closes without consumption, and existing starter and AI actions still work. Every action has an unmasked zero-pixel screenshot with checks underneath. Provider responses and backup prompts are fictional.');
});
