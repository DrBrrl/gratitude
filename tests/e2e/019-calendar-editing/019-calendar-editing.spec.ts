import {test,expect as baseExpect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,getDocs,orderBy,query,type Firestore} from 'firebase/firestore';
import {appendReflection,decodeEvent} from '../../../src/lib/firebase/append';
import {replay} from '../../../src/lib/domain';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory,navigate,editor,expectEditor,backFromEditor,expectSynced} from '../helpers/journal-session';
import {uidFor} from '../helpers/import-fixture';
const expect=baseExpect.configure({timeout:15_000});
test('calendar repairs protect existing drafts and date edits retain their original return month',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(480_000);
 const steps=new TestStepHelper(page,info);
 await startJournal(page,info,steps,'calendar-edit');
 await seedHistory(page,[{text:'A Monday memory.',recordedAt:'2026-09-28T01:00:00Z'}]);
 await navigate(page,steps,'journal','Journal');
 await steps.action('new','Start an independent reflection',()=>page.getByRole('button',{name:'New entry',exact:true}).click(),async()=>{await expect(editor(page)).toBeVisible();});
 await steps.action('existing-draft','Leave a draft for today before choosing a different date',()=>editor(page).fill('Keep this independent draft.'),async()=>{await expectEditor(page,'Keep this independent draft.');await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();});
 await backFromEditor(page,steps,'back','Journal');
 await steps.action('calendar','Open the calendar from Journal',()=>page.getByRole('button',{name:'Open calendar',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your calendar',exact:true})).toBeVisible();});
 await steps.action('month','Browse a past month',()=>page.getByLabel('Jump to month').fill('2026-09'),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');});
 await steps.action('empty-date','Open an empty dated journal',()=>page.locator('.calendar-scroll [data-day="2026-09-29"]').click(),async()=>{await expect(page.locator('.date-heading')).toContainText('29 September 2026');});
 await steps.action('draft-choice','Protect the independent draft before starting another date',()=>page.getByRole('button',{name:'Write a reflection for this date',exact:true}).click(),async()=>{await expect(page.getByRole('dialog',{name:'Existing reflection draft'})).toBeVisible();await expect(editor(page)).toHaveCount(0);});
 await steps.action('keep','Keep the draft and remain on the selected date',()=>page.getByRole('button',{name:'Keep draft and return to this date',exact:true}).click(),async()=>{await expect(page.getByRole('dialog',{name:'Existing reflection draft'})).toHaveCount(0);await expect(page.locator('.date-heading')).toContainText('29 September 2026');});
 await steps.action('choose-again','Review the protected draft again',()=>page.getByRole('button',{name:'Write a reflection for this date',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Resume existing draft',exact:true})).toBeVisible();});
 await steps.action('resume','Resume the original text and date without silently retargeting it',()=>page.getByRole('button',{name:'Resume existing draft',exact:true}).click(),async()=>{await expectEditor(page,'Keep this independent draft.');await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T14:31:07');});
 await backFromEditor(page,steps,'return-date','Journal');
 await steps.action('choose-discard','Request the selected historical date again',()=>page.getByRole('button',{name:'Write a reflection for this date',exact:true}).click(),async()=>{await expect(page.getByRole('dialog',{name:'Existing reflection draft'})).toBeVisible();});
 await steps.action('discard','Explicitly discard the other draft before writing this date',()=>page.getByRole('button',{name:'Discard draft and write for this date',exact:true}).click(),async()=>{await expectEditor(page,'');await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-29T12:00');});
 await steps.action('write','Write the selected date reflection',()=>editor(page).fill('A Tuesday memory.'),async()=>{await expectEditor(page,'A Tuesday memory.');});
 await steps.action('save','Save a distinct historical entry',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection saved',exact:true})).toBeVisible();await expectSynced(page);});
 await steps.action('done','Return to the same dated journal',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.locator('.date-heading')).toContainText('29 September 2026');await expect(page.locator('article.card')).toHaveCount(1);});
 await steps.action('detail','Open the saved backfill',()=>page.getByRole('button',{name:'View entry',exact:true}).click(),async()=>{await expect(page.locator('.detail')).toContainText('A Tuesday memory.');});
 await steps.action('edit','Edit the reflection while retaining its calendar origin',()=>page.getByRole('button',{name:'Edit reflection',exact:true}).click(),async()=>{await expectEditor(page,'A Tuesday memory.');});
 await steps.action('move','Choose a date in a different month',()=>page.getByLabel('Entry date and time').fill('2026-10-01T09:15'),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T09:15');});
 await steps.action('reload-edit','Recover the date edit and its return context after reload',()=>page.reload(),async()=>{await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T09:15');await expectEditor(page,'A Tuesday memory.');});
 await steps.action('save-edit','Commit the changed date without changing entry identity',()=>page.getByRole('button',{name:'Save changes',exact:true}).click(),async()=>{await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime','2026-09-30T23:15:00.000Z');await expectSynced(page);});
 await steps.action('done-edit','Return to the original dated journal even when it is now empty',()=>page.getByRole('button',{name:'Done',exact:true}).click(),async()=>{await expect(page.locator('.date-heading')).toContainText('29 September 2026');await expect(page.locator('article.card')).toHaveCount(0);await expect(page.getByRole('button',{name:'Write a reflection for this date',exact:true})).toBeVisible();});
 await steps.action('old-month','Return to the originating month after the entry moves',()=>page.locator('button.day-back').click(),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');await expect(page.locator('.calendar-scroll [data-day="2026-09-29"]')).not.toHaveClass(/filled/);});
 // Another authenticated client edits the source event stream, not a projected calendar snapshot.
 const uid=await uidFor(page),env=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 try{
  const db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
  const state=replay((await getDocs(query(collection(db,`users/${uid}/streams/v1/events`),orderBy('sequence')))).docs.map(d=>decodeEvent(d.data())));
  const entry=state.entries.find(e=>e.text==='A Tuesday memory.')!;
  // The test environment returns a compat wrapper which the modular SDK unwraps.
  await appendReflection(db as unknown as Firestore,uid,{eventId:'calendar-remote-edit',type:'ReflectionWritten',schemaVersion:6,payload:{entryId:entry.id,text:entry.text,promptId:entry.promptId!,promptText:null,expectedRevision:entry.revision,entryAt:'2026-09-30T01:00:00.000Z',photoSlot:null}});
 }finally{await env.cleanup();}
 await steps.step('remote','Apply a cross-device date edit without jumping the calendar',[{description:'The new date gains its existing entry colour while September remains anchored',check:async()=>{await expect(page.locator('.calendar-scroll [data-day="2026-09-30"]')).toHaveClass(/filled/);await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');}}]);
 await navigate(page,steps,'today','Today');
 await steps.step('today-cleared','Recognize the remote move out of today',[{description:'Today offers a new response rather than continuing the moved entry',check:async()=>{await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeVisible();}}]);
 steps.generateDocs('Protected calendar drafts and editable reflection dates','Existing independent writing is never silently overwritten or moved to another day. Explicit backfills, nested entry edits, reload recovery and date moves preserve the original dated-journal/calendar return chain. A second authenticated client updates date circles without moving the viewport. Every action has a full-page unmasked zero-pixel screenshot with checks underneath.');
});
