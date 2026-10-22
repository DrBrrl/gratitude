import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TestStepHelper } from '../helpers/test-step-helper';
import { backFromEditor, editor, expectEditor, expectSynced, navigate, openEditor, startJournal } from '../helpers/journal-session';

test('choose a date from Today and change a saved reflection date without losing its content', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators');
  test.setTimeout(480_000);
  const steps = new TestStepHelper(page, info);
  const date = page.getByLabel('Entry date and time');
  const cards = page.locator('article.card');
  const text = 'The neighbour brought in my bins.';
  await startJournal(page, info, steps, 'editable-dates');
  await openEditor(page, steps, 'first-editor');
  await steps.action('empty-date', 'Require a valid date before saving', () => date.fill(''), async () => {
    await expect(page.getByText('Choose a valid entry date and time.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save reflection', exact: true })).toBeDisabled();
  });
  await steps.action('future', 'Reject a future date in the first-reflection editor', () => date.fill('2026-10-02T09:15'), async () => {
    await expect(page.getByText('Choose a date and time that is now or earlier.', { exact: true })).toBeVisible();
  });
  await steps.action('past', 'Choose a past local date directly from Today', () => date.fill('2026-09-29T09:15'), async () => { await expect(date).toHaveValue('2026-09-29T09:15'); });
  await steps.action('write', 'Write the reflection for that moment', () => editor(page).fill(text), async () => { await expectEditor(page, text); await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await backFromEditor(page, steps, 'leave-draft');
  await steps.action('reload-draft', 'Reload the dated Today draft', () => page.reload(), async () => { await expectSynced(page); });
  await openEditor(page, steps, 'resume-draft');
  await steps.step('retained-date', 'Retain the chosen local date and reflection across reload', [{ description: 'Both date and text are restored from the local draft', check: async () => { await expect(date).toHaveValue('2026-09-29T09:15'); await expectEditor(page, text); } }]);
  const colour = await page.locator('.composer').evaluate(node => node.style.getPropertyValue('--entry-colour'));
  // Network loss is fixture setup; each resulting user action is documented separately.
  await page.context().setOffline(true);
  await steps.action('pending-date', 'Retain the selected date in an offline pending save', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Return text to editor', exact: true })).toBeVisible(); });
  await steps.action('recover-date', 'Return the same dated reflection to the editor', () => page.getByRole('button', { name: 'Return text to editor', exact: true }).click(), async () => { await expect(date).toHaveValue('2026-09-29T09:15'); await expectEditor(page, text); await expect(page.getByRole('button', { name: 'Return text to editor', exact: true })).toHaveCount(0); });
  await page.context().setOffline(false);
  await steps.action('save-past', 'Save the remembered moment without completing Today', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime', '2026-09-28T23:15:00.000Z'); await expectSynced(page);
  });
  await steps.action('done', 'Read the chosen date on the journal card', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => { await expect(cards).toHaveCount(1); await expect(cards.locator('time')).toHaveText('Tue 29 Sep 2026, 9:15 AM'); });
  await navigate(page, steps, 'today-incomplete', 'Today');
  await steps.step('still-empty', 'Keep Today available after saving a past reflection', [{ description: 'Today still offers a new response', check: async () => { await expect(page.getByRole('button', { name: 'Write a response', exact: true })).toBeVisible(); } }]);
  await navigate(page, steps, 'journal', 'Journal');
  await steps.action('detail', 'Open the saved reflection', () => cards.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail')).toContainText(text); });
  await steps.action('edit', 'Edit the saved reflection with its existing date', () => page.getByRole('button', { name: 'Edit reflection', exact: true }).click(), async () => { await expect(date).toHaveValue('2026-09-29T09:15'); });
  await steps.action('edit-future', 'Reject future dates when editing a saved reflection', () => date.fill('2026-10-02T09:15'), async () => { await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled(); });
  await steps.action('move-today', 'Move the reflection to this morning in local time', () => date.fill('2026-10-01T09:15'), async () => { await expect(date).toHaveValue('2026-10-01T09:15'); await expectEditor(page, text); });
  await backFromEditor(page, steps, 'leave-edit', 'Journal');
  await steps.action('reload-edit', 'Reload without committing the changed date', () => page.reload(), async () => { await expectSynced(page); await expect(page.getByRole('heading', { name: 'Reflection time', exact: true })).toBeVisible(); });
  await navigate(page, steps, 'resume-journal', 'Journal');
  await steps.action('saved-date', 'Keep the old saved date until the edit is committed', () => cards.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail time')).toHaveAttribute('datetime', '2026-09-28T23:15:00.000Z'); });
  await steps.action('resume-edit', 'Restore the unsaved date change and original content', () => page.getByRole('button', { name: 'Edit reflection', exact: true }).click(), async () => { await expect(date).toHaveValue('2026-10-01T09:15'); await expectEditor(page, text); await expect(page.locator('.composer')).toHaveAttribute('style', new RegExp(colour)); });
  await steps.action('save-edit', 'Commit the changed date with the reflection', () => page.getByRole('button', { name: 'Save changes', exact: true }).click(), async () => { await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime', '2026-09-30T23:15:00.000Z'); await expect(page.locator('.saved-card')).toContainText(text); await expect(page.locator('.saved-card')).toHaveAttribute('style', new RegExp(colour)); await expectSynced(page); });
  await steps.action('done-edit', 'Read the new local date on the same journal entry', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => { await expect(cards).toHaveCount(1); await expect(cards.locator('time')).toHaveText('Thu 01 Oct 2026, 9:15 AM'); });
  await navigate(page, steps, 'today-complete', 'Today');
  await steps.step('continuable', 'Recognize the reflection moved into Today', [{ description: 'Today offers to continue the same saved reflection', check: async () => { await expect(page.getByRole('button', { name: 'Continue your reflection', exact: true })).toBeVisible(); } }]);
  await steps.action('reload-saved', 'Start on Journal now that a reflection belongs to Today', () => page.reload(), async () => { await expectSynced(page); await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible(); await expect(cards.locator('time')).toHaveText('Thu 01 Oct 2026, 9:15 AM'); });
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('privacy', 'Open recovery', () => page.getByRole('button', { name: /^Privacy & data/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view', exact: true })).toBeVisible(); });
  await steps.action('rebuild', 'Replay the original save and explicit date edit', () => page.getByRole('button', { name: 'Rebuild local view', exact: true }).click(), async () => { await expectSynced(page); });
  await navigate(page, steps, 'replayed-journal', 'Journal');
  await steps.step('replayed-date', 'Preserve the edited date after complete replay', [{ description: 'The same single entry retains its date, body and colour', check: async () => { await expect(cards).toHaveCount(1); await expect(cards.locator('time')).toHaveText('Thu 01 Oct 2026, 9:15 AM'); await expect(cards).toContainText(text); await expect(cards).toHaveAttribute('style', new RegExp(colour)); } }]);
  await navigate(page, steps, 'export-settings', 'Settings');
  await steps.action('export', 'Open Markdown export', () => page.getByRole('button', { name: /^Export journal/ }).click(), async () => { await expect(page.getByRole('radio', { name: /Markdown/ })).toBeChecked(); });
  await steps.action('prepare', 'Prepare the reflection with its edited date', () => page.getByRole('button', { name: 'Prepare export', exact: true }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Export ready'); });
  const download = page.waitForEvent('download');
  await steps.action('download', 'Download the updated local date without system metadata', () => page.getByRole('button', { name: 'Download Markdown', exact: true }).click(), async () => { const file = await download; const content = await readFile((await file.path())!, 'utf8'); expect(content).toContain('## 2026-10-01 09:15:00'); expect(content).toContain('**Reflection**: The neighbour brought in my bins\\.'); expect(content).not.toMatch(/createdAt|entryAt|sequence/); });
  steps.generateDocs('Choose and edit reflection dates', 'Today and saved-entry editors both allow a local date/time. Empty and future dates are rejected. Date changes remain in the independent draft until reflection save, survive reload and pending-save recovery, update Today and journal dates, and replay/export correctly without changing the entry identity, text or colour. Every action has a full-page unmasked zero-tolerance screenshot with checks beneath it.');
});
