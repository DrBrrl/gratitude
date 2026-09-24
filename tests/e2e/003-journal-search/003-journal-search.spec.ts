import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, writeReflection } from '../helpers/journal-session';

test('rainbow cards, full entries, search and editing', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(90_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'search');
  await writeReflection(page, steps, 'A café walk with a friend made the afternoon brighter.', 'first');
  await steps.action('today', 'Return to Today', () => page.getByRole('button', { name: 'Today', exact: true }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await writeReflection(page, steps, 'The rain made the garden smell wonderful.', 'second');
  const cards = page.locator('article');
  expect(await cards.nth(0).evaluate((node) => node.getBoundingClientRect().height)).toBe(await cards.nth(1).evaluate((node) => node.getBoundingClientRect().height));
  expect(await cards.nth(0).getAttribute('style')).not.toBe(await cards.nth(1).getAttribute('style'));
  await steps.action('search', 'Search for an accent-insensitive phrase', () => page.getByLabel('Search reflections').fill('CAFE friend'), async () => { await expect(cards).toHaveCount(1); await expect(cards.locator('mark')).toHaveCount(2); }, 'All query words match the full text and are highlighted');
  await steps.action('open-entry', 'Open the matching reflection', () => page.getByRole('button', { name: 'View entry →' }).click(), async () => { await expect(page.getByRole('button', { name: 'Edit reflection' })).toBeVisible(); });
  await steps.action('back', 'Return to the retained search results', () => page.getByRole('button', { name: 'Back to journal' }).click(), async () => { await expect(page.getByLabel('Search reflections')).toHaveValue('CAFE friend'); await expect(cards).toHaveCount(1); });
  await steps.action('no-results', 'Search for a missing word', () => page.getByLabel('Search reflections').fill('volcano'), async () => { await expect(page.getByRole('heading', { name: 'No matching reflections' })).toBeVisible(); });
  await steps.action('clear', 'Clear the search', () => page.getByRole('button', { name: 'Clear search' }).first().click(), async () => { await expect(cards).toHaveCount(2); });
  await steps.action('open-edit', 'Open the latest reflection', () => page.getByRole('button', { name: 'View entry →' }).first().click(), async () => { await expect(page.getByRole('button', { name: 'Edit reflection' })).toBeVisible(); });
  await steps.action('edit', 'Edit the saved reflection', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue('The rain made the garden smell wonderful.'); });
  await steps.action('revise', 'Add a remembered detail', () => page.getByLabel('Your reflection').fill('The rain made the garden smell wonderful. The roses opened.'), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(/The roses opened\./); });
  await steps.action('save-edit', 'Save changes without adding a duplicate entry', () => page.getByRole('button', { name: 'Save changes' }).click(), async () => { await expect(cards).toHaveCount(2); await expect(cards.first()).toContainText('The roses opened.'); });
  steps.generateDocs('Browse and search your rainbow journal', 'Every click and text-entry action is followed by a compared screenshot. Server-generated dates are masked; card text, layout, colours and controls are compared exactly.');
});
