import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev --workspace @baas/web -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/app.html',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
