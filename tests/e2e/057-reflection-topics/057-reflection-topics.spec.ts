import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,writeReflection,navigate,expectSynced} from '../helpers/journal-session';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {replay} from '../../../src/lib/domain';
const expect=baseExpect.configure({timeout:15_000});
test('choose, correct and replay a reflection topic without changing the writing',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info);
 const pencil=page.getByRole('button',{name:'Change reflection topic',exact:true});
 const picker=page.getByRole('combobox',{name:'Reflection topic',exact:true});
 await startJournal(page,info,steps,'reflection-topics');
 await writeReflection(page,steps,'The birds singing outside my window.','reflection');
 await steps.action('open-saved-topic','Choose a category from the saved reflection card',()=>pencil.click(),async()=>{
  await expect(picker).toBeFocused();await expect(page.getByRole('option',{name:'Not yet classified',exact:false})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('option',{name:'Nature & outdoors',exact:true})).toBeAttached();
 });
 await steps.action('search','Search the entire topic catalogue',()=>picker.fill('nature'),async()=>{await expect(page.getByRole('option')).toHaveCount(1);});
 await steps.action('choose','Save the selected topic without editing the reflection',()=>page.getByRole('option',{name:'Nature & outdoors',exact:true}).click(),async()=>{
  await expect(page.locator('.topic-label')).toHaveText('Nature & outdoors');await expect(picker).toHaveCount(0);await expectSynced(page);
 });
 await steps.action('done','Return to Journal',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.locator('article.card')).toHaveCount(1);});
 await steps.action('detail','Read the saved category beside Edit reflection',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.detail .topic-label')).toHaveText('Nature & outdoors');await expect(page.locator('.topic-label')).toHaveCSS('font-weight','700');});
 await steps.action('reopen','Keep the current category selected when reopening the picker',()=>pencil.click(),async()=>{await expect(page.getByRole('option',{name:'Nature & outdoors',exact:false})).toHaveAttribute('aria-selected','true');});
 await steps.action('cancel-outside','Click away without changing the category',()=>page.locator('.detail time').click(),async()=>{await expect(picker).toHaveCount(0);await expect(page.locator('.topic-label')).toHaveText('Nature & outdoors');});
 await steps.action('unknown-open','Open topic editing again',()=>pencil.click(),async()=>{await expect(picker).toBeFocused();});
 await steps.action('unknown-search','Find the explicit Unknown category',()=>picker.fill('unknown'),async()=>{await expect(page.getByRole('option')).toHaveCount(1);});
 await steps.action('unknown','Save Unknown using the keyboard',()=>picker.press('Enter'),async()=>{await expect(page.locator('.topic-label')).toHaveText('Unknown');await expect(picker).toHaveCount(0);});
 await steps.action('offline-open','Open the category picker before losing the connection',()=>pencil.click(),async()=>{await expect(picker).toBeFocused();});
 await page.context().setOffline(true);
 await steps.action('offline-search','Search topics while offline',()=>picker.fill('music'),async()=>{await expect(page.getByRole('option')).toHaveCount(1);});
 await steps.action('offline-failure','Keep the saved category when a change cannot sync',()=>page.getByRole('option',{name:'Music',exact:true}).click(),async()=>{await expect(page.getByRole('alert')).toContainText('Connect and wait for your journal to sync first.');await expect(page.getByRole('option',{name:'Music',exact:true})).toHaveAttribute('aria-selected','false');});
 await page.context().setOffline(false);
 await steps.action('retry','Retry the same explicit choice after reconnecting',()=>page.getByRole('option',{name:'Music',exact:true}).click(),async()=>{await expect(page.locator('.topic-label')).toHaveText('Music');await expect(page.getByRole('alert')).toHaveCount(0);await expectSynced(page);});
 await steps.action('reload','Restore the chosen category from the synced journal',()=>page.reload(),async()=>{await expectSynced(page);await expect(page.getByRole('heading',{name:'Your journal',exact:true})).toBeVisible();});
 await steps.action('restored-detail','Read the same topic after reload',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.topic-label')).toHaveText('Music');});
 await navigate(page,steps,'settings','Settings');
 await steps.action('privacy','Open journal recovery',()=>page.getByRole('button',{name:/^Privacy & data/}).click(),async()=>{await expect(page.getByRole('button',{name:'Rebuild local view',exact:true})).toBeVisible();});
 await steps.action('rebuild','Rebuild topics and writing from the immutable event stream',()=>page.getByRole('button',{name:'Rebuild local view',exact:true}).click(),async()=>{await expectSynced(page);});
 await navigate(page,steps,'journal','Journal');
 await steps.action('replayed','Verify the manually corrected topic after full replay',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{
  await expect(page.locator('.topic-label')).toHaveText('Music');await expect(page.locator('.detail')).toContainText('The birds singing outside my window.');
  const log=await selectionLog(page),state=replay(log);expect(state.entries[0].revision).toBe(1);expect(state.topics[state.entries[0].id].topicId).toBe('music');
  expect(log.filter(e=>e.type==='ReflectionTopicChosen')).toHaveLength(3);expect(replay(log.slice(2),replay(log.slice(0,2)))).toEqual(state);
 });
 steps.generateDocs('Editable reflection topics','Saved and detailed reflection cards share a searchable topic picker. All topics are available independently of AI interests. Current selection, click-away cancellation, keyboard save, offline failure/retry, reload and full replay preserve the reflection body, identity and revision. Every user action has an unmasked zero-tolerance screenshot.');
});
