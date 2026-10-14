import { expect, test } from './fixtures/test';

test('Settings removal failures preserve rows, retries refresh server data, and the last login stays protected', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth_token', 'settings-removal-token'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'owner', display_name: 'Owner' } }));
  let accounts = [
    { id: 1, account_id: '111222333444', trainer_name: 'Remove trainer', verification_status: 'verified' },
    { id: 2, account_id: '555666777888', trainer_name: 'Keep trainer', verification_status: 'verified' }
  ];
  let identities = [{ provider: 'google', provider_id: 'g', display_name: 'Google owner' }, { provider: 'discord', provider_id: 'd', display_name: 'Discord owner' }];
  let rejectRemoval = true, rejectConnect = true;
  let revoked = false;
  const deleted: string[] = [];
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: accounts }));
  await page.route('**/api/auth/identities', route => route.fulfill({ json: identities }));
  await page.route('**/api/auth/api-keys', route => route.fulfill({ json: [{ id: 'old', name: 'Revoke tool', key_prefix: 'prefix', created_at: '2026-01-01', revoked }] }));
  await page.route('**/api/auth/api-keys/old', route => {
    expect(route.request().method()).toBe('DELETE');
    if (rejectRemoval) return route.fulfill({ status: 409, json: { error: 'Try again' } });
    revoked = true; deleted.push('key'); return route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/link/111222333444', route => {
    expect(route.request().method()).toBe('DELETE');
    if (rejectRemoval) return route.fulfill({ status: 409, json: { error: 'Try again' } });
    deleted.push('account'); accounts = [{ ...accounts[1]!, trainer_name: 'Refreshed trainer' }];
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/disconnect/google', route => {
    expect(route.request().method()).toBe('DELETE');
    if (rejectRemoval) return route.fulfill({ status: 409, json: { error: 'Try again' } });
    deleted.push('google'); identities = [{ provider: 'discord', provider_id: 'd', display_name: 'Refreshed Discord' }];
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/connect/google', route => rejectConnect
    ? route.fulfill({ status: 400, json: { error: 'Try again' } })
    : route.fulfill({ json: { url: new URL('/mock-provider', page.url()).href } }));
  await page.route('**/mock-provider', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock provider consent</h1>' }));
  await page.goto('/settings');
  const account = page.locator('.account-row').filter({ hasText: 'Remove trainer' });
  await account.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(page.locator('.banner--danger')).toBeVisible();
  await expect(account).toBeVisible(); await expect(account.getByRole('button', { name: 'Unlink', exact: true })).toBeEnabled();
  rejectRemoval = false;
  await account.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(page.locator('#settings-content').getByText('Refreshed trainer', { exact: true })).toBeVisible();
  await expect(page.locator('.banner--danger')).toHaveCount(0);
  rejectRemoval = true;
  const google = page.locator('.identity-row').filter({ hasText: 'Google owner' });
  await google.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('.banner--danger')).toBeVisible(); await expect(google).toBeVisible();
  rejectRemoval = false;
  await google.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByText('Refreshed Discord', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeDisabled();
  await expect(page.locator('.banner--danger')).toHaveCount(0);
  rejectRemoval = true;
  const keyCard = page.locator('.settings-card').filter({ has: page.getByRole('heading', { name: 'API Keys', exact: true }) });
  await keyCard.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(keyCard.locator('.error-msg')).toBeVisible();
  await expect(keyCard.getByRole('button', { name: 'Revoke', exact: true })).toBeEnabled();
  rejectRemoval = false;
  await keyCard.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(keyCard.getByText('Revoked', { exact: true })).toBeVisible();
  await expect(keyCard.locator('.error-msg')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await expect(page.locator('.banner--danger')).toBeVisible();
  rejectConnect = false;
  await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mock provider consent' })).toBeVisible();
  expect(deleted).toEqual(['account', 'google', 'key']);
});

test('Settings cards load independently and an older key response cannot overwrite a created key', async ({ page, isMobile }) => {
  await page.addInitScript(() => localStorage.setItem('auth_token', 'settings-loading-token'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'owner', display_name: 'Owner' } }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [{ id: 1, account_id: '111222333444', trainer_name: 'Ready trainer', verification_status: 'verified' }] }));
  let identitiesUnavailable = true, keyReads = 0, releaseOld = () => {};
  const oldRequest = new Promise<void>(resolve => releaseOld = resolve);
  const newKey = { id: 'new', name: 'Fresh key', key_prefix: 'prefix', created_at: '2026-01-01', revoked: false };
  await page.route('**/api/auth/identities', route => identitiesUnavailable
    ? route.fulfill({ status: 503, json: { error: 'Provider list unavailable' } })
    : route.fulfill({ json: [{ provider: 'google', provider_id: 'owner' }] }));
  await page.route('**/api/auth/api-keys', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { ...newKey, key: 'copy-me-once' } });
    if (++keyReads === 1) { await oldRequest; await route.fulfill({ json: [] }); }
    else await route.fulfill({ json: [newKey] });
  });
  try {
    await page.goto('/settings');
    await expect(page.locator('#settings-content').getByText('Ready trainer', { exact: true })).toBeVisible();
    const keyCard = page.locator('.settings-card').filter({ has: page.getByRole('heading', { name: 'API Keys', exact: true }) });
    await expect(keyCard.getByRole('status')).toHaveText('Loading…');
    await expect(keyCard.getByText('No API keys yet.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry connected logins', exact: true })).toBeVisible();
    if (isMobile) for (const input of await page.locator('.form-row input').all()) expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: test.info().outputPath('settings-partial-load.png'), fullPage: true });
    await page.getByLabel('12-digit Account / Viewer ID').fill('987654321098');
    identitiesUnavailable = false;
    await page.getByRole('button', { name: 'Retry connected logins', exact: true }).click();
    await expect(page.locator('.identity-list').getByText('Google', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeDisabled();
    await page.getByLabel('Key name').fill('Fresh key');
    await page.getByRole('button', { name: 'Create Key', exact: true }).click();
    await expect(page.locator('.api-keys-list').getByText('Fresh key', { exact: true })).toBeVisible();
    await expect(page.locator('.new-key-display code')).toHaveText('copy-me-once');
    const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/api-keys') && response.request().method() === 'GET');
    releaseOld(); await (await oldResponse).finished();
    await expect(page.locator('.api-keys-list').getByText('Fresh key', { exact: true })).toBeVisible();
    await expect(page.getByLabel('12-digit Account / Viewer ID')).toHaveValue('987654321098');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { releaseOld(); }
});

test('Settings keeps verification pending while an independent API-key operation completes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth_token', 'settings-overlap-token'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'owner', display_name: 'Owner' } }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [{ id: 1, account_id: '111222333444', verification_status: 'pending', verification_token: 'VERIFY' }] }));
  await page.route('**/api/auth/identities', route => route.fulfill({ json: [{ provider: 'google', provider_id: 'owner' }] }));
  let releaseVerification = () => {}, releaseKey = () => {};
  let verificationRequests = 0, keyRequests = 0, created = false;
  const verification = new Promise<void>(resolve => releaseVerification = resolve);
  const key = new Promise<void>(resolve => releaseKey = resolve);
  await page.route('**/api/auth/verify', async route => {
    verificationRequests++;
    await verification;
    await route.fulfill({ json: { status: 'timeout', message: 'Verification timed out.' } });
  });
  await page.route('**/api/auth/api-keys', async route => {
    if (route.request().method() === 'POST') {
      keyRequests++;
      await key;
      created = true;
      await route.fulfill({ json: { id: 'new', name: 'Independent key', key: 'one-time-secret' } });
    } else await route.fulfill({ json: created ? [{ id: 'new', name: 'Independent key', key_prefix: 'prefix', created_at: '2026-01-01', revoked: false }] : [] });
  });
  try {
    await page.goto('/settings');
    const verify = page.getByRole('button', { name: 'Verify', exact: true });
    await verify.click();
    await expect.poll(() => verificationRequests).toBe(1);
    await expect(verify).toBeDisabled();
    await page.getByLabel('Key name').fill('Independent key');
    const create = page.getByRole('button', { name: 'Create Key', exact: true });
    await create.click();
    await expect.poll(() => keyRequests).toBe(1);
    await expect(create).toBeDisabled();
    await expect(verify).toBeDisabled();
    releaseKey();
    await expect(page.locator('.new-key-display code')).toHaveText('one-time-secret');
    await expect(verify).toBeDisabled();
    await expect(verify).toHaveAttribute('aria-busy', 'true');
    releaseVerification();
    await expect(page.getByText('Verification timed out.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry in/ })).toBeDisabled();
    expect(verificationRequests).toBe(1);
    expect(keyRequests).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    releaseKey();
    releaseVerification();
  }
});
