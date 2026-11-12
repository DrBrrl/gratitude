import {test,expect as baseExpect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFile} from 'node:fs/promises';
import type {Firestore} from 'firebase/firestore';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate,expectSynced} from '../helpers/journal-session';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {archiveFixture} from '../../fixtures/import-journal.mjs';
import {parseImportArchive} from '../../../src/lib/import-archive';
import {appendReflection} from '../../../src/lib/firebase/append';
import {answersInput,defaultAnswers} from '../../../src/lib/onboarding';
import {exportJournal} from '../../../src/lib/export';
import {replay} from '../../../src/lib/domain';
const expect=baseExpect.configure({timeout:15_000});
test('assign an unselected custom topic to an imported reflection and export it',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info),picker=page.getByRole('combobox',{name:'Reflection topic',exact:true});
 await startJournal(page,info,steps,'imported-topics');
 // Fictional saved vocabulary and legacy import are fixture inputs, not UI actions.
 const uid=await page.evaluate(async()=>{const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))!.name!;return name.split(':').at(-2)!;});
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 const archive=await parseImportArchive(new Blob([new Uint8Array(archiveFixture({count:1,photos:[],missing:[]}).bytes)]),new Date('2026-10-01T04:31:07Z'));
 const plan=archive.records[0];
 try{
  const db=environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore() as unknown as Firestore;
  await appendReflection(db,uid,{eventId:'topic-vocabulary',type:'OnboardingAnswersConfirmed',schemaVersion:1,payload:{...answersInput({...defaultAnswers(),customTopics:[{id:'custom_birds',label:'Birdwatching',description:'Birds on walks.',selected:false}]}),previousEventId:null}});
  await appendReflection(db,uid,{eventId:plan.confirmationId,type:'ImportRecordConfirmed',schemaVersion:1,payload:plan.input});
  await appendReflection(db,uid,{eventId:plan.completionId,type:'ReflectionImported',schemaVersion:1,payload:{sourceKey:plan.input.sourceKey,confirmationId:plan.confirmationId,entryId:plan.input.entryId,expectedRevision:0,photoSlot:null}});
 }finally{await environment.cleanup();}
 await navigate(page,steps,'journal','Journal');
 await steps.action('imported-detail','Open the original imported reflection',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.topic-label')).toHaveText('Not yet classified');});
 await steps.action('open-topics','Open all categories, including unselected interests',()=>page.getByRole('button',{name:'Change reflection topic',exact:true}).click(),async()=>{await expect(picker).toBeFocused();await expect(page.getByRole('option',{name:'Birdwatching',exact:true})).toBeAttached();});
 await steps.action('search-custom','Type to find a custom category',()=>picker.fill('bird'),async()=>{await expect(page.getByRole('option')).toHaveCount(1);});
 await steps.action('assign-custom','Save an unselected custom category on imported writing',()=>page.getByRole('option',{name:'Birdwatching',exact:true}).click(),async()=>{await expect(page.locator('.topic-label')).toHaveText('Birdwatching');await expectSynced(page);});
 await steps.action('reopen-custom','Retain the saved custom selection',()=>page.getByRole('button',{name:'Change reflection topic',exact:true}).click(),async()=>{await expect(page.getByRole('option',{name:/^Birdwatching/})).toHaveAttribute('aria-selected','true');});
 await steps.action('escape','Cancel category editing with Escape',()=>picker.press('Escape'),async()=>{await expect(picker).toHaveCount(0);await expect(page.getByRole('button',{name:'Change reflection topic',exact:true})).toBeFocused();});
 await navigate(page,steps,'settings','Settings');
 await steps.action('export','Open journal export',()=>page.getByRole('button',{name:/^Export journal/}).click(),async()=>{await expect(page.getByRole('radio',{name:/JSON/})).toBeVisible();});
 await steps.action('json','Choose the full JSON format',()=>page.getByRole('radio',{name:/JSON/}).check(),async()=>{await expect(page.getByRole('radio',{name:/JSON/})).toBeChecked();});
 await steps.action('prepare','Prepare the category with the imported writing',()=>page.getByRole('button',{name:'Prepare export',exact:true}).click(),async()=>{await expect(page.getByRole('status')).toHaveText('Export ready');});
 const downloaded=page.waitForEvent('download');
 await steps.action('download','Download JSON with category and original import provenance',()=>page.getByRole('button',{name:'Download JSON',exact:true}).click(),async()=>{
  const data=JSON.parse(await readFile((await (await downloaded).path())!,'utf8'));expect(data.version).toBe(4);expect(data.entries[0].topic).toEqual({id:'custom_birds',label:'Birdwatching',origin:'user'});expect(data.entries[0].origin.sourceKey).toBe(plan.input.sourceKey);
  const log=await selectionLog(page),state=replay(log);expect(state.entries[0].entryAt).toBe(new Date(plan.input.source.createdOn).toISOString());expect(state.entries[0].revision).toBe(1);expect(state.onboarding.answers.customTopics[0].selected).toBe(false);
  expect(exportJournal(state,'markdown').content).not.toMatch(/Birdwatching|topicId|Not yet classified/);
 });
 steps.generateDocs('Topics on imported reflections','An existing imported reflection starts unclassified. A saved but unselected custom interest is searchable, assignable, cancellable and exported in JSON without changing the original date, prompt, identity or import provenance. Markdown retains the simple journal format. Every user action has an unmasked zero-tolerance screenshot.');
});
