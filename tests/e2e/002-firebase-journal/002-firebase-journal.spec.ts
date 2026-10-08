import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { FIXTURE_TIME, editor, expectEditor, expectSynced, navigate, openEditor, startJournal, signIn, writeReflection } from '../helpers/journal-session';

test('Google sign-in, private saving, a second device and cached recovery', async ({ page, browser }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires local Firebase emulators');
  // 32 full-page comparisons plus two sign-ins took 118 seconds on the CI runner.
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'foundation');
  await writeReflection(page, steps, 'I appreciated a quiet cup of tea by the window.', 'tea');
  const secondContext = await browser.newContext({ ...info.project.use, baseURL: String(info.project.use.baseURL) });
  try {
    await secondContext.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    const second = await secondContext.newPage(); steps.setPage(second);
    await second.clock.setFixedTime(new Date(FIXTURE_TIME));
    await steps.action('second-device', 'Open Gratitude on another device', () => second.goto('./journal/'), async () => { await expect(second.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); });
    await signIn(second, info, steps, 'foundation', true, 'Journal');
    await navigate(second, steps, 'second-journal', 'Journal');
    await expect(second.locator('article')).toHaveCount(1);
    await expect(second.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.');
  } finally { await secondContext.close(); steps.setPage(page); }
  await steps.action('reload', 'Reload the first device', () => page.reload(), () => expectSynced(page));
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('recovery', 'Open Privacy & data', () => page.getByRole('button', { name: /^Privacy & data/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view' })).toBeVisible(); });
  await steps.action('rebuild', 'Rebuild the local projection from saved events', () => page.getByRole('button', { name: 'Rebuild local view' }).click(), () => expectSynced(page));
  await navigate(page, steps, 'journal', 'Journal');
  await expect(page.locator('article')).toHaveCount(1);
  // Corrupt disposable cache as a fault fixture, then exercise recovery through a real reload.
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find(db => db.name?.startsWith('gratitude:'))?.name;
    if (!name) throw new Error('Missing checkpoint');
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open(name); opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => { const db = opened.result; const tx = db.transaction('cache', 'readwrite'); const store = tx.objectStore('cache'); const request = store.get('checkpoint'); request.onsuccess = () => { const checkpoint = request.result; checkpoint.state.entries[0].text = 'Corrupted cache'; store.put(checkpoint, 'checkpoint'); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
  });
  await steps.action('corrupt-reload', 'Reload after a damaged device cache', () => page.reload(), () => expectSynced(page));
  await steps.action('recovered-journal', 'Verify the original reflection is recovered', () => page.getByRole('navigation').getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toContainText('I appreciated a quiet cup of tea by the window.'); await expect(page.getByText('Corrupted cache')).toHaveCount(0); });
  await navigate(page, steps, 'today', 'Today');
  await openEditor(page, steps, 'continue');
  await expectEditor(page, 'I appreciated a quiet cup of tea by the window.');
  await steps.action('offline', 'Disconnect this device', () => page.context().setOffline(true), async () => { expect(await page.evaluate(() => navigator.onLine)).toBe(false); });
  await steps.action('offline-type', 'Continue today’s reflection while offline', () => editor(page).fill('I appreciated a quiet cup of tea. A friend checked in today.'), async () => { await expectEditor(page, 'I appreciated a quiet cup of tea. A friend checked in today.'); });
  await steps.action('offline-save', 'Save the offline changes on this device', () => page.getByRole('button', { name: 'Save changes', exact: true }).click(), async () => { await expect(page.locator('.sync-status')).toHaveText('Saved on this device; not synced'); });
  await steps.action('leave', 'Close the application before reconnecting', () => page.goto('about:blank'), async () => { await expect(page.locator('body')).toBeEmpty(); });
  await steps.action('online', 'Reconnect the device', () => page.context().setOffline(false), async () => { expect(await page.evaluate(() => navigator.onLine)).toBe(true); });
  await steps.action('return', 'Reopen Gratitude and retry the saved outbox', () => page.goto('./journal/'), () => expectSynced(page));
  await steps.action('confirm-save', 'Check that the reflection was updated without duplication', () => page.getByRole('navigation').getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toHaveCount(1); await expect(page.locator('article')).toContainText('A friend checked in today.'); });
  await navigate(page, steps, 'settings-account', 'Settings');
  await steps.action('account', 'Open account settings', () => page.getByRole('button', { name: /^Your account/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible(); });
  await steps.action('sign-out', 'Sign out and hide the private journal', () => page.getByRole('button', { name: 'Sign out' }).click(), async () => { await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); await expect(page.locator('article')).toHaveCount(0); });
  steps.generateDocs('Private journal, synchronization and recovery', 'Every navigation, click and text-entry action has a screenshot, including the Google emulator popup and second device. Fixed browser and emulator clocks keep all rendered dates visible and exactly comparable.');
});
