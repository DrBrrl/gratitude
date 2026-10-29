import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Render the same transparent vector used by the favicon at install-icon sizes.
// Run with the pinned browser: nix develop -c node scripts/render-app-icons.mjs
const source = await readFile(new URL('../src/lib/assets/favicon.svg', import.meta.url), 'utf8');
const output = new URL('../static/icons/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${source}`);
    await page.screenshot({ path: fileURLToPath(new URL(`gratitude-${size}.png`, output)), omitBackground: true });
  }
} finally { await browser.close(); }
