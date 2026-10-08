import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TestStepHelper } from '../helpers/test-step-helper';
import { backFromEditor, editor, navigate, openEditor, seedHistory, startJournal } from '../helpers/journal-session';

test('complete Markdown and JSON exports preserve text and exclude drafts', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(120_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'export');
  await seedHistory(page, [
    { text: 'A quiet morning with **tea** & <sunshine>.', recordedAt: '2026-09-29T04:31:07Z' },
    { text: 'A friend shared a funny story.', recordedAt: '2026-09-30T04:31:07Z' }
  ]);
  await navigate(page, steps, 'journal', 'Journal');
  await steps.action('filter', 'Filter the visible journal to one entry', () => page.getByLabel('Search reflections').fill('morning'), async () => { await expect(page.locator('article.card')).toHaveCount(1); });
  await navigate(page, steps, 'draft-tab', 'Today');
  await openEditor(page, steps, 'open-draft');
  await steps.action('draft', 'Leave an unfinished draft', () => editor(page).fill('PRIVATE UNFINISHED DRAFT'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await backFromEditor(page, steps, 'leave-draft');
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('export-settings', 'Open export settings', () => page.getByRole('button', { name: /^Export journal/ }).click(), async () => { await expect(page.getByRole('radio', { name: /Markdown/ })).toBeChecked(); });
  await steps.action('prepare-markdown', 'Prepare a Markdown journal', () => page.getByRole('button', { name: 'Prepare export' }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Export ready'); });
  let markdownContent = '';
  const markdownDownload = page.waitForEvent('download');
  await steps.action('markdown', 'Download all saved reflections as Markdown', () => page.getByRole('button', { name: 'Download Markdown' }).click(), async () => {
    const markdown = await markdownDownload; expect(markdown.suggestedFilename()).toBe('gratitude-journal.md');
    const md = markdownContent = await readFile((await markdown.path())!, 'utf8');
    expect(md).toMatch(/^# Gratitude journal\n\n## \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n\n\*\*Prompt\*\*: What is one small thing you appreciated today\?\n\n\*\*Reflection\*\*: /);
    expect(md.match(/^## /gm)).toHaveLength(2);
    expect(md.match(/^\*\*Prompt\*\*: /gm)).toHaveLength(2);
    expect(md.match(/^\*\*Reflection\*\*: /gm)).toHaveLength(2);
    expect(md).not.toMatch(/saved reflections|through event|Entry:|Colour:|^### /m);
    expect(md).toContain('A friend shared a funny story'); expect(md).toContain('\\*\\*tea\\*\\* &amp; &lt;sunshine&gt;'); expect(md).not.toContain('PRIVATE UNFINISHED DRAFT');
  }, 'Markdown contains both saved entries in the requested format, without system metadata or unfinished drafts');
  await steps.action('select-json', 'Select JSON export', () => page.getByRole('radio', { name: /JSON/ }).check(), async () => { await expect(page.getByRole('radio', { name: /JSON/ })).toBeChecked(); await expect(page.getByRole('button', { name: 'Download Markdown' })).toHaveCount(0); });
  await steps.action('prepare-json', 'Prepare a JSON archive', () => page.getByRole('button', { name: 'Prepare export' }).click(), async () => { await expect(page.getByRole('status')).toHaveText('Export ready'); });
  const jsonDownload = page.waitForEvent('download');
  await steps.action('json', 'Download the same journal as JSON', () => page.getByRole('button', { name: 'Download JSON' }).click(), async () => {
    const jsonFile = await jsonDownload; expect(jsonFile.suggestedFilename()).toBe('gratitude-journal.json');
    const json = JSON.parse(await readFile((await jsonFile.path())!, 'utf8'));
    expect(json.entries).toHaveLength(2); expect(json.entries[1].text).toBe('A quiet morning with **tea** & <sunshine>.'); expect(json.entries[0].prompt).toBe('What is one small thing you appreciated today?'); expect(json.throughSequence).toBe(2);
    expect(json.entries.map((entry: { createdAt: string }) => entry.createdAt)).toEqual(['2026-09-30T04:31:07.000Z', '2026-09-29T04:31:07.000Z']);
    expect(markdownContent.match(/^## .+$/gm)).toEqual(['## 2026-09-30 14:31:07', '## 2026-09-29 14:31:07']);
  }, 'JSON keeps UTC instants; Markdown headings use Australia/Hobart local time');
  await steps.action('offline', 'Disconnect before another export', () => page.context().setOffline(true), async () => { expect(await page.evaluate(() => navigator.onLine)).toBe(false); });
  await steps.action('offline-export', 'Request a complete export while offline', () => page.getByRole('button', { name: 'Prepare export' }).click(), async () => { await expect(page.getByText('Connect to export your complete saved journal.')).toBeVisible(); });
  steps.generateDocs('Take your journal with you', 'Downloads read a complete immutable event prefix from Firestore, independent of search and local drafts. The test inspects actual Markdown and JSON files and demonstrates the offline error. Every action has a screenshot.');
});
