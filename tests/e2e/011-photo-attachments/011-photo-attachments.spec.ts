import { expect as playwrightExpect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, openEditor, editor, expectSynced, navigate } from '../helpers/journal-session';

// Upload, transaction and cleanup acknowledgements can take longer on CI.
const expect = playwrightExpect.configure({ timeout: 15_000 });

test('attach private photos, correct searchable AI descriptions and retain them through replay and export', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(480_000);
  const steps = new TestStepHelper(page, info);
  let mode: 'success' | 'failure' | 'hold' = 'success';
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route('https://firebasevertexai.googleapis.com/**', async route => {
    const data = route.request().postDataJSON();
    expect(data.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
    expect(data.contents[0].parts[1].inlineData.data.length).toBeGreaterThan(100);
    const normalized = Buffer.from(data.contents[0].parts[1].inlineData.data, 'base64');
    expect(normalized.subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
    expect(normalized.includes(Buffer.from('fictional-location-to-strip'))).toBe(false);
    expect(JSON.stringify(data)).not.toContain('A warm drink');
    requests++;
    if (mode === 'hold') await new Promise<void>(resolve => release = resolve);
    if (mode === 'failure') { await route.fulfill({ status: 503, body: '{}' }); return; }
    await route.fulfill({ json: { modelVersion: 'fictional-vision-model', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'A yellow mug beside a blue window.' }] } }] } });
  });
  await startJournal(page, info, steps, 'photos');
  await openEditor(page, steps, 'editor');
  await steps.action('bad-type', 'Reject an unsupported attachment without losing the reflection', () => page.getByLabel('Add photo', { exact: true }).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Not a photo') }), async () => {
    await expect(page.getByText('Choose a JPEG, PNG or WebP photo.')).toBeVisible();
  });
  await steps.action('too-large', 'Reject a photo larger than the upload limit', () => page.getByLabel('Add photo', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }, { timeout: 15_000 }), async () => {
    await expect(page.getByText('Choose a photo smaller than 10 MB.')).toBeVisible();
  });
  await steps.action('pick', 'Select a photo and inspect the AI disclosure', () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => {
    await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Attach & summarize', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save reflection', exact: true })).toBeDisabled();
  });
  await steps.action('reload-selection', 'Recover the selected photo after reloading the unsaved draft', () => page.reload(), async () => { await expectSynced(page); });
  await openEditor(page, steps, 'resume-editor');
  await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 });
  await steps.action('attach-ai', 'Attach the private photo and generate its description', () => page.getByRole('button', { name: 'Attach & summarize', exact: true }).click(), async () => {
    await expect(page.locator('.photo-card .summary')).toHaveText('A yellow mug beside a blue window.', { timeout: 15_000 });
    await expect(page.getByRole('img', { name: 'A yellow mug beside a blue window.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save reflection', exact: true })).toBeEnabled();
    expect(requests).toBe(1);
  });
  await steps.action('save-photo-only', 'Save a photo-only reflection without waiting on text', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible({ timeout: 15_000 }); await expectSynced(page);
  });
  await steps.action('done', 'Browse the photo and its summary in the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(page.locator('article.card')).toHaveCount(1); await expect(page.locator('.card-thumbnail img')).toBeVisible();
  });
  await steps.action('search-ai', 'Find an entry using only its AI image summary', () => page.getByRole('searchbox', { name: 'Search reflections' }).fill('blue window'), async () => {
    await expect(page.locator('article.card')).toHaveCount(1); await expect(page.locator('article.card')).toContainText('blue window');
  });
  await steps.action('detail', 'Read the photo and searchable summary together', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.photo-card .summary')).toContainText('A yellow mug'); });
  await steps.action('edit-summary', 'Open the AI description for correction', () => page.getByRole('button', { name: 'Edit summary', exact: true }).click(), async () => { await expect(page.getByRole('textbox', { name: 'Image summary', exact: true })).toHaveValue('A yellow mug beside a blue window.'); });
  await steps.action('correct-summary', 'Write a description in your own words', () => page.getByRole('textbox', { name: 'Image summary', exact: true }).fill('My turquoise café cup by the kitchen window.'), async () => { await expect(page.getByRole('textbox', { name: 'Image summary', exact: true })).toHaveValue('My turquoise café cup by the kitchen window.'); });
  await steps.action('save-summary', 'Save the correction and update the accessible image description', () => page.getByRole('button', { name: 'Save summary', exact: true }).click(), async () => {
    await expect(page.locator('.photo-card .summary')).toHaveText('My turquoise café cup by the kitchen window.');
    await expect(page.getByRole('img', { name: 'My turquoise café cup by the kitchen window.' })).toBeVisible();
  });
  await steps.action('back', 'Return to the previous search after correcting the description', () => page.locator('button.back').click(), async () => { await expect(page.getByText('No matching reflections', { exact: true })).toBeVisible(); });
  await steps.action('search-corrected', 'Find the corrected summary with accent-insensitive search', () => page.getByRole('searchbox', { name: 'Search reflections' }).fill('turquoise cafe'), async () => { await expect(page.locator('article.card')).toHaveCount(1); });
  await steps.action('reopen', 'Open the corrected photo entry', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.photo-card .summary')).toContainText('turquoise café'); });
  await steps.action('last-photo', 'Protect a photo-only reflection from losing its only attachment', () => page.getByRole('button', { name: 'Remove photo', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Confirm removal', exact: true })).toBeDisabled(); await expect(page.getByText('Add reflection text before removing its last photo.')).toBeVisible(); });
  await steps.action('keep-last', 'Keep the photo-only reflection intact', () => page.getByRole('button', { name: 'Keep photo', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Confirm removal', exact: true })).toHaveCount(0); });
  await steps.action('pick-second', 'Select another photo', () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 }); });
  mode = 'failure';
  await steps.action('failed-summary', 'Keep an attached photo when Gemini is unavailable', () => page.getByRole('button', { name: 'Attach & summarize', exact: true }).click(), async () => { await expect(page.getByText('Couldn’t summarize this photo. You can retry or write a summary.')).toBeVisible({ timeout: 15_000 }); await expect(page.locator('.photo-card')).toHaveCount(2); });
  mode = 'hold';
  await steps.action('retry-summary', 'Explicitly retry the image summary', () => page.getByRole('button', { name: 'Retry summary', exact: true }).click(), async () => { await expect(page.getByText('Summarizing photo…', { exact: true })).toBeVisible(); });
  await steps.action('manual-during-ai', 'Write a correction while AI is still responding', () => page.getByRole('button', { name: 'Write summary', exact: true }).click(), async () => { await expect(page.getByRole('textbox', { name: 'Image summary', exact: true })).toBeVisible(); });
  await steps.action('type-manual', 'Supply the preferred image description', () => page.getByRole('textbox', { name: 'Image summary', exact: true }).fill('A little reminder of home.'), async () => { await expect(page.getByRole('textbox', { name: 'Image summary', exact: true })).toHaveValue('A little reminder of home.'); });
  await steps.action('save-manual', 'Commit the manual description before the AI response', () => page.getByRole('button', { name: 'Save summary', exact: true }).click(), async () => { await expect(page.locator('.photo-card').nth(1).locator('.summary')).toHaveText('A little reminder of home.'); });
  release?.();
  await expect(page.getByText('Your edited summary is saved. The pending AI response will not replace it.', { exact: true })).toHaveCount(0, { timeout: 15_000 });
  mode = 'success';
  await steps.action('late-result', 'Reload after the late AI response without losing the correction', () => page.reload(), async () => { await expectSynced(page); expect(requests).toBe(3); });
  await steps.action('reopen-after-reload', 'Recover both descriptions from saved events', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.photo-card').nth(1).locator('.summary')).toHaveText('A little reminder of home.'); expect(requests).toBe(3); });
  for (const number of [3, 4]) {
    await steps.action(`pick-${number}`, `Select photo ${number}`, () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 }); });
    await steps.action(`no-ai-${number}`, `Attach photo ${number} without sending it to Gemini`, () => page.getByRole('button', { name: 'Attach without AI', exact: true }).click(), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toHaveCount(0, { timeout: 15_000 }); await expect(page.locator('.photo-card .photo-image img')).toHaveCount(number, { timeout: 15_000 }); await expect(page.getByRole('button', { name: 'Remove photo', exact: true }).last()).toBeEnabled(); expect(requests).toBe(3); });
  }
  await expect(page.getByLabel('Add photo', { exact: true })).toHaveCount(0);
  await steps.action('remove', 'Ask to remove a photo without a summary', () => page.getByRole('button', { name: 'Remove photo', exact: true }).last().click(), async () => { await expect(page.getByText('Remove this photo and its summary?', { exact: true })).toBeVisible(); });
  await steps.action('keep', 'Cancel removal and retain the attachment', () => page.getByRole('button', { name: 'Keep photo', exact: true }).click(), async () => { await expect(page.locator('.photo-card')).toHaveCount(4); });
  await steps.action('remove-again', 'Confirm which photo will be removed', () => page.getByRole('button', { name: 'Remove photo', exact: true }).last().click(), async () => { await expect(page.getByRole('button', { name: 'Confirm removal', exact: true })).toBeVisible(); });
  await steps.action('confirm-remove', 'Remove the attachment and its private stored file', () => page.getByRole('button', { name: 'Confirm removal', exact: true }).click(), async () => { await expect(page.locator('.photo-card')).toHaveCount(3); await expect(page.getByLabel('Add photo', { exact: true })).toBeEnabled(); await expect(page.getByRole('alert')).toHaveCount(0); });
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('privacy', 'Open recovery controls', () => page.getByRole('button', { name: /^Privacy & data/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view', exact: true })).toBeVisible(); });
  await steps.action('rebuild', 'Reconstruct all photos and descriptions without calling Gemini', () => page.getByRole('button', { name: 'Rebuild local view', exact: true }).click(), async () => { await expectSynced(page); expect(requests).toBe(3); });
  await navigate(page, steps, 'rebuilt-journal', 'Journal');
  await steps.action('rebuilt-detail', 'Read photos and manual text after complete replay', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.photo-card')).toHaveCount(3);
    const images = page.locator('.photo-card .photo-image img');
    await expect(images).toHaveCount(3);
    await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0))).toBe(true);
    await images.evaluateAll(nodes => Promise.all(nodes.map(node => (node as HTMLImageElement).decode())));
    await expect(page.locator('.photo-card').nth(1).locator('.summary')).toHaveText('A little reminder of home.'); expect(requests).toBe(3);
  }, 'All three photos are loaded and decoded, manual descriptions survive replay and Gemini is not called again');
  await navigate(page, steps, 'export-settings', 'Settings');
  await steps.action('export', 'Open journal export', () => page.getByRole('button', { name: /^Export journal/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Prepare export', exact: true })).toBeVisible(); });
  await steps.action('prepare', 'Include saved photo bytes and descriptions in Markdown ZIP', () => page.getByRole('button', { name: 'Prepare export', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Download Markdown ZIP', exact: true })).toBeVisible({ timeout: 15_000 }); });
  const download = page.waitForEvent('download');
  await steps.action('download', 'Download the complete photo journal archive', () => page.getByRole('button', { name: 'Download Markdown ZIP', exact: true }).click(), async () => {
    const file = await download;
    const files = unzipSync(await readFile((await file.path())!));
    expect(Object.keys(files).filter(path => path.endsWith('.jpg'))).toHaveLength(3);
    expect(strFromU8(files['gratitude-journal.md'])).toContain('My turquoise café cup');
    expect(strFromU8(files['gratitude-journal.md'])).toContain('A little reminder of home');
  });
  steps.generateDocs('Photo attachments and editable AI summaries', 'Attach normalized private photos with explicit Gemini consent or without AI. Save a photo-only reflection, correct a summary, search the corrected text, handle failed and late AI output, enforce four attachments, remove an image, replay source events and export actual photo files. Each action compares an unmasked full-page screenshot at zero pixel tolerance. Provider replies are fictional; no live inference or journal data is used.');
});
