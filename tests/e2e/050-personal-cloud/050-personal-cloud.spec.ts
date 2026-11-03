import {test,expect as baseExpect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,deleteDoc,Timestamp} from 'firebase/firestore';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,signIn,expectSynced,navigate,seedHistory,FIXTURE_TIME} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices} from '../helpers/gemini';
import {selectionLog} from '../helpers/ai-selection-fixture';
const expect=baseExpect.configure({timeout:15000});
const KEY='fictional-personal-gemini-key-never-live',MODEL='gemini-3.6-flash';
test('a personal cloud key is write-only, defaults to generic context, restores on another device and can be removed',async({page,context},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});let uid='',revision=0,generations=0;const calls:any[]=[];
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 const network=async(target:import('@playwright/test').Page)=>{
  await target.route('http://127.0.0.1:15001/demo-gratitude/australia-southeast1/personalGemini',async route=>{
   const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,x-firebase-appcheck,x-firebase-gmpid'};
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   expect(req.headers().authorization).toMatch(/^Bearer /);const data=req.postDataJSON().data;calls.push(data);
   if(data.operation==='test'){expect(data.key===KEY||!data.key&&data.connectionId).toBeTruthy();await route.fulfill({headers,json:{result:{models:[MODEL,'gemini-other-fixture']}}});return;}
   if(data.operation==='save'){
    expect(data.model).toBe(MODEL);revision++;
    await environment.withSecurityRulesDisabled(async admin=>setDoc(doc(admin.firestore(),`users/${uid}/privateConnections/${data.connectionId}`),{schemaVersion:1,provider:'personal-gemini',model:MODEL,revision:`fixture-key-${revision}`,allowPersonal:data.allowPersonal,updatedAt:Timestamp.fromDate(new Date(FIXTURE_TIME))}));
    await route.fulfill({headers,json:{result:{connectionId:data.connectionId,revision:`fixture-key-${revision}`,model:MODEL,allowPersonal:data.allowPersonal}}});return;
   }
   if(data.operation==='delete'){
    await environment.withSecurityRulesDisabled(async admin=>deleteDoc(doc(admin.firestore(),`users/${uid}/privateConnections/${data.connectionId}`)));
    await route.fulfill({headers,json:{result:{deleted:true}}});return;
   }
   expect(data.operation).toBe('generate');expect(data.key).toBeUndefined();expect(data.requestId).toBeTruthy();generations++;
   await route.fulfill({headers,json:{result:{text:generations===1?'What fictional everyday kindness did you enjoy?':'What fictional detail brought you calm?',model:MODEL+'-fixture',finishReason:'STOP'}}});
  });
 };
 try{
  await network(page);await startJournal(page,info,steps,'personal-cloud');
  uid=await page.evaluate(async()=>{const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))?.name;if(!name)throw Error('No journal');return name.split(':').at(-2)!;});
  await seedHistory(page,[{text:'Fictional kettle and sunshine, private context.',recordedAt:'2026-09-30T01:00:00Z'}]);
  await aiSettings(page,steps,'ai');
  await steps.action('own-key','Choose a personal Gemini connection',()=>page.getByLabel('AI provider',{exact:true}).selectOption('personal-gemini'),async()=>{await expect(page.getByRole('region',{name:'Personal Gemini connection'})).toBeVisible();await expect(page.getByRole('button',{name:'Save private cloud connection'})).toBeDisabled();});
  await steps.action('key','Enter a fictional key only into the private password field',()=>page.getByLabel('Gemini API key',{exact:true}).fill(KEY),async()=>{await expect(page.getByLabel('Gemini API key',{exact:true})).toHaveValue(KEY);expect(calls).toHaveLength(0);});
  await steps.action('test','Test model metadata without inference or saving the key',()=>page.getByRole('button',{name:'Test cloud connection'}).click(),async()=>{await expect(page.getByRole('status')).toContainText('no reflection or inference was sent');expect(generations).toBe(0);await expect(page.getByLabel(/I have reviewed Google/)).not.toBeChecked();});
  await steps.action('model','Explicitly select a discovered Gemini model',()=>page.getByLabel('Your Gemini model').selectOption(MODEL),async()=>{await expect(page.getByLabel('Your Gemini model')).toHaveValue(MODEL);});
  await steps.action('save-key','Save the private account connection without approving personal data',()=>page.getByRole('button',{name:'Save private cloud connection'}).click(),async()=>{await expect(page.getByRole('status')).toContainText('key cannot be read back');await expect(page.getByLabel('Replacement Gemini API key (optional)')).toHaveValue('');expect(generations).toBe(0);});
  await toggleAI(page,steps,'enable',true);await saveChoices(page,steps,'enable-save');
  await navigate(page,steps,'today','Today');
  await steps.action('generic','Request a generic question with your saved cloud connection',()=>page.getByRole('button',{name:'Find me a prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText('What fictional everyday kindness did you enjoy?');expect(generations).toBe(1);const request=calls.find(call=>call.operation==='generate');expect(request.context).toContain('No personal context is supplied.');expect(JSON.stringify(request)).not.toContain('Fictional kettle');expect(request.key).toBeUndefined();});
  await aiSettings(page,steps,'review');
  await steps.action('terms','Review this key’s provider terms before permitting personal context',()=>page.getByLabel(/I have reviewed Google/).check(),async()=>{await expect(page.getByLabel(/I have reviewed Google/)).toBeChecked();});
  await steps.action('save-terms','Save the explicit terms acknowledgement without re-entering a key',()=>page.getByRole('button',{name:'Save private cloud connection'}).click(),async()=>{await expect(page.getByRole('status')).toContainText('key cannot be read back');expect(calls.filter(call=>call.operation==='save')).toHaveLength(2);expect(calls.filter(call=>call.operation==='save')[1].key).toBeUndefined();expect(generations).toBe(1);});
  await steps.action('journal-permission','Explicitly allow journal context for this approved connection',()=>page.getByRole('switch',{name:'Use journal entries',exact:true}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use journal entries',exact:true})).toHaveAttribute('aria-checked','true');});
  await saveChoices(page,steps,'personal-permission');
  await navigate(page,steps,'personal-today','Today');
  await steps.action('personal','Request another prompt using only explicitly approved journal context',()=>page.getByRole('button',{name:'Another prompt',exact:true}).click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText('What fictional detail brought you calm?');expect(generations).toBe(2);const outgoing=calls.filter(call=>call.operation==='generate').at(-1);expect(JSON.parse(outgoing.context).reflections.recent).toEqual([{date:'2026-09-30',text:'Fictional kettle and sunshine, private context.'}]);expect(outgoing.key).toBeUndefined();});
  await aiSettings(page,steps,'independent-photo');
  await steps.action('photo-options','Open independent photo connection settings',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(page.getByLabel('Photo description connection')).toHaveValue('prompt');});
  await steps.action('separate-key','Choose a separate personal Gemini connection for photos',()=>page.getByLabel('Photo description connection').selectOption('personal-gemini'),async()=>{await expect(page.getByRole('region',{name:'Photo model connection'})).toBeVisible();});
  const photos=page.getByRole('region',{name:'Photo model connection',exact:true});
  await steps.action('photo-key','Enter a fictional key for the photo slot',()=>photos.getByLabel('Gemini API key',{exact:true}).fill(KEY),async()=>{await expect(photos.getByLabel('Gemini API key',{exact:true})).toHaveValue(KEY);});
  await steps.action('photo-test','Discover the photo key’s models without inference',()=>photos.getByRole('button',{name:'Test cloud connection'}).click(),async()=>{await expect(photos.getByRole('status')).toContainText('no reflection or inference was sent');expect(generations).toBe(2);});
  await steps.action('photo-model','Choose its model independently',()=>photos.getByLabel('Your Gemini model').selectOption(MODEL),async()=>{await expect(photos.getByLabel('Your Gemini model')).toHaveValue(MODEL);});
  await steps.action('photo-terms','Review the photo connection’s own provider terms',()=>photos.getByLabel(/I have reviewed Google/).check(),async()=>{await expect(photos.getByLabel(/I have reviewed Google/)).toBeChecked();});
  await steps.action('photo-save','Save a separately bound photo key without changing the prompt connection',()=>photos.getByRole('button',{name:'Save private cloud connection'}).click(),async()=>{await expect(photos.getByLabel('Replacement Gemini API key (optional)')).toHaveValue('');await expect(photos.getByRole('status')).toContainText('key cannot be read back');expect(generations).toBe(2);const saved=calls.filter(call=>call.operation==='save');expect(saved.at(-1).connectionId).not.toBe(saved[0].connectionId);});
  const log=await selectionLog(page);expect(JSON.stringify(log)).not.toContain(KEY);expect(log.find(event=>event.type==='PromptRequested')?.payload.contextMode).toBe('generic');
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(KEY);
  const secondContext=await page.context().browser()!.newContext({...info.project.use,baseURL:info.project.use.baseURL??process.env.E2E_BASE_URL??'http://127.0.0.1:4173/'});
  try{
   await secondContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
   const second=await secondContext.newPage();await second.clock.setFixedTime(new Date(FIXTURE_TIME));await network(second);steps.setPage(second);
   await steps.action('second-device','Open Gratitude in a separate browser storage context',()=>second.goto('./journal/'),async()=>{await expect(second.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
   await signIn(second,info,steps,'personal-cloud',true);
   await aiSettings(second,steps,'restored');
   await steps.step('write-only','Restore the account connection without revealing its key',[{description:'The selected model and acknowledgement restore, while the password remains empty',check:async()=>{await expect(second.getByLabel('Your Gemini model')).toHaveValue(MODEL);await expect(second.getByLabel('Replacement Gemini API key (optional)')).toHaveValue('');await expect(second.getByLabel(/I have reviewed Google/)).toBeChecked();expect(await second.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(KEY);}}]);
   await steps.action('test-saved','Test the restored connection using only its opaque reference',()=>second.getByRole('button',{name:'Test cloud connection'}).click(),async()=>{await expect(second.getByRole('status')).toContainText('Connected to your Gemini account');expect(calls.at(-1).key).toBeUndefined();expect(generations).toBe(2);});
   await steps.action('restore-photo','Inspect the independent photo connection on the second device',()=>second.getByText('Photo description model',{exact:true}).click(),async()=>{const restored=second.getByRole('region',{name:'Photo model connection',exact:true});await expect(restored.getByLabel('Your Gemini model')).toHaveValue(MODEL);await expect(restored.getByLabel('Replacement Gemini API key (optional)')).toHaveValue('');await expect(restored.getByLabel(/I have reviewed Google/)).toBeChecked();});
   await steps.action('close-photo','Close photo settings before managing the prompt key',()=>second.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(second.getByRole('region',{name:'Photo model connection',exact:true})).toHaveCount(0);});
   await steps.action('remove','Remove the saved key without switching providers silently',()=>second.getByRole('button',{name:'Remove saved cloud key'}).click(),async()=>{await expect(second.getByRole('status')).toContainText('saved key was removed');await expect(second.getByRole('region',{name:'AI model connection',exact:true}).getByRole('button',{name:'Remove saved cloud key'})).toHaveCount(0);await expect(second.getByRole('region',{name:'AI model connection',exact:true}).getByLabel('Gemini API key',{exact:true})).toHaveValue('');await expect(second.getByRole('button',{name:'Save private cloud connection'})).toBeDisabled();await expect(second.getByLabel('AI provider',{exact:true})).toHaveValue('personal-gemini');});
   await steps.action('photo-retained','Keep the independent photo key after removing the prompt key',()=>second.getByText('Photo description model',{exact:true}).click(),async()=>{const restored=second.getByRole('region',{name:'Photo model connection',exact:true});await expect(restored.getByLabel('Your Gemini model')).toHaveValue(MODEL);await expect(restored.getByRole('button',{name:'Remove saved cloud key'})).toBeVisible();await expect(second.getByRole('region',{name:'AI model connection',exact:true}).getByRole('button',{name:'Save private cloud connection'})).toBeDisabled();expect(generations).toBe(2);});
  }finally{await secondContext.close();}
  steps.setPage(page);
  await steps.action('original-photo-close','Return to the original browser and close its photo settings',()=>page.getByText('Photo description model',{exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Photo model connection',exact:true})).toHaveCount(0);});
  await steps.action('managed','Explicitly choose the managed provider after removing the old key',()=>page.getByLabel('AI provider',{exact:true}).selectOption('gemini'),async()=>{await expect(page.getByRole('button',{name:'Save model settings',exact:true})).toBeVisible();});
  await steps.action('save-managed','Save the managed provider without restoring an obsolete personal credential',()=>page.getByRole('button',{name:'Save model settings',exact:true}).click(),async()=>{await expect(page.getByText(/Current provider: Gemini/)).toBeVisible();});
  await steps.action('reselect-removed','Reselect personal Gemini using fresh account metadata rather than the deleted cached key',()=>page.getByLabel('AI provider',{exact:true}).selectOption('personal-gemini'),async()=>{await expect(page.getByRole('region',{name:'AI model connection',exact:true}).getByLabel('Gemini API key',{exact:true})).toHaveValue('');await expect(page.getByRole('region',{name:'AI model connection',exact:true}).getByRole('button',{name:'Remove saved cloud key'})).toHaveCount(0);expect(generations).toBe(2);});
  steps.generateDocs('Personal Gemini account keys','Enter a fictional key once, test metadata separately, select and save a private connection, and default to generic context until provider terms are explicitly acknowledged. A second browser restores the model and permission without receiving its key, then removes the prompt credential while keeping an independently saved photo key. Emulator tests separately exercise actual encryption, authorization, quota, deduplication and in-flight deletion. Every action compares an unmasked full-page screenshot at zero pixel tolerance.');
 }finally{await environment.cleanup();}
});
