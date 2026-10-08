import { expect, type Page, type TestInfo } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import { STARTER_ID } from '../../../src/lib/domain';
import { TestStepHelper } from './test-step-helper';

export const FIXTURE_TIME = '2026-10-01T04:31:07.000Z';
export const editor = (page: Page) => page.getByRole('textbox', { name: 'Your reflection', exact: true });
export async function editorText(page: Page) {
  return editor(page).evaluate(node => (node as HTMLElement).innerText.replace(/\r\n/g, '\n').replace(/\n$/, ''));
}
export async function expectEditor(page: Page, text: string) { await expect.poll(() => editorText(page)).toBe(text); }
export async function expectSynced(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Journal navigation' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sync-status')).toHaveCount(0, { timeout: 15_000 });
}
export async function navigate(page: Page, steps: TestStepHelper, id: string, destination: 'Today' | 'Journal' | 'Settings') {
  await steps.action(id, `Open ${destination}`, () => page.getByRole('navigation').getByRole('button', { name: destination, exact: true }).click(), async () => {
    await expect(page.getByRole('heading', { name: destination === 'Today' ? 'Reflection time' : destination === 'Journal' ? 'Your journal' : 'Settings', exact: true })).toBeVisible();
  });
}
export async function openEditor(page: Page, steps: TestStepHelper, id: string) {
  await steps.action(id, 'Open the reflection editor', () => page.getByRole('button', { name: /^(Write a response|Continue your reflection)$/ }).click(), async () => { await expect(editor(page)).toBeVisible(); });
}
export async function backFromEditor(page: Page, steps: TestStepHelper, id: string, destination = 'Today') {
  await steps.action(id, `Return to ${destination} without losing the draft`, () => page.locator('button.back').click(), async () => { await expect(editor(page)).toHaveCount(0); });
}
export async function startJournal(page: Page, info: TestInfo, steps: TestStepHelper, name: string) {
  await page.clock.setFixedTime(new Date(FIXTURE_TIME));
  await page.request.delete('http://127.0.0.1:19099/emulator/v1/projects/demo-gratitude/accounts');
  await page.context().route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  await steps.action('open', 'Open Gratitude', () => page.goto('./journal/'), async () => { await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(); });
  await signIn(page, info, steps, name);
}
export async function signIn(page: Page, info: TestInfo, steps: TestStepHelper, name: string, existing = false, landing: 'Today' | 'Journal' = 'Today') {
  const email = `${name}-${info.project.name}@example.test`;
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await opened;
  await popup.waitForLoadState('domcontentloaded');
  await steps.step('google-popup', 'Choose Google sign-in', [{ description: 'The Google emulator account chooser opens', check: async () => { await expect(popup.getByRole('button', { name: 'Add new account' })).toBeVisible(); } }], popup);
  if (existing) await popup.getByText(email, { exact: true }).click();
  else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await steps.step('new-account', 'Add a fictional Google account', [{ description: 'The account form opens', check: async () => { await expect(popup.locator('#email-input')).toBeVisible(); } }], popup);
    await popup.locator('#email-input').fill(email);
    await steps.step('email', 'Enter the fictional email address', [{ description: 'The email field retains the input', check: async () => { await expect(popup.locator('#email-input')).toHaveValue(email); } }], popup);
    await popup.locator('#display-name-input').fill('Gratitude visitor');
    await steps.step('name', 'Enter a display name', [{ description: 'The display name is entered', check: async () => { await expect(popup.locator('#display-name-input')).toHaveValue('Gratitude visitor'); } }], popup);
    await popup.locator('#sign-in').click();
  }
  const destination = landing === 'Journal' ? 'Your journal' : 'Reflection time';
  await steps.step('signed-in', landing === 'Journal' ? 'Return to the journal after today’s saved reflection' : 'Complete sign-in and open Today', [{ description: landing === 'Journal' ? 'The saved daily reflection makes Journal the initial page on this device' : 'The private journal is synchronized and Today is ready', check: async () => {
    await expectSynced(page);
    await expect(page.getByRole('heading', { name: destination, exact: true })).toBeVisible();
    if (landing === 'Today') await expect(page.getByRole('button', { name: /^(Write a response|Continue your reflection)$/ })).toBeEnabled();
  } }]);
}
export async function writeReflection(page: Page, steps: TestStepHelper, text: string, id: string) {
  await openEditor(page, steps, `${id}-open`);
  await steps.action(`${id}-type`, 'Write a reflection', () => editor(page).fill(text), async () => { await expectEditor(page, text); await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible(); });
  await steps.action(`${id}-save`, 'Save the reflection', () => page.getByRole('button', { name: /^Save (reflection|changes)$/ }).click(), async () => {
    await expect(page.getByRole('heading', { name: 'Reflection saved', exact: true })).toBeVisible(); await expect(page.locator('.saved-card')).toContainText(text); await expectSynced(page);
    // The emulator can return fractional milliseconds within the fixture second.
    // Validate that second, the precision exported to Markdown.
    await expect(page.locator('.saved-heading time')).toHaveAttribute('datetime', /^2026-10-01T04:31:07\.\d{3}Z$/);
  });
}

/** Historical raw events are setup fixtures, not journal UI actions or projected state. */
export async function seedHistory(page: Page, entries: { text: string; recordedAt: string }[]) {
  const uid = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find(db => db.name?.startsWith('gratitude:demo-gratitude:'))?.name;
    if (!name) throw new Error('Missing signed-in journal database');
    return name.split(':').at(-2)!;
  });
  const environment = await initializeTestEnvironment({ projectId: 'demo-gratitude', firestore: { host: '127.0.0.1', port: 18080 } });
  try {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = writeBatch(db);
      const root = `users/${uid}/streams/v1`;
      entries.forEach((entry, index) => {
        const id = `fixture-${index + 1}`;
        batch.set(doc(db, `${root}/events/${id}`), { eventId: id, type: 'ReflectionWritten', schemaVersion: 1,
          sequence: index + 1, recordedAt: Timestamp.fromDate(new Date(entry.recordedAt)),
          payload: { entryId: id, text: entry.text, expectedRevision: 0, starterId: STARTER_ID } });
        batch.set(doc(db, `${root}/entries/${id}`), { lastEventId: id });
      });
      batch.set(doc(db, root), { sequence: entries.length, lastEventId: `fixture-${entries.length}` });
      await batch.commit();
    });
  } finally { await environment.cleanup(); }
}
