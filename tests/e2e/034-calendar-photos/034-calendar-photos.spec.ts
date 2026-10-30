import { test, expect as baseExpect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch, Timestamp, type Firestore } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, seedHistory, FIXTURE_TIME, navigate, expectSynced, expectDecodedPhotos } from '../helpers/journal-session';
import { uidFor } from '../helpers/import-fixture';
import { appendReflection } from '../../../src/lib/firebase/append';
import { replay, photoKey, type PhotoAction } from '../../../src/lib/domain';

const expect = baseExpect.configure({ timeout: 15_000 });
test('private photo dates share fogged thumbnails across all calendars and discard them on sign-out', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(240_000);
  const steps = new TestStepHelper(page, info);
  const downloads: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().startsWith('http://127.0.0.1:19199/') && request.url().includes('alt=media')) downloads.push(decodeURIComponent(new URL(request.url()).pathname).split('/').at(-1)!);
  });
  await startJournal(page, info, steps, 'calendar-photos');
  await seedHistory(page, [
    { text: 'An earlier Sunday picture.', recordedAt: '2026-09-27T01:00:00Z' },
    { text: 'A later Sunday picture.', recordedAt: '2026-09-27T02:00:00Z' },
    { text: 'A Wednesday picture.', recordedAt: '2026-09-30T01:00:00Z' },
    { text: 'A Thursday picture.', recordedAt: '2026-10-01T01:00:00Z' },
    { text: 'A picture in an offscreen month.', recordedAt: '2026-08-01T01:00:00Z' },
    { text: 'An unavailable picture still has a readable date.', recordedAt: '2026-08-15T01:00:00Z' }
  ]);
  const uid = await uidFor(page);
  const env = await initializeTestEnvironment({ projectId: 'demo-gratitude', firestore: { host: '127.0.0.1', port: 18080 }, storage: { host: '127.0.0.1', port: 19199 } });
  const attachments = [
    ['fixture-1', 0, 'calendar-sunday-old'], ['fixture-2', 0, 'calendar-sunday-first'], ['fixture-2', 1, 'calendar-sunday-spare'],
    ['fixture-3', 0, 'calendar-wednesday'], ['fixture-4', 0, 'calendar-today'], ['fixture-5', 0, 'calendar-august'], ['fixture-6', 0, 'calendar-missing']
  ] as const;
  const actions: PhotoAction[] = attachments.map(([entryId, slot, photoId], i) => ({ eventId: `calendar-photo-${i}`, type: 'PhotoAttached', schemaVersion: 1, payload: { entryId, slot, photoId, previousEventId: null } }));
  replay(actions.map((action, i) => ({ ...action, sequence: i + 1, recordedAt: FIXTURE_TIME })));
  try {
    const image = new Uint8Array(await readFile('tests/fixtures/import-mug.jpg'));
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), batch = writeBatch(db), root = `users/${uid}/streams/v1`;
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        batch.set(doc(db, `${root}/events/${action.eventId}`), { ...action, sequence: i + 7, recordedAt: Timestamp.fromDate(new Date(FIXTURE_TIME)) });
        batch.set(doc(db, `${root}/photos/${photoKey(action.payload.entryId, action.payload.slot)}`), { lastEventId: action.eventId });
        if (action.payload.photoId !== 'calendar-missing') await uploadBytes(ref(context.storage('demo-gratitude.firebasestorage.app'), `users/${uid}/v1/${action.payload.photoId}`), image, { contentType: 'image/jpeg' });
      }
      batch.set(doc(db, root), { sequence: 13, lastEventId: actions.at(-1)!.eventId }); await batch.commit();
    });
    const week = page.locator('.week-box');
    const photo = (scope: ReturnType<typeof page.locator>, day: string) => scope.locator(`[data-day="${day}"] .calendar-photo img`);
    await steps.step('week-photos', 'See fogged photo circles in the current week', [{ description: 'Sunday, Wednesday and Today show readable numbers, date-colour rings and decoded private thumbnails', check: async () => {
      await expect(week.locator('.calendar-photo img')).toHaveCount(3);
      for (const day of ['2026-09-27', '2026-09-30', '2026-10-01']) await expect(photo(week, day)).toBeVisible();
      await expect(week.locator('[data-day="2026-09-27"]')).toHaveAttribute('aria-label', /2 reflections, photo attached/);
      await expect(week.locator('[data-day="2026-09-27"] .day-number')).toHaveText('27');
      await expect(week.locator('[data-day="2026-09-27"]')).toHaveCSS('--day-colour', '#e5e561');
      expect(downloads).not.toContain('calendar-sunday-old'); expect(downloads).not.toContain('calendar-sunday-spare'); expect(downloads).not.toContain('calendar-august');
    } }]);
    const sunday = await photo(week, '2026-09-27').getAttribute('src');
    await steps.action('landing', 'Open the lowered landing page and its photo month', () => page.locator('.today-header a.brand').click(), async () => {
      await expect(photo(page.locator('.landing-calendar'), '2026-10-01')).toBeVisible();
      const offset = await page.locator('.page').evaluate(node => parseFloat(getComputedStyle(node).paddingTop) - 64);
      const size = await page.getByRole('heading', { name: 'Gratitude', exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      expect(offset).toBeGreaterThan(size * .6); expect(offset).toBeLessThan(size * .85);
    }, 'The page moves down by approximately one capital G while date photos retain their coloured rings');
    await steps.action('september', 'Browse September’s photo dates', () => page.getByRole('button', { name: 'Previous month', exact: true }).click(), async () => {
      await expect(photo(page.locator('.landing-calendar'), '2026-09-27')).toHaveAttribute('src', sunday!);
      await expect(photo(page.locator('.landing-calendar'), '2026-09-30')).toBeVisible();
      for (const id of ['calendar-sunday-first', 'calendar-wednesday', 'calendar-today']) expect(downloads.filter(value => value === id)).toHaveLength(1);
    }, 'The month and week reuse the same tiny, owner-bound thumbnail without another image download');
    await steps.action('app', 'Return to the signed-in app', () => page.getByRole('link', { name: 'Open your journal', exact: true }).click(), async () => {
      await expect(page.getByRole('heading', { name: 'Reflection time' })).toBeVisible();
      await expect(photo(week, '2026-09-27')).toHaveAttribute('src', sunday!);
    });
    await steps.action('calendar', 'Open photo dates in the scrolling calendar', () => page.getByRole('button', { name: 'Open calendar', exact: true }).click(), async () => {
      await expect(photo(page.locator('.calendar-scroll'), '2026-10-01')).toBeVisible();
      expect(downloads).not.toContain('calendar-august');
    }, 'Offscreen months do not trigger private photo downloads');
    await steps.action('august', 'Load photos when their historical month becomes visible', () => page.getByLabel('Jump to month').fill('2026-08'), async () => {
      await expect(photo(page.locator('.calendar-scroll'), '2026-08-01')).toBeVisible();
      await expect(page.locator('.calendar-scroll [data-day="2026-08-15"] .calendar-photo')).toHaveAttribute('data-state', 'unavailable');
      await expect(page.locator('.calendar-scroll [data-day="2026-08-15"] .day-number')).toHaveText('15');
      await expect(page.getByRole('alert')).toHaveCount(0);
    }, 'A visible historical photo loads; an unavailable file keeps its date readable and clickable');
    await steps.action('return-september', 'Return to the previously loaded photo month', () => page.getByLabel('Jump to month').fill('2026-09'), async () => {
      await expect(photo(page.locator('.calendar-scroll'), '2026-09-27')).toHaveAttribute('src', sunday!);
    });
    // Another device removes the first Sunday attachment through the real append contract.
    const other = env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } });
    // Rules-unit-testing returns a compat wrapper which the modular SDK unwraps.
    await appendReflection(other.firestore() as unknown as Firestore, uid, { eventId: 'calendar-remove-first', type: 'PhotoRemoved', schemaVersion: 1, payload: { entryId: 'fixture-2', slot: 0, photoId: 'calendar-sunday-first', previousEventId: 'calendar-photo-1' } });
    await steps.step('removed', 'Reflect a photo removal from another device', [{ description: 'Sunday selects the next occupied photo slot and the old thumbnail disappears', check: async () => {
      await expect(photo(page.locator('.calendar-scroll'), '2026-09-27')).toBeVisible();
      await expect(photo(page.locator('.calendar-scroll'), '2026-09-27')).not.toHaveAttribute('src', sunday!);
      expect(downloads).toContain('calendar-sunday-spare');
    } }]);
    await steps.action('reload', 'Recreate photo date selections from cached and source state', () => page.reload(), async () => {
      await expectSynced(page);
      await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor', '2026-09');
      await expect(photo(page.locator('.calendar-scroll'), '2026-09-27')).toBeVisible();
    });
    await steps.action('multiple', 'Keep the usual date-click behaviour for a photo date', () => page.locator('.calendar-scroll [data-day="2026-09-27"]').click(), async () => {
      await expect(page.locator('.date-heading')).toContainText('27 September 2026');
      await expect(page.locator('article.card')).toHaveCount(2);
      await expectDecodedPhotos(page, 2);
      await expect(photo(week, '2026-09-27')).toBeVisible();
    });
    await navigate(page, steps, 'settings', 'Settings');
    await steps.action('account', 'Open account controls', () => page.getByRole('button', { name: /^Your account/ }).click(), async () => {
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    });
    await steps.action('signout', 'End the owner’s photo session', () => page.getByRole('button', { name: 'Sign out', exact: true }).click(), async () => {
      await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
      await expect(page.locator('.calendar-photo')).toHaveCount(0);
    });
    await steps.action('signedout-home', 'Keep the signed-out preview free of private images', () => page.goto('./'), async () => {
      await expect(page.locator('.signed-out-calendar')).toBeVisible();
      await expect(page.locator('.calendar-photo')).toHaveCount(0);
      expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat().every(url => !url.includes('19199') && !url.startsWith('blob:')))).toBe(true);
    });
    steps.generateDocs('Fogged photo circles in every gratitude calendar', 'Fictional private attachments supply date thumbnails in week strips, the landing month and the scrolling calendar. The newest dated reflection with photos supplies its first live slot. Visible photos share a bounded memory cache; offscreen months stay lazy, missing images preserve readable dates, removals and replay update the selection, and sign-out removes private previews. The lowered landing heading keeps its top anchoring. Every user action has an unmasked full-page zero-pixel screenshot with checks underneath.');
  } finally { await env.cleanup(); }
});
