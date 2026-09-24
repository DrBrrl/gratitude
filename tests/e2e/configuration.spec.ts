import { expect, test } from '@playwright/test';

test('the published build exposes configured Google sign-in', async ({ page }) => {
  test.skip(!process.env.VITE_FIREBASE_PROJECT_ID, 'Only the live-configured Pages build uses this check');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./journal/');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByText('Account sign-in is not available on this site yet.')).toHaveCount(0);
  expect(errors).toEqual([]);
});
