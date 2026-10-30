import {test,expect as baseExpect,type Route} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,signIn,expectSynced,FIXTURE_TIME} from '../helpers/journal-session';
import {aiSettings} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
const expect=baseExpect.configure({timeout:15_000});
const TOKEN='fictional-synced-token',SERVER='https://fictional-model.example.test',MODEL='google/gemma-4-31b';
test('an optional account token restores its bound connection across devices and can be forgotten',async({page,browser},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let discoveries=0;
 const routeModel=async(route:Route)=>{
  expect(route.request().url()).toBe(`${SERVER}/api/v1/models`);
  expect(route.request().headers().authorization).toBe(`Bearer ${TOKEN}`);discoveries++;
  await route.fulfill({json:{models:[{type:'llm',key:MODEL,capabilities:{vision:true},loaded_instances:[{id:MODEL,config:{context_length:32768}}]}]}});
 };
 await page.route(`${SERVER}/**`,routeModel);
 await startJournal(page,info,steps,'account-token');
 await aiSettings(page,steps,'configure');
 await steps.action('local','Choose a local model without authorizing inference',()=>page.getByLabel('AI provider',{exact:true}).selectOption('lm-studio'),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue('');});
 await steps.action('server','Set the shared private HTTPS server address',()=>page.getByLabel('LM Studio server URL').fill(SERVER),async()=>{await expect(page.getByLabel('LM Studio server URL')).toHaveValue(SERVER);});
 await steps.action('token','Enter a fictional token in the password field',()=>page.getByLabel('LM Studio API token').fill(TOKEN),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);});
 await steps.action('save-model','Save the local provider and tab-only connection',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText('Provider saved to your account; connection settings saved on this device.',{exact:true})).toBeVisible();});
 await steps.action('sync-options','Review optional account storage and its trust boundary',()=>page.getByText('Account token sync',{exact:true}).click(),async()=>{await expect(page.getByText(/Firebase project administrators and this app can access/)).toBeVisible();await expect(page.getByRole('button',{name:'Remember token in my account',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Forget saved token',exact:true})).toHaveCount(0);});
 await steps.action('remember','Explicitly save the token with its server and model to this account',()=>page.getByRole('button',{name:'Remember token in my account',exact:true}).click(),async()=>{await expect(page.getByText('Token and server connection saved to your account.',{exact:true})).toBeVisible();await expect(page.getByText('A connection is saved to your account.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Forget saved token',exact:true})).toBeEnabled();expect(discoveries).toBe(0);expect(JSON.stringify(await selectionLog(page))).not.toContain(TOKEN);expect(await page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('fictional-synced-token')))).toBe(false);});
 const context=await browser.newContext({...info.project.use,baseURL:String(info.project.use.baseURL)});
 const other=await context.newPage();
 try{
  await other.clock.setFixedTime(new Date(FIXTURE_TIME));await other.route(`${SERVER}/**`,routeModel);steps.setPage(other);
  await steps.action('new-device','Open Gratitude on an independent browser device',()=>other.goto('./journal/'),async()=>{await expect(other.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
  await signIn(other,info,steps,'account-token',true);
  await aiSettings(other,steps,'restored');
  await steps.step('restored-connection','Restore the exact bound connection without entering the token again',[{description:'The signed-in owner receives the saved HTTPS address, model and password-field token without inference',check:async()=>{await expect(other.getByLabel('LM Studio server URL')).toHaveValue(SERVER);await expect(other.getByLabel('Model API identifier')).toHaveValue(MODEL);await expect(other.getByLabel('LM Studio API token')).toHaveValue(TOKEN);expect(discoveries).toBe(0);}}]);
  await steps.action('test-restored','Test authenticated metadata using the restored token',()=>other.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(other.getByText(/Connected to LM Studio/)).toBeVisible();expect(discoveries).toBe(1);});
  await steps.action('change-server','Clear the token when editing its server destination',()=>other.getByLabel('LM Studio server URL').fill('https://different-fictional-model.example.test'),async()=>{await expect(other.getByLabel('LM Studio API token')).toHaveValue('');expect(discoveries).toBe(1);});
  await steps.action('reload','Reload without saving the different destination',()=>other.reload(),async()=>{await expectSynced(other);});
  await aiSettings(other,steps,'after-reload');
  await steps.step('reload-pair','Restore the account token only with its saved server',[{description:'Reload restores the authorized pair, never the unsaved destination',check:async()=>{await expect(other.getByLabel('LM Studio server URL')).toHaveValue(SERVER);await expect(other.getByLabel('LM Studio API token')).toHaveValue(TOKEN);}}]);
  steps.setPage(page);
  await steps.action('forget','Forget the saved credential from the first device',()=>page.getByRole('button',{name:'Forget saved token',exact:true}).click(),async()=>{await expect(page.getByText(/Saved token forgotten\. Connected devices clear it/)).toBeVisible();await expect(page.getByLabel('LM Studio API token')).toHaveValue('');await expect(page.getByRole('button',{name:'Forget saved token',exact:true})).toHaveCount(0);});
  steps.setPage(other);
  await steps.step('remote-forget','Clear the credential on the other connected device',[{description:'Account deletion clears the active password field and tab storage without changing the provider',check:async()=>{await expect(other.getByLabel('LM Studio API token')).toHaveValue('');await expect(other.getByLabel('AI provider',{exact:true})).toHaveValue('lm-studio');expect(await other.evaluate(()=>Object.values(sessionStorage).some(value=>value.includes('fictional-synced-token')))).toBe(false);expect(JSON.stringify(await selectionLog(other))).not.toContain(TOKEN);expect(discoveries).toBe(1);}}]);
  await steps.action('reload-forgotten','Keep the token forgotten after another reload',()=>other.reload(),async()=>{await expectSynced(other);});
  await aiSettings(other,steps,'forgotten');
  await steps.step('no-token','Require a new token after deletion',[{description:'No deleted credential is restored and no model inference occurred',check:async()=>{await expect(other.getByLabel('LM Studio API token')).toHaveValue('');expect(discoveries).toBe(1);}}]);
 }finally{await context.close();steps.setPage(page);}
 steps.generateDocs('Optional account-synced LM Studio token','Explicitly remember a fictional token and its server/model, restore them on an independent device without re-entry, test metadata, clear tokens on destination edits, and forget the saved credential across connected devices. Credentials stay outside journal events and persistent device preferences. Offline copies require LM Studio revocation to disable immediately. Every action has an unmasked full-page zero-pixel screenshot comparison, with checks beneath.');
});
