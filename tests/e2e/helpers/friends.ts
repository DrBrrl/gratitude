import { expect, type Page, type TestInfo } from '@playwright/test';
import { TestStepHelper } from './test-step-helper';
import { FIXTURE_TIME, navigate, signIn } from './journal-session';

export async function openFriends(page: Page, steps: TestStepHelper, prefix = '') {
  await navigate(page,steps,`${prefix}settings`,'Settings');
  await steps.action(`${prefix}account`,'Open account settings',()=>page.getByRole('button',{name:/^Your account/}).click({timeout:15_000}),async()=>{await expect(page.getByRole('button',{name:'Friends & hugs',exact:true})).toBeVisible();});
  await steps.action(`${prefix}friends`,'Open Friends and hugs',()=>page.getByRole('button',{name:'Friends & hugs',exact:true}).click(),async()=>{
    await expect(page.getByRole('heading',{name:'Friends & hugs',exact:true})).toBeVisible();await expect(page.getByText('Opening your friends…',{exact:true})).toHaveCount(0,{timeout:15_000});
    await expect(page.getByRole('button',{name:/^Save friends profile$|^Edit friends profile$/})).toBeEnabled({timeout:15_000});
    await expect(page.locator('.friends-space .connection')).toHaveCount(0,{timeout:15_000});
    await expect(page.getByText('Profile unavailable',{exact:true})).toHaveCount(0,{timeout:15_000});
  });
}
export async function createProfile(page: Page, steps: TestStepHelper, name: string, username: string, prefix = '') {
  await steps.action(`${prefix}display-name`, 'Choose a friend-facing display name',()=>page.getByRole('textbox',{name:'Display name',exact:true}).fill(name),async()=>{await expect(page.getByRole('textbox',{name:'Display name',exact:true})).toHaveValue(name);});
  await steps.action(`${prefix}username`, 'Choose a searchable username',()=>page.getByRole('textbox',{name:'Your username',exact:true}).fill(username),async()=>{await expect(page.getByRole('textbox',{name:'Your username',exact:true})).toHaveValue(username);});
  await steps.action(`${prefix}profile-save`,'Save the opt-in friends profile',()=>page.getByRole('button',{name:'Save friends profile',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name,exact:true})).toBeVisible({timeout:15_000});await expect(page.getByText(`@${username.trim().toLowerCase().replace(/^@/,'')}`,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit friends profile',exact:true})).toBeEnabled();});
}
export async function findFriend(page: Page, steps: TestStepHelper, username: string, name: string, prefix = '') {
  await steps.action(`${prefix}search-name`,'Enter a friend’s username',()=>page.getByRole('textbox',{name:'Your friend’s username',exact:true}).fill(username),async()=>{await expect(page.getByRole('textbox',{name:'Your friend’s username',exact:true})).toHaveValue(username);});
  await steps.action(`${prefix}find`,'Find the chosen profile by username',()=>page.getByRole('button',{name:'Find friend',exact:true}).click(),async()=>{await expect(page.getByRole('region',{name:'Add a friend',exact:true}).getByRole('heading',{name,exact:true})).toBeVisible({timeout:15_000});});
}
export async function secondFriend(page: Page, info: TestInfo, steps: TestStepHelper, account: string) {
  const context=await page.context().browser()!.newContext({...info.project.use});
  const other=await context.newPage();await other.clock.setFixedTime(new Date(FIXTURE_TIME));
  await context.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
  steps.setPage(other);
  await steps.action('other-device','Open a separate signed-out browser',()=>other.goto('./journal/'),async()=>{await expect(other.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
  await signIn(other,info,steps,account);
  return {other,context};
}
export async function switchFriend(page: Page, steps: TestStepHelper, id: string, check: ()=>Promise<void>) {
  steps.setPage(page);await steps.action(id,'Return to the other friend’s device',()=>page.bringToFront(),check);
}

/** Disposable demo data: independent runs must not retain handle reservations. */
export async function resetFriendsFixture(page: Page) {
  if(process.env.E2E_FIREBASE!=='true')throw new Error('Friends fixtures require the demo emulators.');
  const result=await page.request.delete('http://127.0.0.1:18080/emulator/v1/projects/demo-gratitude/databases/(default)/documents',{timeout:30_000});
  expect(result.ok()).toBe(true);
}
