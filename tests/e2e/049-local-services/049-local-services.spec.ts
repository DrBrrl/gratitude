import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,expectSynced,navigate} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
const expect=baseExpect.configure({timeout:15000});
const SERVER='https://fictional-ollama.example.test',MODEL='fictional-text:8b',VISION='fictional-vision:8b';
test('native Ollama connection discovery, final prompts and independent photo settings preserve consent and destination bindings',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let generated=0,unauthorized=false;const sent:any[]=[];
 await page.route(SERVER+'/**',async route=>{
  const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  expect(req.headers()['x-goog-api-key']).toBeUndefined();expect(req.headers().authorization).toBeUndefined();
  if(unauthorized){await route.fulfill({status:401,headers,json:{error:'Private server details are not user-facing.'}});return;}
  const path=new URL(req.url()).pathname,body=req.postData()?req.postDataJSON():null;
  if(path==='/api/tags'){await route.fulfill({headers,json:{models:[{name:MODEL},{name:VISION},{name:'forced-thinking:8b'}]}});return;}
  if(path==='/api/ps'){await route.fulfill({headers,json:{models:[{name:MODEL,context_length:32768}]}});return;}
  if(path==='/api/show'){await route.fulfill({headers,json:{capabilities:['completion',...(body.model===VISION?['vision']:[]),...(body.model==='forced-thinking:8b'?['thinking']:[])],...(body.model==='forced-thinking:8b'?{thinking:{values:['low','high'],default:'low'}}:{})}});return;}
  expect(path).toBe('/api/chat');generated++;sent.push(body);
  expect(body.chat_template_kwargs).toBeUndefined();expect(body.reasoning_effort).toBeUndefined();expect(body.truncate).toBe(false);expect(body.shift).toBe(false);
  await route.fulfill({headers,json:{model:body.model,done:true,done_reason:'stop',message:{role:'assistant',content:'What small fictional comfort made you smile?'}}});
 });
 await startJournal(page,info,steps,'local-services');await aiSettings(page,steps,'ai');
 await steps.action('ollama','Choose the native Ollama service',()=>page.getByLabel('AI provider',{exact:true}).selectOption('ollama'),async()=>{await expect(page.getByLabel('Server address',{exact:true})).toHaveValue('http://127.0.0.1:11434');await expect(page.getByRole('button',{name:'Save model settings',exact:true})).toBeDisabled();});
 await steps.action('server','Choose a fictional private HTTPS server',()=>page.getByLabel('Server address',{exact:true}).fill(SERVER),async()=>{await expect(page.getByLabel('Proxy authentication token (optional)')).toHaveValue('');});
 await steps.action('discover','Discover Ollama metadata without sending reflections or loading models',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toBeVisible();expect(generated).toBe(0);await expect(page.getByRole('option',{name:/forced-thinking/})).toBeDisabled();});
 await steps.action('text','Choose the available text model',()=>page.getByLabel('Model API identifier',{exact:true}).selectOption(MODEL),async()=>{await expect(page.getByRole('status')).toContainText('Connected to Ollama. Model loaded. Text prompts only.');});
 await steps.action('save','Save an explicit account choice and private connection revision',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText(/Current provider: Ollama/)).toBeVisible();expect(generated).toBe(0);});
 await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'consent');
 await navigate(page,steps,'today','Today');
 await steps.action('generate','Generate a native final-text question only after the explicit request',()=>page.getByRole('button',{name:'Generate a prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText('What small fictional comfort made you smile?');expect(generated).toBe(1);const context=JSON.parse(sent[0].messages[1].content);expect(context.reflections.recent).toEqual([]);expect(context.user).toBeUndefined();});
 await aiSettings(page,steps,'photo-settings');
 await steps.action('photo-details','Open the independent photo-model choice',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(page.getByLabel('Photo description connection')).toHaveValue('prompt');});
 await steps.action('photo-ollama','Choose a separate Ollama photo connection',()=>page.getByLabel('Photo description connection').selectOption('ollama'),async()=>{await expect(page.getByRole('region',{name:'Photo model connection'})).toBeVisible();});
 const photos=page.getByRole('region',{name:'Photo model connection',exact:true});
 await steps.action('photo-server','Enter the photo model’s server independently',()=>photos.getByLabel('Server address',{exact:true}).fill(SERVER),async()=>{await expect(photos.getByLabel('Proxy authentication token (optional)')).toHaveValue('');});
 await steps.action('photo-discover','Discover photo capabilities without inference',()=>photos.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(photos.getByRole('combobox',{name:'Model API identifier'})).toBeVisible();expect(generated).toBe(1);});
 await steps.action('vision','Choose a verified vision model for photos',()=>photos.getByLabel('Model API identifier').selectOption(VISION),async()=>{await expect(photos.getByRole('status')).toContainText('Photo summaries supported.');});
 await steps.action('save-photo','Save the independent photo model without changing the prompt model',()=>photos.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'AI model connection',exact:true}).getByLabel('Model API identifier')).toHaveValue(MODEL);await expect(photos.getByRole('status')).toContainText('Photo model choice saved');});
 await steps.action('reload','Restore both literal service/model choices without generation',()=>page.reload(),async()=>{await expectSynced(page);expect(generated).toBe(1);});
 await aiSettings(page,steps,'restored');
 const promptSettings=page.getByRole('region',{name:'AI model connection',exact:true});
 await steps.action('sync-details','Inspect optional tokenless connection sync',()=>promptSettings.getByText('Account token sync',{exact:true}).click(),async()=>{await expect(promptSettings.getByRole('button',{name:'Remember connection in my account'})).toBeEnabled();await expect(promptSettings.getByText(/Native Ollama has no API token to revoke/)).toBeVisible();});
 await steps.action('remember','Explicitly remember the native server and model without inventing an API token',()=>promptSettings.getByRole('button',{name:'Remember connection in my account'}).click(),async()=>{await expect(promptSettings.getByRole('status')).toContainText('optional proxy token saved to your account');await expect(promptSettings.getByRole('button',{name:'Stop account connection sync'})).toBeVisible();expect(generated).toBe(1);});
 await steps.action('stop-sync','Stop account sync while retaining this device’s configured service',()=>promptSettings.getByRole('button',{name:'Stop account connection sync'}).click(),async()=>{await expect(promptSettings.getByRole('status')).toContainText('Account connection sync stopped');await expect(promptSettings.getByRole('button',{name:'Stop account connection sync'})).toHaveCount(0);await expect(promptSettings.getByLabel('Server address')).toHaveValue(SERVER);expect(generated).toBe(1);});
 await steps.action('bad-auth','Explain proxy authentication failures without falling back',async()=>{unauthorized=true;await page.getByRole('region',{name:'AI model connection',exact:true}).getByRole('button',{name:'Test connection',exact:true}).click();},async()=>{await expect(page.getByRole('alert')).toContainText('server rejected its authentication token');await expect(page.getByLabel('AI provider',{exact:true})).toHaveValue('ollama');expect(generated).toBe(1);});
 const log=await selectionLog(page),request=log.find(event=>event.type==='PromptRequested'&&event.schemaVersion===23);expect(request?.schemaVersion).toBe(23);expect(request?.payload.provider).toBe('ollama');expect(request?.payload.connectionId).toBeTruthy();expect(JSON.stringify(log)).not.toContain(SERVER);expect(log.filter(event=>event.type==='PromptResponseReceived')).toHaveLength(1);
 steps.generateDocs('Native Ollama connections','Discover native text/vision capabilities without inference; choose, save and restore separately bound prompt/photo models. Generate one final question with the shared context policy and native controls. Forced thinking and authentication failures cannot silently change providers. Every action compares an unmasked full-page screenshot at zero pixel tolerance.');
});
