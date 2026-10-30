import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { FIXTURE_TIME, signIn, navigate, writeReflection, expectSynced } from '../helpers/journal-session';

async function expectPublicLanding(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Gratitude', exact: true })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Calendar sign-in preview' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('.filled, .calendar-photo')).toHaveCount(0);
  expect(await preview.locator('button').evaluateAll(nodes => nodes.length > 30 && nodes.every(node => (node as HTMLButtonElement).disabled))).toBe(true);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Journal navigation' })).toHaveCount(0);
  await expect(page.locator('article.card, .composer')).toHaveCount(0);
  await expect(page).toHaveTitle('Gratitude');
}

test('every signed-out route uses the public landing calendar and sign-in remains recoverable', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators');
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, info);
  await page.clock.setFixedTime(new Date(FIXTURE_TIME));
  await page.request.delete('http://127.0.0.1:19099/emulator/v1/projects/demo-gratitude/accounts');
  await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
  for (const [id, route] of [['root', './'], ['journal', './journal/'], ['settings', './settings/'], ['journal-link', './journal/?afterSignIn=journal']] as const) {
    await steps.action(id, `Open ${route} before signing in`, async () => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    }, () => expectPublicLanding(page), 'The same empty, disabled calendar and landing text appear without private content');
  }
  await steps.action('reload', 'Reload the Journal sign-in link without signing in', () => page.reload(), () => expectPublicLanding(page));
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  const popup = await opened;
  await steps.step('cancel-popup', 'Open Google authentication from the landing calendar', [{ description: 'The Google account chooser opens directly', check: async () => {
    await expect(popup.getByRole('button', { name: 'Add new account' })).toBeVisible();
  } }], popup);
  await steps.action('cancelled', 'Close authentication without signing in', () => popup.close(), async () => {
    await expectPublicLanding(page);
    await expect(page.getByRole('alert')).toHaveText('Sign-in was not completed. You can try again.', { timeout: 15_000 });
  });
  await signIn(page, info, steps, 'signed-out-routing', false, 'Journal', true, () => page.getByRole('link', { name: 'Sign in and open your journal', exact: true }).click());
  await navigate(page, steps, 'today', 'Today');
  await writeReflection(page, steps, 'A fictional moment to keep private after signing out.', 'private');
  await steps.action('settings-restored', 'Open Settings directly with a restored account session', () => page.goto('./settings/'), async () => {
    await expectSynced(page);
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Calendar sign-in preview' })).toHaveCount(0);
  });
  await steps.action('account', 'Open account settings', () => page.getByRole('button', { name: /^Your account/ }).click({ timeout: 15_000 }), async () => {
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  });
  await steps.action('signout', 'Sign out directly onto the public landing calendar', () => page.getByRole('button', { name: 'Sign out', exact: true }).click(), async () => {
    await expectPublicLanding(page);
    await expect(page.getByText('A fictional moment to keep private after signing out.', { exact: true })).toHaveCount(0);
  });
  await steps.action('signed-out-reload', 'Keep the public landing on a signed-out Settings reload', () => page.reload(), () => expectPublicLanding(page));
  steps.generateDocs('One landing page before sign-in', 'Root, Journal, Settings and Journal sign-in links show the same greyed-out empty calendar before authentication. Cancelling Google sign-in keeps that page and allows retry; the footer opens Journal after sign-in. A restored session opens Settings directly, and sign-out removes private content immediately. Every action has an unmasked screenshot comparison with zero differing pixels, with checks below the image.');
});
