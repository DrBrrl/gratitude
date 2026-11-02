import {test,expect as baseExpect,type Page} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,openEditor,editor,expectSynced,expectDecodedPhotos,signIn,FIXTURE_TIME} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices,AI_ENDPOINT} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {replay} from '../../../src/lib/domain';
import {SYSTEM_PROMPT} from '../../../src/lib/ai/context';
import {PHOTO_SYSTEM_PROMPT} from '../../../src/lib/ai/instructions';
const expect=baseExpect.configure({timeout:15_000});
const PROMPT_SERVER='https://fictional-writing.example.test',PHOTO_SERVER='https://fictional-photos.example.test';
const PROMPT_MODEL='local/writing',PHOTO_MODEL='local/vision',SHARED_MODEL='local/shared-vision';
const PROMPT_TOKEN='fictional-writing-token',PHOTO_TOKEN='fictional-photo-token';
const QUESTION='What small sound made today feel welcoming?',SUMMARY='A fictional yellow mug beside a blue window.';
test('prompts and photos use independent computers and models, with an explicit shared-model option',async({page,browser},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let prompts=0,photos=0,sharedPhotos=0,cloud=0,failPhoto=false;
 const routeServers=async(p:Page)=>{
  await p.route(AI_ENDPOINT,async route=>{cloud++;await route.fulfill({status:503,json:{}});});
  await p.route(/https:\/\/fictional-(writing|photos)\.example\.test\//,async route=>{
   const request=route.request();
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'}});return;}
   const photoServer=request.url().startsWith(PHOTO_SERVER);
   expect(request.headers().authorization).toBe(`Bearer ${photoServer?PHOTO_TOKEN:PROMPT_TOKEN}`);expect(request.headers()['x-goog-api-key']).toBeUndefined();
   if(request.url().endsWith('/api/v1/models')){
    const ids=photoServer?[PHOTO_MODEL,'local/another-vision']:[PROMPT_MODEL,SHARED_MODEL];
    await route.fulfill({json:{models:ids.map(id=>({type:'llm',key:id,loaded_instances:[{id,config:{context_length:32768}}],capabilities:{vision:id!==PROMPT_MODEL}}))}});return;
   }
   expect(request.url()).toBe(`${photoServer?PHOTO_SERVER:PROMPT_SERVER}/v1/chat/completions`);
   const body=request.postDataJSON(),image=Array.isArray(body.messages[1].content);
   if(image){expect(body.messages[0].content).toBe(PHOTO_SYSTEM_PROMPT);expect(JSON.stringify(body)).not.toContain('PRIVATE_DRAFT');expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);if(photoServer){photos++;expect(body.model).toBe(PHOTO_MODEL);if(failPhoto){failPhoto=false;await route.fulfill({status:503,json:{error:'Private diagnostics'}});return;}}else{sharedPhotos++;expect(body.model).toBe(SHARED_MODEL);}}
   else{prompts++;expect(photoServer).toBe(false);expect(body.model).toBe(PROMPT_MODEL);expect(body.messages[0].content).toBe(SYSTEM_PROMPT);}
   await route.fulfill({json:{model:body.model,choices:[{finish_reason:'stop',message:{role:'assistant',content:image?SUMMARY:QUESTION}}]}});
  });
 };
 await routeServers(page);
 await startJournal(page,info,steps,'photo-model');await aiSettings(page,steps,'configure');
 const main=page.getByRole('region',{name:'AI model connection',exact:true});
 const photo=page.getByRole('region',{name:'Photo model connection',exact:true});
 await steps.action('local-prompts','Choose LM Studio for reflection prompts',()=>main.getByLabel('AI provider',{exact:true}).selectOption('lm-studio'),async()=>{await expect(main.getByLabel('LM Studio server URL')).toBeVisible();});
 await steps.action('prompt-server','Choose the writing computer',()=>main.getByLabel('LM Studio server URL').fill(PROMPT_SERVER),async()=>{await expect(main.getByLabel('LM Studio API token')).toHaveValue('');});
 await steps.action('prompt-token','Enter the writing server token',()=>main.getByLabel('LM Studio API token').fill(PROMPT_TOKEN),async()=>{await expect(main.getByLabel('LM Studio API token')).toHaveValue(PROMPT_TOKEN);});
 await steps.action('prompt-models','Discover writing models',()=>main.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(main.getByRole('combobox',{name:'Model API identifier',exact:true})).toBeVisible();});
 await steps.action('prompt-model','Choose a text-only model for prompts',()=>main.getByLabel('Model API identifier').selectOption(PROMPT_MODEL),async()=>{await expect(main.getByText(/Connected to LM Studio/)).toContainText('Text prompts only.');});
 await steps.action('save-prompts','Save the writing connection',()=>main.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(main.getByText(/Provider saved to your account/)).toBeVisible();});
 await steps.action('prompt-sync-options','Open account sync for the writing connection',()=>main.getByText('Account token sync',{exact:true}).click(),async()=>{await expect(main.getByRole('button',{name:'Remember token in my account',exact:true})).toBeEnabled();});
 await steps.action('remember-prompts','Remember only the writing connection in its account slot',()=>main.getByRole('button',{name:'Remember token in my account',exact:true}).click(),async()=>{await expect(main.getByText('Token and server connection saved to your account.',{exact:true})).toBeVisible();await expect(main.getByRole('button',{name:'Forget saved token',exact:true})).toBeEnabled();});
 await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'save-consent');
 await steps.action('photo-options','Open the photo connection settings',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(page.getByLabel('Photo description connection')).toHaveValue('prompt');});
 await steps.action('separate','Choose a separate LM Studio connection for photos',()=>page.getByLabel('Photo description connection').selectOption('lm-studio'),async()=>{await expect(photo.getByLabel('LM Studio API token')).toHaveValue('');await expect(main.getByLabel('Model API identifier')).toHaveValue(PROMPT_MODEL);});
 await steps.action('photo-server','Choose a different computer for photos',()=>photo.getByLabel('LM Studio server URL').fill(PHOTO_SERVER),async()=>{await expect(photo.getByLabel('LM Studio server URL')).toHaveValue(PHOTO_SERVER);});
 await steps.action('photo-token','Enter only that computer’s token',()=>photo.getByLabel('LM Studio API token').fill(PHOTO_TOKEN),async()=>{await expect(main.getByLabel('LM Studio API token')).toHaveValue(PROMPT_TOKEN);});
 await steps.action('photo-models','Discover models on the photo computer',()=>photo.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(photo.getByRole('combobox',{name:'Model API identifier',exact:true})).toBeVisible();});
 await steps.action('photo-model','Choose its vision model',()=>photo.getByLabel('Model API identifier').selectOption(PHOTO_MODEL),async()=>{await expect(photo.getByText(/Connected to LM Studio/)).toContainText('Photo summaries supported.');});
 await steps.action('save-photo','Save the independent photo model without changing prompts',()=>photo.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(photo.getByText(/Photo model choice saved to your account/)).toBeVisible();await expect(main.getByLabel('Model API identifier')).toHaveValue(PROMPT_MODEL);});
 await steps.action('photo-sync-options','Open account sync for the photo connection',()=>photo.getByText('Account token sync',{exact:true}).click(),async()=>{await expect(photo.getByRole('button',{name:'Remember token in my account',exact:true})).toBeEnabled();});
 await steps.action('remember-photo','Remember the second connection independently',()=>photo.getByRole('button',{name:'Remember token in my account',exact:true}).click(),async()=>{await expect(photo.getByText('Token and server connection saved to your account.',{exact:true})).toBeVisible();await expect(main.getByLabel('LM Studio API token')).toHaveValue(PROMPT_TOKEN);});
 const context=await browser.newContext({...info.project.use,baseURL:String(info.project.use.baseURL)}),other=await context.newPage();
 try{
  // Use the same pinned-font/CDN fixture as the first browser and other device scenarios.
  await context.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
  await other.clock.setFixedTime(new Date(FIXTURE_TIME));await routeServers(other);steps.setPage(other);
  await steps.action('other-device','Open another device',()=>other.goto('./journal/'),async()=>{await expect(other.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
  await signIn(other,info,steps,'photo-model',true);await aiSettings(other,steps,'other');
  await steps.action('other-photo','Restore both connections on another signed-in device',()=>other.getByText('Photo description model',{exact:true}).click(),async()=>{
   const p=other.getByRole('region',{name:'Photo model connection',exact:true}),m=other.getByRole('region',{name:'AI model connection',exact:true});
   await expect(other.getByLabel('Photo description connection')).toHaveValue('lm-studio');await expect(p.getByLabel('LM Studio server URL')).toHaveValue(PHOTO_SERVER);await expect(p.getByLabel('Model API identifier')).toHaveValue(PHOTO_MODEL);await expect(p.getByLabel('LM Studio API token')).toHaveValue(PHOTO_TOKEN);await expect(m.getByLabel('LM Studio server URL')).toHaveValue(PROMPT_SERVER);await expect(m.getByLabel('Model API identifier')).toHaveValue(PROMPT_MODEL);await expect(m.getByLabel('LM Studio API token')).toHaveValue(PROMPT_TOKEN);expect(prompts+photos+sharedPhotos+cloud).toBe(0);
  });
 }finally{await context.close();steps.setPage(page);}
 await steps.action('today','Open Today',()=>page.getByRole('navigation').getByRole('button',{name:'Today',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();});
 await steps.action('generate','Generate a prompt on the writing computer',()=>page.getByRole('button',{name:'Find me a prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText(QUESTION);expect(prompts).toBe(1);expect(photos+sharedPhotos+cloud).toBe(0);});
 await openEditor(page,steps,'editor');
 await steps.action('draft','Keep the draft out of image requests',()=>editor(page).fill('PRIVATE_DRAFT: A small moment worth remembering.'),async()=>{await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();});
 await steps.action('photo','Choose a fictional image',()=>page.getByLabel('Add photo',{exact:true}).setInputFiles('tests/fixtures/yellow-mug.png'),async()=>{await expect(page.getByText(`If you choose to summarize this photo, it goes directly to your LM Studio server at ${PHOTO_SERVER}.`,{exact:false})).toBeVisible();});
 failPhoto=true;
 await steps.action('photo-outage','Keep a photo-server outage separate from the writing server',()=>page.getByRole('button',{name:'Attach & summarize',exact:true}).click(),async()=>{await expect(page.getByText('Couldn’t summarize this photo. You can retry or write a summary.',{exact:true})).toBeVisible({timeout:30_000});expect(photos).toBe(1);expect(prompts).toBe(1);expect(sharedPhotos+cloud).toBe(0);await expectDecodedPhotos(page,1);});
 await steps.action('retry-photo','Retry only the selected photo model',()=>page.getByRole('button',{name:'Retry summary',exact:true}).click(),async()=>{await expect(page.locator('.summary')).toHaveText(SUMMARY);await expectDecodedPhotos(page,1);expect(photos).toBe(2);});
 await steps.action('save-entry','Save the reflection and independent summary',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection saved',exact:true})).toBeVisible();await expectDecodedPhotos(page,1);});
 await steps.action('done','Open the journal',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your journal',exact:true})).toBeVisible();await expectDecodedPhotos(page,1);});
 await aiSettings(page,steps,'shared');
 await steps.action('list-shared','Discover a vision-capable model on the writing server',()=>main.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{await expect(main.getByRole('combobox',{name:'Model API identifier',exact:true})).toHaveValue(PROMPT_MODEL);});
 await steps.action('choose-shared','Choose a model that can handle both tasks',()=>main.getByLabel('Model API identifier').selectOption(SHARED_MODEL),async()=>{await expect(main.getByText(/Connected to LM Studio/)).toContainText('Photo summaries supported.');});
 await steps.action('save-shared','Save it as the prompt model',()=>main.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(main.getByLabel('Model API identifier')).toHaveValue(SHARED_MODEL);});
 await steps.action('shared-photo-options','Open photo model choices again',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(page.getByLabel('Photo description connection')).toHaveValue('lm-studio');});
 await steps.action('reuse','Choose the explicit same-model option',()=>page.getByLabel('Photo description connection').selectOption('prompt'),async()=>{await expect(page.getByText(/Photo summaries will use the same server, model and credentials as prompts/)).toBeVisible();});
 await steps.action('save-reuse','Save the shared model choice',()=>page.getByRole('button',{name:'Save photo model',exact:true}).click(),async()=>{await expect(page.getByText('Photo model choice saved to your account.',{exact:true})).toBeVisible();});
 await steps.action('journal','Return to the journal',()=>page.getByRole('navigation').getByRole('button',{name:'Journal',exact:true}).click(),async()=>{await expect(page.locator('article.card')).toHaveCount(1);await expectDecodedPhotos(page,1);});
 await steps.action('entry','Open the saved entry',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.summary')).toHaveText(SUMMARY);await expectDecodedPhotos(page,1);});
 await steps.action('another-photo','Choose another image using the shared model',()=>page.getByLabel('Add photo',{exact:true}).setInputFiles('tests/fixtures/yellow-mug.png'),async()=>{await expect(page.getByText(`If you choose to summarize this photo, it goes directly to your LM Studio server at ${PROMPT_SERVER}.`,{exact:false})).toBeVisible();});
 await steps.action('shared-summary','Send the photo to the prompt connection only after choosing reuse',()=>page.getByRole('button',{name:'Attach & summarize',exact:true}).click(),async()=>{await expect(page.locator('.summary')).toHaveCount(2);await expectDecodedPhotos(page,2);expect(sharedPhotos).toBe(1);expect(photos).toBe(2);expect(cloud).toBe(0);});
 await steps.action('reload','Reload recorded summaries without inference',()=>page.reload(),async()=>{await expectSynced(page);expect(prompts).toBe(1);expect(photos).toBe(2);expect(sharedPhotos).toBe(1);expect(cloud).toBe(0);});
 await aiSettings(page,steps,'reload');
 await steps.action('restored-shared','Restore the saved same-model choice and updated account model',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(main.getByLabel('Model API identifier')).toHaveValue(SHARED_MODEL);await expect(page.getByLabel('Photo description connection')).toHaveValue('prompt');expect(prompts).toBe(1);expect(photos).toBe(2);expect(sharedPhotos).toBe(1);});
 await steps.step('replay','Rebuild all settings and results from source events',[{description:'Full and cached replay retain the shared choice and both exact summaries without credentials or endpoints in events',check:async()=>{const log=await selectionLog(page),state=replay(log);expect(replay(log.slice(5),replay(log.slice(0,5)))).toEqual(state);expect(state.ai.choices.photoProvider).toBe('prompt');expect(Object.values(state.photos).map(p=>p.summary)).toEqual([SUMMARY,SUMMARY]);expect(log.filter(e=>e.type==='PhotoSummaryRequested').every(e=>e.schemaVersion===3)).toBe(true);for(const privateValue of [PROMPT_TOKEN,PHOTO_TOKEN,PROMPT_SERVER,PHOTO_SERVER])expect(JSON.stringify(log)).not.toContain(privateValue);}}]);
 steps.generateDocs('Independent prompt and photo model connections','Use a text model on one fictional laptop for gratitude prompts and a vision model on another for photo descriptions. Explicitly remember each bound token, restore both on another device, handle an independent photo-server outage, then choose Same as prompt model and describe a second photo using that shared connection. Exact output replays without inference. Every user action has a full-page unmasked zero-pixel screenshot comparison, with checks below.');
});
