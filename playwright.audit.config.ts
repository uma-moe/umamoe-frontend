import { defineConfig, devices } from '@playwright/test';

process.env.PERF_AUDIT = '1';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, retries: 0, timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['./tests/performance/audit-reporter.ts']],
  outputDir: process.env.PERF_OUT ?? '.tmp/interaction-audit',
  use: { baseURL: 'http://127.0.0.1:4184', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile-chromium', testIgnore: /ui-lab\.spec\.ts/, use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 960 } } }
  ],
  webServer: { command: 'npx vite preview --configLoader runner --host 127.0.0.1 --port 4184 --strictPort', url: 'http://127.0.0.1:4184', reuseExistingServer: true, timeout: 30_000 }
});
