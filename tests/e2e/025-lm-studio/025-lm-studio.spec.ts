import {test,expect as baseExpect,type Route} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory,navigate,openEditor,editor,expectEditor,expectSynced,expectDecodedPhotos,signIn,FIXTURE_TIME} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices,AI_ENDPOINT} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {SYSTEM_PROMPT} from '../../../src/lib/ai/context';
import {PHOTO_SYSTEM_PROMPT} from '../../../src/lib/ai/instructions';
import {replay} from '../../../src/lib/domain';
const expect=baseExpect.configure({timeout:15_000});
const TOKEN='fictional-local-lm-token',MODEL='google/gemma-4-31b';
const FIRST='What small outdoor moment brought you comfort?',SECOND='What everyday kindness would you like to remember?',SUMMARY='A yellow mug beside a blue window.';
test('LM Studio prompts and photos use explicit local credentials and replay without inference',async({page,browser},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600_000);
 const steps=new TestStepHelper(page,info);let cloud=0,discovery=0,failNext=false;
 const submissions:any[]=[];
 await page.route(AI_ENDPOINT,async route=>{cloud++;await route.fulfill({status:503,body:'{}'});});
 const localRoute=async (route:Route)=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'};
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   expect(route.request().headers()['x-goog-api-key']).toBeUndefined();
   if(route.request().headers().authorization!==`Bearer ${TOKEN}`){await route.fulfill({status:401,headers,json:{error:'Fictional unauthorized request'}});return;}
   if(route.request().url().endsWith('/api/v1/models')) {
     discovery++;await route.fulfill({headers,json:{models:[{type:'llm',key:MODEL,loaded_instances:[{id:MODEL,config:{context_length:32768}}],capabilities:{vision:true,reasoning:{allowed_options:['off','on'],default:'on'}}}]}});return;
   }
   expect(route.request().url()).toBe('http://127.0.0.1:8080/v1/chat/completions');
   const body=route.request().postDataJSON();submissions.push(body);
   expect(body.model).toBe(MODEL);expect(body.chat_template_kwargs).toEqual({enable_thinking:false});expect(body.reasoning_effort).toBe('off');expect(body.stream).toBe(false);
   if(failNext){failNext=false;await route.fulfill({status:503,headers,json:{error:'Do not display raw server details'}});return;}
   const image=Array.isArray(body.messages[1].content);
   if(image) {
     expect(body.messages[0].content).toBe(PHOTO_SYSTEM_PROMPT);
     expect(body.messages[1].content[0]).toEqual({type:'text',text:'Describe this photo.'});
     const url=body.messages[1].content[1].image_url.url;expect(url).toMatch(/^data:image\/jpeg;base64,/);
     const bytes=Buffer.from(url.split(',')[1],'base64');expect([...bytes.subarray(0,3)]).toEqual([255,216,255]);
     expect(JSON.stringify(body)).not.toContain('PRIVATE_UNSAVED_REFLECTION');
   } else expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
   const text=image?SUMMARY:submissions.length===1?FIRST:SECOND;
   await route.fulfill({headers,json:{model:MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:text,reasoning_content:'This separate reasoning field is never journal content.'}}]}});
 };
 await page.route('http://127.0.0.1:8080/**',localRoute);
 await startJournal(page,info,steps,'local-lm');
 await seedHistory(page,[{text:'A fictional walk beside the river.',recordedAt:'2026-09-28T01:00:00Z'},{text:'A fictional shared cup of tea.',recordedAt:'2026-09-29T01:00:00Z'}]);
 await aiSettings(page,steps,'configure');
 await steps.action('choose-local','Choose LM Studio as the next AI provider',()=>page.getByLabel('AI provider',{exact:true}).selectOption('lm-studio'),async()=>{await expect(page.getByLabel('LM Studio server URL')).toHaveValue('http://127.0.0.1:8080');await expect(page.getByLabel('Model API identifier')).toHaveValue(MODEL);});
 await steps.action('auth-required','Check the authenticated server before entering a token',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByRole('alert')).toHaveText(/needs a valid API token/);expect(submissions).toHaveLength(0);expect(cloud).toBe(0);});
 await steps.action('token','Enter a fictional token only in the local connection form',()=>page.getByLabel('LM Studio API token').fill(TOKEN),async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);});
 await steps.action('test','Discover the loaded model, image support and context length without inference',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(page.getByText(/Connected to LM Studio/)).toContainText('32,768 tokens');expect(discovery).toBe(1);expect(submissions).toHaveLength(0);});
 await steps.action('save-model','Save the account provider and this device’s private connection',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText('Provider saved to your account; connection settings saved on this device.',{exact:true})).toBeVisible();await expect(page.getByText(/Current provider: LM Studio/)).toBeVisible();});
 await toggleAI(page,steps,'enable',true);
 await steps.action('share','Allow chosen saved reflections to inform local prompts',()=>page.getByRole('switch',{name:'Use journal entries',exact:true}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use journal entries',exact:true})).toHaveAttribute('aria-checked','true');});
 await saveChoices(page,steps,'save-sharing');
 await navigate(page,steps,'today','Today');
 await steps.action('generate','Generate a gratitude prompt directly through LM Studio',()=>page.getByRole('button',{name:'Find me a prompt',exact:true}).click(),async()=>{
   await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST);expect(submissions).toHaveLength(1);expect(cloud).toBe(0);
   const context=JSON.parse(submissions[0].messages[1].content);expect(context.referenceDate).toBe('2026-10-01');expect(Object.values(context.reflections).flat()).toHaveLength(2);
 },'The local model receives the approved JSON and exact instruction with thinking disabled; Gemini is not called');
 await steps.action('why','Identify the recorded local provider and actual sources',()=>page.getByRole('button',{name:'Why this prompt?',exact:true}).click(),async()=>{await expect(page.locator('.explanation')).toContainText('generated by LM Studio');await expect(page.locator('.explanation')).toContainText('2 saved reflections');});
 await steps.action('close-why','Close the source explanation',()=>page.getByRole('button',{name:'Why this prompt?',exact:true}).click(),async()=>{await expect(page.locator('.explanation')).toHaveCount(0);});
 await openEditor(page,steps,'editor');
 await steps.action('write','Write a response that remains a private draft',()=>editor(page).fill('PRIVATE_UNSAVED_REFLECTION: I enjoyed a quiet morning.'),async()=>{await expectEditor(page,'PRIVATE_UNSAVED_REFLECTION: I enjoyed a quiet morning.');});
 await steps.action('date','Choose an earlier date for this reflection',()=>page.getByLabel('Entry date and time').fill('2026-09-30T12:00'),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-30T12:00');});
 await steps.action('editor-prompt','Generate a local prompt for the selected entry date',()=>page.getByRole('button',{name:'Generate AI prompt',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Generated prompt option'})).toContainText(SECOND);expect(submissions).toHaveLength(2);const context=submissions[1].messages[1].content;expect(JSON.parse(context).referenceDate).toBe('2026-09-30');expect(context).not.toContain('PRIVATE_UNSAVED_REFLECTION');});
 await steps.action('use-option','Choose the generated local question for this draft',()=>page.getByRole('button',{name:'Use this prompt',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Edit prompt text',exact:true})).toHaveText(SECOND);});
 await steps.action('photo','Inspect local AI processing before attaching a fictional photo',()=>page.getByLabel('Add photo',{exact:true}).setInputFiles('tests/fixtures/yellow-mug.png'),async()=>{await expect(page.getByRole('img',{name:'Attachment preview'})).toBeVisible();await expect(page.getByText(/it goes directly to your LM Studio server/)).toBeVisible();await expect(page.getByRole('link',{name:'AI service & data use'})).toHaveCount(0);});
 await steps.action('summarize','Attach the photo and ask the same local model for its summary',()=>page.getByRole('button',{name:'Attach & summarize',exact:true}).click(),async()=>{await expect(page.locator('.summary')).toHaveText(SUMMARY);await expectDecodedPhotos(page,1);expect(submissions).toHaveLength(3);expect(cloud).toBe(0);});
 await steps.action('save','Save the backfilled reflection, prompt and local photo summary',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.locator('.saved-card .entry-prompt')).toHaveText(SECOND);await expectDecodedPhotos(page,1);await expectSynced(page);});
 await steps.action('done','Return to the saved journal',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.locator('article.card')).toHaveCount(3);});
 await steps.action('reload','Reload with the same provider and no repeated inference',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST);expect(submissions).toHaveLength(3);expect(cloud).toBe(0);});
 await navigate(page,steps,'journal','Journal');
 await steps.action('entry','Read the reflection and its saved local summary',()=>page.locator('article.card').filter({hasText:'PRIVATE_UNSAVED_REFLECTION'}).getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.summary')).toHaveText(SUMMARY);await expectDecodedPhotos(page,1);});
 await steps.action('edit','Edit the saved reflection using the configured local provider',()=>page.getByRole('button',{name:'Edit reflection',exact:true}).click(),async()=>{await expectEditor(page,'PRIVATE_UNSAVED_REFLECTION: I enjoyed a quiet morning.');await expectDecodedPhotos(page,1);});
 await steps.action('reference-date','Move the draft reference date forward without changing the saved entry yet',()=>page.getByLabel('Entry date and time').fill('2026-10-01T12:00'),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T12:00');await expectDecodedPhotos(page,1);});
 await steps.action('saved-editor-prompt','Exclude the edited entry even when its saved date is earlier than the reference day',()=>page.getByRole('button',{name:'Generate AI prompt',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Generated prompt option'})).toBeVisible();expect(submissions).toHaveLength(4);const context=submissions[3].messages[1].content;expect(JSON.parse(context).referenceDate).toBe('2026-10-01');expect(context).not.toContain('PRIVATE_UNSAVED_REFLECTION');expect(context).not.toContain(SUMMARY);await expectDecodedPhotos(page,1);});
 await steps.action('keep-question','Keep the existing saved question',()=>page.getByRole('button',{name:'Keep current prompt',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Generated prompt option'})).toHaveCount(0);await expectDecodedPhotos(page,1);});
 await steps.action('back','Return without saving the edited date',()=>page.locator('button.back').click(),async()=>{await expect(page.locator('.detail .entry-prompt')).toHaveText(SECOND);await expectDecodedPhotos(page,1);});
 await navigate(page,steps,'settings','Settings');
 await steps.action('privacy','Open local projection recovery',()=>page.getByRole('button',{name:/^Privacy & data/}).click(),async()=>{await expect(page.getByRole('button',{name:'Rebuild local view',exact:true})).toBeVisible();});
 await steps.action('replay','Rebuild local prompt and photo history entirely from recorded events',()=>page.getByRole('button',{name:'Rebuild local view',exact:true}).click(),async()=>{
   await expectSynced(page);expect(submissions).toHaveLength(4);expect(cloud).toBe(0);
   const events=await selectionLog(page),full=replay(events);expect(full.ai.choices.provider).toBe('lm-studio');expect(replay(events.slice(3),replay(events.slice(0,3)))).toEqual(full);
   expect(events.filter(e=>e.type==='PromptRequested').map(e=>e.schemaVersion)).toEqual([5,6,6]);expect(events.some(e=>e.type==='PhotoSummaryRequested'&&e.schemaVersion===2)).toBe(true);
   expect(JSON.stringify(events)).not.toContain(TOKEN);expect(JSON.stringify(events)).not.toContain('http://127.0.0.1:8080');expect(JSON.stringify(events)).not.toContain('This separate reasoning field');
 },'Exact local outputs and usage survive replay; credentials, addresses and reasoning are absent from the event stream');
 const otherContext=await browser.newContext({...info.project.use,baseURL:String(info.project.use.baseURL)});
 try {
   await otherContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
   const other=await otherContext.newPage();steps.setPage(other);await other.clock.setFixedTime(new Date(FIXTURE_TIME));
   await other.route('http://127.0.0.1:8080/**',localRoute);
   await other.route(AI_ENDPOINT,async route=>{cloud++;await route.fulfill({status:503,body:'{}'});});
   await steps.action('other-device','Open the same account on a device without local credentials',()=>other.goto('./journal/'),async()=>{await expect(other.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();});
   await signIn(other,info,steps,'local-lm',true);
   await steps.action('other-no-fallback','Keep the shared local provider when this device has no API token',()=>other.getByRole('button',{name:'Another prompt',exact:true}).click(),async()=>{await expect(other.getByText('LM Studio needs a valid API token. Enter it in AI settings on this device.',{exact:true})).toBeVisible();expect(submissions).toHaveLength(4);expect(cloud).toBe(0);});
   await aiSettings(other,steps,'other-connection');
   await steps.step('other-private','Require device-specific connection credentials without reverting to Gemini',[{description:'The account still selects LM Studio, but this device has no saved token',check:async()=>{await expect(other.getByLabel('AI provider',{exact:true})).toHaveValue('lm-studio');await expect(other.getByLabel('LM Studio API token')).toHaveValue('');expect(cloud).toBe(0);}}]);
 } finally {await otherContext.close();steps.setPage(page);}
 await navigate(page,steps,'replayed-today','Today');
 failNext=true;
 await steps.action('failure','Handle an unavailable local model without sending data to Gemini',()=>page.getByRole('button',{name:/^(Another prompt|Try another request)$/}).click(),async()=>{await expect(page.getByText('LM Studio could not complete this request. Check the loaded model and its context length.',{exact:true})).toBeVisible();await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST);expect(submissions).toHaveLength(5);expect(cloud).toBe(0);});
 await steps.action('starter','Explicitly use the starter after the local failure',()=>page.getByRole('button',{name:'Use starter prompt',exact:true}).click(),async()=>{await expect(page.locator('.badge')).toHaveText('Starter prompt');expect(submissions).toHaveLength(5);expect(cloud).toBe(0);});
 await aiSettings(page,steps,'retained');
 await steps.step('private-settings','Retain the address and tab token on this device',[{description:'The saved local model connection survives reload; the persistent preferences contain no token',check:async()=>{await expect(page.getByLabel('LM Studio API token')).toHaveValue(TOKEN);await expect(page.getByLabel('AI provider',{exact:true})).toHaveValue('lm-studio');expect(await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('gratitude:model:')).some(([,value])=>value.includes('fictional-local-lm-token')))).toBe(false);}}]);
 steps.generateDocs('LM Studio prompts and private photo summaries','Configure an authenticated local Gemma model, disable thinking, generate daily and dated-editor prompts, summarize a normalized photo, preserve outputs through reload/full replay, and handle failure without a Gemini fallback. Provider choice syncs through events; connection addresses and tokens remain on the device. Server responses and credentials are fictional. Every user action has a full-page unmasked screenshot at zero tolerance, with checks underneath.');
});
