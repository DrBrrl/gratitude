import { test, expect as baseExpect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, seedHistory, expectSynced } from '../helpers/journal-session';

const expect = baseExpect.configure({ timeout: 15_000 });
test('large journals load incrementally while search, Settings and cached recovery stay complete', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators');
  test.setTimeout(360_000);
  const steps = new TestStepHelper(page, info);
  const timings: { destination: string; milliseconds: number }[] = [];
  const timed = async (destination: string, action: () => Promise<unknown>) => {
    const started = performance.now();
    await action();
    timings.push({ destination, milliseconds: Math.round(performance.now() - started) });
  };
  const nav = (name: string) => page.getByRole('navigation', { name: 'Journal navigation' }).getByRole('button', { name, exact: true });
  const cards = page.locator('article.card');
  await startJournal(page, info, steps, 'large-journal');
  await seedHistory(page, Array.from({ length: 701 }, (_, i) => ({
    text: i === 0 ? 'The café comet conversation, remembered from long ago.' : `Fictional reflection ${i + 1}. A quiet walk and a thoughtful conversation.`,
    recordedAt: new Date(Date.UTC(2024, 0, i + 1, 2)).toISOString()
  })));
  await steps.action('journal', 'Open a journal with 701 saved reflections', () => timed('Journal', () => nav('Journal').click()), async () => {
    await expect(cards).toHaveCount(20);
    await expect(cards.first()).toContainText('Fictional reflection 701.');
    await expect(page.getByRole('status')).toContainText('Showing 20 of 701 reflections');
  }, 'Only the newest twenty cards are mounted; all 701 entries remain available');
  await steps.action('scroll', 'Scroll down to automatically load older reflections', () => page.locator('.more-reflections').scrollIntoViewIfNeeded(), async () => {
    await expect(cards).toHaveCount(40);
    await expect(page.locator('.more-reflections')).toContainText('Showing 40 of 701 reflections');
  }, 'Scrolling loads twenty more cards without a button click');
  await steps.action('entry', 'Open an entry from the second batch', () => cards.nth(20).getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.detail .entry-text')).toHaveText('Fictional reflection 681. A quiet walk and a thoughtful conversation.');
  });
  await steps.action('back', 'Return to the loaded journal range', () => page.locator('button.back').click(), async () => {
    await expect(cards).toHaveCount(40);
    await expect(page.locator('#view-fixture-681')).toBeFocused();
  }, 'Returning preserves the loaded cards and focuses the entry that was opened');
  await steps.action('settings', 'Open Settings from a large journal', () => timed('Settings', () => nav('Settings').click()), async () => {
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.settings-row')).toHaveCount(5);
  }, 'Settings replaces the journal without mounting or measuring hidden cards');
  await steps.action('ai-settings', 'Open model and prompt settings', () => page.getByRole('button', { name: /^AI settings/ }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'AI settings', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What informs your prompts' })).toBeVisible();
  });
  await steps.action('settings-back', 'Return to the settings menu', () => page.locator('button.back').click(), async () => {
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  });
  await steps.action('journal-again', 'Return to the journal after Settings', () => nav('Journal').click(), async () => {
    await expect(cards).toHaveCount(40);
  });
  await steps.action('search', 'Search the complete history for an unmounted entry', () => page.getByLabel('Search reflections').fill('CAFE comet'), async () => {
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('The café comet conversation');
    await expect(cards.locator('mark')).toHaveCount(2);
    await expect(page.locator('.result-count')).toHaveText('1 reflection');
  }, 'Accent-insensitive search includes the oldest entry, beyond the rendered batches');
  await steps.action('oldest', 'Read the matching historical reflection', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.detail time')).toHaveAttribute('datetime', '2024-01-01T02:00:00.000Z');
    await expect(page.locator('.detail .entry-text')).toHaveText('The café comet conversation, remembered from long ago.');
  });
  await steps.action('search-back', 'Return to the retained search', () => page.locator('button.back').click(), async () => {
    await expect(page.getByLabel('Search reflections')).toHaveValue('CAFE comet');
    await expect(cards).toHaveCount(1);
  });
  await steps.action('clear', 'Restore the previously loaded journal range', () => page.getByRole('button', { name: 'Clear search', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(40);
  });
  await steps.action('today', 'Return to Today without rendering historical cards', () => timed('Today', () => nav('Today').click()), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection time' })).toBeVisible();
    await expect(cards).toHaveCount(0);
  });
  await steps.action('reload', 'Restore the large journal from its cached projection', () => page.reload(), async () => {
    await expectSynced(page);
    await expect(page.getByRole('heading', { name: 'Reflection time' })).toBeVisible();
  });
  await steps.action('warm-journal', 'Open a fresh twenty-card range after reload', () => timed('Journal after cached reload', () => nav('Journal').click()), async () => {
    await expect(cards).toHaveCount(20);
    await expect(page.locator('.more-reflections')).toContainText('Showing 20 of 701 reflections');
  });
  await info.attach('navigation-timings', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
  steps.generateDocs('Responsive navigation through 701 reflections', 'Fictional raw events create a large journal. Twenty cards mount initially; scrolling adds twenty. Search covers the full history, entry navigation retains the loaded range, Settings stays independent, and a cached reload restores every entry. Timing observations are attached to the test report without hardware-dependent pass/fail limits. Every user action has an unmasked full-page screenshot comparison with zero pixel tolerance.');
});
