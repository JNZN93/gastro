import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  outputDir: './e2e-results',
  use: {
    baseURL: 'http://localhost:4200',
    video: 'on',
    viewport: { width: 1280, height: 800 },
    headless: false,
    permissions: ['notifications'],
    launchOptions: {
      slowMo: 400,
      args: ['--enable-features=PushMessaging'],
      ignoreDefaultArgs: ['--enable-automation'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
