import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

async function login(page: Page, email: string, existing = false) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await opened;
  await popup.waitForLoadState('domcontentloaded');
  if (existing) {
    await popup.getByText(email, { exact: true }).click();
  } else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    // The emulator owns these inputs and does not provide valid label associations.
    await popup.locator('#email-input').fill(email);
    await popup.locator('#display-name-input').fill('Gratitude visitor');
    await popup.locator('#sign-in').click();
  }
  // Auth handshake and initial Firestore connection can involve cold startup.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status')).toHaveText('Synced', { timeout: 15_000 });
}

test('Google sign-in, private saving, a second device and cached recovery', async ({ page, browser }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires the local Firebase emulator build');
  test.setTimeout(60_000);
  await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  const steps = new TestStepHelper(page, info);
  await page.goto('./journal/');
  await steps.step('google-signin', 'A visitor signs in to their private journal', [
    { description: 'Google sign-in is offered before journal data is shown', check: async () => { await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); } },
    { description: 'No reflection editor is shown before authentication', check: async () => { await expect(page.getByLabel('Your reflection')).toHaveCount(0); } }
  ]);
  const email = `${info.project.name}@example.test`;
  await login(page, email);
  await page.getByLabel('Your reflection').fill('I appreciated a quiet cup of tea by the window.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByLabel('Your reflection')).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('Synced');
  await steps.step('saved-reflection', 'A reflection is saved to the signed-in account', [
    { description: 'The saved entry contains the prompt and exact user text', check: async () => { await expect(page.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.'); await expect(page.locator('article')).toContainText('What is one small thing you appreciated today?'); } },
    { description: 'Cloud synchronization is confirmed', check: async () => { await expect(page.getByRole('status')).toHaveText('Synced'); } }
  ]);
  const secondContext = await browser.newContext({ baseURL: String(info.project.use.baseURL) });
  try {
    await secondContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
    const second = await secondContext.newPage();
    await second.goto('./journal/');
    await login(second, email, true);
    await expect(second.locator('article')).toHaveCount(1);
    await expect(second.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.');
  } finally { await secondContext.close(); }
  await page.reload();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Synced');
  // Damage the disposable checkpoint without changing its digest. Recovery must use events.
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('gratitude:'))?.name;
    if (!name) throw new Error('Missing journal checkpoint database');
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open(name);
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const db = opened.result;
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const request = store.get('checkpoint');
        request.onsuccess = () => {
          const checkpoint = request.result;
          checkpoint.state.entries[0].text = 'Corrupted cache';
          store.put(checkpoint, 'checkpoint');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.reload();
  await expect(page.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.');
  await expect(page.getByText('Corrupted cache', { exact: true })).toHaveCount(0);
  await page.getByText('Journal recovery', { exact: true }).click();
  await page.getByRole('button', { name: 'Rebuild local view' }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Synced');
  await page.getByText('Journal recovery', { exact: true }).click();
  await steps.step('replayed-reflection', 'The same journal survives reload and complete projection rebuild', [
    { description: 'The saved reflection is reconstructed without duplication', check: async () => { await expect(page.locator('article')).toHaveCount(1); await expect(page.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.'); } },
    { description: 'The editor remains empty after recovery', check: async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); } }
  ]);
  // A failed explicit save is durable even if the tab reloads before retry.
  await page.context().setOffline(true);
  await page.getByLabel('Your reflection').fill('A friend checked in today.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved on this device; not synced');
  await expect(page.getByRole('heading', { name: 'A reflection is waiting to sync' })).toBeVisible();
  await expect(page.getByText('A friend checked in today.', { exact: true })).toBeVisible();
  // Unload before going online, so recovery must read the persisted outbox in a new page.
  await page.goto('about:blank');
  await page.context().setOffline(false);
  await page.goto('./journal/');
  await expect(page.locator('article')).toHaveCount(2);
  await expect(page.locator('article').filter({ hasText: 'A friend checked in today.' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'A reflection is waiting to sync' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  steps.generateDocs('Firebase journal foundation', 'Google authentication protects a private event stream. A second device, reload, and full projection rebuild recover the same reflection; signing out clears the visible journal. Uses local emulators and fictional data.');
});
