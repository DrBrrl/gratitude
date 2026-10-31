import {test,expect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,writeReflection} from '../helpers/journal-session';
import {openFriends,createProfile,secondFriend,findFriend,switchFriend} from '../helpers/friends';

test('people find chosen usernames and explicitly accept before becoming friends; blocking ends the connection',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});const suffix=info.project.name.startsWith('mobile')?'m':'d';
 await startJournal(page,info,steps,'requests-alice');await writeReflection(page,steps,'A private reflection that stays only in Alice’s journal.','private');await openFriends(page,steps);await createProfile(page,steps,'Alice',`alice_requests_${suffix}`);
 const {other,context}=await secondFriend(page,info,steps,'requests-bob');
 try{
  await openFriends(other,steps,'bob-');await createProfile(other,steps,'Bob',`bob_requests_${suffix}`,'bob-');
  await switchFriend(page,steps,'alice-return',async()=>{await expect(page.getByRole('heading',{name:'Alice',exact:true})).toBeVisible();});
  await findFriend(page,steps,`@BOB_REQUESTS_${suffix.toUpperCase()}`,'Bob');
  await steps.action('request','Send a friend request without sharing journal content',()=>page.getByRole('button',{name:'Send friend request',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Sent friend requests'})).toContainText('Bob',{timeout:15_000});await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);});
  await switchFriend(other,steps,'bob-request',async()=>{await expect(other.getByRole('region',{name:'Incoming friend requests'})).toContainText('Alice',{timeout:15_000});await expect(other.getByText('A private reflection that stays only in Alice’s journal.',{exact:true})).toHaveCount(0);await expect(other.getByRole('button',{name:'Decline request',exact:true})).toBeEnabled();});
  await steps.action('accept','Explicitly accept Alice’s request',()=>other.getByRole('button',{name:'Accept request from Alice',exact:true}).click(),async()=>{await expect(other.getByRole('region',{name:'Incoming friend requests'})).toHaveCount(0,{timeout:15_000});await expect(other.getByRole('region',{name:'Your friends',exact:true})).toContainText('Alice');});
  await switchFriend(page,steps,'alice-friends',async()=>{await expect(page.getByRole('region',{name:'Sent friend requests'})).toHaveCount(0,{timeout:15_000});await expect(page.getByRole('region',{name:'Your friends',exact:true})).toContainText('Bob');});
  await steps.action('manage','Open friendship controls',()=>page.getByText('Manage friendship with Bob',{exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Block Bob',exact:true})).toBeVisible();});
  await steps.action('block','Block Bob and end the friendship',()=>page.getByRole('button',{name:'Block Bob',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0,{timeout:15_000});await expect(page.getByRole('region',{name:'Blocked people'})).toContainText('Bob');});
  await switchFriend(other,steps,'revoked',async()=>{await expect(other.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0,{timeout:15_000});await expect(other.getByRole('button',{name:'Send a hug to Alice',exact:true})).toHaveCount(0);});
  await switchFriend(page,steps,'alice-blocked',async()=>{await expect(page.getByRole('region',{name:'Blocked people'})).toContainText('Bob');});
  await steps.action('unblock','Unblock without automatically restoring consent',()=>page.getByRole('button',{name:'Unblock Bob',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Blocked people'})).toHaveCount(0,{timeout:15_000});await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);});
 }finally{await context.close();}
 steps.generateDocs('Find friends without sharing a journal','Two independent Google accounts choose discoverable names and connect only after the recipient accepts. Journal text stays private; blocking revokes the connection on both devices, and unblocking does not restore it. Every action has an unmasked zero-pixel screenshot with checks below the image.');
});
