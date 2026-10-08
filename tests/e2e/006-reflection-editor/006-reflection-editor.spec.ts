import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { backFromEditor, editor, expectEditor, expectSynced, navigate, openEditor, startJournal } from '../helpers/journal-session';

test('paragraph writing, plain-text paste, undo and settings navigation', async ({ page }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(120_000);
  const steps = new TestStepHelper(page, info);
  await startJournal(page, info, steps, 'editor');
  await steps.action('why', 'Read why this starter prompt is shown', () => page.getByRole('button', { name: 'Why this prompt?' }).click(), async () => { await expect(page.locator('.explanation')).toContainText('This starter works without sending anything to AI.'); });
  await openEditor(page, steps, 'open-editor');
  await steps.action('first', 'Write the first paragraph', () => editor(page).pressSequentially('A quiet cup of tea.'), async () => { await expectEditor(page, 'A quiet cup of tea.'); });
  await steps.action('enter', 'Start a new paragraph with one Enter', () => editor(page).press('Enter'), async () => { await expectEditor(page, 'A quiet cup of tea.\n'); });
  await steps.action('second', 'Write the next paragraph with half-line spacing', () => editor(page).pressSequentially('A kind message.'), async () => {
    await expectEditor(page, 'A quiet cup of tea.\nA kind message.');
    const spacing = await editor(page).evaluate(node => {
      const second = node.lastElementChild!;
      return parseFloat(getComputedStyle(second).marginTop) / parseFloat(getComputedStyle(node).lineHeight);
    });
    expect(spacing).toBeCloseTo(0.5, 1);
  });
  // Clipboard fixture includes HTML to verify that only its plain-text representation is inserted.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob(['\nA warm smile.'], { type: 'text/plain' }),
    'text/html': new Blob(['<p><b>A warm smile.</b></p>'], { type: 'text/html' })
  })]));
  await steps.action('paste', 'Paste another paragraph as plain text', () => editor(page).press('Control+v'), async () => {
    await expectEditor(page, 'A quiet cup of tea.\nA kind message.\nA warm smile.');
    await expect(editor(page).locator('b, strong')).toHaveCount(0);
  });
  await steps.action('undo', 'Undo the paste', () => editor(page).press('Control+z'), async () => { await expectEditor(page, 'A quiet cup of tea.\nA kind message.'); });
  await steps.action('redo', 'Restore the pasted paragraph', () => editor(page).press('Control+Shift+z'), async () => { await expectEditor(page, 'A quiet cup of tea.\nA kind message.\nA warm smile.'); });
  await steps.action('save', 'Save the paragraph-spaced reflection', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expectSynced(page);
    await expect(page.locator('.saved-card .paragraph')).toHaveText(['A quiet cup of tea.', 'A kind message.', 'A warm smile.']);
    await expect(page.locator('.saved-card h2')).toHaveText(['Prompt', 'Reflection']);
    await expect(page.locator('.saved-card .entry-prompt')).toHaveCSS('font-style', 'italic');
    await expect(page.getByRole('button', { name: 'Browse your journal', exact: true })).toHaveCount(0);
  }, 'The saved card has matching Prompt and Reflection headings, an italic prompt, spaced paragraphs and no redundant browse button');
  await steps.action('journal', 'Finish saving and open the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Your journal', exact: true })).toBeVisible();
  });
  await expect(page.locator('article.card .paragraph')).toHaveText(['A quiet cup of tea.', 'A kind message.', 'A warm smile.']);
  await expect(page.getByRole('button', { name: '(see more)', exact: true })).toHaveCount(0);
  await steps.action('entry', 'Read the same paragraph layout in the full entry', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail .paragraph')).toHaveText(['A quiet cup of tea.', 'A kind message.', 'A warm smile.']); });
  await steps.action('edit-again', 'Continue the saved reflection', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expectEditor(page, 'A quiet cup of tea.\nA kind message.\nA warm smile.'); });
  await steps.action('end', 'Move the caret to the end', () => editor(page).press('Control+End'), async () => { await expect(editor(page)).toBeFocused(); });
  await steps.action('new-paragraph', 'Start another paragraph', () => editor(page).press('Enter'), async () => { await expect(editor(page).locator(':scope > div')).toHaveCount(4); });
  await steps.action('blank-paragraph', 'Leave an intentional blank paragraph', () => editor(page).press('Enter'), async () => { await expect(editor(page).locator(':scope > div')).toHaveCount(5); });
  await steps.action('evening', 'Write after the blank paragraph', () => editor(page).pressSequentially('A calm evening.'), async () => { await expect(editor(page).locator(':scope > div').last()).toHaveText('A calm evening.'); });
  await steps.action('save-blank-line', 'Save without adding extra blank lines', () => page.getByRole('button', { name: 'Save changes' }).click(), async () => {
    await expectSynced(page);
    await expect(page.locator('.saved-card .paragraph')).toHaveText(['A quiet cup of tea.', 'A kind message.', 'A warm smile.', '', 'A calm evening.']);
  });
  await steps.action('reopen', 'Reopen the saved paragraphs', () => page.getByRole('button', { name: 'Edit reflection' }).click(), async () => { await expect(editor(page).locator(':scope > div')).toHaveText(['A quiet cup of tea.', 'A kind message.', 'A warm smile.', '', 'A calm evening.']); });
  await backFromEditor(page, steps, 'back-saved', 'Saved reflection');
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('ai-settings', 'Open AI settings from the Settings menu', () => page.getByRole('button', { name: /^AI settings/ }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'AI settings' })).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(3);
    for (const control of await page.getByRole('switch').all()) { await expect(control).toBeEnabled(); await expect(control).toHaveAttribute('aria-checked', 'false'); }
    await expect(page.getByText('AI prompts are off. Your journal uses a starter prompt.')).toBeVisible();
  }, 'AI controls start off and require explicit choices before sharing');
  await steps.action('back-settings', 'Return with the shared compact back control', () => page.locator('button.back').click(), async () => { await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible(); });
  steps.generateDocs('Write paragraphs and review settings', 'A single Enter creates the same half-line paragraph spacing used in the journal. Plain-text clipboard input remains undoable and saves without HTML. Settings exposes AI controls with sharing disabled by default. Each user action has a screenshot comparison.');
});
