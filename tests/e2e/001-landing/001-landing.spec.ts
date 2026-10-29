import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the landing page serves', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  await page.clock.setFixedTime(new Date('2026-10-01T04:31:07.000Z'));
  // Relative navigation preserves both the project and PR-preview base paths.
  const response = await page.goto('./');

  await steps.step('landing-serves', 'A visitor can open Gratitude', [
    { description: 'The landing document returns HTTP 200', check: async () => { expect(response?.status()).toBe(200); } },
    { description: 'The page identifies itself as Gratitude', check: async () => { await expect(page).toHaveTitle('Gratitude'); } },
    { description: 'The install manifest preserves this deployment’s scope and transparent star-and-heart icons', check: async () => {
      const manifestPath = await page.locator('link[rel="manifest"]').getAttribute('href');
      const response = await page.request.get(new URL(manifestPath!, page.url()).href);
      expect(response.ok()).toBe(true);
      const manifest = await response.json();
      const scope = new URL('./', page.url()).pathname;
      expect(manifest.name).toBe('Gratitude'); expect(manifest.scope).toBe(scope);
      expect(manifest.start_url).toBe(`${scope}journal/`);
      expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
      for (const icon of manifest.icons) {
        const pixels = await page.evaluate(async (url: string) => {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
          const pixel = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
          return { width: image.width, height: image.height, corner: pixel(0, 0), star: pixel(Math.round(image.width * 28 / 64), Math.round(image.height * 28 / 64)), heart: pixel(Math.round(image.width * 48 / 64), Math.round(image.height * 48 / 64)) };
        }, new URL(icon.src, page.url()).href);
        expect(`${pixels.width}x${pixels.height}`).toBe(icon.sizes);
        expect(pixels.corner[3]).toBe(0);
        expect(pixels.star).toEqual([244, 211, 94, 255]); expect(pixels.heart).toEqual(pixels.star);
      }
    } },
    { description: 'Calendar account restoration finishes before the page is captured', check: async () => { await expect(page.getByText('Opening your calendar…', { exact: true })).toHaveCount(0, { timeout: 15_000 }); } },
    { description: 'The signed-out calendar is empty, greyed out and disabled, with its sign-in notice visible', check: async () => {
      const preview=page.getByRole('region',{name:'Calendar sign-in preview'});
      await expect(preview).toBeVisible();await expect(preview.locator('.landing-calendar')).toHaveAttribute('data-anchor','2026-10');await expect(preview.locator('.filled')).toHaveCount(0);await expect(preview.locator('.calendar-preview')).toHaveCSS('filter','grayscale(1)');expect(await preview.locator('button').evaluateAll(nodes=>nodes.length===35 && nodes.every(node=>(node as HTMLButtonElement).disabled))).toBe(true);await expect(preview.locator('.signin-message')).toHaveText('Sign in to see your gratitude calendar.');
    } },
    { description: 'The main heading is visible', check: async () => { await expect(page.getByRole('heading', { level: 1, name: 'Gratitude', exact: true })).toBeVisible(); } }
  ]);
  await steps.action('signin-focus','Reach the sign-in link while skipping disabled calendar controls',()=>page.keyboard.press('Tab'),async()=>{await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeFocused();});
  await steps.action('journal-focus','Reach the signed-out footer link',()=>page.keyboard.press('Tab'),async()=>{await expect(page.getByRole('link',{name:'Sign in and open your journal',exact:true})).toBeFocused();});
  steps.generateDocs('The Gratitude landing page',
    'A visitor opens the production build and sees an empty, disabled calendar under a sign-in overlay. Keyboard navigation skips calendar controls and reaches the sign-in links.');
});
