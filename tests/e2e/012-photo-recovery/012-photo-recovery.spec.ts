import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, openEditor, editor, expectSynced, navigate } from '../helpers/journal-session';

test('recover staged photos and received summaries, retain photos through text edits and discard unsaved attachments', async ({ page, context }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(300_000);
  const steps = new TestStepHelper(page, info);
  let calls = 0;
  await page.route('https://firebasevertexai.googleapis.com/**', async route => {
    calls++;
    await context.setOffline(true);
    await route.fulfill({ json: { modelVersion: 'fictional-vision-model', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'A yellow mug in front of a window.' }] } }] } });
  });
  await startJournal(page, info, steps, 'photo-recovery');
  await openEditor(page, steps, 'editor');
  await steps.action('text', 'Write a reflection before attaching a photo', () => editor(page).fill('A warm drink.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('pick', 'Stage a selected photo on this device', () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 }); });
  await steps.action('offline-attach', 'Preserve the selected photo and pause uploading when the connection drops', () => context.setOffline(true), async () => {
    await expect(page.getByText('Connect to attach this photo. Your selection is saved on this device.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Attach without AI', exact: true })).toBeDisabled(); expect(calls).toBe(0);

  });
  await context.setOffline(false);
  await steps.action('cancel', 'Cancel the staged selection without changing the reflection', () => page.getByRole('button', { name: 'Cancel photo', exact: true }).click(), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toHaveCount(0); await expect(editor(page)).toContainText('A warm drink.'); });
  await steps.action('pick-again', 'Choose the photo again', () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => { await expect(page.getByRole('button', { name: 'Attach without AI', exact: true })).toBeEnabled(); });
  await steps.action('attach-no-ai', 'Attach without enabling Gemini or prompt personalization', () => page.getByRole('button', { name: 'Attach without AI', exact: true }).click(), async () => { await expect(page.locator('.photo-card .photo-image img')).toBeVisible({ timeout: 15_000 }); expect(calls).toBe(0); });
  await context.setOffline(true);
  await steps.action('pending-save', 'Keep an offline save and its attached photo ready for recovery', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Return text to editor', exact: true })).toBeVisible(); });
  await steps.action('recover-pending', 'Return the pending reflection to its original photo identity', () => page.getByRole('button', { name: 'Return text to editor', exact: true }).click(), async () => { await expect(editor(page)).toContainText('A warm drink.'); await expect(page.locator('.photo-card')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Return text to editor', exact: true })).toHaveCount(0); });
  await steps.action('reconnect', 'Reconnect with the reflection and photo still together', () => context.setOffline(false), async () => { await expect(page.locator('.photo-card .photo-image img')).toBeVisible({ timeout: 20_000 }); });
  await steps.action('save', 'Save the reflection and its attachment', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => { await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible({ timeout: 15_000 }); await expectSynced(page); await expect(page.locator('.photo-card .photo-image img')).toBeVisible({ timeout: 15_000 }); });
  await steps.action('received-offline', 'Receive a summary just as the connection drops', () => page.getByRole('button', { name: 'Summarize photo', exact: true }).click(), async () => {
    await expect(page.getByRole('button', { name: 'Sync received summaries', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.photo-card .summary')).toHaveCount(0); await expect(page.locator('.photo-card .photo-image img')).toBeVisible(); expect(calls).toBe(1);
  });
  await context.setOffline(false);
  await steps.action('reload', 'Keep the received summary in the outbox after reload', () => page.reload(), async () => { await expectSynced(page); await expect(page.getByRole('button', { name: 'Sync received summaries', exact: true })).toBeEnabled(); expect(calls).toBe(1); });
  await steps.action('sync-result', 'Sync the received description without another Gemini call', () => page.getByRole('button', { name: 'Sync received summaries', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Sync received summaries', exact: true })).toHaveCount(0); expect(calls).toBe(1); });
  await steps.action('detail', 'Read the synchronized summary beside the retained photo', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.photo-card .summary')).toHaveText('A yellow mug in front of a window.'); });
  await steps.action('edit-text', 'Edit reflection text while keeping its independent photo state', () => page.getByRole('button', { name: 'Edit reflection', exact: true }).click(), async () => { await expect(editor(page)).toContainText('A warm drink.'); await expect(page.locator('.photo-card .summary')).toHaveText('A yellow mug in front of a window.'); });
  await steps.action('new-text', 'Add detail to the reflection', () => editor(page).fill('A warm drink and a quiet afternoon.'), async () => { await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action('save-edit', 'Save text without replacing photos or regenerating the summary', () => page.getByRole('button', { name: 'Save changes', exact: true }).click(), async () => { await expect(page.locator('.saved-card')).toContainText('A warm drink and a quiet afternoon.'); await expect(page.locator('.photo-card .summary')).toHaveText('A yellow mug in front of a window.'); expect(calls).toBe(1); });
  await steps.action('done', 'Return to the journal after editing', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => { await expect(page.locator('article.card')).toHaveCount(1); });
  await steps.action('new', 'Start an independent draft to review discard behavior', () => page.getByRole('button', { name: 'New entry', exact: true }).click(), async () => { await expect(editor(page)).toBeVisible(); });
  await steps.action('draft-photo', 'Select a photo for the unsaved reflection', () => page.getByLabel('Add photo', { exact: true }).setInputFiles('tests/fixtures/yellow-mug.png'), async () => { await expect(page.getByRole('img', { name: 'Attachment preview' })).toBeVisible({ timeout: 15_000 }); });
  await steps.action('draft-attach', 'Attach the photo while leaving the reflection unsaved', () => page.getByRole('button', { name: 'Attach without AI', exact: true }).click(), async () => { await expect(page.locator('.photo-card .photo-image img')).toBeVisible({ timeout: 15_000 }); expect(calls).toBe(1); });
  await steps.action('discard', 'Review the draft discard confirmation', () => page.getByRole('button', { name: 'Discard draft', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeVisible(); });
  await steps.action('confirm-discard', 'Discard the unsaved reflection and remove its attached file', () => page.getByRole('button', { name: 'Discard draft permanently', exact: true }).click(), async () => { await expect(page.getByRole('dialog')).toBeHidden(); await expect(page.locator('.photo-card')).toHaveCount(0); await expect(page.getByRole('alert')).toHaveCount(0); });
  await steps.action('back', 'Return to the existing journal', () => page.locator('button.back').click(), async () => { await expect(page.locator('article.card')).toHaveCount(1); await expect(page.locator('.card-thumbnail img')).toBeVisible(); });
  await steps.action('cleanup-detail', 'Open the saved photo before testing an interrupted file removal', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.photo-card')).toHaveCount(1); });
  const storageEndpoint = '**/v0/b/demo-gratitude.firebasestorage.app/o/**';
  await page.route(storageEndpoint, route => route.request().method() === 'DELETE' ? route.fulfill({ status: 403, json: { error: { message: 'Fictional deletion failure' } } }) : route.continue());
  await steps.action('remove-photo', 'Review removal of the saved attachment', () => page.getByRole('button', { name: 'Remove photo', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Confirm removal', exact: true })).toBeEnabled(); });
  await steps.action('cleanup-pending', 'Retain a cleanup intent when the file deletion fails', () => page.getByRole('button', { name: 'Confirm removal', exact: true }).click(), async () => { await expect(page.locator('.photo-card')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Retry photo cleanup', exact: true })).toBeVisible(); await expect(page.getByText('Photo removal could not finish. Reconnect and retry photo cleanup.', { exact: true })).toBeVisible(); });
  await page.unroute(storageEndpoint);
  await steps.action('cleanup-reload', 'Finish confirmed file cleanup after reloading with a connection', () => page.reload(), async () => { await expectSynced(page); await expect(page.getByRole('button', { name: 'Retry photo cleanup', exact: true })).toHaveCount(0, { timeout: 15_000 }); await expect(page.locator('.card-thumbnail')).toHaveCount(0); await expect(page.locator('article.card')).toHaveCount(1); });
  steps.generateDocs('Recover photos and image summary results', 'Offline attachment retains the local selection. An already-received Gemini response survives reload and syncs without inference. Text edits retain independent attachments and descriptions. Discarding an unsaved reflection removes its uploaded photo, while previously saved entries remain. All user actions have full-page, unmasked, zero-pixel screenshot comparisons.');
});
