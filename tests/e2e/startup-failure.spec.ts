import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { mockAdvertising, mockDatabase, mockResources } from './fixtures/api';

test.beforeEach(async ({ context }) => {
  await mockAdvertising(context);
  await mockResources(context);
  await context.addInitScript(() => {
    localStorage.setItem('page-introduction-audience-v1', 'existing');
    localStorage.setItem('lastSeenUpdateVersion', '18');
    localStorage.setItem('lineage-planner-saves-v1', '{"Keep me":[]}');
  });
});

test('a failed entry script offers recovery without losing the URL or saved plans', async ({ page }) => {
  let failing = true;
  await page.route(/\/(?:app\/index-[\w-]+\.js|src\/main\.ts)(?:\?.*)?$/, route => failing ? route.abort('failed') : route.continue());
  await page.goto('/tools?keep=1#section');
  const error = page.locator('#app-error');
  await expect(error).toBeVisible();
  await expect(error.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
  await error.locator('summary').click();
  await expect(error.locator('pre')).toContainText('could not be downloaded');
  await expect(error.locator('pre')).toContainText('Browser:');
  await expect(error.locator('pre')).toContainText('Build:');
  await expect(error.locator('pre')).toContainText('Page: /tools');
  await expect(error.locator('pre')).toContainText('Source:');
  await expect(error.locator('pre')).toContainText(/(?:\/app\/index-[\w-]+\.js|\/src\/main\.ts)/);
  await expect(error.locator('pre')).not.toContainText('keep=1');
  failing = false;
  await error.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByRole('heading', { name: 'Tools & Calculators', exact: true })).toBeVisible();
  await expect(error).toBeHidden();
  await expect(page).toHaveURL(/\/tools\?keep=1#section$/);
  expect(await page.evaluate(() => localStorage.getItem('lineage-planner-saves-v1'))).toBe('{"Keep me":[]}');
});

test('render failures show the independent fallback', async ({ page }) => {
  await page.route(/\/PrivacyPage(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export default function () { throw new TypeError("A browser feature is unavailable"); }'
  }));
  await page.goto('/privacy-policy');
  const error = page.locator('#app-error');
  await expect(error).toBeVisible();
  await error.locator('summary').click();
  await expect(error.locator('pre')).toContainText('A browser feature is unavailable');
  await expect(error.locator('pre')).toContainText('TypeError:');
  await expect(error.locator('pre')).toContainText('Stack trace:');
  await expect(error.locator('pre')).toContainText('PrivacyPage');
  expect(await page.evaluate(() => localStorage.getItem('lineage-planner-saves-v1'))).toBe('{"Keep me":[]}');
});

test('app runtime errors are visible while unrelated third-party errors are ignored', async ({ page }) => {
  await page.goto('/tools?report=route-private#route-secret');
  await expect(page.getByRole('heading', { name: 'Tools & Calculators', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {
    filename: 'https://third-party.invalid/ad.js', message: 'An ad failed'
  })));
  await expect(page.locator('#app-error')).toBeHidden();
  await page.evaluate(() => {
    const error = new TypeError('Failed: ' + location.origin + '/app/file.js?token=private#secret');
    error.stack = error.toString() + '\n    at failedControl (' + location.origin + '/app/filter.js?token=stack-private#stack-secret:27:9)';
    window.dispatchEvent(new ErrorEvent('error', {
      filename: location.origin + '/app/index-test.js?token=source-private#source-secret', lineno: 12, colno: 34, error
    }));
  });
  const error = page.locator('#app-error');
  await expect(error).toBeVisible();
  await error.locator('summary').click();
  await expect(error.locator('pre')).toContainText('/app/file.js');
  await expect(error.locator('pre')).toContainText('Page: /tools');
  await expect(error.locator('pre')).toContainText('/app/index-test.js:12:34');
  await expect(error.locator('pre')).toContainText('Stack trace:');
  await expect(error.locator('pre')).toContainText('failedControl');
  await expect(error.locator('pre')).toContainText('/app/filter.js:27:9');
  await expect(error.locator('pre')).not.toContainText('private');
  await expect(error.locator('pre')).not.toContainText('secret');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('umamoe:app-error', { detail: new Error('Secondary failure') })));
  await expect(error.locator('pre')).not.toContainText('Secondary failure');
});

test('cancelled database searches do not show the fatal fallback when a fetch observer leaks the rejection', async ({ page }) => {
  await mockDatabase(page);
  await page.goto('/database');
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const request = originalFetch(...args);
      // Reproduce an injected fetch observer that leaves a rejected child promise.
      if (String(args[0]).includes('/search/query?')) void request.then(() => {});
      return request;
    };
  });
  let pending = false;
  await page.route('**/search/query?*', route => {
    if (new URL(route.request().url()).searchParams.get('sort_by') !== 'win_count') return route.fallback();
    pending = true; // Leave this search in flight until the next selection aborts it.
  });
  const sort = page.locator('#database-sort');
  await sort.click();
  await page.getByRole('option', { name: 'G1 Wins', exact: true }).click();
  await expect.poll(() => pending).toBe(true);
  await sort.click();
  await page.getByRole('option', { name: 'Newest First', exact: true }).click();
  await expect.poll(() => errors.some(error => error.name === 'AbortError')).toBe(true);
  await expect(page.locator('#app-error')).toBeHidden();
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  await expect(sort).toContainText('Newest First');
  await expect(page.getByRole('alert').filter({ hasText: 'Inheritance search unavailable' })).toHaveCount(0);

  // A real app rejection must still offer recovery after the cancellation.
  await page.evaluate(() => {
    const error = new TypeError('Unexpected application failure');
    error.stack = error.toString() + '\n    at ' + location.origin + '/app/DatabasePage-test.js:2:1';
    void Promise.reject(error);
  });
  await expect(page.locator('#app-error')).toBeVisible();
  await expect(page.locator('#app-error-details')).toContainText('TypeError: Unexpected application failure');
});

test('production Svelte errors report the actual bound property and stack', async ({ page }) => {
  // Compile a real Svelte error using the production config, without shipping a broken component.
  const entry = '\0svelte-error-test';
  const errors = fileURLToPath(new URL('../../node_modules/svelte/src/internal/client/errors.js', import.meta.url));
  const result = await build({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)), configLoader: 'runner', mode: 'production', logLevel: 'silent',
    plugins: [{
      name: 'svelte-error-test',
      resolveId: id => id === entry ? entry : undefined,
      load: id => id === entry ? `import { props_invalid_value } from ${JSON.stringify(errors)}; export default function FailedFilter() { props_invalid_value('filterValue'); }` : undefined
    }],
    build: { write: false, copyPublicDir: false, manifest: false, rollupOptions: { input: entry, preserveEntrySignatures: 'strict' } }
  });
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected a single production bundle');
  const failure = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId === entry);
  if (!failure || failure.type !== 'chunk') throw new Error('Missing compiled Svelte error');
  await page.route(/\/PrivacyPage(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: failure.code }));
  await page.goto('/privacy-policy');
  const error = page.locator('#app-error');
  await expect(error).toBeVisible();
  await error.locator('summary').click();
  await expect(error.locator('pre')).toContainText('props_invalid_value');
  await expect(error.locator('pre')).toContainText('Cannot do `bind:filterValue={undefined}` when `filterValue` has a fallback value');
  await expect(error.locator('pre')).toContainText('Stack trace:');
  await expect(error.locator('pre')).toContainText('PrivacyPage');
});
