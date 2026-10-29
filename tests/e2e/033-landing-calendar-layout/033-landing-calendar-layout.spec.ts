import { test, expect as baseExpect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal } from '../helpers/journal-session';

const expect = baseExpect.configure({ timeout: 15_000 });
test('landing month controls stay anchored while four-, five- and six-week months grow downwards', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators');
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'landing-layout');
  await steps.action('tall', 'Use a tall screen where centering would otherwise move the calendar', () => page.setViewportSize({ width: info.project.name === 'mobile-chromium' ? 320 : 1280, height: 1200 }), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection time' })).toBeVisible();
  });
  await steps.action('landing', 'Open the top-anchored landing calendar', () => page.locator('.today-header a.brand').click(), async () => {
    await expect(page.locator('.landing-calendar')).toHaveAttribute('data-anchor', '2026-10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  const controls = page.locator('.month-controls');
  const calendar = page.locator('.landing-calendar');
  const controlsTop = await controls.evaluate(node => node.getBoundingClientRect().top);
  const titleTop = await page.getByRole('heading', { name: 'Gratitude', exact: true }).evaluate(node => node.getBoundingClientRect().top);
  const stable = async () => {
    expect(await controls.evaluate(node => node.getBoundingClientRect().top)).toBe(controlsTop);
    expect(await page.getByRole('heading', { name: 'Gratitude', exact: true }).evaluate(node => node.getBoundingClientRect().top)).toBe(titleTop);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  };
  await steps.action('choose', 'Open the month chooser', () => page.getByRole('button', { name: 'Choose month, October 2026', exact: true }).click(), async () => {
    await expect(page.getByLabel('Month', { exact: true })).toBeFocused(); await stable();
  });
  await steps.action('may', 'Enter a six-week month', () => page.getByLabel('Month', { exact: true }).fill('May'), async () => {
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue('May'); await stable();
  });
  await steps.action('apply-may', 'Let the calendar extend downward for May', () => page.getByLabel('Month', { exact: true }).press('Enter'), async () => {
    await expect(calendar).toHaveAttribute('data-anchor', '2026-05'); await stable();
  });
  const sixWeeks = await calendar.evaluate(node => node.getBoundingClientRect().height);
  await steps.action('june', 'Advance to a shorter five-week month', () => page.getByRole('button', { name: 'Next month', exact: true }).click(), async () => {
    await expect(calendar).toHaveAttribute('data-anchor', '2026-06'); await stable();
    expect(await calendar.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(sixWeeks);
  }, 'The calendar shrinks below the controls without recentering the page');
  await steps.action('choose-february', 'Open the chooser again', () => page.getByRole('button', { name: 'Choose month, June 2026', exact: true }).click(), async () => {
    await expect(page.getByLabel('Month', { exact: true })).toBeVisible(); await stable();
  });
  await steps.action('february', 'Enter a four-week month', () => page.getByLabel('Month', { exact: true }).fill('February'), async () => {
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue('February'); await stable();
  });
  await steps.action('apply-february', 'Keep the arrows fixed with February’s shorter grid', () => page.getByLabel('Month', { exact: true }).press('Enter'), async () => {
    await expect(calendar).toHaveAttribute('data-anchor', '2026-02'); await stable();
    expect(await calendar.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(sixWeeks);
  });
  await steps.action('january', 'Move back to a taller month without moving the controls', () => page.getByRole('button', { name: 'Previous month', exact: true }).click(), async () => {
    await expect(calendar).toHaveAttribute('data-anchor', '2026-01'); await stable();
  });
  steps.generateDocs('Landing calendars grow downwards', 'Tall desktop and narrow mobile layouts keep the title and month-arrow coordinates unchanged while four-, five- and six-week months change the calendar height. Long month names and the editable chooser cannot vertically recenter the controls. Every action has a full-page unmasked zero-pixel screenshot with checks beneath it.');
});
