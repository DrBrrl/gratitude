import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TestStepHelper } from '../helpers/test-step-helper';
import { backFromEditor, editor, expectEditor, expectSynced, navigate, openEditor, startJournal } from '../helpers/journal-session';

test('backfill a local date, preserve its draft and save multiple independent entries today', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(480_000);
  const steps = new TestStepHelper(page, info);
  const cards = page.locator('article.card');
  await startJournal(page, info, steps, 'backfill');
  await navigate(page, steps, 'journal', 'Journal');
  await steps.action('new', 'Start an independent journal entry', () => page.getByRole('button', { name: 'New entry', exact: true }).click(), async () => {
    await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T14:31:07');
    await expectEditor(page, '');
  });
  await steps.action('future', 'Check that future dates cannot be saved', () => page.getByLabel('Entry date and time').fill('2026-10-02T09:15'), async () => {
    await expect(page.getByText('Choose a date and time that is now or earlier.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save reflection', exact: true })).toBeDisabled();
  });
  await steps.action('past-date', 'Choose a remembered moment on a previous local date', () => page.getByLabel('Entry date and time').fill('2026-09-29T09:15'), async () => {
    await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-29T09:15');
    await expect(page.getByText('Choose a date and time that is now or earlier.')).toHaveCount(0);
  });
  await steps.action('past-text', 'Write a reflection for that date', () => editor(page).fill('Remembering the neighbour who brought in my bins.'), async () => {
    await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  });
  await backFromEditor(page, steps, 'leave-draft', 'Journal');
  await steps.action('independent-today', 'Keep the dated draft separate from Today', () => page.getByRole('navigation').getByRole('button', { name: 'Today', exact: true }).click(), async () => {
    await expect(page.getByRole('button', { name: 'Write a response', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue your reflection', exact: true })).toHaveCount(0);
  });
  await navigate(page, steps, 'draft-journal', 'Journal');
  await steps.action('reload-draft', 'Reload with a dated draft still on this device', () => page.reload(), async () => {
    await expectSynced(page); await expect(cards).toHaveCount(0);
  });
  // No entry has been saved for today, so the initial page remains Today.
  await navigate(page, steps, 'resume-journal', 'Journal');
  await steps.action('resume-draft', 'Resume the independent draft with its chosen date', () => page.getByRole('button', { name: 'New entry', exact: true }).click(), async () => {
    await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-29T09:15');
    await expectEditor(page, 'Remembering the neighbour who brought in my bins.');
  });
  await steps.action('save-past', 'Save the backfilled reflection', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime', '2026-09-28T23:15:00.000Z'); await expectSynced(page);
  });
  await steps.action('done-past', 'See the backfilled date on its journal card', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(1); await expect(cards.first().locator('time')).toHaveText('Tue 29 Sep 2026, 9:15 AM');
  });
  await navigate(page, steps, 'today', 'Today');
  await expect(page.getByRole('button', { name: 'Write a response', exact: true })).toBeVisible();
  await openEditor(page, steps, 'today-draft');
  await steps.action('today-text', 'Keep an unfinished reflection for Today', () => editor(page).fill('Today I enjoyed a quiet cup of tea.'), async () => {
    await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  });
  await backFromEditor(page, steps, 'leave-today-draft');
  await navigate(page, steps, 'new-today-journal', 'Journal');
  await steps.action('new-today', 'Create another entry while Today has an unfinished draft', () => page.getByRole('button', { name: 'New entry', exact: true }).click(), async () => {
    await expectEditor(page, ''); await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T14:31:07');
  });
  await steps.action('second-text', 'Record another moment for the same day', () => editor(page).fill('Later I noticed a bright bird outside.'), async () => { await expectEditor(page, 'Later I noticed a bright bird outside.'); });
  await steps.action('save-second', 'Save the independent entry without consuming Today’s draft', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible({ timeout: 15_000 }); await expectSynced(page);
  });
  await steps.action('done-second', 'See the independent entry alongside the backfill', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(2); await expect(cards.first()).toContainText('Later I noticed a bright bird');
  });
  await steps.action('saved-detail', 'Open the newly saved entry while the other draft remains unfinished', () => cards.first().getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.detail')).toContainText('Later I noticed a bright bird');
  });
  await steps.action('saved-edit', 'Edit that entry without opening Today’s different draft', () => page.getByRole('button', { name: 'Edit reflection', exact: true }).click(), async () => {
    await expectEditor(page, 'Later I noticed a bright bird outside.');
  });
  await backFromEditor(page, steps, 'back-saved-entry', 'Journal');
  await steps.action('back-journal', 'Return to the journal without changing either entry', () => page.locator('button.back').click(), async () => { await expect(cards).toHaveCount(2); });
  await navigate(page, steps, 'another-today', 'Today');
  const draftColour = await page.locator('.daily-prompt').evaluate(element => element.style.getPropertyValue('--entry-colour'));
  await steps.action('another', 'Use Today’s shortcut for a fresh additional reflection', () => page.getByRole('button', { name: 'Write another reflection', exact: true }).click(), async () => {
    await expectEditor(page, ''); await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-10-01T14:31:07');
  });
  await backFromEditor(page, steps, 'back-to-today');
  await steps.action('resume-today', 'Resume Today’s original draft with its own text and colour', () => page.getByRole('button', { name: 'Continue your reflection', exact: true }).click(), async () => {
    await expectEditor(page, 'Today I enjoyed a quiet cup of tea.');
    await expect(page.locator('.composer')).toHaveAttribute('style', new RegExp(draftColour));
  });
  await steps.action('save-first', 'Finish Today’s original draft as its own reflection', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.saved-card')).toHaveAttribute('style', new RegExp(draftColour)); await expectSynced(page);
  });
  await steps.action('done-first', 'Browse both daily entries in chronological order', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Today I enjoyed a quiet cup');
    await expect(cards.nth(1)).toContainText('Later I noticed a bright bird');
    await expect(cards.nth(2)).toContainText('Remembering the neighbour');
  });
  await steps.action('past-detail', 'Read the chosen date in the full entry', () => cards.last().getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.detail time')).toHaveAttribute('datetime', '2026-09-28T23:15:00.000Z');
  });
  await steps.action('edit-past', 'Edit the backfilled text while retaining its date and prompt', () => page.getByRole('button', { name: 'Edit reflection', exact: true }).click(), async () => {
    await expectEditor(page, 'Remembering the neighbour who brought in my bins.');
    await expect(page.getByLabel('Entry date and time')).toHaveValue('2026-09-29T09:15');
  });
  await steps.action('edit-text', 'Add detail to the remembered moment', () => editor(page).fill('Remembering the neighbour who brought in my bins and waved.'), async () => { await expectEditor(page, 'Remembering the neighbour who brought in my bins and waved.'); });
  await steps.action('save-edit', 'Save the edit without changing the historical date', () => page.getByRole('button', { name: 'Save changes', exact: true }).click(), async () => {
    await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime', '2026-09-28T23:15:00.000Z', { timeout: 15_000 }); await expectSynced(page);
  });
  await steps.action('done-edit', 'Return to all three independently saved reflections', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => { await expect(cards).toHaveCount(3); await expect(cards.last()).toContainText('bins and waved.'); });
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('privacy', 'Open journal recovery', () => page.getByRole('button', { name: /^Privacy & data/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view' })).toBeVisible(); });
  await steps.action('rebuild', 'Rebuild the dated journal entirely from source events', () => page.getByRole('button', { name: 'Rebuild local view' }).click(), async () => { await expectSynced(page); });
  await steps.action('rebuilt-journal', 'Read all entries after complete replay', () => page.getByRole('navigation').getByRole('button', { name: 'Journal', exact: true }).click(), async () => {
    await expect(cards).toHaveCount(3); await expect(cards.last().locator('time')).toHaveText('Tue 29 Sep 2026, 9:15 AM');
  });
  await navigate(page, steps, 'export-settings', 'Settings');
  await steps.action('export', 'Open journal export', () => page.getByRole('button', { name: /^Export journal/ }).click(), async () => { await expect(page.getByRole('radio', { name: /Markdown/ })).toBeChecked(); });
  await steps.action('prepare', 'Prepare all dated reflections for export', () => page.getByRole('button', { name: 'Prepare export', exact: true }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Export ready'); });
  const download = page.waitForEvent('download');
  await steps.action('download', 'Download local entry dates without system metadata', () => page.getByRole('button', { name: 'Download Markdown', exact: true }).click(), async () => {
    const file = await download;
    const markdown = await readFile((await file.path())!, 'utf8');
    expect(markdown.match(/^## .+$/gm)).toEqual(['## 2026-10-01 14:31:07', '## 2026-10-01 14:31:07', '## 2026-09-29 09:15:00']);
    expect(markdown).toContain('bins and waved'); expect(markdown).not.toMatch(/createdAt|entryAt|sequence/i);
  });
  steps.generateDocs('Backfill moments and write more than once a day', 'New entries have an explicit local date/time and their own durable draft. Future times are rejected. Backfills do not complete Today; multiple daily entries retain separate identities, colours and prompts. Editing, full replay and Markdown export preserve the chosen date. Every action has an unmasked, zero-tolerance screenshot comparison.');
});
