import {test,expect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal} from '../helpers/journal-session';
import {resetFriendsFixture,openFriends,createProfile,secondFriend,findFriend} from '../helpers/friends';

test('chosen public names, unique handles and opt-out discovery survive replay without sharing journal data',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(240_000);
 const steps=new TestStepHelper(page,info,{paintStaticPage:true}); const suffix=info.project.name.startsWith('mobile')?'m':'d';const handle=`jamie_profile_${suffix}`;
 await resetFriendsFixture(page);await startJournal(page,info,steps,'profile-owner');await openFriends(page,steps);await createProfile(page,steps,'Jamie',` @${handle.toUpperCase()} `);
 await steps.action('reload','Restore the cached friends profile after reload',()=>page.reload(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible({timeout:15_000});});
 await openFriends(page,steps,'restored-');
 await steps.action('rebuild','Rebuild the friends profile from its source actions',()=>page.getByRole('button',{name:'Rebuild friends view',exact:true}).click(),async()=>{await expect(page.getByText('Friends view rebuilt from saved actions.',{exact:true})).toBeVisible({timeout:15_000});await expect(page.getByRole('heading',{name:'Jamie',exact:true})).toBeVisible();});
 await steps.action('edit','Edit the chosen profile',()=>page.getByRole('button',{name:'Edit friends profile',exact:true}).click(),async()=>{await expect(page.getByRole('textbox',{name:'Your username',exact:true})).toHaveValue(handle);});
 await steps.action('hide','Opt out of new username discovery',()=>page.getByRole('checkbox',{name:'Let people find me by username',exact:true}).uncheck(),async()=>{await expect(page.getByRole('checkbox',{name:'Let people find me by username',exact:true})).not.toBeChecked();});
 await steps.action('save-hidden','Save the discovery preference',()=>page.getByRole('button',{name:'Save profile changes',exact:true}).click(),async()=>{await expect(page.getByText('Your profile is hidden from new username searches.',{exact:true})).toBeVisible({timeout:15_000});});
 const {other,context}=await secondFriend(page,info,steps,'profile-searcher');
 try{
  await openFriends(other,steps,'other-');
  await steps.action('other-name','Choose a second person’s display name',()=>other.getByRole('textbox',{name:'Display name',exact:true}).fill('Robin'),async()=>{await expect(other.getByRole('textbox',{name:'Display name',exact:true})).toHaveValue('Robin');});
  await steps.action('taken-name','Try the same username on another account',()=>other.getByRole('textbox',{name:'Your username',exact:true}).fill(handle),async()=>{await expect(other.getByRole('textbox',{name:'Your username',exact:true})).toHaveValue(handle);});
  await steps.action('taken-rejected','Reject a username that already belongs to someone else',()=>other.getByRole('button',{name:'Save friends profile',exact:true}).click(),async()=>{await expect(other.getByRole('alert')).toHaveText('That username is already taken. Try another.',{timeout:15_000});});
  await steps.action('available-name','Choose an available username instead',()=>other.getByRole('textbox',{name:'Your username',exact:true}).fill(`robin_profile_${suffix}`),async()=>{await expect(other.getByRole('textbox',{name:'Your username',exact:true})).toHaveValue(`robin_profile_${suffix}`);});
  await steps.action('other-save','Save the other person’s own profile',()=>other.getByRole('button',{name:'Save friends profile',exact:true}).click(),async()=>{await expect(other.getByRole('heading',{name:'Robin',exact:true})).toBeVisible({timeout:15_000});});
  await steps.action('hidden-search','Enter the hidden username',()=>other.getByRole('textbox',{name:'Your friend’s username',exact:true}).fill(`@${handle.toUpperCase()}`),async()=>{await expect(other.getByRole('textbox',{name:'Your friend’s username',exact:true})).toHaveValue(`@${handle.toUpperCase()}`);});
  await steps.action('hidden-result','Keep a hidden profile out of username discovery',()=>other.getByRole('button',{name:'Find friend',exact:true}).click(),async()=>{await expect(other.getByText('No profile found for that username.',{exact:true})).toBeVisible({timeout:15_000});await expect(other.getByRole('region',{name:'Add a friend'})).not.toContainText('Jamie');});
 }finally{await context.close();}
 steps.generateDocs('Choose a friends profile','A deliberate public name and case-insensitive unique username remain separate from Google identity and private journal data. Cached recovery and full source replay preserve the profile; hiding it stops discovery. Each action has an unmasked zero-pixel screenshot with checks underneath.');
});
