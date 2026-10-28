import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate,expectSynced} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices,AI_ENDPOINT} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
const expect=baseExpect.configure({timeout:15_000});
const PROMPT='What small familiar thing made your fictional morning brighter?';
test('local API validation failures are visible beside the request control and retry recovers without thinking',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let attempts=0,cloud=0;
 await page.route(AI_ENDPOINT,async route=>{cloud++;await route.fulfill({status:503,json:{}});});
 await page.route('http://127.0.0.1:8080/**',async route=>{
  expect(route.request().headers().authorization).toBe('Bearer fictional-recovery-token');
  if(route.request().url().endsWith('/api/v1/models'))return route.fulfill({json:{models:[{type:'llm',key:'google/gemma-4-31b',capabilities:{vision:true,reasoning:{allowed_options:['off','on']}},loaded_instances:[{id:'google/gemma-4-31b',config:{context_length:32768}}]}]}});
  attempts++;const body=route.request().postDataJSON();
  expect(body.chat_template_kwargs).toEqual({enable_thinking:false});
  // Mirror the real endpoint's accepted vocabulary, rather than accepting any fixture payload.
  if(!['none','minimal','low','medium','high','xhigh'].includes(body.reasoning_effort))return route.fulfill({status:400,json:{error:`Invalid reasoning_effort value: ${body.reasoning_effort}`}});
  expect(body.reasoning_effort).toBe('none');
  if(attempts===1)return route.fulfill({status:400,json:{error:'PRIVATE_SERVER_DIAGNOSTIC: synthetic request validation failure'}});
  return route.fulfill({json:{model:'google/gemma-4-31b',choices:[{finish_reason:'stop',message:{role:'assistant',content:PROMPT}}]}});
 });
 await startJournal(page,info,steps,'local-recovery');
 await aiSettings(page,steps,'configure');
 await steps.action('local','Select the local Gemma provider',()=>page.getByLabel('AI provider',{exact:true}).selectOption('lm-studio'),async()=>{await expect(page.getByLabel('Model API identifier')).toHaveValue('google/gemma-4-31b');});
 await steps.action('token','Enter a fictional tab-only credential',()=>page.getByLabel('LM Studio API token').fill('fictional-recovery-token'),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue('fictional-recovery-token');});
 await steps.action('save-model','Save the local connection and provider choice',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText('Provider saved to your account; connection settings saved on this device.',{exact:true})).toBeVisible();});
 await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'choices');await navigate(page,steps,'today','Today');
 await steps.action('rejected','Show a rejected request next to its retry button',()=>page.getByRole('button',{name:'Find me a prompt',exact:true}).click(),async()=>{
  const notice=page.locator('.prompt-request-error');await expect(notice).toHaveText('LM Studio could not complete this request. Check the loaded model and its context length.');
  const retry=page.getByRole('button',{name:'Try another request',exact:true});await expect(retry).toBeEnabled();
  const noticeBox=await notice.boundingBox(),buttonBox=await retry.boundingBox();expect(noticeBox).not.toBeNull();expect(buttonBox).not.toBeNull();expect(buttonBox!.y-(noticeBox!.y+noticeBox!.height)).toBeLessThan(40);
  await expect(page.locator('body')).not.toContainText('PRIVATE_SERVER_DIAGNOSTIC');expect(attempts).toBe(1);expect(cloud).toBe(0);
 });
 await steps.action('reload-failure','Restore a visible failure notice after reloading without retrying inference',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.locator('.prompt-request-error')).toHaveText('No new prompt arrived. Check your AI connection, try again, or choose a backup prompt.');await expect(page.getByRole('button',{name:'Try another request',exact:true})).toBeEnabled();expect(attempts).toBe(1);});
 await steps.action('retry','Explicitly retry with the compatible non-thinking setting',()=>page.getByRole('button',{name:'Try another request',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText(PROMPT);await expect(page.locator('.prompt-request-error')).toHaveCount(0);expect(attempts).toBe(2);expect(cloud).toBe(0);});
 await steps.action('reload-success','Replay the completed prompt without generating another',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.locator('.daily-prompt h2')).toHaveText(PROMPT);await expect(page.locator('.prompt-request-error')).toHaveCount(0);expect(attempts).toBe(2);const events=await selectionLog(page);expect(events.filter(e=>e.type==='AIRequestFailed')).toHaveLength(1);expect(events.filter(e=>e.type==='PromptResponseReceived')).toHaveLength(1);expect(JSON.stringify(events)).not.toContain('fictional-recovery-token');expect(JSON.stringify(events)).not.toContain('PRIVATE_SERVER_DIAGNOSTIC');});
 steps.generateDocs('Local prompt validation and visible recovery','Translate native thinking off to the OpenAI-compatible none value while retaining enable_thinking: false. A fictional HTTP 400 produces a visible notice beside retry, persists a generic replay-derived failure notice after reload, and recovers only through an explicit retry. Raw server diagnostics and credentials never enter the journal. Every action has an unmasked full-page zero-pixel screenshot comparison with checks underneath.');
});
