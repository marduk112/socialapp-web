import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the REAL stack: docker infra + backend (:8080) must already be running.
 * The Angular dev server is started (or reused) via `webServer`.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // following-feed.spec.ts asserts on the first page (20 posts) of the GLOBAL "For you" feed, so it must not run while another
  // worker is creating posts (media, hashtag, notification specs seed dozens): it runs in its own project after all others.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /following-feed\.spec\.ts/ },
    {
      name: 'global-feed',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /following-feed\.spec\.ts/,
      dependencies: ['chromium'],
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
