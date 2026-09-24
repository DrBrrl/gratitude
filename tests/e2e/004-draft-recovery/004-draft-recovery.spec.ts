import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal } from '../helpers/journal-session';

test('unfinished drafts survive navigation and reload with explicit discard', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(90_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'draft');
  await steps.action('type', 'Begin an unfinished reflection', () => page.getByLabel('Your reflection').fill('The neighbour brought fresh lemons.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('journal', 'Visit the journal without saving an entry', () => page.getByRole('button', { name: 'Journal', exact: true }).click(), async () => { await expect(page.locator('article')).toHaveCount(0); });
  await steps.action('today', 'Return to the unfinished draft', () => page.getByRole('button', { name: 'Today', exact: true }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue('The neighbour brought fresh lemons.'); });
  await steps.action('reload', 'Reload the application', () => page.reload(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue('The neighbour brought fresh lemons.'); await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('ask-discard', 'Ask to discard the draft', () => page.getByRole('button', { name: 'Discard draft', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeVisible(); });
  await steps.action('keep', 'Keep writing instead', () => page.getByRole('button', { name: 'Keep writing' }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue('The neighbour brought fresh lemons.'); });
  await steps.action('save', 'Save the recovered draft as one reflection', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.locator('article')).toHaveCount(1); });
  await steps.action('empty-after-reload', 'Reload after saving', () => page.reload(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await steps.action('another', 'Start another draft', () => page.getByLabel('Your reflection').fill('This is a draft I will discard.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('discard-again', 'Open discard confirmation', () => page.getByRole('button', { name: 'Discard draft', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeVisible(); });
  await steps.action('confirm-discard', 'Confirm permanent draft removal', () => page.getByRole('button', { name: 'Discard draft permanently' }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await steps.action('verify-discard', 'Reload to verify the draft stays discarded', () => page.reload(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  steps.generateDocs('Protect unfinished writing', 'Draft actions are persisted to this device independently of the confirmed cloud journal. Every interaction is captured. Saving uses a stable action ID to recover safely across interrupted acknowledgements.');
});
