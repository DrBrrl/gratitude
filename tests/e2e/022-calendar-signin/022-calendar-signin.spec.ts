import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {FIXTURE_TIME,signIn,navigate,expectSynced} from '../helpers/journal-session';
const expect=baseExpect.configure({timeout:15_000});

test('both signed-out landing links open authentication and then Journal',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300_000);
 const steps=new TestStepHelper(page,info);
 await page.clock.setFixedTime(new Date(FIXTURE_TIME));
 await page.request.delete('http://127.0.0.1:19099/emulator/v1/projects/demo-gratitude/accounts');
 await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
 await steps.action('landing','Open the signed-out calendar preview',()=>page.goto('./'),async()=>{
  const preview=page.getByRole('region',{name:'Calendar sign-in preview'});await expect(preview).toBeVisible();await expect(preview.locator('.filled')).toHaveCount(0);expect(await preview.locator('button').evaluateAll(nodes=>nodes.every(node=>(node as HTMLButtonElement).disabled))).toBe(true);
 });
 await signIn(page,info,steps,'calendar-signin',false,'Journal',true);
 await steps.step('journal-destination','Complete sign-in directly into Journal even with no saved entries',[{description:'The explicit landing-link destination is consumed and the journal is ready',check:async()=>{await expect(page.getByRole('heading',{name:'Your journal',exact:true})).toBeVisible();await expect(page).not.toHaveURL(/afterSignIn/);await expect(page.locator('article.card')).toHaveCount(0);}}]);
 await navigate(page,steps,'settings','Settings');
 await steps.action('account','Open the signed-in account',()=>page.getByRole('button',{name:/^Your account/}).click(),async()=>{await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();});
 await steps.action('signout','Sign out before checking the footer entry point',()=>page.getByRole('button',{name:'Sign out',exact:true}).click(),async()=>{await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();});
 await steps.action('signedout-home','Return to the signed-out landing page',()=>page.goto('./'),async()=>{await expect(page.getByRole('region',{name:'Calendar sign-in preview'})).toBeVisible();await expect(page.getByRole('link',{name:'Sign in and open your journal',exact:true})).toBeVisible();});
 await signIn(page,info,steps,'calendar-signin',true,'Journal',true,()=>page.getByRole('link',{name:'Sign in and open your journal',exact:true}).click());
 await steps.action('today','Open Today after signing in',()=>page.getByRole('navigation').getByRole('button',{name:'Today',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();await expectSynced(page);});
 await steps.action('signedin-home','Keep the ordinary footer and interactive calendar after sign-in',()=>page.locator('.today-header a.brand').click(),async()=>{
  await expect(page.getByRole('region',{name:'Calendar sign-in preview'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Open your journal',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Sign in and open your journal',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Next month',exact:true})).toBeEnabled();
 });
 steps.generateDocs('Sign in from the calendar preview','The signed-out landing calendar is empty and disabled under its sign-in notice. Both the overlay link and signed-out footer open Google authentication and then Journal. Signed-in users retain the ordinary footer and interactive calendar. Every action has an unmasked full-page screenshot at zero pixel tolerance, with checks below the image.');
});
