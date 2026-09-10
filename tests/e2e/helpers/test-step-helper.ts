import { test, type Page, type TestInfo } from '@playwright/test';

type Verification = { description: string; check: () => Promise<void> };

/** Keep each step's assertions, screenshot, and report text together. */
export class TestStepHelper {
  private index = 0;

  constructor(private page: Page, private info: TestInfo) {}

  async step(name: string, description: string, verifications: Verification[]) {
    const id = `${String(this.index++).padStart(3, '0')}-${name.replace(/[^a-z0-9-]/gi, '-')}`;
    await test.step(description, async () => {
      for (const verification of verifications) {
        await test.step(verification.description, verification.check);
      }
      await this.info.attach(`${id}.png`, {
        body: await this.page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png'
      });
      await this.info.attach(`${id}.md`, {
        body: `# ${description}\n\n${verifications.map((v) => `- Passed: ${v.description}`).join('\n')}\n`,
        contentType: 'text/markdown'
      });
    });
  }
}
