import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, writeReflection } from '../helpers/journal-session';

test('complete Markdown and JSON exports preserve text and exclude drafts', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(90_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'export');
  await writeReflection(page, steps, 'A quiet morning with **tea** & <sunshine>.', 'first');
  await steps.action('today', 'Open Today for another reflection', () => page.getByRole('button', { name: 'Today', exact: true }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await writeReflection(page, steps, 'A friend shared a funny story.', 'second');
  await steps.action('filter', 'Filter the visible journal to one entry', () => page.getByLabel('Search reflections').fill('morning'), async () => { await expect(page.locator('article')).toHaveCount(1); });
  await steps.action('draft-tab', 'Return to Today', () => page.getByRole('button', { name: 'Today', exact: true }).click(), async () => { await expect(page.getByLabel('Your reflection')).toHaveValue(''); });
  await steps.action('draft', 'Leave an unfinished draft', () => page.getByLabel('Your reflection').fill('PRIVATE UNFINISHED DRAFT'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('settings', 'Open export settings', () => page.getByRole('button', { name: 'Settings', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeVisible(); });
  const markdownDownload = page.waitForEvent('download');
  await steps.action('markdown', 'Download all saved reflections as Markdown', () => page.getByRole('button', { name: 'Download Markdown' }).click(), async () => {
    await expect(page.getByText('Export ready: 2 saved reflections.')).toBeVisible();
    const markdown = await markdownDownload; expect(markdown.suggestedFilename()).toBe('gratitude-journal.md');
    const md = await readFile((await markdown.path())!, 'utf8');
    expect(md).toContain('A friend shared a funny story'); expect(md).toContain('\\*\\*tea\\*\\* &amp; &lt;sunshine&gt;'); expect(md).not.toContain('PRIVATE UNFINISHED DRAFT');
  }, 'The downloaded Markdown includes both saved entries, escapes literal formatting, and excludes the unfinished draft');
  const jsonDownload = page.waitForEvent('download');
  await steps.action('json', 'Download the same journal as JSON', () => page.getByRole('button', { name: 'Download JSON' }).click(), async () => {
    await expect(page.getByText('Export ready: 2 saved reflections.')).toBeVisible();
    const jsonFile = await jsonDownload; expect(jsonFile.suggestedFilename()).toBe('gratitude-journal.json');
    const json = JSON.parse(await readFile((await jsonFile.path())!, 'utf8'));
    expect(json.entries).toHaveLength(2); expect(json.entries[1].text).toBe('A quiet morning with **tea** & <sunshine>.'); expect(json.entries[0].prompt).toBe('What is one small thing you appreciated today?'); expect(json.throughSequence).toBe(2);
  }, 'The downloaded JSON preserves exact reflection text and prompts for both saved entries, through event 2');
  await steps.action('offline', 'Disconnect before another export', () => page.context().setOffline(true), async () => { expect(await page.evaluate(() => navigator.onLine)).toBe(false); });
  await steps.action('offline-export', 'Request a complete export while offline', () => page.getByRole('button', { name: 'Download JSON' }).click(), async () => { await expect(page.getByText('Connect to export your complete saved journal.')).toBeVisible(); });
  steps.generateDocs('Take your journal with you', 'Downloads read a complete immutable event prefix from Firestore, independent of search and local drafts. The test inspects actual Markdown and JSON files and demonstrates the offline error. Every action has a screenshot.');
});
