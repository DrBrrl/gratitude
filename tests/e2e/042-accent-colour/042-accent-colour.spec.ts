import { test, expect as baseExpect, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';
import { startJournal, navigate, signIn, expectSynced, FIXTURE_TIME, writeReflection } from '../helpers/journal-session';
import { aiSettings, saveChoices } from '../helpers/gemini';
import { selectionLog } from '../helpers/ai-selection-fixture';
import { accentChoices, accentTheme } from '../../../src/lib/appearance';
import { replay } from '../../../src/lib/domain';
const expect = baseExpect.configure({ timeout: 15_000 });
const blue=accentChoices.find(choice=>choice.name==='Blue')!;
async function checkHighlight(page:Page,colour:string){
  const appearance=await page.evaluate(()=>{
    // Resolve real computed CSS colours without adding or replacing any page content.
    const canvas=new OffscreenCanvas(1,1),context=canvas.getContext('2d')!;
    const rgb=(value:string)=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data);};
    const active=document.querySelector('nav button[aria-current]')!;
    return{icon:rgb(getComputedStyle(active.querySelector('svg')!).color),underline:rgb(getComputedStyle(active,'::after').backgroundColor),border:rgb(getComputedStyle(document.querySelector('.accent-picker')!).borderTopColor)};
  });
  const swatch=[1,3,5].map(at=>parseInt(colour.slice(at,at+2),16));
  const chroma=(channels:number[])=>Math.max(...channels.slice(0,3))-Math.min(...channels.slice(0,3));
  const weight=parseFloat(accentTheme(accentChoices.find(choice=>choice.colour===colour)!.colourIndex).highlightWeight)/100;
  expect(Math.abs(chroma(appearance.icon)/chroma(swatch)-weight)).toBeLessThanOrEqual(.02);
  expect(appearance.underline).toEqual(appearance.icon);
  // Border opacity and palette colour stay independent of the brighter icon tint.
  expect(appearance.border[3]).toBe(82);
  for(let i=0;i<3;i++)expect(Math.abs(appearance.border[i]-swatch[i])).toBeLessThanOrEqual(2);
}


test('choose an account accent, keep rainbow reflections, and grow AI guidance with a clear limit', async ({ page, browser }, info) => {
  test.skip(process.env.E2E_FIREBASE !== 'true', 'Requires Firebase emulators'); test.setTimeout(600_000);
  const steps = new TestStepHelper(page, info, { paintStaticPage: true });
  await startJournal(page, info, steps, 'accent');
  await writeReflection(page, steps, 'A fictional bright morning, with a warm cup of tea.', 'reflection');
  await navigate(page, steps, 'settings', 'Settings');
  await steps.action('account', 'Open Account and its fourteen rainbow accent choices', () => page.getByRole('button', { name: /^Account / }).click(), async () => {
    await expect(page.getByRole('group', { name: 'Choose your accent colour' }).getByRole('button')).toHaveCount(14);
    await expect(page.getByRole('button', { name: 'Yellow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await checkHighlight(page,accentChoices[0].colour);
  });
  for (const choice of accentChoices.slice(1)) {
    await steps.action(`colour-${choice.colourIndex}`, `Choose ${choice.name.toLowerCase()} accents and smoke`, () => page.getByRole('button', { name: choice.name, exact: true }).click(), async () => {
      await expect(page.getByRole('button', { name: choice.name, exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: choice.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(choice.colour);
      await expect(page.locator('.app-background')).toHaveCSS('isolation','isolate');
      const smoke=await page.locator('.app-background').evaluate(node=>({blend:getComputedStyle(node,'::after').mixBlendMode,colour:getComputedStyle(node,'::after').backgroundColor}));
      expect(smoke.blend).toBe('color');expect(smoke.colour).toBe(`rgb(${[1,3,5].map(at=>parseInt(choice.colour.slice(at,at+2),16)).join(', ')})`);
      await checkHighlight(page,choice.colour);
      await expect(page.getByRole('button',{name:choice.name,exact:true}).locator('span')).toHaveCSS('color',`rgb(${[1,3,5].map(at=>parseInt(choice.inkColour.slice(at,at+2),16)).join(', ')})`);
    },'The selected icon and underline keep the swatch hue and strong colour; the glass border retains its original colour and opacity');
  }
  await steps.action('blue', 'Use blue for the following screens', () => page.getByRole('button', { name: 'Blue', exact: true }).click(), async () => { await expect(page.getByRole('button', { name: 'Blue', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true'); });
  await steps.action('reload', 'Restore the account accent after reload', () => page.reload(), async () => { await expectSynced(page); await expect.poll(async () => replay(await selectionLog(page)).appearance.colourIndex).toBe(blue.colourIndex); await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(blue.colour); });
  await navigate(page, steps, 'journal', 'Journal');
  const cardColour = await page.locator('.card').first().evaluate(node => (node as HTMLElement).style.getPropertyValue('--entry-colour'));
  expect(cardColour).not.toBe(blue.colour);
  await steps.action('view-entry', 'Keep the reflection’s date colour under the blue theme', () => page.getByRole('button', { name: 'View entry', exact: true }).click(), async () => { await expect(page.locator('.detail')).toBeVisible(); expect(await page.locator('.detail').evaluate(node => (node as HTMLElement).style.getPropertyValue('--entry-colour'))).toBe(cardColour); });
  await steps.action('themed-today','Open Today with a vivid blue star and matching selected icon',()=>page.getByRole('navigation').getByRole('button',{name:'Today',exact:true}).click(),async()=>{await expect(page.getByRole('heading',{name:'Reflection time',exact:true})).toBeVisible();const highlight=await page.locator('nav button[aria-current] svg').evaluate(node=>getComputedStyle(node).color);await expect(page.locator('.brand-star')).toHaveCSS('fill',highlight);await expect(page.locator('.week-open>span')).toHaveCSS('color',highlight);},'The wordmark star and selected Today icon share the stronger blue highlight');
  const graphicalColour=await page.locator('.brand-star').evaluate(node=>getComputedStyle(node).fill);
  const ringColour = `rgb(${[1, 3, 5].map(at => parseInt(cardColour.slice(at, at + 2), 16)).join(', ')})`;
  await steps.action('themed-landing', 'Use blue calendar controls while keeping the saved date’s rainbow ring', () => page.getByRole('link', { name: 'Gratitude', exact: true }).click(), async () => {
    await expect(page.locator('.landing-calendar')).toBeVisible();
    await expect(page.locator('.month-controls svg').first()).toHaveCSS('color',graphicalColour);
    await expect(page.locator('.landing-calendar [data-day="2026-10-01"] .number')).toHaveCSS('border-top-color', ringColour);
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(blue.colour);
  });
  await steps.action('return-journal', 'Return to the themed app from the landing page', () => page.getByRole('link', { name: 'Open your journal', exact: true }).click(), async () => { await expectSynced(page); });
  await aiSettings(page, steps, 'guidance');
  await steps.action('prompt-info', 'Expand the explanation of prompt personalisation', () => page.getByText('Prompt info', { exact: true }).click(), async () => {
    await expect(page.locator('.prompt-info')).toHaveAttribute('open', '');
    await expect(page.locator('.prompt-info p')).toContainText('The switches above optionally include up to 20 earlier reflections (anniversaries, rediscoveries, and recent writing) and up to 20 original questions with their feedback.');
  });
  await steps.action('close-prompt-info', 'Keep the optional explanation tucked away', () => page.getByText('Prompt info', { exact: true }).click(), async () => { await expect(page.locator('.prompt-info p')).toBeHidden(); });
  const guidance = page.getByRole('textbox', { name: 'What should prompts focus on or avoid?' });
  const smallHeight = await guidance.evaluate(node => node.clientHeight);
  const text = 'Everyday joys and the changing seasons. Please make room for gentle questions about family, friendship, food and time outdoors. '.repeat(4).slice(0, 500);
  await steps.action('long-guidance', 'Grow the field so all 500 characters remain visible', () => guidance.fill(text), async () => {
    await expect(guidance).toHaveValue(text); await expect(page.locator('#ai-guidance-limit')).toHaveText('500 / 500 characters');
    await expect.poll(() => guidance.evaluate(node => node.clientHeight)).toBeGreaterThan(smallHeight);
    expect(await guidance.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  });
  await steps.action('limit', 'Prevent typing beyond the stated character limit', () => guidance.press('x'), async () => { await expect(guidance).toHaveValue(text); });
  await saveChoices(page, steps, 'save-guidance');
  await steps.action('short-guidance', 'Shrink the field when the guidance becomes shorter', () => guidance.fill('Everyday joys.'), async () => { await expect(page.locator('#ai-guidance-limit')).toHaveText('14 / 500 characters'); await expect.poll(() => guidance.evaluate(node => node.clientHeight)).toBe(smallHeight); });
  await saveChoices(page, steps, 'save-short');
  const context = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  try {
    await context.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    const other = await context.newPage(); await other.clock.setFixedTime(new Date(FIXTURE_TIME)); steps.setPage(other);
    await steps.action('device', 'Open Gratitude on a fresh device with default yellow', () => other.goto('./journal/'), async () => { await expect(other.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible(); });
    await signIn(other, info, steps, 'accent', true, 'Journal');
    await steps.step('synced-colour', 'Restore blue from the account’s event stream', [{ description: 'A new device receives the chosen colour through full replay', check: async () => { await expect.poll(() => other.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(blue.colour); } }]);
    await aiSettings(other, steps, 'restored');
    await steps.step('restored-guidance', 'Restore the saved short guidance and its character count', [{ description: 'The field and explicit limit agree on both devices', check: async () => { await expect(other.locator('#ai-guidance')).toHaveValue('Everyday joys.'); await expect(other.locator('#ai-guidance-limit')).toHaveText('14 / 500 characters'); } }]);
  } finally { await context.close(); steps.setPage(page); }
  await navigate(page, steps, 'leave-settings', 'Settings');
  await steps.action('leave-account', 'Return to Account', () => page.getByRole('button', { name: /^Account / }).click(), async () => { await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true'); });
  await steps.action('signout', 'Return public pages to yellow on sign-out', () => page.getByRole('button', { name: 'Sign out', exact: true }).click(), async () => { await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(accentChoices[0].colour); });
  await steps.generateDocs('Your favourite accent colour', 'Account accents use the fourteen supplied hex points independently of the date rainbow, sync independently of AI consent, recolour the smoke and glass, and preserve reflection date colours. The picker and smoke use the exact supplied hex points; icons use their strongest readable tint, with matching wordmark-star colour and the same border opacity. AI guidance grows with its content and states its 500-character limit.');
});
