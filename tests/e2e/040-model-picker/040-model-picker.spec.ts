import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,expectSynced} from '../helpers/journal-session';
import {aiSettings} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
const expect=baseExpect.configure({timeout:15_000});
const SERVER='https://fictional-laptop.example.test',OTHER='https://other-fictional-laptop.example.test';
const MODEL='google/gemma-4-31b',PLAIN='local/small-model',ALIAS='loaded-vision-instance';
const TOKEN='fictional-picker-token';
const catalogue=[
 {type:'llm',key:MODEL,loaded_instances:[{id:MODEL,config:{context_length:32768}}],capabilities:{vision:true,reasoning:{allowed_options:['off','on']}}},
 {type:'llm',key:PLAIN,loaded_instances:[],capabilities:{vision:false}},
 {type:'llm',key:'local/vision',loaded_instances:[{id:ALIAS,config:{context_length:8192}}],capabilities:{vision:true}},
 {type:'llm',key:'local/thinking-only',loaded_instances:[],capabilities:{reasoning:{allowed_options:['on']}}},
 {type:'embedding',key:'local/embedding',loaded_instances:[]}
];
test('choose models discovered from the configured LM Studio instance without inference',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let discoveries=0,inferences=0,empty=false;
 await page.route(/https:\/\/(fictional-laptop|other-fictional-laptop)\.example\.test\//,async route=>{
  const request=route.request();
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'}});return;}
  expect(request.headers()['x-goog-api-key']).toBeUndefined();
  if(!request.url().endsWith('/api/v1/models')){inferences++;await route.fulfill({status:500,json:{}});return;}
  discoveries++;expect(request.method()).toBe('GET');expect(request.postData()).toBeNull();
  if(request.headers().authorization!==`Bearer ${TOKEN}`){await route.fulfill({status:401,json:{error:'Do not expose private diagnostics'}});return;}
  await route.fulfill({json:{models:empty?[]:catalogue}});
 });
 await startJournal(page,info,steps,'model-picker');
 await aiSettings(page,steps,'configure');
 await steps.action('local','Choose LM Studio',()=>page.getByLabel('AI provider',{exact:true}).selectOption('lm-studio'),async()=>{await expect(page.getByLabel('Model API identifier')).toHaveValue(MODEL);});
 await steps.action('server','Enter the model laptop’s HTTPS origin',()=>page.getByLabel('LM Studio server URL').fill(SERVER),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue('');});
 await steps.action('token','Enter the fictional server token',()=>page.getByLabel('LM Studio API token').fill(TOKEN),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);});
 await steps.action('discover','Discover models without generation or loading',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{
  const picker=page.getByRole('combobox',{name:'Model API identifier',exact:true});
  await expect(picker).toHaveValue(MODEL);await expect(picker.getByRole('option')).toHaveCount(6);
  await expect(picker.getByRole('option',{name:'local/thinking-only · thinking off unavailable',exact:true})).toBeDisabled();
  await expect(picker.getByRole('option',{name:/embedding/})).toHaveCount(0);
  await expect(page.getByText(/Connected to LM Studio/)).toContainText('32,768 tokens');expect(discoveries).toBe(1);expect(inferences).toBe(0);
 });
 await steps.action('unloaded','Choose an available unloaded text model',()=>page.getByLabel('Model API identifier').selectOption(PLAIN),async()=>{
  await expect(page.getByText(/Connected to LM Studio/)).toContainText('first request may load it. Text prompts only.');expect(discoveries).toBe(1);expect(inferences).toBe(0);
 });
 await steps.action('alias','Choose a loaded instance by its API identifier',()=>page.getByLabel('Model API identifier').selectOption(ALIAS),async()=>{
  await expect(page.getByText(/Connected to LM Studio/)).toContainText('Photo summaries supported. Loaded context: 8,192 tokens.');expect(discoveries).toBe(1);
 });
 await steps.action('manual','Return to manual API identifier entry',()=>page.getByLabel('Model API identifier').selectOption(''),async()=>{await expect(page.getByRole('textbox',{name:'Model API identifier',exact:true})).toHaveValue(ALIAS);});
 await steps.action('missing','Enter an identifier missing from this server',()=>page.getByLabel('Model API identifier').fill('local/missing'),async()=>{await expect(page.getByLabel('Model API identifier')).toHaveValue('local/missing');});
 await steps.action('recover','Retain the missing choice while offering discovered replacements',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{
  await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveValue('local/missing');await expect(page.getByRole('alert')).toContainText('selected model is not available');expect(discoveries).toBe(2);
 });
 await steps.action('replacement','Explicitly replace the missing identifier',()=>page.getByLabel('Model API identifier').selectOption(PLAIN),async()=>{await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText(/Connected to LM Studio/)).toContainText('Text prompts only.');});
 await steps.action('save','Save the chosen model without inference',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{
  await expect(page.getByText('Provider saved to your account; connection settings saved on this device.',{exact:true})).toBeVisible();await expect(page.getByLabel('Model API identifier')).toHaveValue(PLAIN);
  expect(inferences).toBe(0);expect(JSON.stringify(await selectionLog(page))).not.toContain(TOKEN);
 });
 await steps.action('reload','Restore the saved identifier without fetching a catalogue',()=>page.reload(),async()=>{await expectSynced(page);expect(discoveries).toBe(2);});
 await aiSettings(page,steps,'restored');
 await steps.step('saved-model','Keep the chosen model and token after reload',[{description:'The device restores the literal chosen identifier without automatic discovery or inference',check:async()=>{
  await expect(page.getByRole('textbox',{name:'Model API identifier',exact:true})).toHaveValue(PLAIN);await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);expect(discoveries).toBe(2);expect(inferences).toBe(0);
 }}]);
 await steps.action('refresh','Explicitly refresh the server catalogue',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveValue(PLAIN);expect(discoveries).toBe(3);});
 await steps.action('switch-server','Clear discovered models and the token on a destination change',()=>page.getByLabel('LM Studio server URL').fill(OTHER),async()=>{
  await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveCount(0);await expect(page.getByLabel('LM Studio API token')).toHaveValue('');expect(discoveries).toBe(3);
 });
 await steps.action('auth-required','Keep old models unavailable when the new server rejects authentication',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{
  await expect(page.getByRole('alert')).toContainText('needs a valid API token');await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveCount(0);expect(discoveries).toBe(4);
 });
 await steps.action('new-token','Enter a token for the new destination',()=>page.getByLabel('LM Studio API token').fill(TOKEN),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);});
 empty=true;
 await steps.action('empty','Report an empty catalogue without selecting another provider',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{
  await expect(page.getByRole('alert')).toContainText('selected model is not available');await expect(page.getByLabel('AI provider',{exact:true})).toHaveValue('lm-studio');await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveCount(0);expect(discoveries).toBe(5);expect(inferences).toBe(0);
 });
 steps.generateDocs('LM Studio model picker','Discover fictional language models and loaded aliases from the selected server using authenticated metadata only. Pick text or vision models, keep manual identifiers, recover an unavailable choice, save/reload the selection and invalidate the catalogue when switching servers. Thinking-only models are disabled. Each action has an unmasked full-page zero-pixel screenshot comparison with checks beneath its image; no model loading or inference occurs.');
});
