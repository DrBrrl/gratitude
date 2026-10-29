import { test, expect as baseExpect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, seedHistory, expectSynced } from '../helpers/journal-session';

const expect = baseExpect.configure({ timeout: 15_000 });
test('week gestures move one week at a time and calendar statistics count days separately from entries', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators');
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'week-navigation');
  await seedHistory(page, [
    { text: 'A first Sunday moment.', recordedAt: '2026-09-20T01:00:00Z' },
    { text: 'A second Sunday moment.', recordedAt: '2026-09-20T02:00:00Z' },
    { text: 'A Monday kindness.', recordedAt: '2026-09-21T01:00:00Z' },
    { text: 'A Tuesday walk.', recordedAt: '2026-09-22T01:00:00Z' }
  ]);
  const box = page.locator('.week-box');
  const firstDay = () => box.locator('[data-day]').first();
  const swipe = async (direction: 'left' | 'right') => {
    const bounds = (await box.boundingBox())!;
    const left = bounds.x + 40, right = bounds.x + bounds.width - 40, y = bounds.y + 55;
    const from = direction === 'right' ? left : right, to = direction === 'right' ? right : left;
    if (info.project.name === 'mobile-chromium') {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(from, y); await page.mouse.down();
      await page.mouse.move(to, y, { steps: 5 }); await page.mouse.up();
    }
  };
  await steps.action('previous', 'Swipe right to the previous Sunday-first week', () => swipe('right'), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-20');
    await expect(box.locator('[data-day="2026-09-20"]')).toHaveAttribute('aria-label', /2 reflections/);
    await expect(box.locator('strong')).toHaveText('0 days of gratitude in a row');
    await expect(page.locator('.detail')).toHaveCount(0);
  }, 'One gesture moves seven days; saved rings reflect that week without opening an entry');
  await steps.action('date', 'Open all reflections on a date in the previous week', () => box.locator('[data-day="2026-09-20"]').click(), async () => {
    await expect(page.locator('article.card')).toHaveCount(2);
    await expect(page.locator('.date-heading')).toContainText('20 September 2026');
  });
  await steps.action('back', 'Return to the same historical week', () => page.locator('button.day-back').click(), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-20');
    await expect(box.locator('[data-day="2026-09-20"]')).toBeFocused();
  });
  await steps.action('next', 'Swipe left to return to this week', () => swipe('left'), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-27');
    await expect(box.locator('[data-day="2026-10-02"]')).toBeDisabled();
  });
  await steps.action('wheel', 'Use one horizontal scroll gesture to visit next week', async () => {
    const bounds = (await box.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 55);
    // Keep the gesture's momentum in the same browser event turn. Separate
    // automation round-trips can exceed the product's 200ms idle boundary.
    await box.evaluate(node => node.addEventListener('wheel', () => {
      for (const deltaX of [60, 30]) node.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true }));
    }, { once: true }));
    await page.mouse.wheel(80, 0);
  }, async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-10-04');
    expect(await box.locator('[data-day]').evaluateAll(nodes => nodes.length === 7 && nodes.every(node => (node as HTMLButtonElement).disabled))).toBe(true);
  }, 'The gesture’s momentum does not skip several weeks, and all future dates stay disabled');
  await steps.action('focus', 'Focus the week strip for keyboard navigation', () => box.focus(), async () => { await expect(box).toBeFocused(); });
  await steps.action('key-this-week', 'Move back exactly one week with the left arrow key', () => box.press('ArrowLeft'), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-27');
    await expect(box).toBeFocused();
  });
  await steps.action('key-previous', 'Move back to the saved historical week', () => box.press('ArrowLeft'), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-20');
  });
  await steps.action('calendar', 'Open the calendar at the week being browsed', () => page.getByRole('button', { name: 'Open calendar', exact: true }).click(), async () => {
    await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor', '2026-09');
    const summary = page.getByRole('region', { name: 'Gratitude statistics' });
    await expect(summary.locator('p').nth(0)).toContainText('Current streak: 0 days of gratitude in a row');
    await expect(summary.locator('small')).toHaveText('(Longest streak: 3 days)');
    await expect(summary.locator('p').nth(1)).toHaveText('Total entries: 4 · 3 days of gratitude');
    await expect(summary.locator('p').nth(2)).toHaveText('Most recent streak: 3 days of gratitude in a row');
  }, 'A gap leaves the current streak at zero; the latest and longest stretches remain three days across four entries');
  await steps.action('reload-calendar', 'Reload without losing the calendar or its historical return week', () => page.reload(), async () => {
    await expectSynced(page);
    await expect(page.locator('.calendar-scroll')).toHaveAttribute('data-anchor', '2026-09');
    await expect(page.locator('.calendar-summary p').nth(1)).toHaveText('Total entries: 4 · 3 days of gratitude');
  });
  await steps.action('calendar-back', 'Return from the calendar to the same week', () => page.locator('button.back').click(), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-20');
  });
  await steps.action('journal', 'Keep the browsed week when switching to Journal', () => page.getByRole('navigation').getByRole('button', { name: 'Journal', exact: true }).click(), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-20');
    await expect(page.locator('article.card')).toHaveCount(4);
  });
  await steps.action('journal-next', 'Swipe the Journal week strip forward too', () => swipe('left'), async () => {
    await expect(firstDay()).toHaveAttribute('data-day', '2026-09-27');
  });
  steps.generateDocs('Browse gratitude weeks and see your streaks', 'Touch swipes, mouse drags, horizontal wheel gestures and arrow keys move seven days at a time. Future dates stay disabled, taps still open every reflection on a date, and return navigation retains the week. The calendar separates current, longest and latest streaks, total entries and distinct gratitude days. Each action is followed by an unmasked full-page zero-pixel screenshot comparison.');
});
