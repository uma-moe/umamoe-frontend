import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } },
    { name: 'mobile-chromium', testIgnore: /ui-lab\.spec\.ts/, use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } },
    { name: 'mobile-webkit', testIgnore: /ui-lab\.spec\.ts/, use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-firefox', testMatch: /lineage-(startup|responsive)\.spec\.ts/, use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 }, hasTouch: true } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run build:beta && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/ui-lab',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
