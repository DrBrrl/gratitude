import { expect, type Page, type TestInfo } from '@playwright/test';
import { TestStepHelper } from './test-step-helper';

export async function startJournal(page: Page, info: TestInfo, steps: TestStepHelper, name: string) {
  await page.request.delete('http://127.0.0.1:19099/emulator/v1/projects/demo-gratitude/accounts');
  await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  await steps.action('open', 'Open Gratitude', () => page.goto('./journal/'), async () => {
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });
  await signIn(page, info, steps, name);
}
export async function signIn(page: Page, info: TestInfo, steps: TestStepHelper, name: string, existing = false) {
  const email = `${name}-${info.project.name}@example.test`;
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await opened;
  await popup.waitForLoadState('domcontentloaded');
  await steps.step('google-popup', 'Choose Google sign-in', [{ description: 'The Google emulator account chooser opens', check: async () => { await expect(popup.getByRole('button', { name: 'Add new account' })).toBeVisible(); } }], popup);
  if (existing) await popup.getByText(email, { exact: true }).click();
  else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await steps.step('new-account', 'Add a fictional Google account', [{ description: 'The account form opens', check: async () => { await expect(popup.locator('#email-input')).toBeVisible(); } }], popup);
    await popup.locator('#email-input').fill(email);
    await steps.step('email', 'Enter the fictional email address', [{ description: 'The email field retains the input', check: async () => { await expect(popup.locator('#email-input')).toHaveValue(email); } }], popup);
    await popup.locator('#display-name-input').fill('Gratitude visitor');
    await steps.step('name', 'Enter a display name', [{ description: 'The display name is entered', check: async () => { await expect(popup.locator('#display-name-input')).toHaveValue('Gratitude visitor'); } }], popup);
    await popup.locator('#sign-in').click();
  }
  await steps.step('signed-in', 'Complete sign-in and open Today', [{ description: 'The private journal is synchronized', check: async () => { await expect(page.getByRole('status')).toHaveText('Synced', { timeout: 15_000 }); await expect(page.getByLabel('Your reflection')).toBeVisible(); } }]);
}
export async function writeReflection(page: Page, steps: TestStepHelper, text: string, id: string) {
  await steps.action(`${id}-type`, 'Write a reflection', () => page.getByLabel('Your reflection').fill(text), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(text); });
  await steps.action(`${id}-save`, 'Save the reflection to the journal', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Synced'); await expect(page.locator('article').filter({ hasText: text })).toBeVisible(); });
}
