import {test,expect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends,createProfile,secondFriend,findFriend,switchFriend} from '../helpers/friends';

test('accepted friends receive durable hugs with recipient controls, a cooldown and replay-safe read state',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true});const suffix=info.project.name.startsWith('mobile')?'m':'d';
 await resetFriendsFixture(page);await startJournal(page,info,steps,'hugs-alice');await openFriends(page,steps);await createProfile(page,steps,'Alice',`alice_hugs_${suffix}`);
 const {other,context}=await secondFriend(page,info,steps,'hugs-bob');
 try{
  await openFriends(other,steps,'bob-');await createProfile(other,steps,'Bob',`bob_hugs_${suffix}`,'bob-');
  await findFriend(other,steps,`alice_hugs_${suffix}`,'Alice');
  await steps.action('request','Ask Alice to connect',()=>other.getByRole('button',{name:'Send friend request',exact:true}).click(),async()=>{await expect(other.getByRole('region',{name:'Sent friend requests'})).toContainText('Alice',{timeout:15_000});});
  await switchFriend(page,steps,'alice-request',async()=>{await expect(page.getByRole('button',{name:'Accept request from Bob',exact:true})).toBeVisible({timeout:15_000});});
  await steps.action('accept','Accept Bob as a friend',()=>page.getByRole('button',{name:'Accept request from Bob',exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Send a hug to Bob',exact:true})).toBeEnabled({timeout:15_000});});
  await steps.action('send-hug','Send a little hug to Bob',()=>page.getByRole('button',{name:'Send a hug to Bob',exact:true}).click(),async()=>{await expect(page.getByText('A little hug, sent with care.',{exact:true})).toBeVisible({timeout:15_000});await expect(page.getByRole('button',{name:'Send a hug to Bob',exact:true})).toBeDisabled();});
  await switchFriend(other,steps,'bob-hug',async()=>{await expect(other.getByRole('region',{name:'Hug inbox'})).toContainText('Alice sent you a hug.',{timeout:15_000});await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.unread')).toHaveCount(1);});
  await steps.action('read-hug','Acknowledge the received hug',()=>other.getByRole('button',{name:'Mark hug from Alice as read',exact:true}).click(),async()=>{await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.unread')).toHaveCount(0,{timeout:15_000});await expect(other.getByText('Read, and kept with care.',{exact:true})).toBeVisible();});
  await steps.action('manage','Open hug preferences',()=>other.getByText('Manage friendship with Alice',{exact:true}).click(),async()=>{await expect(other.getByRole('button',{name:'Pause hugs from Alice',exact:true})).toBeVisible();});
  await steps.action('pause','Pause hugs from this friend',()=>other.getByRole('button',{name:'Pause hugs from Alice',exact:true}).click(),async()=>{await expect(other.getByRole('button',{name:'Allow hugs from Alice',exact:true})).toBeVisible({timeout:15_000});});
  await steps.action('rebuild','Replay the complete friendship source without redelivering a hug',()=>other.getByRole('button',{name:'Rebuild friends view',exact:true}).click(),async()=>{await expect(other.getByText('Friends view rebuilt from saved actions.',{exact:true})).toBeVisible({timeout:15_000});await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.hug')).toHaveCount(1);await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.unread')).toHaveCount(0);await expect(other.getByRole('button',{name:'Allow hugs from Alice',exact:true})).toBeVisible();});
  await steps.action('reload','Reload after receiving a hug',()=>other.reload(),async()=>{await expect(other.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible({timeout:15_000});});
  await openFriends(other,steps,'restored-');
  await steps.step('durable-hug','Restore the one received hug and its read state',[{description:'Cached recovery and server tail replay preserve exactly one acknowledged hug',check:async()=>{await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.hug')).toHaveCount(1);await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.unread')).toHaveCount(0);}}]);
  await switchFriend(page,steps,'paused-on-sender',async()=>{await expect(page.getByText('Your friend has paused incoming hugs.',{exact:true})).toBeVisible({timeout:15_000});await expect(page.getByRole('button',{name:'Send a hug to Bob',exact:true})).toBeDisabled();});
  await steps.action('remove-controls','Open controls to end the friendship',()=>page.getByText('Manage friendship with Bob',{exact:true}).click(),async()=>{await expect(page.getByRole('button',{name:'Remove Bob as a friend',exact:true})).toBeVisible();});
  await steps.action('remove-friend','End the friendship without deleting received hugs',()=>page.getByRole('button',{name:'Remove Bob as a friend',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0,{timeout:15_000});});
  await switchFriend(other,steps,'friendship-ended',async()=>{await expect(other.getByRole('region',{name:'Your friends',exact:true}).locator('.friend-card')).toHaveCount(0,{timeout:15_000});await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.hug')).toHaveCount(1);await expect(other.getByRole('region',{name:'Hug inbox'}).locator('.unread')).toHaveCount(0);});
 }finally{await context.close();}
 steps.generateDocs('Send and keep a gentle hug','Accepted friends exchange durable in-app hugs. The recipient can mark a hug as read or pause incoming hugs; one sender cannot send another to the same friend within 24 hours. Cached recovery and complete replay preserve the inbox without redelivering old gestures. Device push is outside this first slice. Every action has an unmasked zero-pixel screenshot with checks beneath its image.');
});
