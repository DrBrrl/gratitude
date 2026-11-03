import { test, expect as baseExpect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, navigate, expectSynced, signIn, FIXTURE_TIME } from '../helpers/journal-session';
import { selectionLog } from '../helpers/ai-selection-fixture';
import { replay } from '../../../src/lib/domain';
const expect = baseExpect.configure({timeout:15_000});

test('private answers, editable topics and prompt controls sync without enabling AI or a public profile', async ({page,browser},info) => {
  test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
  const steps = new TestStepHelper(page,info,{paintStaticPage:true});let inference=0;
  await page.route(/firebasevertexai\.googleapis\.com|\/v1\/chat\/completions/,route=>{inference++;return route.abort();});
  await startJournal(page,info,steps,'private-answers');
  await navigate(page,steps,'settings','Settings');
  await steps.action('answers','Open the private questionnaire',()=>page.getByRole('button',{name:/^Personalise your journal/}).click(),async()=>{
    await expect(page.getByLabel('What would you like to be called?')).toHaveValue('');
    await expect(page.getByRole('table').getByRole('button',{pressed:true})).toHaveCount(0);
    await expect(page.getByRole('radio',{name:/^Narrow/})).toBeChecked();
  });
  await steps.action('name','Enter a private preferred name',()=>page.getByLabel('What would you like to be called?').fill('Sam'),async()=>{await expect(page.getByLabel('What would you like to be called?')).toHaveValue('Sam');});
  await steps.action('pronouns','Enter optional private pronouns',()=>page.getByLabel('Share your pronouns if you like!').fill('they/them'),async()=>{await expect(page.getByLabel('Share your pronouns if you like!')).toHaveValue('they/them');});
  await steps.action('music','Select a topic with a non-colour check',()=>page.getByRole('button',{name:'Music',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Music',exact:true})).toHaveAttribute('aria-pressed','true');});
  await steps.action('edit-description','Open the selected topic’s description editor',()=>page.getByRole('button',{name:'Edit Music description',exact:true}).click(),async()=>{await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Music description', {exact:true})).toHaveValue('Music and sounds: listening, playing, singing.');});
  await steps.action('write-description','Make the topic description personal',()=>page.getByLabel('Music description',{exact:true}).fill('Music and sounds: listening, playing piano, singing.'),async()=>{await expect(page.getByRole('dialog')).toContainText('52 / 149');});
  await steps.action('save-description','Keep the edited description in the setup draft',()=>page.getByRole('button',{name:'Save description',exact:true}).click(),async()=>{await expect(page.getByRole('dialog')).toBeHidden();await expect(page.getByRole('row').filter({has:page.getByRole('button',{name:'Music',exact:true})})).toContainText('playing piano');});
  await steps.action('community','Select another interest',()=>page.getByRole('button',{name:'Community & kindness',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Community & kindness',exact:true})).toHaveAttribute('aria-pressed','true');});
  await steps.action('custom-name','Name a custom topic',()=>page.getByLabel('Your topic',{exact:true}).fill('Birdwatching'),async()=>{await expect(page.getByLabel('Your topic',{exact:true})).toHaveValue('Birdwatching');});
  await steps.action('custom-description','Describe the custom topic',()=>page.getByLabel('Topic description',{exact:true}).fill('Noticing birds on walks.'),async()=>{await expect(page.getByLabel('Topic description',{exact:true})).toHaveValue('Noticing birds on walks.');});
  await steps.action('custom-add','Add a row without silently selecting it',()=>page.getByRole('button',{name:'Add topic',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Birdwatching',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByLabel('Your topic',{exact:true})).toHaveValue('');});
  await steps.action('custom-select','Explicitly select the custom topic',()=>page.getByRole('button',{name:'Birdwatching',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Birdwatching',exact:true})).toHaveAttribute('aria-pressed','true');});
  await steps.action('scope','Choose Intermediate prompt scope',()=>page.getByRole('radio',{name:/^Intermediate/}).check(),async()=>{await expect(page.getByRole('radio',{name:/^Intermediate/})).toBeChecked();});
  const slider=page.getByRole('slider');
  await steps.action('focus-limit','Focus the word-limit slider',()=>slider.focus(),async()=>{await expect(slider).toBeFocused();});
  await steps.action('change-limit','Increase the limit by one ten-word step',()=>slider.press('ArrowRight'),async()=>{await expect(slider).toHaveValue('90');await expect(page.getByText('Prompts under 90 words',{exact:true})).toBeVisible();});
  await steps.action('save','Confirm the private answers',()=>page.getByRole('button',{name:'Save my answers',exact:true}).click(),async()=>{await expect(page.getByRole('status')).toHaveText('Your answers are saved.');await expectSynced(page);expect(inference).toBe(0);});
  await steps.action('journal','Use the private name in Journal',()=>page.getByRole('navigation').getByRole('button',{name:'Journal',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Sam’s Journal',exact:true})).toBeVisible();});
  await steps.action('today','Use the private name on Today',()=>page.getByRole('navigation').getByRole('button',{name:'Today',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time, Sam!',exact:true})).toBeVisible();});
  await steps.action('reload','Restore private preferences from the cached and cloud journal',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.getByRole('heading',{name:'Reflection time, Sam!',exact:true})).toBeVisible();expect(inference).toBe(0);});
  const secondContext=await browser.newContext({...info.project.use,baseURL:String(info.project.use.baseURL)});
  try {
    await secondContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
    const second=await secondContext.newPage();steps.setPage(second);await second.clock.setFixedTime(new Date(FIXTURE_TIME));
    await steps.action('second-open','Open another device',()=>second.goto('./journal/'),async()=>{await expect(second.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
    await signIn(second,info,steps,'private-answers',true,'Today',false,undefined,'Sam');
    await navigate(second,steps,'second-settings','Settings');
    await steps.action('second-answers','Inspect synchronized answers on the second device',()=>second.getByRole('button',{name:/^Personalise your journal/}).click(),async()=>{
      await expect(second.getByLabel('What would you like to be called?')).toHaveValue('Sam');
      await expect(second.getByRole('button',{name:'Birdwatching',exact:true})).toHaveAttribute('aria-pressed','true');
      await expect(second.getByRole('slider')).toHaveValue('90');
      const log=await selectionLog(second),state=replay(log);expect(state.onboarding.answers.useAnswers).toBe(false);expect(state.ai.choices.enabled).toBe(false);expect(state.entries).toHaveLength(0);
      expect(replay(log.slice(1),replay(log.slice(0,1)))).toEqual(state);
    });
    await steps.action('clear-open','Review what clearing private answers affects',()=>second.getByRole('button',{name:'Clear answers',exact:true}).click(),async()=>{await expect(second.getByRole('region',{name:'Clear questionnaire answers'})).toBeVisible();});
    await steps.action('clear-confirm','Clear answers and their AI permission together',()=>second.getByRole('button',{name:'Confirm clear answers',exact:true}).click(),async()=>{await expect(second.getByRole('status')).toHaveText('Your answers are cleared.');await expect(second.getByLabel('What would you like to be called?')).toHaveValue('');await expect(second.getByRole('slider')).toHaveValue('80');});
  } finally {await secondContext.close();steps.setPage(page);}
  await steps.action('cleared-on-first','See the cleared private heading on the original device',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();expect(inference).toBe(0);});
  steps.generateDocs('Private questionnaire answers across devices','Optional private identity, seventeen editable topic rows, a repeatable custom topic, scope and a ten-word slider step are confirmed as literal actions. A second device restores them and clears the answers without changing the journal or enabling AI. Every user action has an unmasked full-page zero-pixel comparison and checks below its image.');
});
