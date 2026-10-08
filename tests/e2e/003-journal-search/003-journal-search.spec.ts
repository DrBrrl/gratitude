import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { editor, expectEditor, expectSynced, seedHistory, startJournal } from '../helpers/journal-session';

const longReflection = 'The rain made the garden smell wonderful.\nThe roses opened.\nA neighbour stopped to share a story about the flowers she grew as a child, and we stayed outside talking until the clouds cleared and the afternoon sunshine warmed the garden again.';

test('rainbow cards, expansion, full entries, search and editing', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(120_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'search');
  await seedHistory(page, [
    { text: 'A café walk with a friend.', recordedAt: '2026-09-29T04:31:07Z' },
    { text: longReflection, recordedAt: '2026-09-30T04:31:07Z' }
  ]);
  const cards = page.locator('article.card');
  await steps.action('journal', 'Browse short and long rainbow reflections', () => page.getByRole('navigation').getByRole('button', { name: 'Journal', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByRole('button', { name: '(see more)', exact: true })).toBeVisible();
    await expect(cards.last().getByRole('button', { name: '(see more)', exact: true })).toHaveCount(0);
    expect(await cards.first().getAttribute('style')).not.toBe(await cards.last().getAttribute('style'));
    expect((await cards.first().boundingBox())!.height).toBeGreaterThan((await cards.last().boundingBox())!.height);
    await expect(cards.first().locator('time')).toHaveText('Wed 30 Sep 2026, 2:31 PM');
    await expect(cards.first().locator('.preview > p')).toContainText(' …');
    const lines = await cards.first().locator('.preview > p').evaluate(node => {
      const height = parseFloat(getComputedStyle(node).lineHeight);
      return Array.from(node.children).reduce((sum, child) => sum + Math.round(child.getBoundingClientRect().height / height), 0);
    });
    expect(lines).toBe(3);
  }, 'Short cards shrink, long reflections show three lines and a spaced ellipsis, and dates use local time');
  await steps.action('expand', 'Expand the longer reflection in place', () => cards.first().getByRole('button', { name: '(see more)', exact: true }).click(), async () => {
    await expect(cards.first().locator('.preview > p')).toHaveText(longReflection.replace(/\n/g, ''));
    await expect(cards.first().getByRole('button', { name: '(see less)', exact: true })).toBeVisible();
    await expect(cards.getByRole('button', { name: 'View entry', exact: true })).toHaveCount(2);
  });
  await steps.action('collapse', 'Collapse the reflection again', () => cards.first().getByRole('button', { name: '(see less)', exact: true }).click(), async () => { await expect(cards.first().getByRole('button', { name: '(see more)', exact: true })).toBeVisible(); });
  await steps.action('focus-search', 'Focus the search field', () => page.getByLabel('Search reflections').click(), async () => { await expect(page.getByLabel('Search reflections')).toBeFocused(); });
  await steps.action('search', 'Search for an accent-insensitive phrase', () => page.getByLabel('Search reflections').fill('CAFE friend'), async () => { await expect(cards).toHaveCount(1); await expect(cards.locator('mark')).toHaveCount(2); }, 'All query words match the full text and are highlighted');
  await steps.action('open-entry', 'Open the matching reflection', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.getByRole('button', { name: 'Edit reflection' })).toBeVisible();
    await expect(page.locator('article time')).toHaveAttribute('datetime', '2026-09-29T04:31:07.000Z');
    await expect(page.locator('article time')).toHaveText(/29 September 2026.*2:31 pm/);
  }, 'The full reflection includes its prompt and local date and time');
  await steps.action('back', 'Return to the retained search results', () => page.locator('button.back').click(), async () => { await expect(page.getByLabel('Search reflections')).toHaveValue('CAFE friend'); await expect(cards).toHaveCount(1); });
  await steps.action('no-results', 'Search for a missing word', () => page.getByLabel('Search reflections').fill('volcano'), async () => { await expect(page.getByRole('heading', { name: 'No matching reflections' })).toBeVisible(); });
  await steps.action('clear', 'Clear the search', () => page.getByRole('button', { name: 'Clear search' }).first().click(), async () => { await expect(cards).toHaveCount(2); });
  await steps.action('open-edit', 'Open the latest reflection', () => page.getByRole('button', { name: 'View entry', exact: true }).first().click(), async () => { await expect(page.locator('.detail .entry-text')).toHaveText(longReflection.replace(/\n/g, '')); });
  await steps.action('edit', 'Edit the saved reflection', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expectEditor(page, longReflection); await expect(page.locator('button.back')).toHaveText('Journal'); });
  await steps.action('revise', 'Add a remembered detail', () => editor(page).fill('The rain made the garden smell wonderful. The roses opened.'), async () => { await expectEditor(page, 'The rain made the garden smell wonderful. The roses opened.'); });
  await steps.action('save-edit', 'Save changes to the existing reflection', () => page.getByRole('button', { name: 'Save changes' }).click(), async () => { await expect(page.locator('.saved-card')).toContainText('The roses opened.'); await expectSynced(page); });
  await steps.action('edited-journal', 'Finish editing and return to the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('The roses opened.');
    await expect(cards.first().locator('time')).toHaveText('Wed 30 Sep 2026, 2:31 PM');
  });
  steps.generateDocs('Browse and search your rainbow journal', 'Every click and text-entry action is followed by a compared screenshot. Historical raw-event fixtures exercise content-sized cards, three-line previews, expansion, local timestamps and full-entry editing.');
});
