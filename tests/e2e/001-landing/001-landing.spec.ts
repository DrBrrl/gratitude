import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the landing page serves', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  // Relative navigation preserves both the project and PR-preview base paths.
  const response = await page.goto('./');

  await steps.step('landing-serves', 'A visitor can open Gratitude', [
    { description: 'The landing document returns HTTP 200', check: async () => { expect(response?.status()).toBe(200); } },
    { description: 'The page identifies itself as Gratitude', check: async () => { await expect(page).toHaveTitle('Gratitude'); } },
    { description: 'The main heading is visible', check: async () => { await expect(page.getByRole('heading', { level: 1, name: 'Gratitude', exact: true })).toBeVisible(); } }
  ]);
});
