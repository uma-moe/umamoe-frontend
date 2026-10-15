import { defineConfig, devices } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  workers: 1,
  reporter: 'list',
  outputDir: '.tmp/mobile-layout',
  projects: [
    { name: 'pixel-6', use: { ...devices['Pixel 6'] } },
    { name: 'pixel-6-landscape', use: { ...devices['Pixel 6 landscape'] } },
    { name: 'touch-tablet', use: { ...devices['Pixel 6'], viewport: { width: 1280, height: 900 } } }
  ]
});
