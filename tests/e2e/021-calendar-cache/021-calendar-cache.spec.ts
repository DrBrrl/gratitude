import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal,seedHistory,expectSynced} from '../helpers/journal-session';

const expect=baseExpect.configure({timeout:30_000});
test('an unavailable backend retains a verified cached calendar and reconnects without losing its month',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(180_000);
 const steps=new TestStepHelper(page,info);
 await startJournal(page,info,steps,'calendar-cache');
 await seedHistory(page,[{text:'A Wednesday memory.',recordedAt:'2026-09-30T01:00:00Z'}]);
 await expect(page.locator('.week-box strong')).toHaveText('1 day of gratitude in a row');
 await steps.action('calendar','Open the synchronized calendar',()=>page.getByRole('button',{name:'Open calendar',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Your calendar',exact:true})).toBeVisible();});
 await steps.action('month','Choose the historical month to preserve',()=>page.getByLabel('Jump to month').fill('2026-09'),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');await expect(page.locator('.calendar-scroll [data-day="2026-09-30"]')).toHaveAttribute('aria-label',/1 reflection/);});
 // Simulate a Firestore-only outage: HTML/auth remain available, as required for
 // the app's existing warm-open contract. This does not claim offline cold starts.
 const outage=/http:\/\/127\.0\.0\.1:18080\//;
 await page.context().route(outage,route=>route.abort('internetdisconnected'));
 await steps.action('cached-reload','Reload during a backend outage without discarding the cached prefix',()=>page.reload(),async()=>{
  await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');
  await expect(page.locator('.calendar-scroll [data-day="2026-09-30"]')).toHaveAttribute('aria-label',/1 reflection/);
  await expect(page.locator('.calendar-cache-note')).toHaveText('Saved on this device · waiting to sync');
  await expect(page.getByRole('alert')).toHaveCount(0);
 });
 await page.context().unroute(outage);
 // Network restoration is environment setup, rather than a click. The checked
 // state proves the cache anchor is revalidated before the UI reports Synced.
 await steps.step('reconnected','Revalidate the saved prefix when Firestore returns',[{description:'Synchronization retains the same historical month and saved date',check:async()=>{
  await expectSynced(page);await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-09');await expect(page.locator('.calendar-scroll [data-day="2026-09-30"]')).toHaveAttribute('aria-label',/1 reflection/);
 }}]);
 steps.generateDocs('Cached calendar during a backend outage','A digest-checked local prefix remains visible when Firestore is unavailable. Reconnection verifies its immutable anchor before accepting a server tail. HTML and authentication stay available; offline cold starts are outside this contract. Every user action has an unmasked zero-pixel screenshot with checks underneath.');
});
