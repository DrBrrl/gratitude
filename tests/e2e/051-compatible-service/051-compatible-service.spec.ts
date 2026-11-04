import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices} from '../helpers/gemini';
const expect=baseExpect.configure({timeout:15000});
const SERVER='https://fictional-compatible.example.test',MODEL='verified/plain-text',TOKEN='fictional-proxy-token';
test('an explicitly verified text-only chat server can generate without inheriting LM Studio controls',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(480000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let generated=0;
 await page.route(SERVER+'/**',async route=>{
  const request=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'};
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  expect(request.headers()['x-goog-api-key']).toBeUndefined();
  if(request.headers().authorization!==`Bearer ${TOKEN}`){await route.fulfill({status:401,headers,json:{error:'private diagnostics'}});return;}
  if(request.url().endsWith('/v1/models')){await route.fulfill({headers,json:{data:[{id:'unknown/capabilities'},{id:MODEL,capabilities:{completion:true,thinking:false}}]}});return;}
  const body=request.postDataJSON();expect(body.model).toBe(MODEL);expect(body.stream).toBe(false);expect(body.chat_template_kwargs).toBeUndefined();expect(body.reasoning_effort).toBeUndefined();expect(body.messages[1].content).toBeTruthy();generated++;
  await route.fulfill({headers,json:{model:MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:'What fictional ordinary moment felt good?'}}]}});
 });
 await startJournal(page,info,steps,'compatible-service');await aiSettings(page,steps,'ai');
 await steps.action('service','Choose the bounded compatibility contract',()=>page.getByLabel('AI provider',{exact:true}).selectOption('openai-compatible'),async()=>{await expect(page.getByText(/requires models to declare completion: true/)).toBeVisible();await expect(page.getByRole('button',{name:'Save model settings',exact:true})).toBeDisabled();});
 await steps.action('server','Choose the verified server’s HTTPS origin',()=>page.getByLabel('Server address',{exact:true}).fill(SERVER),async()=>{await expect(page.getByLabel('Proxy authentication token (optional)')).toHaveValue('');});
 await steps.action('auth-error','Show a proxy authentication failure without exposing diagnostics',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByRole('alert')).toContainText('server rejected its authentication token');expect(generated).toBe(0);});
 await steps.action('token','Enter the dedicated fictional proxy token',()=>page.getByLabel('Proxy authentication token (optional)').fill(TOKEN),async()=>{await expect(page.getByLabel('Proxy authentication token (optional)')).toHaveValue(TOKEN);});
 await steps.action('discover','Read the verified capability declarations without generation',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByRole('option',{name:/unknown\/capabilities/})).toBeDisabled();expect(generated).toBe(0);});
 await steps.action('model','Choose the declared non-thinking text model',()=>page.getByLabel('Model API identifier').selectOption(MODEL),async()=>{await expect(page.getByRole('status')).toContainText('Text prompts only.');});
 await steps.action('save','Save the explicit server and revision',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText(/Current provider: Compatible local server/)).toBeVisible();});
 await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'choices');await navigate(page,steps,'today','Today');
 await steps.action('generate','Generate using only standard final-text chat fields',()=>page.getByRole('button',{name:'Generate a prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText('What fictional ordinary moment felt good?');expect(generated).toBe(1);});
 steps.generateDocs('Verified text-only compatibility contract','Unknown capabilities cannot be saved. A fictional server with declared completion/non-thinking support accepts a dedicated proxy token, then receives one standard non-streaming chat request. No LM Studio options, photos, Firebase credentials or silent fallback are used. Every action has an unmasked full-page zero-pixel screenshot comparison.');
});
