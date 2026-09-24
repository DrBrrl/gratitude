import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, signIn, writeReflection } from '../helpers/journal-session';

test('Google sign-in, private saving, a second device and cached recovery', async ({ page, browser }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires local Firebase emulators'); test.setTimeout(120_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'foundation');
  await writeReflection(page, steps, 'I appreciated a quiet cup of tea by the window.', 'tea');
  const secondContext = await browser.newContext({ baseURL: String(info.project.use.baseURL), viewport: info.project.use.viewport, colorScheme: 'dark', locale: 'en-AU', timezoneId: 'Australia/Hobart' });
  try {
    await secondContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
    const second = await secondContext.newPage(); steps.setPage(second);
    await steps.action('second-device', 'Open Gratitude on another device', () => second.goto('./journal/'), async () => { await expect(second.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); });
    await signIn(second, info, steps, 'foundation', true);
    await steps.action('second-journal', 'Read the synchronized journal on the second device', () => second.getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(second.locator('article')).toHaveCount(1); await expect(second.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.'); });
  } finally { await secondContext.close(); steps.setPage(page); }
  await steps.action('reload', 'Reload the first device', () => page.reload(), async () => { await expect(page.getByRole('status')).toHaveText('Synced'); });
  await steps.action('settings', 'Open Settings', () => page.getByRole('button', { name: 'Settings', exact: true }).click(), async () => { await expect(page.getByText('Journal recovery', { exact: true })).toBeVisible(); });
  await steps.action('recovery', 'Open the journal recovery controls', () => page.getByText('Journal recovery', { exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view' })).toBeVisible(); });
  await steps.action('rebuild', 'Rebuild the local projection from saved events', () => page.getByRole('button', { name: 'Rebuild local view' }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Synced'); });
  await steps.action('journal', 'Check the rebuilt journal', () => page.getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toHaveCount(1); });
  // Corrupt disposable cache as a fault fixture, then exercise recovery through a real reload.
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('gratitude:'))?.name;
    if (!name) throw new Error('Missing checkpoint');
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open(name); opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => { const db = opened.result; const tx = db.transaction('cache', 'readwrite'); const store = tx.objectStore('cache'); const request = store.get('checkpoint'); request.onsuccess = () => { const checkpoint = request.result; checkpoint.state.entries[0].text = 'Corrupted cache'; store.put(checkpoint, 'checkpoint'); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
  });
  await steps.action('corrupt-reload', 'Reload after a damaged device cache', () => page.reload(), async () => { await expect(page.getByRole('status')).toHaveText('Synced'); });
  await steps.action('recovered-journal', 'Verify the original reflection is recovered', () => page.getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.'); await expect(page.getByText('Corrupted cache')).toHaveCount(0); });
  await steps.action('today', 'Return to Today before going offline', () => page.getByRole('button', { name: 'Today', exact: true }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await steps.action('offline', 'Disconnect this device', () => page.context().setOffline(true), async () => { await expect(page.getByLabel('Your reflection')).toBeVisible(); });
  await steps.action('offline-type', 'Write while offline', () => page.getByLabel('Your reflection').fill('A friend checked in today.'), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue('A friend checked in today.'); });
  await steps.action('offline-save', 'Save the offline reflection on this device', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Saved on this device; not synced'); });
  await steps.action('leave', 'Close the application before reconnecting', () => page.goto('about:blank'), async () => { await expect(page.locator('body')).toBeEmpty(); });
  await steps.action('online', 'Reconnect the device', () => page.context().setOffline(false), async () => { expect(await page.evaluate(() => navigator.onLine)).toBe(true); });
  await steps.action('return', 'Reopen Gratitude and retry the saved outbox', () => page.goto('./journal/'), async () => { await expect(page.getByRole('status')).toHaveText('Synced'); });
  await steps.action('confirm-save', 'Check that both reflections are saved once', () => page.getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toHaveCount(2); await expect(page.locator('article').filter({ hasText: 'A friend checked in today.' })).toHaveCount(1); });
  await steps.action('account', 'Open account settings', () => page.getByRole('button', { name: 'Settings', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible(); });
  await steps.action('sign-out', 'Sign out and hide the private journal', () => page.getByRole('button', { name: 'Sign out' }).click(), async () => { await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); await expect(page.locator('article')).toHaveCount(0); });
  steps.generateDocs('Private journal, synchronization and recovery', 'Every navigation, click and text-entry action has a screenshot, including the Google emulator popup and second device. Server dates are masked; all other pixels are compared.');
});
