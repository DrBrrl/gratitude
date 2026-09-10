import { defineConfig } from '@playwright/test';

const basePath = process.env.BASE_PATH ?? '';
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:4173${basePath}/`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 2_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    colorScheme: 'dark',
    locale: 'en-AU',
    timezoneId: 'Australia/Hobart',
    reducedMotion: 'reduce',
    actionTimeout: 2_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-gpu', '--font-render-hinting=none']
    }
  },
  projects: [
    { name: 'mobile-chromium', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-chromium', use: { viewport: { width: 1280, height: 800 } } }
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000
  }
});
