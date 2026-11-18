import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory,navigate,openEditor,editor,expectSynced} from '../helpers/journal-session';
import {aiSettings,toggleAI,saveChoices,AI_ENDPOINT,respond} from '../helpers/gemini';
import {selectionLog,seedPromptTopics} from '../helpers/ai-selection-fixture';
import {replay} from '../../../src/lib/domain';
import {buildContext} from '../../../src/lib/ai/context';
const expect=baseExpect.configure({timeout:15000});
const MUSIC='What small sound brought you a fresh moment of appreciation?';
const NATURE='What detail outdoors have you enjoyed noticing recently?';
test('one-topic regular prompts rotate visible offers, preserve feedback and use matching dated history',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(420000);
 const steps=new TestStepHelper(page,info),requests:any[]=[];
 await page.route(AI_ENDPOINT,async route=>{
  const body=route.request().postDataJSON(),json=JSON.parse(body.contents[0].parts[0].text);requests.push(json);
  expect(body.systemInstruction.parts[0].text).toContain('Historical reflections are background about the user');expect(json.mode).toBe('regular');expect(json).not.toHaveProperty('topics');expect(JSON.stringify(json)).not.toContain('fixture-');
  if(requests.length===2)return route.fulfill({status:503,json:{error:{message:'Fictional temporary provider outage'}}});
  await respond(route,requests.length===1?MUSIC:NATURE);
 });
 await startJournal(page,info,steps,'topic-prompts');
 await seedHistory(page,[{text:'The birds in the garden.',recordedAt:'2026-09-28T01:00:00Z'},{text:'Clouds over the hills.',recordedAt:'2026-09-29T01:00:00Z'},{text:'A new song on the radio.',recordedAt:'2026-09-30T01:00:00Z'}]);
 await seedPromptTopics(page,['nature','music'],{'fixture-1':'nature','fixture-2':'nature','fixture-3':'music'});
 await steps.step('history','Start with three fictional classified reflections and two shared interests',[{description:'The Today card is ready; no model request has occurred',check:async()=>{await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeVisible();expect(requests).toHaveLength(0);}}]);
 await aiSettings(page,steps,'configure');await toggleAI(page,steps,'enable',true);
 await steps.action('journal','Share matching history explicitly',()=>page.getByRole('switch',{name:'Use journal entries',exact:true}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use journal entries',exact:true})).toHaveAttribute('aria-checked','true');});
 await steps.action('feedback-consent','Share explicit feedback separately',()=>page.getByRole('switch',{name:'Use prompt feedback',exact:true}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use prompt feedback',exact:true})).toHaveAttribute('aria-checked','true');});
 await saveChoices(page,steps,'save');await navigate(page,steps,'today','Today');
 await steps.action('generate','Generate for the least-reflected-on selected topic',()=>page.getByRole('button',{name:'Generate a prompt',exact:true}).click(),async()=>{
  await expect(page.locator('.daily-prompt h2')).toHaveText(MUSIC,{timeout:30000});expect(requests).toHaveLength(1);expect(requests[0].topic.description).toBe('Music and sounds: listening, playing, singing.');expect(requests[0].reflections.recent).toEqual([{date:'2026-09-30',text:'A new song on the radio.'}]);
 });
 await steps.action('why','See the real topic and sparse source count',()=>page.getByRole('button',{name:'Why this prompt?'}).click(),async()=>{await expect(page.locator('.explanation')).toContainText('Regular prompt · Music');await expect(page.locator('.explanation')).toContainText('1 saved reflections (1 of 20 context units)');await expect(page.locator('.explanation')).toContainText('recent: 1');});
 await steps.action('open-feedback','Open feedback for this exact question',()=>page.getByRole('button',{name:'Give prompt feedback'}).click(),async()=>{await expect(page.getByLabel('What would make prompts better for you?')).toBeVisible();});
 await steps.action('feedback-text','Write an explicit preference',()=>page.getByLabel('What would make prompts better for you?').fill('Keep inviting me to notice fresh details.'),async()=>{await expect(page.getByLabel('What would make prompts better for you?')).toHaveValue('Keep inviting me to notice fresh details.');});
 await steps.action('feedback-save','Save the prompt and feedback pair',()=>page.getByRole('button',{name:'Save feedback',exact:true}).click(),async()=>{await expect(page.getByText('Prompt feedback saved.',{exact:true})).toBeVisible();});
 await steps.action('close-why','Close the explanation',()=>page.getByRole('button',{name:'Why this prompt?'}).click(),async()=>{await expect(page.locator('.explanation')).toHaveCount(0);});
 await steps.action('outage','Ask for a different topic during a fictional outage',()=>page.getByRole('button',{name:'Another prompt',exact:true}).click(),async()=>{
  await expect(page.getByRole('button',{name:'Try another request',exact:true})).toBeEnabled({timeout:30000});await expect(page.locator('.daily-prompt h2')).toHaveText(MUSIC);expect(requests).toHaveLength(2);expect(requests[1].topic.description).toContain('Landscapes');const state=replay(await selectionLog(page));expect(state.rotation.offers.filter(o=>o.kind==='ai')).toHaveLength(1);
 });
 await steps.action('retry','Request again without counting a failed prompt as an offer',()=>page.getByRole('button',{name:'Try another request',exact:true}).click(),async()=>{
  await expect(page.locator('.daily-prompt h2')).toHaveText(NATURE,{timeout:30000});expect(requests).toHaveLength(3);expect(requests[2].topic).toEqual(requests[1].topic);expect(requests[2].reflections.recent.map((e:any)=>e.text).sort()).toEqual(['Clouds over the hills.','The birds in the garden.']);expect(requests[2].promptFeedback).toEqual([{prompt:MUSIC,feedback:'Keep inviting me to notice fresh details.'}]);expect(requests[2].differentPromptRequest).toContain(MUSIC);
 });
 await openEditor(page,steps,'write');
 await steps.action('reflection','Write a response to the offered topic',()=>editor(page).fill('I noticed the soft light on the leaves today.'),async()=>{await expect(editor(page)).toHaveText('I noticed the soft light on the leaves today.');});
 await steps.action('save-reflection','Save the exact received question with the reflection',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.locator('.saved-card .entry-prompt')).toHaveText(NATURE,{timeout:30000});});
 await steps.action('done','Return to the journal',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your journal',exact:true})).toBeVisible();});
 await steps.action('reload','Restore the saved question and offer history without inference',()=>page.reload(),async()=>{await expectSynced(page);expect(requests).toHaveLength(3);await expect(page.locator('article.card .entry-prompt').first()).toHaveText(NATURE);});
 await navigate(page,steps,'settings','Settings');
 await steps.action('privacy','Open journal recovery',()=>page.getByRole('button',{name:/^Privacy & data/}).click(),async()=>{await expect(page.getByRole('button',{name:'Rebuild local view',exact:true})).toBeVisible();});
 await steps.action('rebuild','Rebuild selected topics, offers and exact provider JSON from source events',()=>page.getByRole('button',{name:'Rebuild local view',exact:true}).click(),async()=>{
  await expectSynced(page);expect(requests).toHaveLength(3);const log=await selectionLog(page),full=replay(log);expect(replay(log.slice(10),replay(log.slice(0,10)))).toEqual(full);expect(full.rotation.offers.filter(o=>o.kind==='ai').map(o=>o.topicId)).toEqual(['music','nature']);let index=0;for(const [i,e]of log.entries())if(e.type==='PromptRequested')expect(JSON.parse(buildContext(replay(log.slice(0,i)),e))).toEqual(requests[index++]);
 });
 steps.generateDocs('One topic, fresh reflections','The least-reflected-on selected interest receives a regular prompt with only matching logical-date history. A visible successful offer rotates to the other interest; a provider failure does not count as an offer. Explicit feedback preserves its exact question, sparse counts are explained, and saving, cached reload and complete replay perform no inference. Every user action is followed by an unmasked zero-pixel screenshot with checks underneath.');
});
