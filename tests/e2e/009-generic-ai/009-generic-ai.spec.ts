import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { navigate, seedHistory, startJournal } from '../helpers/journal-session';
import { AI_ENDPOINT, FIRST_PROMPT, respond, aiSettings, toggleAI, saveChoices } from '../helpers/gemini';

test('generic live configuration never shares personal journal context', async ({ page }, info) => {
  test.skip(process.env.E2E_AI_GENERIC !== 'true', 'Requires a generic-mode emulator build'); test.setTimeout(120_000);
  const steps = new TestStepHelper(page, info);
  const requests: string[] = [];
  await page.route(AI_ENDPOINT, async route => { requests.push(route.request().postData()!); await respond(route); });
  await startJournal(page, info, steps, 'generic-ai');
  await seedHistory(page, [{ text: 'Fictional private context that must stay out of Gemini.', recordedAt: '2026-09-30T02:00:00Z' }]);
  await aiSettings(page, steps, 'configure');
  await expect(page.getByRole('switch', { name: 'Use prompt feedback' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Use journal entries' })).toBeDisabled();
  await expect(page.getByLabel(/What should prompts focus on/)).toHaveCount(0);
  await toggleAI(page, steps, 'enable', true); await saveChoices(page, steps, 'save-choices');
  expect(requests).toHaveLength(0);
  await navigate(page, steps, 'today', 'Today');
  await steps.action('generate', 'Request a prompt without personal context', () => page.getByRole('button', { name: 'Find me a prompt', exact: true }).click(), async () => {
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT, { timeout: 15_000 }); expect(requests).toHaveLength(1);
    const request = JSON.parse(requests[0]);
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'Offer a fresh question about an ordinary everyday moment. No personal context is supplied.' }] }]);
    expect(requests[0]).not.toContain('Fictional private context');
  }, 'Only the fixed generic instruction reaches the provider; the saved reflection is excluded');
  await steps.action('why', 'Read the generic prompt disclosure', () => page.getByRole('button', { name: 'Why this prompt?' }).click(), async () => {
    await expect(page.locator('.explanation')).toContainText('No journal text, preferences or feedback was shared.');
  });
  steps.generateDocs('Generic AI without journal sharing', 'This build uses the same generic data mode as the live sites, with Firebase emulators and a fictional provider response. Personal sharing controls are disabled; the outgoing model request contains no journal content.');
});
