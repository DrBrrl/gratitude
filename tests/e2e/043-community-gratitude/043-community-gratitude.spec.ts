import {test,expect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {expectSynced,startJournal,seedHistory,navigate} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends,createProfile,secondFriend,findFriend,switchFriend} from '../helpers/friends';

test('substring discovery and repairable shared streaks respect consent, withdrawal and replay',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});const suffix=info.project.name.startsWith('mobile')?'m':'d';
 await resetFriendsFixture(page);await startJournal(page,info,steps,'community-jamie');
 await seedHistory(page,[{text:'Fictional gratitude for a walk.',recordedAt:'2026-09-27T01:00:00Z'},{text:'Fictional gratitude for a friend.',recordedAt:'2026-09-29T01:00:00Z'},{text:'Fictional gratitude for music.',recordedAt:'2026-09-30T01:00:00Z'}]);
 await openFriends(page,steps);await createProfile(page,steps,'Jamie',`jamie_community_${suffix}`);
 const {other,context}=await secondFriend(page,info,steps,'community-robin');
 try{
  await seedHistory(other,[{text:'A fictional morning.',recordedAt:'2026-09-27T01:00:00Z'},{text:'Fictional tea.',recordedAt:'2026-09-28T01:00:00Z'},{text:'Fictional sunshine.',recordedAt:'2026-09-29T01:00:00Z'},{text:'Fictional laughter.',recordedAt:'2026-09-30T01:00:00Z'}]);
  await openFriends(other,steps,'robin-');await createProfile(other,steps,'Robin',`testing_jam_${suffix}`,'robin-');
  await switchFriend(page,steps,'jamie-return',async()=>{await expect(page.getByRole('heading',{name:'Jamie',exact:true})).toBeVisible();});
  await findFriend(page,steps,'jam','Robin');
  await steps.step('substring-matches','Discover both prefix and interior username matches',[{description:'A partial username finds Jamie and testing_jam, with italic handles including @',check:async()=>{const results=page.getByRole('region',{name:'Add a friend'});await expect(results.getByRole('heading',{name:'Jamie',exact:true})).toBeVisible();await expect(results.getByRole('heading',{name:'Robin',exact:true})).toBeVisible();await expect(results.locator('em').filter({hasText:`@testing_jam_${suffix}`})).toBeVisible();}}]);
  await steps.action('request','Request friendship from the matching profile',()=>page.getByRole('article',{name:`Friend match @testing_jam_${suffix}`}).getByRole('button',{name:'Send friend request',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Sent friend requests'})).toContainText('Robin',{timeout:15_000});});
  await switchFriend(other,steps,'robin-request',async()=>{await expect(other.getByRole('button',{name:'Accept request from Jamie',exact:true})).toBeVisible({timeout:15_000});});
  await steps.action('accept','Accept and see the shared streak intersection',()=>other.getByRole('button',{name:'Accept request from Jamie',exact:true}).click(),async()=>{await expect(other.getByRole('region',{name:'Community gratitude'})).toContainText('Robin and Jamie have a 2 day gratitude streak.',{timeout:15_000});await expect(other.getByRole('region',{name:'Your friends',exact:true})).toContainText('(2 days of gratitude in a row)');});
  await switchFriend(page,steps,'jamie-community',async()=>{await expect(page.getByRole('region',{name:'Community gratitude'})).toContainText('Jamie and Robin have a 2 day gratitude streak.',{timeout:15_000});await expect(page.getByRole('region',{name:'Your friends',exact:true})).toContainText('(4 days of gratitude in a row)');});
  // Append through the real editor, dated in the past: no rewriting computed streaks.
  await navigate(page,steps,'backfill-journal','Journal');
  await steps.action('new-backfill','Open another reflection to repair the missing day',()=>page.getByRole('button',{name:'New entry',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your reflection',exact:true})).toBeVisible();});
  await steps.action('backfill-date','Choose the missing historic date',()=>page.getByLabel('Entry date and time',{exact:true}).fill('2026-09-28T12:00'),async()=>{await expect(page.getByLabel('Entry date and time',{exact:true})).toHaveValue('2026-09-28T12:00');});
  await steps.action('backfill-text','Write the backfilled reflection',()=>page.getByRole('textbox',{name:'Your reflection',exact:true}).fill('Fictional gratitude for a quiet afternoon.'),async()=>{await expect(page.getByText('Draft saved on this device',{exact:true})).toBeVisible();});
  await steps.action('save-backfill','Save the historic reflection',()=>page.getByRole('button',{name:'Save reflection',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection saved',exact:true})).toBeVisible({timeout:15_000});});
  await openFriends(page,steps,'repaired-');
  await steps.step('repaired-streak','Repair the community streak from the entry’s original date',[{description:'Backfilling the missing date repairs the shared four-day run without exposing reflection text',check:async()=>{await expect(page.getByRole('region',{name:'Community gratitude'})).toContainText('Jamie and Robin have a 4 day gratitude streak.',{timeout:15_000});}}]);
  await page.clock.setFixedTime(new Date('2026-10-03T04:31:07.000Z'));
  await steps.action('later-visit','Return after the shared run has ended',()=>page.reload(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible({timeout:15_000});await expectSynced(page);});
  await openFriends(page,steps,'longest-');
  await steps.step('longest-run','Keep the longest shared streak after a break',[{description:'The four-day shared run remains visible as the longest streak',check:async()=>{await expect(page.getByRole('region',{name:'Community gratitude'})).toContainText('Jamie and Robin’s longest gratitude streak: 4 days.',{timeout:15_000});}}]);
  await steps.action('edit-sharing','Review the shared calendar preference',()=>page.getByRole('button',{name:'Edit friends profile',exact:true}).click(),async()=>{await expect(page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true})).toBeChecked();});
  await steps.action('hide-streaks','Choose to keep gratitude dates and streaks private',()=>page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true}).uncheck(),async()=>{await expect(page.getByLabel('Shared calendar timezone',{exact:true})).toHaveCount(0);});
  await steps.action('save-private','Withdraw sharing and clear community streaks',()=>page.getByRole('button',{name:'Save profile changes',exact:true}).click(),async()=>{await expect(page.getByText('Your gratitude streaks are hidden from friends.',{exact:true})).toBeVisible({timeout:15_000});await expect(page.getByRole('region',{name:'Community gratitude'})).toContainText('Your community streaks will show up here!');});
  await switchFriend(other,steps,'robin-private',async()=>{await expect(other.getByRole('region',{name:'Your friends',exact:true})).not.toContainText('days of gratitude in a row',{timeout:15_000});await expect(other.getByRole('region',{name:'Community gratitude'})).toContainText('Your community streaks will show up here!');});
  await steps.action('replay','Rebuild from raw actions without restoring withdrawn sharing',()=>other.getByRole('button',{name:'Rebuild friends view',exact:true}).click(),async()=>{await expect(other.getByText('Friends view rebuilt from saved actions.',{exact:true})).toBeVisible({timeout:15_000});await expect(other.getByRole('region',{name:'Your friends',exact:true})).not.toContainText('days of gratitude in a row');});
 }finally{await context.close();}
 steps.generateDocs('Repair community gratitude together','Partial usernames match either end or the middle. Explicitly shared civil dates produce individual and shared streaks, including historic entries. A backfill repairs the shared run; withdrawing consent removes both the friend’s parenthetical streak and community result live. Journals remain private. Every user action has a full-page, unmasked screenshot with zero tolerance and checks beneath it.');
});
