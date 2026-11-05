import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {signIn,FIXTURE_TIME,expectSynced} from '../helpers/journal-session';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {replay} from '../../../src/lib/domain';
const expect=baseExpect.configure({timeout:15000});
test('starter-only setup skips AI preferences, hides sharing and supports backtracking and reload',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let inference=0;
 await page.clock.setFixedTime(new Date(FIXTURE_TIME));await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,r=>r.abort());
 await page.route(/firebasevertexai\.googleapis\.com|\/v1\/chat\/completions/,r=>{inference++;return r.abort();});
 await page.request.delete('http://127.0.0.1:19099/emulator/v1/projects/demo-gratitude/accounts');
 await steps.action('open','Open the journal before signing in',()=>page.goto('./journal/'),async()=>{await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
 await signIn(page,info,steps,'starter-setup',false,'Today',false,undefined,'',false);
 await steps.action('start','Begin optional setup',()=>page.getByRole('button',{name:'Let’s get started',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'About you',exact:true})).toBeVisible();});
 await steps.action('colour','Continue without private identity fields',()=>page.locator('.setup footer').getByRole('button',{name:'Continue',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your colour',exact:true})).toBeVisible();});
 await steps.action('ai-choice','Choose whether to use AI before any interests or prompt settings',()=>page.locator('.setup footer').getByRole('button',{name:'Continue',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Choose your AI',exact:true})).toBeVisible();await expect(page.getByRole('switch',{name:'AI prompts',exact:true})).toHaveAttribute('aria-checked','false');await expect(page.getByRole('region',{name:'AI model connection'})).toHaveCount(0);});
 await steps.action('preview-ai','See optional AI connections when enabled',()=>page.getByRole('switch',{name:'AI prompts',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'AI model connection',exact:true})).toBeVisible();});
 await steps.action('choose-starters','Collapse AI options and choose starters',()=>page.getByRole('switch',{name:'AI prompts',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'AI model connection',exact:true})).toHaveCount(0);});
 await steps.action('friends','Skip interests and prompt preferences',()=>page.locator('.setup footer').getByRole('button',{name:'Set up Later',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your friends profile',level:1,exact:true})).toBeVisible();await expect(page.locator('.setup .progress')).toHaveText('5 of 6');await expect(page.getByText('You can find your friends in Gratitude and send them little hugs to encourage them to reflect with you every day! Set up your profile now or later.',{exact:true})).toBeVisible();});
 await steps.action('back','Return directly to AI choice',()=>page.locator('.setup footer').getByRole('button',{name:'Back',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Choose your AI',exact:true})).toBeVisible();});
 await steps.action('friends-again','Keep the starter-only path',()=>page.locator('.setup footer').getByRole('button',{name:'Set up Later',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your friends profile',level:1,exact:true})).toBeVisible();});
 await steps.action('reload','Resume the starter-only route without confirming an earlier draft’s hidden AI permissions',async()=>{
  // Fixture: an earlier, unconfirmed questionnaire had sharing choices staged locally.
  await page.evaluate(async()=>{
   const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))?.name;
   if(!name)throw Error('Missing fixture journal');
   await new Promise<void>((resolve,reject)=>{const opening=indexedDB.open(name);opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{
    const db=opening.result,tx=db.transaction('outbox','readwrite'),store=tx.objectStore('outbox'),request=store.get('onboarding-draft');
    request.onsuccess=()=>{const value=request.result;if(!value){tx.abort();return;}value.answers.useAnswers=true;value.aiChoices={enabled:false,useJournal:true,useFeedback:true,guidance:'An unconfirmed fictional preference.'};store.put(value,'onboarding-draft');};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error??Error('Fixture draft write failed'));};
   };});
  });
  await page.reload();
 },async()=>{await expect(page.getByRole('heading',{name:'Your friends profile',level:1,exact:true})).toBeVisible();await expect(page.locator('.setup .progress')).toHaveText('5 of 6');await expect(page.getByLabel('Display name',{exact:true})).toBeEnabled();});
 await steps.action('review','Review the starter-only setup',()=>page.locator('.setup footer').getByRole('button',{name:'Set up Later',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Ready to reflect?',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'What informs your prompts',exact:true})).toHaveCount(0);await expect(page.getByLabel('Use my questionnaire answers for AI prompts',{exact:true})).toHaveCount(0);await expect(page.locator('.setup .progress')).toHaveText('6 of 6');});
 await steps.action('finish','Save the optional setup and keep AI off',()=>page.getByRole('button',{name:'Save and start writing',exact:true}).click(),async()=>{await expectSynced(page);await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();const state=replay(await selectionLog(page));expect(state.ai.choices.enabled).toBe(false);expect(state.ai.choices.useJournal).toBe(false);expect(state.ai.choices.useFeedback).toBe(false);expect(state.ai.choices.guidance).toBe('');expect(state.onboarding.answers.selectedTopics).toEqual([]);expect(state.onboarding.answers.useAnswers).toBe(false);expect(inference).toBe(0);});
 steps.generateDocs('Optional AI before prompt preferences','Starter-only setup hides AI connections, skips interests and scope, supports direct backtracking and resumes the shortened route. Sharing controls stay absent and no AI is enabled or contacted. Every user action has a full-page unmasked zero-pixel screenshot with checks below.');
});
