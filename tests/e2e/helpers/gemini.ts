import { expect, type Page, type Route } from '@playwright/test';
import { TestStepHelper } from './test-step-helper';
import { navigate } from './journal-session';
export const AI_ENDPOINT = 'https://firebasevertexai.googleapis.com/v1beta/projects/demo-gratitude/models/gemini-3.6-flash:generateContent';
export const FIRST_PROMPT = 'What small kindness made your day feel a little lighter?';
export const SECOND_PROMPT = 'What everyday sound did you enjoy noticing?';
export async function respond(route: Route, text = FIRST_PROMPT, model = 'gemini-3.6-flash-fixture') {
  await route.fulfill({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: model } });
}
export async function aiSettings(page: Page, steps: TestStepHelper, id: string) {
  await navigate(page, steps, `${id}-settings`, 'Settings');
  await steps.action(`${id}-ai`, 'Open AI sharing choices', () => page.getByRole('button', { name: /^AI settings/ }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'AI settings', exact: true })).toBeVisible();
  });
}
export async function toggleAI(page: Page, steps: TestStepHelper, id: string, enabled: boolean) {
  await steps.action(id, enabled ? 'Choose to enable AI prompts' : 'Turn AI prompts off', () => page.getByRole('switch', { name: 'AI prompts', exact: true }).click(), async () => {
    await expect(page.getByRole('switch', { name: 'AI prompts', exact: true })).toHaveAttribute('aria-checked', String(enabled));
  });
}
export async function saveChoices(page: Page, steps: TestStepHelper, id: string) {
  await steps.action(id, 'Save these explicit sharing choices', () => page.getByRole('button', { name: 'Save AI choices' }).click(), async () => {
    await expect(page.getByText('AI choices saved.', { exact: true })).toBeVisible({ timeout: 15_000 });
  });
}
