import {test,expect as baseExpect} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,deleteDoc,type Firestore} from 'firebase/firestore';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends} from '../helpers/friends';
import {saveFriendProfile} from '../../../src/lib/friends/repository';
const expect=baseExpect.configure({timeout:15_000});
test('an existing profile needs saved sharing consent and can repair a missing public calendar',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});
 await resetFriendsFixture(page);await startJournal(page,info,steps,'sharing-publication');
 await seedHistory(page,[{text:'Fictional appreciation for a warm cup of tea.',recordedAt:'2026-09-30T01:00:00Z'}]);
 const uid=await page.evaluate(async()=>{const name=(await indexedDB.databases()).find(db=>db.name?.startsWith('gratitude:demo-gratitude:'))!.name!;return name.split(':').at(-2)!;});
 const environment=await initializeTestEnvironment({projectId:'demo-gratitude',firestore:{host:'127.0.0.1',port:18080}});
 try{
  const db=environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore() as unknown as Firestore;
  // Reproduce a profile saved before any sharing action, using the normal source transaction.
  await saveFriendProfile(db,uid,{displayName:'Jamie',username:`sharing_profile_${info.project.name.startsWith('mobile')?'m':'d'}`,discoverable:true},'profile-without-sharing');
  await openFriends(page,steps);
  await steps.step('not-shared','Show that a profile alone does not publish gratitude dates',[{description:'The owner sees an explicit instruction to save sharing, and no sharing source action or public calendar exists',check:async()=>{
   await expect(page.getByText('Save your sharing choice to let friends see your streak. Edit your friends profile and save with sharing enabled.',{exact:true})).toBeVisible();
   expect((await getDoc(doc(db,`friendSharing/${uid}`))).exists()).toBe(false);expect((await getDoc(doc(db,`friendGratitude/${uid}`))).exists()).toBe(false);
  }}]);
  await steps.action('edit','Open the existing friends profile',()=>page.getByRole('button',{name:'Edit friends profile',exact:true}).click(),async()=>{await expect(page.getByRole('checkbox',{name:'Share my gratitude streaks with friends',exact:true})).toBeChecked();expect((await getDoc(doc(db,`friendSharing/${uid}`))).exists()).toBe(false);});
  await steps.action('confirm','Explicitly save sharing and publish the known reflection date',()=>page.getByRole('button',{name:'Save profile changes',exact:true}).click(),async()=>{
   await expect(page.getByText('Your gratitude streaks are shared with accepted friends.',{exact:true})).toBeVisible();await expect(page.locator('.friends-space')).toHaveAttribute('data-publication-ready','true');
   expect((await getDoc(doc(db,`friendGratitude/${uid}`))).get('days')).toEqual(['2026-09-30']);
  });
  // A lost disposable projection does not revoke or invent the user's canonical consent.
  await environment.withSecurityRulesDisabled(async context=>{await deleteDoc(doc(context.firestore(),`friendGratitude/${uid}`));});
  await steps.step('missing-projection','Distinguish saved consent from a calendar awaiting publication',[{description:'The owner sees that dates need syncing and gets an explicit repair action',check:async()=>{
   await expect(page.getByText('Streak sharing is on. Your gratitude dates are waiting to sync; keep Gratitude open and connected.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sync shared streak',exact:true})).toBeEnabled();
  }}]);
  await steps.action('repair','Rebuild only the public date projection from the loaded journal',()=>page.getByRole('button',{name:'Sync shared streak',exact:true}).click(),async()=>{
   await expect(page.getByText('Your shared streak is synced.',{exact:true})).toBeVisible();await expect(page.getByText('Your gratitude streaks are shared with accepted friends.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sync shared streak',exact:true})).toHaveCount(0);
   expect((await getDoc(doc(db,`friendGratitude/${uid}`))).get('days')).toEqual(['2026-09-30']);expect((await getDoc(doc(db,`friendSharing/${uid}`))).get('sequence')).toBe(1);
  });
 }finally{await environment.cleanup();}
 steps.generateDocs('Make streak sharing explicit and repairable','An existing profile without a sharing source record is not described as shared. A preselected checkbox is only a draft until Save. Confirmed publication exposes only the expected dates; a missing disposable calendar has a repair button that preserves consent and journal data. Every action has an unmasked zero-tolerance screenshot and checks underneath it.');
});
