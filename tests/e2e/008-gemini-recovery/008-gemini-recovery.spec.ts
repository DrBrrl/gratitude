import { expect, test, type Route } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { expectSynced, FIXTURE_TIME, navigate, startJournal } from '../helpers/journal-session';
import { AI_ENDPOINT, FIRST_PROMPT, SECOND_PROMPT, respond, aiSettings, saveChoices, toggleAI } from '../helpers/gemini';

test('interrupted inference, provider failure, response outbox and consent revocation', async ({ page, context }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(180_000);
  const steps = new TestStepHelper(page, info);
  let calls = 0; let held: Route | undefined;
  await page.route(AI_ENDPOINT, async route => { calls++; held = route; });
  await startJournal(page, info, steps, 'gemini-recovery');
  await aiSettings(page, steps, 'configure'); await toggleAI(page, steps, 'enable', true); await saveChoices(page, steps, 'save-choices');
  await navigate(page, steps, 'today', 'Today');
  await steps.action('request', 'Request a prompt and wait for the provider', () => page.getByRole('button', { name: 'Find me a prompt', exact: true }).click(), async () => {
    await expect.poll(() => calls).toBe(1); await expect(page.getByRole('button', { name: 'Finding a prompt…' })).toBeDisabled();
  });
  await steps.action('interrupt', 'Reload while inference is unfinished', () => page.reload(), async () => {
    await expectSynced(page); await expect(page.getByText(/A request is unfinished/)).toBeVisible(); expect(calls).toBe(1);
  }, 'Replay restores the request and starter without automatically sending another request');
  await held?.abort().catch(() => {});
  await page.unroute(AI_ENDPOINT);
  await page.route(AI_ENDPOINT, async route => { calls++; await route.fulfill({ status: 429, json: { error: { message: 'Fictional quota failure' } } }); });
  await steps.action('retry-failure', 'Explicitly retry and receive a provider failure', () => page.getByRole('button', { name: 'Try another request' }).click(), async () => {
    await expect(page.getByText('No new prompt arrived. You can try again or use the starter prompt.')).toBeVisible({ timeout: 15_000 }); expect(calls).toBe(2);
  });
  await steps.action('fallback', 'Choose the bundled starter after the failure', () => page.getByRole('button', { name: 'Use starter prompt' }).click(), async () => {
    await expect(page.locator('.badge')).toHaveText('Starter prompt'); await expect(page.getByRole('button', { name: 'Find me a prompt', exact: true })).toBeEnabled(); expect(calls).toBe(2);
  });
  await page.unroute(AI_ENDPOINT);
  await page.route(AI_ENDPOINT, async route => {
    calls++;
    // Failure injection after provider receipt: the exact output must survive locally.
    await context.setOffline(true);
    await respond(route);
  });
  await steps.action('received-offline', 'Receive a prompt just as the connection drops', () => page.getByRole('button', { name: 'Find me a prompt', exact: true }).click(), async () => {
    await expect(page.getByRole('button', { name: 'Sync received prompt' })).toBeEnabled({ timeout: 15_000 }); expect(calls).toBe(3);
    await expect(page.locator('.daily-prompt h2')).not.toHaveText(FIRST_PROMPT);
  }, 'The received response is durable on this device and is not displayed as a saved prompt yet');
  await context.setOffline(false);
  await steps.action('reload-result', 'Reload with a received response waiting in the outbox', () => page.reload(), async () => {
    await expectSynced(page); await expect(page.getByRole('button', { name: 'Sync received prompt' })).toBeEnabled(); expect(calls).toBe(3);
  });
  await steps.action('sync-result', 'Sync the received output without new inference', () => page.getByRole('button', { name: 'Sync received prompt' }).click(), async () => {
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT); await expect(page.getByRole('button', { name: 'Sync received prompt' })).toHaveCount(0); expect(calls).toBe(3);
  });
  await page.unroute(AI_ENDPOINT); held = undefined;
  await page.route(AI_ENDPOINT, async route => { calls++; held = route; });
  await steps.action('late-request', 'Begin another prompt request', () => page.getByRole('button', { name: 'Another prompt' }).click(), async () => {
    await expect.poll(() => calls).toBe(4); await expect(page.getByRole('button', { name: 'Finding a prompt…' })).toBeDisabled();
  });
  const other = await context.newPage(); await other.clock.setFixedTime(new Date(FIXTURE_TIME)); steps.setPage(other);
  await steps.action('other-tab', 'Open the same account in another tab', () => other.goto('./journal/'), async () => {
    await expectSynced(other); await expect(other.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT); expect(calls).toBe(4);
  });
  await aiSettings(other, steps, 'revoke'); await toggleAI(other, steps, 'disable', false); await saveChoices(other, steps, 'save-revocation');
  await expect(page.getByRole('button', { name: 'Set up AI prompts' })).toBeVisible();
  await respond(held!, SECOND_PROMPT);
  steps.setPage(page);
  await steps.step('late-response', 'Return to the first tab after the late response', [{ description: 'Consent revocation discards the late response and preserves the previously saved prompt', check: async () => {
    await expect(page.getByText('That request was replaced or AI sharing changed. The late prompt was discarded.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT); expect(calls).toBe(4);
  } }]);
  await steps.action('reload-revoked', 'Reload after revoking AI consent', () => page.reload(), async () => {
    await expectSynced(page); await expect(page.getByRole('button', { name: 'Set up AI prompts' })).toBeVisible();
    await expect(page.locator('.daily-prompt h2')).toHaveText(FIRST_PROMPT); expect(calls).toBe(4);
  });
  await other.close();
  steps.generateDocs('Recover AI requests and revoke consent', 'Provider calls are held or failed at the real HTTP boundary. Interrupted requests require explicit retries; received responses survive reload and sync without inference. Another tab can revoke consent before a late response arrives.');
});
