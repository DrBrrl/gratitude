import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { editor, expectEditor, expectSynced, navigate, openEditor, startJournal } from '../helpers/journal-session';
import { AI_ENDPOINT, FIRST_PROMPT, SECOND_PROMPT, respond, aiSettings, saveChoices, toggleAI } from '../helpers/gemini';

test('consent, personalized prompts, freeform feedback and immutable journal history', async ({ page }, info) => {
  // 35 full-page comparisons took 2.9 minutes in CI; allow the complete walkthrough
  // to finish while retaining the per-action and screenshot deadlines.
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(300_000);
  const steps = new TestStepHelper(page, info);
  const requests: string[] = [];
  await page.route(AI_ENDPOINT, async route => {
    requests.push(route.request().postData()!);
    await respond(route, requests.length === 1 ? FIRST_PROMPT : SECOND_PROMPT, requests.length === 1 ? 'gemini-original' : 'gemini-new-model');
  });
  await startJournal(page, info, steps, 'gemini');
  expect(requests).toHaveLength(0);
  await aiSettings(page, steps, 'configure');
  await expect(page.getByRole('switch', { name: 'AI prompts', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: 'Use journal entries' })).toHaveAttribute('aria-checked', 'false');
  await toggleAI(page, steps, 'enable', true);
  await steps.action('preferences', 'Give Gemini an optional starting preference', () => page.getByLabel(/What should prompts focus on/).fill('Everyday moments; avoid questions about work.'), async () => {
    await expect(page.getByLabel(/What should prompts focus on/)).toHaveValue('Everyday moments; avoid questions about work.'); expect(requests).toHaveLength(0);
  });
  await steps.action('feedback-choice', 'Allow saved feedback to inform later prompts', () => page.getByRole('switch', { name: 'Use prompt feedback' }).click(), async () => {
    await expect(page.getByRole('switch', { name: 'Use prompt feedback' })).toHaveAttribute('aria-checked', 'true');
  });
  await saveChoices(page, steps, 'save-choices');
  expect(requests).toHaveLength(0);
  await navigate(page, steps, 'today', 'Today');
  await steps.action('generate', 'Request the first AI prompt', () => page.getByRole('button', { name: 'Find me a prompt', exact: true }).click(), async () => {
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT, { timeout: 15_000 }); expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('Everyday moments'); expect(requests[0]).toContain('recentReflections');
  }, 'The exact provider response is displayed only after it is saved, using the approved preferences');
  await steps.action('why', 'Inspect the sources used for this prompt', () => page.getByRole('button', { name: 'Why this prompt?' }).click(), async () => {
    await expect(page.locator('.explanation')).toContainText('0 recent reflections and 0 pieces of feedback');
  });
  await steps.action('feedback', 'Open short freeform feedback', () => page.getByRole('button', { name: 'Give prompt feedback' }).click(), async () => {
    await expect(page.getByLabel('What would make prompts better for you?')).toBeVisible();
  });
  await steps.action('type-feedback', 'Describe what would suit you better', () => page.getByLabel('What would make prompts better for you?').fill('More questions about sounds, please.'), async () => {
    await expect(page.getByLabel('What would make prompts better for you?')).toHaveValue('More questions about sounds, please.');
  });
  await steps.action('save-feedback', 'Save feedback without calling the provider', () => page.getByRole('button', { name: 'Save feedback' }).click(), async () => {
    await expect(page.getByText('Prompt feedback saved.', { exact: true })).toBeVisible({ timeout: 15_000 }); expect(requests).toHaveLength(1);
  });
  await steps.action('close-why', 'Close the prompt explanation', () => page.getByRole('button', { name: 'Why this prompt?' }).click(), async () => { await expect(page.locator('.explanation')).toHaveCount(0); });
  await openEditor(page, steps, 'write');
  await steps.action('reflection', 'Respond to the recorded question', () => editor(page).fill('Someone held the door while I carried my tea.'), async () => {
    await expectEditor(page, 'Someone held the door while I carried my tea.'); await expect(page.locator('.writing-prompt')).toHaveText(FIRST_PROMPT);
  });
  await steps.action('save', 'Save the reflection with its original AI prompt', () => page.getByRole('button', { name: 'Save reflection', exact: true }).click(), async () => {
    await expect(page.locator('.saved-card .entry-prompt')).toHaveText(FIRST_PROMPT, { timeout: 15_000 }); await expectSynced(page);
  });
  await steps.action('done', 'Return to the journal', () => page.getByRole('button', { name: 'Done', exact: true }).click(), async () => { await expect(page.locator('article.card .entry-prompt')).toHaveText(FIRST_PROMPT); });
  await steps.action('reload', 'Reload the cached journal without requesting AI', () => page.reload(), async () => {
    await expectSynced(page); await expect(page.locator('article.card .entry-prompt')).toHaveText(FIRST_PROMPT); expect(requests).toHaveLength(1);
  });
  await navigate(page, steps, 'recovery-settings', 'Settings');
  await steps.action('privacy', 'Open journal recovery', () => page.getByRole('button', { name: /^Privacy & data/ }).click(), async () => { await expect(page.getByRole('button', { name: 'Rebuild local view' })).toBeVisible(); });
  await steps.action('rebuild', 'Recreate the entire projection from events', () => page.getByRole('button', { name: 'Rebuild local view' }).click(), async () => { await expectSynced(page); expect(requests).toHaveLength(1); });
  // Advancing fixture input is setup, not a hidden user action. Next navigation displays its date.
  await page.clock.setFixedTime(new Date('2026-10-01T14:31:07.000Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await aiSettings(page, steps, 'journal-context');
  await steps.action('include-journal', 'Opt in to using recent saved reflections', () => page.getByRole('switch', { name: 'Use journal entries' }).click(), async () => {
    await expect(page.getByRole('switch', { name: 'Use journal entries' })).toHaveAttribute('aria-checked', 'true');
  });
  await saveChoices(page, steps, 'save-journal-context');
  await navigate(page, steps, 'new-day', 'Today');
  await steps.action('next-prompt', 'Request a new day’s prompt using the chosen context', () => page.getByRole('button', { name: 'Find me a prompt', exact: true }).click(), async () => {
    await expect(page.locator('.daily-prompt h2')).toHaveText(SECOND_PROMPT, { timeout: 15_000 }); expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('More questions about sounds, please.'); expect(requests[1]).toContain('Someone held the door');
  });
  await navigate(page, steps, 'history', 'Journal');
  await steps.action('original-entry', 'Read the old reflection after the model changed', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => {
    await expect(page.locator('.detail .entry-prompt')).toHaveText(FIRST_PROMPT); expect(requests).toHaveLength(2);
  }, 'The original question survives cached reload, complete replay and a newer model response');
  steps.generateDocs('Gemini prompts, choices and feedback', 'Fictional responses at the Firebase AI Logic HTTP boundary verify explicit consent, bounded personal context, freeform feedback, durable prompts and replay with zero inference. Every user action has a full-page screenshot comparison.');
});
