import {test,expect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends,createProfile,secondFriend,findFriend,switchFriend} from '../helpers/friends';

test('requests can be cancelled or declined and a discovered account can be blocked before friendship',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(360_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});const suffix=info.project.name.startsWith('mobile')?'m':'d';
 await resetFriendsFixture(page);await startJournal(page,info,steps,'controls-alice');await openFriends(page,steps);await createProfile(page,steps,'Alice',`alice_controls_${suffix}`);
 const bob=await secondFriend(page,info,steps,'controls-bob');
 let charlie: Awaited<ReturnType<typeof secondFriend>>|null=null;
 try{
  await openFriends(bob.other,steps,'bob-');await createProfile(bob.other,steps,'Bob',`bob_controls_${suffix}`,'bob-');
  await findFriend(bob.other,steps,`alice_controls_${suffix}`,'Alice','bob-');
  await steps.action('bob-request','Send a request to Alice',()=>bob.other.getByRole('button',{name:'Send friend request',exact:true}).click(),async()=>{await expect(bob.other.getByRole('button',{name:'Cancel request to Alice',exact:true})).toBeVisible({timeout:15_000});});
  await steps.action('cancel','Cancel a request that has not been accepted',()=>bob.other.getByRole('button',{name:'Cancel request to Alice',exact:true}).click(),async()=>{await expect(bob.other.getByRole('region',{name:'Sent friend requests'})).toHaveCount(0,{timeout:15_000});await expect(bob.other.getByText('Give your friend some space. Another request can be sent after 24 hours.',{exact:true})).toBeVisible();});
  await switchFriend(page,steps,'cancelled-recipient',async()=>{await expect(page.getByRole('region',{name:'Incoming friend requests'})).toHaveCount(0);await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);});
  charlie=await secondFriend(page,info,steps,'controls-charlie');const c=charlie.other;
  await openFriends(c,steps,'charlie-');await createProfile(c,steps,'Charlie',`charlie_controls_${suffix}`,'charlie-');
  await findFriend(c,steps,`alice_controls_${suffix}`,'Alice','charlie-');
  await steps.action('charlie-request','Send an independent request to Alice',()=>c.getByRole('button',{name:'Send friend request',exact:true}).click(),async()=>{await expect(c.getByRole('button',{name:'Cancel request to Alice',exact:true})).toBeVisible({timeout:15_000});});
  await switchFriend(page,steps,'decline-recipient',async()=>{await expect(page.getByRole('region',{name:'Incoming friend requests'})).toContainText('Charlie',{timeout:15_000});});
  await steps.action('decline','Decline without creating a friendship',()=>page.getByRole('button',{name:'Decline request',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Incoming friend requests'})).toHaveCount(0,{timeout:15_000});await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);});
  await switchFriend(c,steps,'declined-sender',async()=>{await expect(c.getByRole('region',{name:'Sent friend requests'})).toHaveCount(0,{timeout:15_000});await expect(c.getByText('Give your friend some space. Another request can be sent after 24 hours.',{exact:true})).toBeVisible();});
  await findFriend(c,steps,`bob_controls_${suffix}`,'Bob','block-');
  await steps.action('block-first','Block a discovered account without sending a friend request',()=>c.getByRole('button',{name:'Block Bob',exact:true}).click(),async()=>{await expect(c.getByRole('region',{name:'Blocked people'})).toContainText('Bob',{timeout:15_000});await expect(c.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);await expect(c.getByRole('region',{name:'Sent friend requests'})).toHaveCount(0);});
  await switchFriend(bob.other,steps,'no-request-on-block',async()=>{await expect(bob.other.getByRole('region',{name:'Incoming friend requests'})).toHaveCount(0);await expect(bob.other.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0);});
 }finally{await charlie?.context.close();await bob.context.close();}
 steps.generateDocs('Control who can connect','Fictional people cancel or decline requests without creating friendships. A 24-hour delay prevents immediate repeat requests. A person can block a discovered account before connecting; doing so never sends a request or grants journal access. Every action has an unmasked full-page zero-pixel screenshot and checks underneath.');
});
