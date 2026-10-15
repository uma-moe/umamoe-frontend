import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Each browser process writes a native Firefox Profiler recording when it closes.
process.env.PERF_FIREFOX = '1';
// Firefox has no CDP CPU throttle or Chromium Event Timing audit.
delete process.env.PERF_PROFILE;
delete process.env.PERF_AUDIT;
const output = resolve(process.env.PERF_OUT ?? '.tmp/firefox-profiles');
mkdirSync(output, { recursive: true });
export default defineConfig({
  testDir: process.env.PERF_STRESS ? './tests/performance' : './tests/e2e',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  outputDir: `${output}/results`,
  use: {
    ...devices['Desktop Firefox'],
    baseURL: 'http://127.0.0.1:4184',
    viewport: process.env.PERF_STRESS ? { width: 390, height: 844 } : { width: 1536, height: 960 },
    hasTouch: Boolean(process.env.PERF_STRESS),
    screenshot: 'only-on-failure',
    launchOptions: {
      env: {
        ...process.env,
        MOZ_PROFILER_STARTUP: '1',
        MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu',
        MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain',
        MOZ_PROFILER_STARTUP_INTERVAL: '1',
        MOZ_PROFILER_STARTUP_ENTRIES: '10000000',
        MOZ_PROFILER_SHUTDOWN: `${output}/firefox-${Date.now()}-${process.pid}.json`
      }
    }
  }
});
