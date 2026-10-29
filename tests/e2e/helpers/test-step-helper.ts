import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Verification = { description: string; check: () => Promise<void> };
type DocStep = { description: string; image: string; checks: string[] };

/** Every documented step must pass its checks and its screenshot comparison. */
export class TestStepHelper {
  private steps: DocStep[] = [];

  constructor(private page: Page, private info: TestInfo, private options: { paintStaticPage?: boolean } = {}) {}

  setPage(page: Page) { this.page = page; }

  async step(name: string, description: string, verifications: Verification[], capturePage = this.page) {
    const id = `${String(this.steps.length).padStart(3, '0')}-${name.replace(/[^a-z0-9-]/gi, '-')}`;
    const filename = `${id}-${this.info.project.name}.png`;
    await test.step(description, async () => {
      for (const verification of verifications) {
        await test.step(verification.description, verification.check);
      }
      await capturePage.mouse.move(0, 0);
      // Full-page capture has a deterministic document origin. Chromium mobile
      // can otherwise shift its scroll offset between beyond-viewport captures.
      // Capture all content, then restore the action's actual scroll position.
      const scroll = await capturePage.evaluate(() => ({ x: scrollX, y: scrollY }));
      if (this.options.paintStaticPage) {
        // Static walkthroughs can have glass layers several viewports below the
        // fold. Visit every viewport to paint those layers before full-page capture.
        // Never enable this for an infinite scroller: scrolling can load new content.
        await capturePage.evaluate(async () => {
          // Stay below the clamped maximum: its fractional scroll origin can
          // leave glass layers rasterized on a different subpixel grid. The
          // final screenshot still captures the entire document, including its last row.
          const bottom = Math.max(0, document.documentElement.scrollHeight - innerHeight - 1);
          for (let y = 0; y <= bottom; y += innerHeight) {
            window.scrollTo({ left: 0, top: y, behavior: 'instant' });
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          }
          window.scrollTo({ left: 0, top: bottom, behavior: 'instant' });
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
      }
      await capturePage.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
      // Let the browser composite glass/backdrop layers at the capture origin.
      // The scroll position can update before those layers finish repainting.
      await capturePage.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      if (this.options.paintStaticPage) {
        const layout = await capturePage.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          surfaces: Array.from(document.querySelector('main')?.children ?? []).map(node => {
            const rect = node.getBoundingClientRect();
            return { tag: node.tagName, classes: node.className, x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height };
          })
        }));
        // Numeric geometry only, never input values or journal/credential text.
        await this.info.attach(`${id}-layout`, { body: JSON.stringify(layout), contentType: 'application/json' });
      }
      // Visible calendar photos are authenticated, asynchronous content. Await
      // their real download/decoding (or unavailable state), never hide them.
      await expect.poll(() => capturePage.locator('.calendar-photo').evaluateAll(async nodes => {
        if (nodes.some(node => node.getAttribute('data-state') === 'loading')) return false;
        const images = nodes.flatMap(node => [...node.querySelectorAll('img')]);
        if (images.some(image => !image.complete || !image.naturalWidth)) return false;
        try { await Promise.all(images.map(image => image.decode())); return true; }
        catch { return false; }
      }), { timeout: 15_000 }).toBe(true);
      try {
        await expect(capturePage).toHaveScreenshot(filename, {
          timeout: 30_000, // Slow CI needs time for two stable full-page renders; pixel tolerance stays zero.
          fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css',
          maxDiffPixels: 0, threshold: 0
        });
      } finally {
        await capturePage.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: 'instant' }), scroll);
        await capturePage.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      this.steps.push({
        description,
        image: `./screenshots/${filename}`,
        checks: verifications.map((verification) => verification.description)
      });
    });
  }

  async action(name: string, description: string, action: () => Promise<unknown>, check: () => Promise<void>, checkDescription = 'The expected result of this action is visible') {
    await action();
    await this.step(name, description, [{ description: checkDescription, check }]);
  }

  generateDocs(title: string, description: string) {
    // Each browser project owns a file, so parallel workers cannot overwrite it.
    const filename = this.info.project.name === 'mobile-chromium'
      ? 'README.md'
      : `README.${this.info.project.name}.md`;
    const sections = this.steps.map((step) =>
      `## ${step.description}\n\n![${step.description}](${step.image})\n\n` +
      `**Verifications:**\n\n${step.checks.map((check) => `- [x] ${check}`).join('\n')}\n` +
      '- [x] Screenshot matches the committed baseline (zero differing pixels)'
    );
    writeFileSync(join(dirname(this.info.file), filename),
      `<!-- Generated by the E2E test. Do not edit by hand. -->\n\n# ${title}\n\n` +
      `${description}\n\nViewport: ${this.info.project.name}.\n\n${sections.join('\n\n')}\n`
    );
  }
}
