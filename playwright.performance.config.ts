import { defineConfig, devices } from '@playwright/test';
process.env.PERF_AUDIT = '1';
export default defineConfig({
  testDir: './tests/performance',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['./tests/performance/audit-reporter.ts']],
  expect: { timeout: 30000 },
  outputDir: process.env.PERF_OUT ?? '.tmp/stress-results',
  use: {
    ...devices['Pixel 5'],
    viewport: { width: 390, height: 844 },
    baseURL: 'http://127.0.0.1:4184',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npx vite preview --configLoader runner --host 127.0.0.1 --port 4184 --strictPort',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: true,
    timeout: 30000
  }
});
