import {test,expect as baseExpect,type Page} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,writeBatch,Timestamp} from 'firebase/firestore';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory,navigate,writeReflection,editor,expectSynced} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends,createProfile,secondFriend,switchFriend} from '../helpers/friends';
import {emptyPair,applyPair,pairHead,type PairEvent} from '../../../src/lib/friends/domain';
const expect=baseExpect.configure({timeout:15_000});
async function account(page:Page){return page.evaluate(async()=>{const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))!.name!;return name.split(':').at(-2)!;});}
async function historicalFriendship(a:string,b:string){
 const pending:PairEvent={eventId:'table-request',type:'FriendRequestSent',schemaVersion:1,actorUid:a,targetUid:b,sequence:1,recordedAt:'2026-09-27T01:00:00.000Z',payload:{previousEventId:null}};
 const accepted:PairEvent={eventId:'table-accepted',type:'FriendRequestAccepted',schemaVersion:1,actorUid:b,targetUid:a,sequence:2,recordedAt:'2026-09-28T01:00:00.000Z',payload:{previousEventId:pending.eventId}};
 const pair=[pending,accepted].reduce(applyPair,emptyPair(a,b));
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 try{await environment.withSecurityRulesDisabled(async context=>{
  const db=context.firestore(),batch=writeBatch(db),head=pairHead(pair);
  batch.set(doc(db,'friendPairs/table-pair'),{...head,requestedAt:Timestamp.fromDate(new Date(head.requestedAt!))});
  for(const e of [pending,accepted])batch.set(doc(db,`friendPairs/table-pair/events/${e.eventId}`),{...e,recordedAt:Timestamp.fromDate(new Date(e.recordedAt))});
  batch.set(doc(db,`friendLinks/${a}/peers/${b}`),{pairId:'table-pair'});batch.set(doc(db,`friendLinks/${b}/peers/${a}`),{pairId:'table-pair'});await batch.commit();
 });}finally{await environment.cleanup();}
}
test('friendship table hearts update for both people and shared streaks repair since acceptance',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(480_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true}),suffix=info.project.name.startsWith('mobile')?'m':'d';
 await resetFriendsFixture(page);await startJournal(page,info,steps,'table-jamie');
 await seedHistory(page,[{text:'Before friendship.',recordedAt:'2026-09-27T01:00:00Z'},{text:'A shared first day.',recordedAt:'2026-09-28T01:00:00Z'},{text:'A quiet day.',recordedAt:'2026-09-30T01:00:00Z'}]);
 await openFriends(page,steps);await createProfile(page,steps,'Jamie',`jamie_table_${suffix}`);
 const {other,context}=await secondFriend(page,info,steps,'table-robin');
 const table=page.getByRole('table',{name:'Shared gratitude streaks',exact:true});
 try{
  await seedHistory(other,[{text:'Before friendship.',recordedAt:'2026-09-27T01:00:00Z'},{text:'A first day.',recordedAt:'2026-09-28T01:00:00Z'},{text:'A bright day.',recordedAt:'2026-09-29T01:00:00Z'},{text:'A calm day.',recordedAt:'2026-09-30T01:00:00Z'}]);
  await openFriends(other,steps,'robin-');await createProfile(other,steps,'Robin',`robin_table_${suffix}`,'robin-');
  // Existing acceptance is a fictional source fixture, not a migration-time timestamp.
  await historicalFriendship(await account(page),await account(other));
  await switchFriend(page,steps,'existing-friendship',async()=>{await expect(table).toContainText('Robin');await expect(table.locator('.streak strong')).toHaveText('1');await expect(table.getByRole('img')).toHaveAccessibleName('You: Not yet. Robin: Not yet.');});
  await navigate(page,steps,'today','Today');await writeReflection(page,steps,'Today I appreciated the sunlight.','jamie');
  await openFriends(page,steps,'jamie-done-');
  await steps.step('left-half','Fill your half while your friend has not reflected today',[{description:'Only the left half fills; the unfinished day retains yesterday’s shared run',check:async()=>{await expect(table.getByRole('img')).toHaveAccessibleName('You: Grateful. Robin: Not yet.');await expect(table.locator('.streak strong')).toHaveText('1');}}]);
  await switchFriend(other,steps,'other-half',async()=>{await expect(other.getByRole('table',{name:'Shared gratitude streaks'}).getByRole('img')).toHaveAccessibleName('You: Not yet. Jamie: Grateful.');});
  await navigate(other,steps,'robin-today','Today');await writeReflection(other,steps,'Today I appreciated a cup of tea.','robin');await openFriends(other,steps,'robin-done-');
  await steps.step('full-heart','Fill both halves when both friends have reflected',[{description:'Both halves and the shared run update through the consented date snapshots',check:async()=>{const t=other.getByRole('table',{name:'Shared gratitude streaks'});await expect(t.getByRole('img')).toHaveAccessibleName('You: Grateful. Jamie: Grateful.');await expect(t.locator('.streak strong')).toHaveText('2');}}]);
  await switchFriend(page,steps,'live-update',async()=>{await expect(table.getByRole('img')).toHaveAccessibleName('You: Grateful. Robin: Grateful.');await expect(table.locator('.streak strong')).toHaveText('2');});
  await navigate(page,steps,'backfill-journal','Journal');
  await steps.action('backfill-open','Add a reflection for the missing shared day',()=>page.getByRole('button',{name:'New entry',exact:true}).click(),async()=>{await expect(editor(page)).toBeVisible();});
  await steps.action('backfill-date','Choose a date after friendship began',()=>page.getByLabel('Entry date and time',{exact:true}).fill('2026-09-29T12:00'),async()=>{await expect(page.getByLabel('Entry date and time',{exact:true})).toHaveValue('2026-09-29T12:00');});
  await steps.action('backfill-write','Remember the missing day',()=>editor(page).fill('I appreciated a warm hello.'),async()=>{await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();});
  await steps.action('backfill-save','Save the historic date to repair the run',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection saved',exact:true})).toBeVisible();await expectSynced(page);});
  await openFriends(page,steps,'repaired-');
  await steps.step('repaired','Count all shared dates since acceptance, including a later backfill',[{description:'The run repairs to four days; the earlier pre-friendship reflection is excluded',check:async()=>{await expect(table.locator('.streak strong')).toHaveText('4');}}]);
  await steps.action('rebuild','Recover the acceptance date and streak from source events',()=>page.getByRole('button',{name:'Rebuild friends view',exact:true}).click(),async()=>{await expect(page.getByText('Friends view rebuilt from saved actions.',{exact:true})).toBeVisible();await expect(table.locator('.streak strong')).toHaveText('4');});
  await steps.action('edit-sharing','Review your date-sharing preference',()=>page.getByRole('button',{name:'Edit friends profile',exact:true}).click(),async()=>{await expect(page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true})).toBeChecked();});
  await steps.action('hide','Turn off date sharing',()=>page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true}).uncheck(),async()=>{await expect(page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true})).not.toBeChecked();});
  await steps.action('save-private','Distinguish private status from an unfilled heart',()=>page.getByRole('button',{name:'Save profile changes',exact:true}).click(),async()=>{await expect(table).toContainText('Sharing off');await expect(table.getByRole('img')).toHaveAccessibleName('You: Unavailable. Robin: Unavailable.');await expect(table.locator('.streak strong')).toHaveCount(0);});
  await switchFriend(other,steps,'friend-private',async()=>{const t=other.getByRole('table',{name:'Shared gratitude streaks'});await expect(t).toContainText('Not shared or unavailable');await expect(t.getByRole('img')).toHaveAccessibleName('You: Grateful. Jamie: Unavailable.');});
  await steps.action('manage','Review the accepted friendship',()=>other.locator('summary').filter({hasText:'Manage friendship with Jamie'}).click(),async()=>{await expect(other.getByRole('button',{name:'Remove Jamie as a friend',exact:true})).toBeVisible();});
  await steps.action('remove','Remove the table row when the friendship ends',()=>other.getByRole('button',{name:'Remove Jamie as a friend',exact:true}).click(),async()=>{await expect(other.getByRole('table',{name:'Shared gratitude streaks'})).toHaveCount(0);await expect(other.getByRole('region',{name:'Your friends',exact:true})).toContainText('No friends yet. Add some to get started!');});
 }finally{await context.close();}
 steps.generateDocs('Gratitude together, one half at a time','A table below Community gratitude lists each accepted friend, a two-part present-day heart and a repairable shared streak since acceptance. Both devices update live, historic backfills repair the run, pre-friendship dates are excluded, full source replay preserves acceptance, and withdrawn sharing is unavailable rather than falsely unfilled. Every user action has an unmasked zero-tolerance screenshot.');
});
