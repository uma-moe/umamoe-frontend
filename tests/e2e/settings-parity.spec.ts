import { expect, test, type Page } from './fixtures/test';

const verified = { id: 1, account_id: '123456789012', verification_status: 'verified', verified_at: '2026-01-01T00:00:00Z', trainer_name: 'Parity Trainer', representative_uma_id: 101101 };
const pending = { id: 2, account_id: '111222333444', verification_status: 'pending', verification_token: 'UMA-VERIFY', verified_at: null, trainer_name: 'Pending Trainer' };

async function mockSettings(page: Page) {
  let accounts = [verified, pending];
  let keys = [{ id: 'key-1', name: 'Existing tool', key_prefix: 'uma_k_old', total_requests: 48, created_at: '2026-01-01T00:00:00Z', revoked: false }];
  const mutations: Array<{ path: string; method: string; body?: unknown }> = [];
  await page.addInitScript(() => localStorage.setItem('auth_token', 'settings-parity-token'));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 'owner', display_name: 'Owner', created_at: '2025-01-01T00:00:00Z' } }));
  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: accounts }));
  await page.route('**/api/auth/identities', (route) => route.fulfill({ json: [{ provider: 'google', provider_id: 'g-1', display_name: 'Owner' }, { provider: 'discord', provider_id: 'd-1', display_name: 'Parity#0001' }] }));
  await page.route('**/api/auth/link', async (route) => {
    const body = route.request().postDataJSON(); mutations.push({ path: '/api/auth/link', method: 'POST', body });
    const account = { id: 3, account_id: String(body.account_id), verification_status: 'pending', verification_token: 'NEW-CODE', verified_at: null, trainer_name: 'New Trainer' };
    accounts = [...accounts, account]; await route.fulfill({ json: account });
  });
  await page.route('**/api/auth/verify', async (route) => {
    const body = route.request().postDataJSON(); mutations.push({ path: '/api/auth/verify', method: 'POST', body });
    await route.fulfill({ json: { status: 'timeout', message: 'Profile refresh timed out.' } });
  });
  await page.route(/\/api\/auth\/api-keys(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method();
    if (method === 'POST') {
      const body = route.request().postDataJSON(); mutations.push({ path: url.pathname, method, body });
      const created = { id: 'key-2', name: body.name, key: 'uma_k_secret_once', key_prefix: 'uma_k_new', total_requests: 0, created_at: '2026-08-29T00:00:00Z', revoked: false };
      keys = [...keys, { ...created, key: undefined }]; await route.fulfill({ json: created }); return;
    }
    if (method === 'DELETE') {
      mutations.push({ path: url.pathname, method }); keys = keys.map((key) => key.id === url.pathname.split('/').at(-1) ? { ...key, revoked: true } : key);
      await route.fulfill({ status: 204 }); return;
    }
    await route.fulfill({ json: keys });
  });
  return mutations;
}

test('Settings retains the Angular authentication guard', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('Settings preserves linked-account, verification, identity, and API-key workflows', async ({ page }) => {
  const mutations = await mockSettings(page); await page.goto('/settings');
  for (const heading of ['Linked Game Accounts', 'Connected Logins', 'API Keys']) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.locator('.account-list').getByText('Parity Trainer', { exact: true })).toBeVisible();
  await expect(page.getByText('UMA-VERIFY', { exact: true })).toBeVisible();
  await expect(page.locator('.identity-list').getByText('Google', { exact: true })).toBeVisible();
  await expect(page.locator('.identity-list').getByText('Discord', { exact: true })).toBeVisible();
  const accountInput = page.getByLabel('12-digit Account / Viewer ID');
  await accountInput.fill('987654321098');
  await expect(accountInput).toHaveValue('987654321098');
  await page.getByRole('button', { name: 'Link Account' }).click();
  await expect(page.getByText('Account 987654321098 linked! Follow the verification steps below.')).toBeVisible();
  expect(mutations.find((item) => item.path === '/api/auth/link')?.body).toEqual({ account_id: 987654321098 });
  await page.getByRole('button', { name: 'Verify', exact: true }).first().click();
  await expect(page.getByText('Profile refresh timed out.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry in 30s/ })).toBeDisabled();
  expect(mutations.find((item) => item.path === '/api/auth/verify')?.body).toEqual({ account_id: '111222333444' });
  await page.getByLabel('Key name').fill('Parity client');
  await page.getByRole('button', { name: 'Create Key' }).click();
  await expect(page.getByText('uma_k_secret_once', { exact: true })).toBeVisible();
  await expect(page.getByText('Parity client', { exact: true })).toBeVisible();
  expect(mutations.find((item) => item.path === '/api/auth/api-keys' && item.method === 'POST')?.body).toEqual({ name: 'Parity client' });
  await page.getByRole('button', { name: 'Revoke' }).first().click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  expect(mutations.some((item) => item.path === '/api/auth/api-keys/key-1' && item.method === 'DELETE')).toBe(true);
});

test('populated Settings shares the wide page layout and responsive ad placements', async ({ page }) => {
  await mockSettings(page); await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible();
  const frame = page.locator('[data-route-id="settings"]');
  await expect(frame).toHaveAttribute('data-page-width', 'wide');
  for (const width of [1920, 1700, 1699, 1536, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const heading = await page.getByRole('heading', { name: 'Account Settings', exact: true }).boundingBox();
    const card = await page.locator('.settings-card').first().boundingBox();
    expect(Math.abs(heading!.x - card!.x)).toBeLessThan(2);
    if (width >= 1700) { await expect(frame.locator('[data-ad-position="right-rail"]')).toBeVisible(); await expect(frame.locator('[data-ad-kind="inline"]')).toBeHidden(); }
    else { await expect(frame.locator('[data-ad-position="right-rail"]')).toBeHidden(); await expect(frame.locator('[data-ad-kind="inline"]')).toBeVisible(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 1536 || width === 390) await page.screenshot({ path: test.info().outputPath(`settings-layout-${width}.png`) });
  }
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('settings-layout-light.png'), animations: 'disabled' });
});

test('Settings copy handles browser denial, fallback focus, and one-time key recovery', async ({ page, isMobile }) => {
  await mockSettings(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => {
      if (sessionStorage.getItem('test-clipboard-native') !== 'allow') throw new DOMException('Blocked', 'NotAllowedError');
      sessionStorage.setItem('test-clipboard-value', value);
    } } });
    document.execCommand = (command) => {
      if (sessionStorage.getItem('test-clipboard-fallback') === 'throw') throw new Error('Clipboard unavailable');
      if (command !== 'copy' || sessionStorage.getItem('test-clipboard-fallback') === 'deny') return false;
      sessionStorage.setItem('test-clipboard-value', (document.activeElement as HTMLTextAreaElement).value);
      return true;
    };
  });
  await page.goto('/settings');
  const code = page.getByRole('button', { name: 'Copy code', exact: true });
  await code.focus();
  await code.press('Enter');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('test-clipboard-value'))).toBe('UMA-VERIFY');
  await expect(code).toBeFocused();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('test-clipboard-fallback', 'deny'));
  await code.click();
  await expect(page.getByText('Could not copy the code. Select and copy it manually.')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('test-clipboard-fallback', 'throw'));
  await page.getByLabel('Key name').fill('Copy recovery');
  await page.getByRole('button', { name: 'Create Key' }).click();
  const key = page.getByRole('button', { name: 'Copy API key' });
  await key.click();
  await expect(page.getByText('Could not copy the API key. Select and copy it manually before leaving this page.')).toBeVisible();
  await expect(page.locator('.new-key-display code')).toHaveText('uma_k_secret_once');
  await page.evaluate(() => sessionStorage.setItem('test-clipboard-native', 'allow'));
  await key.click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('test-clipboard-value'))).toBe('uma_k_secret_once');
  await expect(page.getByText('Could not copy the API key. Select and copy it manually before leaving this page.')).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveCount(0);
  if (isMobile) {
    expect((await code.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  }
});


test('footer global settings saves the preference and restores keyboard focus', async ({ page }) => {
  await mockSettings(page); await page.goto('/settings');
  const settings = page.locator('.site-footer').getByRole('button', { name: 'Global settings', exact: true });
  await settings.focus(); await settings.press('Enter');
  const preference = page.getByRole('checkbox', { name: 'Virtual scrolling', exact: true });
  await expect(preference).toBeChecked(); await preference.uncheck();
  await preference.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Global settings', exact: true })).toBeHidden();
  await expect(settings).toBeFocused();
  await page.reload(); await settings.click(); await expect(preference).not.toBeChecked();
  await preference.check(); await page.reload(); await settings.click(); await expect(preference).toBeChecked();
  await page.getByRole('dialog', { name: 'Global settings', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(settings).toBeFocused();
});
