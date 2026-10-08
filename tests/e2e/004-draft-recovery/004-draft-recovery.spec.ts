import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { backFromEditor, editor, expectEditor, expectSynced, navigate, openEditor, seedHistory, startJournal } from '../helpers/journal-session';

test('daily and historical drafts stay separate through navigation, reload and discard', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(150_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'draft');
  await seedHistory(page, [{ text: 'Yesterday I appreciated the garden.', recordedAt: '2026-09-30T04:31:07Z' }]);
  await navigate(page, steps, 'history', 'Journal');
  await expect(page.locator('article.card')).toHaveCount(1);
  await navigate(page, steps, 'today', 'Today');
  const todayColour = await page.locator('.daily-prompt').getAttribute('style');
  await openEditor(page, steps, 'open');
  await steps.action('type', 'Begin today’s unfinished reflection', () => editor(page).fill('The neighbour brought fresh lemons.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await backFromEditor(page, steps, 'back-today');
  await navigate(page, steps, 'journal', 'Journal');
  await steps.action('past-entry', 'Open yesterday’s saved entry', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail')).toContainText('Yesterday I appreciated the garden.'); });
  const pastColour = await page.locator('.detail').getAttribute('style');
  await steps.action('past-editor', 'Edit yesterday’s reflection', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expectEditor(page, 'Yesterday I appreciated the garden.'); await expect(page.locator('.composer')).toHaveAttribute('style', pastColour!); });
  await steps.action('past-draft', 'Keep a separate draft for yesterday', () => editor(page).fill('Yesterday I appreciated the garden and the roses.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await backFromEditor(page, steps, 'back-entry', 'Journal');
  await expect(page.locator('.detail')).toContainText('Yesterday I appreciated the garden.');
  await steps.action('stable-today', 'Return to today’s independent prompt and colour', () => page.getByRole('navigation').getByRole('button', { name: 'Today', exact: true }).click(), async () => {
    await expect(page.locator('.daily-prompt')).toHaveAttribute('style', todayColour!);
    await expect(page.getByRole('button', { name: 'Continue your reflection', exact: true })).toBeVisible();
  });
  await steps.action('reload', 'Reload with both drafts on this device', () => page.reload(), async () => { await expectSynced(page); await expect(page.getByRole('button', { name: 'Continue your reflection', exact: true })).toBeEnabled(); });
  await openEditor(page, steps, 'recover-today');
  await expectEditor(page, 'The neighbour brought fresh lemons.');
  await steps.action('ask-discard', 'Ask to discard today’s draft', () => page.getByRole('button', { name: 'Discard draft', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeVisible(); });
  await steps.action('keep', 'Keep writing instead', () => page.getByRole('button', { name: 'Keep writing' }).click(), async () => { await expectEditor(page, 'The neighbour brought fresh lemons.'); await expect(page.getByRole('dialog')).not.toBeVisible(); });
  await steps.action('save', 'Save the recovered draft', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.locator('.saved-card')).toContainText('The neighbour brought fresh lemons.'); await expectSynced(page); });
  await steps.action('done', 'Finish today’s reflection and return to the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
    await expect(page.locator('article.card').first()).toHaveAttribute('style', todayColour!);
  });
  await navigate(page, steps, 'revisit-today', 'Today');
  await openEditor(page, steps, 'continue-saved');
  await expectEditor(page, 'The neighbour brought fresh lemons.');
  await steps.action('another', 'Make an edit that will be discarded', () => editor(page).fill('This is a draft I will discard.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('discard-again', 'Open discard confirmation', () => page.getByRole('button', { name: 'Discard draft', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeVisible(); });
  await steps.action('confirm-discard', 'Discard the edit while keeping the saved reflection', () => page.getByRole('button', { name: 'Discard draft permanently' }).click(), async () => { await expect(editor(page)).toHaveCount(0); await expect(page.locator('.daily-prompt')).toHaveAttribute('style', todayColour!); });
  await navigate(page, steps, 'past-again', 'Journal');
  await steps.action('past-open-again', 'Open yesterday’s reflection again', () => page.locator('article.card').filter({ hasText: 'Yesterday' }).getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail')).toContainText('Yesterday I appreciated the garden.'); });
  await steps.action('past-recovered', 'Recover yesterday’s independent draft', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expectEditor(page, 'Yesterday I appreciated the garden and the roses.'); });
  await steps.action('save-past', 'Save yesterday’s edit after completing today’s reflection', () => page.getByRole('button', { name: 'Save changes', exact: true }).click(), async () => {
    await expectSynced(page);
    await expect(page.locator('.saved-card')).toContainText('Yesterday I appreciated the garden and the roses.');
  });
  await steps.action('done-past', 'Finish the historical edit and return to the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
    await expect(page.locator('article.card')).toHaveCount(2);
  });
  await steps.action('verify-discard', 'Reload into the journal once today’s reflection is saved', () => page.reload(), async () => {
    await expectSynced(page);
    await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
  });
  await navigate(page, steps, 'verify-today', 'Today');
  await openEditor(page, steps, 'verify-saved');
  await expectEditor(page, 'The neighbour brought fresh lemons.');
  await backFromEditor(page, steps, 'leave-today');
  // A new local day is a clock fixture, not a change to saved event timestamps.
  // It is already 2 October in Hobart while the UTC date is still 1 October.
  await page.clock.setFixedTime(new Date('2026-10-01T14:31:07.000Z'));
  await steps.action('new-day', 'Reopen Today at the start of a new local day', () => page.reload(), async () => {
    await expectSynced(page);
    await expect(page.getByRole('heading', { name: 'Reflection time', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write a response', exact: true })).toBeEnabled();
    await expect(page.locator('.today-date')).toHaveText('Friday 2 October');
  });
  steps.generateDocs('Protect unfinished writing', 'Daily and historical editor drafts persist independently. Back returns to the editor’s origin; Done and returning sessions open Journal once today’s reflection is saved. Today keeps its colour and becomes the initial page again on a new local day. Discarding an edit preserves saved writing and other drafts. Every interaction is captured.');
});
