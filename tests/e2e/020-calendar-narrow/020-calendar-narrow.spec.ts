import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal} from '../helpers/journal-session';
const expect=baseExpect.configure({timeout:15_000});
test('calendar and week boxes fit a narrow screen and support keyboard scrolling',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true' || info.project.name!=='mobile-chromium','Narrow mobile emulator scenario');test.setTimeout(180_000);
 const steps=new TestStepHelper(page,info);await startJournal(page,info,steps,'calendar-narrow');
 await steps.action('narrow','Use a 320-pixel mobile screen',()=>page.setViewportSize({width:320,height:844}),async()=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.week-box .dates button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>=44))).toBe(true);
 });
 await steps.action('open','Open the scrolling calendar on the narrow screen',()=>page.getByRole('button',{name:'Open calendar',exact:true}).click(),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-10');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
 await steps.action('focus','Focus the calendar scroll region with its accessible label',()=>page.getByRole('region',{name:'Gratitude calendar',exact:true}).focus(),async()=>{await expect(page.locator('.calendar-scroll')).toBeFocused();});
 await steps.action('keyboard','Scroll to later months using the keyboard',()=>page.locator('.calendar-scroll').press('PageDown'),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-11');await expect(page.locator('.calendar-scroll [data-day="2026-11-01"]')).toBeDisabled();await expect(page.locator('.calendar-month')).toHaveCount(7);});
 await steps.action('now','Return to the current month',()=>page.getByRole('button',{name:'This month',exact:true}).click(),async()=>{await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor','2026-10');});
 await steps.action('today','Return to the same Today page',()=>page.locator('button.back').click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();});
 // Advancing the fixture clock and notifying foreground restoration is environment setup.
 await page.clock.setFixedTime(new Date('2026-10-03T15:00:00.000Z'));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await steps.step('sunday','Roll into the new Sunday-first week without a saved event',[{description:'The foreground date change updates the header, current week and disabled future days',check:async()=>{
  await expect(page.locator('.today-date')).toContainText('Sunday 4 October');await expect(page.locator('.week-box [data-day]').first()).toHaveAttribute('data-day','2026-10-04');await expect(page.locator('.week-box [data-day="2026-10-05"]')).toBeDisabled();await expect(page.getByRole('button',{name:'Write a response',exact:true})).toBeEnabled();
 }}]);
 steps.generateDocs('Narrow-screen calendar and keyboard access','The real product layout fits 320px without horizontal overflow, retains 44px week-day targets and supports focusable keyboard month scrolling. Future dates remain disabled. Every action has a full-page unmasked zero-pixel screenshot with checks underneath.');
});
