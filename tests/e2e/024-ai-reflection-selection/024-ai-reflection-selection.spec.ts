import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate,openEditor,editor,expectEditor,expectSynced} from '../helpers/journal-session';
import {aiSettings,saveChoices,toggleAI,AI_ENDPOINT,respond,FIRST_PROMPT,SECOND_PROMPT} from '../helpers/gemini';
import {seedSelectionHistory,selectionLog} from '../helpers/ai-selection-fixture';
import {replay,isMixedRequest} from '../../../src/lib/domain';
import {buildContext} from '../../../src/lib/ai/context';
const expect=baseExpect.configure({timeout:15_000});
type Context={referenceDate:string;timeZone:string;preferences:string;reflections:Record<string,{date:string;text:string}[]>;promptFeedback:string[]};
test('personalised generation mixes twenty logical-date reflections and replays successful usage',async({page},info)=>{
  test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
  const steps=new TestStepHelper(page,info),contexts:Context[]=[];
  await page.route(AI_ENDPOINT,async route=>{
    const body=route.request().postDataJSON();contexts.push(JSON.parse(body.contents[0].parts[0].text));
    await respond(route,contexts.length===1?FIRST_PROMPT:SECOND_PROMPT);
  });
  await startJournal(page,info,steps,'mixed-reflections');
  await seedSelectionHistory(page);
  await steps.step('history','Replay imported and in-app history with old entry dates and today’s receipt time',[{description:'Historical entries leave Today ready for a new reflection without provider calls',check:async()=>{await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeVisible();expect(contexts).toHaveLength(0);}}]);
  await aiSettings(page,steps,'configure');
  await toggleAI(page,steps,'enable',true);
  await steps.action('journal-consent','Choose to share saved reflection context',()=>page.getByRole('switch',{name:'Use journal entries'}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use journal entries'})).toHaveAttribute('aria-checked','true');});
  await steps.action('feedback-consent','Choose to share explicit prompt feedback',()=>page.getByRole('switch',{name:'Use prompt feedback'}).click(),async()=>{await expect(page.getByRole('switch',{name:'Use prompt feedback'})).toHaveAttribute('aria-checked','true');});
  await saveChoices(page,steps,'save-choices');
  await navigate(page,steps,'today','Today');
  await steps.action('generate','Generate using twenty saved reflections selected by logical date',()=>page.getByRole('button',{name:'Find me a prompt',exact:true}).click(),async()=>{
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT);expect(contexts).toHaveLength(1);
    const c=contexts[0];expect(Object.values(c.reflections).map(g=>g.length)).toEqual([8,7,0,5]);
    expect(c.referenceDate).toBe('2026-10-01');expect(c.timeZone).toBe('Australia/Hobart');
    expect(c.reflections.anniversary).toContainEqual({date:'2025-10-01',text:'An imported anniversary walk.'});
    expect(c.reflections.recent.every(e=>e.date>='2026-09-17'&&e.date<'2026-10-01')).toBe(true);
    expect(new Set(Object.values(c.reflections).flat().map(e=>e.text)).size).toBe(20);
    expect(JSON.stringify(c)).not.toContain('entryId');expect(JSON.stringify(c)).not.toContain('userNotes');
  },'The intercepted provider input has 8 anniversaries, 7 rediscoveries and 5 recent reflections, including the original imported date');
  await steps.action('why','See the actual number of saved sources',()=>page.getByRole('button',{name:'Why this prompt?'}).click(),async()=>{await expect(page.locator('.explanation')).toContainText('20 saved reflections and 0 pieces of feedback');});
  await steps.action('feedback','Open freeform prompt feedback',()=>page.getByRole('button',{name:'Give prompt feedback'}).click(),async()=>{await expect(page.getByLabel('What would make prompts better for you?')).toBeVisible();});
  await steps.action('write-feedback','Write the feedback to share with the next request',()=>page.getByLabel('What would make prompts better for you?').fill('More about quiet outdoor moments, please.'),async()=>{await expect(page.getByLabel('What would make prompts better for you?')).toHaveValue('More about quiet outdoor moments, please.');});
  await steps.action('save-feedback','Save explicit feedback without inference',()=>page.getByRole('button',{name:'Save feedback'}).click(),async()=>{await expect(page.getByText('Prompt feedback saved.',{exact:true})).toBeVisible();expect(contexts).toHaveLength(1);});
  await steps.action('close-why','Close the source explanation',()=>page.getByRole('button',{name:'Why this prompt?'}).click(),async()=>{await expect(page.locator('.explanation')).toHaveCount(0);});
  await steps.action('another','Rediscover sources that have not yet informed a successful prompt',()=>page.getByRole('button',{name:'Another prompt',exact:true}).click(),async()=>{
    await expect(page.locator('.daily-prompt h2')).toHaveText(SECOND_PROMPT);expect(contexts).toHaveLength(2);
    const previous=new Set(Object.values(contexts[0].reflections).flat().map(e=>e.text));
    expect(contexts[1].reflections.rediscovery.every(e=>!previous.has(e.text))).toBe(true);
    expect(contexts[1].promptFeedback).toEqual(['More about quiet outdoor moments, please.']);
  },'Successful-use history rotates rediscovery sources and only the saved freeform feedback enters the JSON');
  await openEditor(page,steps,'editor');
  await steps.action('draft','Keep unfinished writing out of Gemini context',()=>editor(page).fill('UNSAVED_PRIVATE_DRAFT'),async()=>{await expectEditor(page,'UNSAVED_PRIVATE_DRAFT');});
  await steps.action('backfill-date','Choose a backfill date for this reflection',()=>page.getByLabel('Entry date and time').fill('2026-09-24T12:00'),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-24T12:00');});
  await steps.action('editor-generate','Select historical context relative to the editor’s date',()=>page.getByRole('button',{name:'Generate AI prompt',exact:true}).click(),async()=>{
    await expect(page.getByRole('complementary',{name:'Generated prompt option'})).toBeVisible();expect(contexts).toHaveLength(3);
    expect(contexts[2].referenceDate).toBe('2026-09-24');
    expect(Object.values(contexts[2].reflections).flat().every(e=>e.date<'2026-09-24')).toBe(true);
    expect(JSON.stringify(contexts[2])).not.toContain('UNSAVED_PRIVATE_DRAFT');await expectEditor(page,'UNSAVED_PRIVATE_DRAFT');
  },'The chosen backfill date is captured; later entries and the unsaved response are excluded');
  await steps.action('keep-current','Keep the existing question after receiving a generated option',()=>page.getByRole('button',{name:'Keep current prompt',exact:true}).click(),async()=>{await expect(page.getByRole('complementary',{name:'Generated prompt option'})).toHaveCount(0);});
  await steps.action('back','Return to Today without saving the draft',()=>page.locator('button.back').click(),async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText(SECOND_PROMPT);expect(contexts).toHaveLength(3);});
  await steps.action('reload','Restore cached history without another AI request',()=>page.reload(),async()=>{await expectSynced(page);expect(contexts).toHaveLength(3);});
  await navigate(page,steps,'settings','Settings');
  await steps.action('privacy','Open journal recovery',()=>page.getByRole('button',{name:/^Privacy & data/}).click(),async()=>{await expect(page.getByRole('button',{name:'Rebuild local view',exact:true})).toBeVisible();});
  await steps.action('replay','Recreate selection usage and exact prompts from source events',()=>page.getByRole('button',{name:'Rebuild local view',exact:true}).click(),async()=>{
    await expectSynced(page);expect(contexts).toHaveLength(3);
    const log=await selectionLog(page),full=replay(log);
    expect(full.ai.usage).not.toEqual({});expect(replay(log.slice(20),replay(log.slice(0,20)))).toEqual(full);
    let contextIndex=0;
    for(const [index,event] of log.entries()) if(event.type==='PromptRequested'&&isMixedRequest(event)) {
      const snapshot=replay(log.slice(0,index));
      expect(JSON.parse(buildContext(snapshot,event))).toEqual(contexts[contextIndex++]);
    }
  },'Full and cached replay agree on successful source usage; recorded seeds and revisions reconstruct each intercepted context without inference');
  steps.generateDocs('Twenty reflections for a personalised gratitude prompt','Fictional imported and in-app entries are selected by logical date: eight balanced anniversaries, seven rediscoveries and five recent reflections. Explicit feedback, consent, a dated editor, unsaved-text exclusion, cached reload and full replay are verified at the intercepted Gemini boundary. Each user action has an unmasked full-page zero-pixel screenshot with checks beneath it.');
});
