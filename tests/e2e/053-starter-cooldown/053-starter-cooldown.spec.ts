import {test,expect as baseExpect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,writeBatch,Timestamp} from 'firebase/firestore';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,navigate,openEditor,expectSynced} from '../helpers/journal-session';
import {selectionLog} from '../helpers/ai-selection-fixture';
import {STARTER_CATALOGUE} from '../../../src/lib/starter-catalogue';
import {replay,parseAction,type SourceAction} from '../../../src/lib/domain';
const expect=baseExpect.configure({timeout:15000});
test('accepted starters become eligible on day thirty without recycling prompts earlier',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(600000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});
 await startJournal(page,info,steps,'starter-rest','2026-08-29T04:31:07.000Z');
 await navigate(page,steps,'settings','Settings');
 const uid=await page.evaluate(async()=>{const db=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'));return db!.name!.split(':').at(-2)!;});
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 // Historical literal acceptance actions are fixture inputs before the dated visits.
 try{await environment.withSecurityRulesDisabled(async context=>{
  const db=context.firestore(),root=`users/${uid}/streams/v1`,head=await getDoc(doc(db,root)),offset=head.get('sequence')??0,batch=writeBatch(db);
  const actions:SourceAction[]=STARTER_CATALOGUE.map((p,i)=>{const day=i===0?'2026-08-01':'2026-08-02';return parseAction({eventId:`a_${day}_${p.id}`,type:'PromptAccepted',schemaVersion:1,payload:{day,promptId:p.id}});});
  for(const [i,action] of actions.entries())batch.set(doc(db,root+'/events/'+action.eventId),{...action,sequence:offset+i+1,recordedAt:Timestamp.fromDate(new Date('2026-08-29T04:31:07Z'))});
  batch.set(doc(db,root),{sequence:offset+actions.length,lastEventId:actions.at(-1)!.eventId});batch.set(doc(db,root+'/rotation/control'),{lastEventId:actions.at(-1)!.eventId});await batch.commit();
 });}finally{await environment.cleanup();}
 await steps.action('day-twenty-nine','Open the journal twenty-nine days after the earliest accepted starter',async()=>{await page.clock.setFixedTime(new Date('2026-08-30T04:31:07Z'));await page.reload();},async()=>{await expect(page.locator('.daily-prompt h2')).toHaveText('No starter prompts remain today. You can write your own prompt.');await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeEnabled();const state=replay(await selectionLog(page));expect(state.rotation.offers.filter(o=>o.day==='2026-08-30')).toHaveLength(0);});
 await steps.action('day-thirty','Open the next local day when the first starter finishes its rest',async()=>{await page.clock.setFixedTime(new Date('2026-08-31T04:31:07Z'));await page.reload();},async()=>{await expectSynced(page);await expect(page.locator('.daily-prompt h2')).toHaveText(STARTER_CATALOGUE[0].text);});
 await openEditor(page,steps,'use-rested');
 const state=replay(await selectionLog(page));expect(state.rotation.accepted[STARTER_CATALOGUE[0].id]).toBe('2026-08-31');
 steps.generateDocs('Thirty-day starter rest','A raw fictional acceptance history leaves no eligible starter on day twenty-nine, keeps writing available, and makes the first starter eligible on day thirty. Every user action is followed by an unmasked zero-pixel screenshot with checks beneath it.');
});
