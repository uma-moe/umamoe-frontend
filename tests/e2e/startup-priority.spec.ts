import { expect, test } from './fixtures/test';
import { mockCommunity, profile, veteran } from './fixtures/api';

test('initial Veterans data takes priority over background page warming', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'startup-fixture');
    localStorage.setItem('uma:active-workspace', 'account:123456789012');
    localStorage.setItem('uma-browser-proof-v1', JSON.stringify({ token: 'fixture-proof', expiresAt: Date.now() + 60_000 }));
  });
  const starts: Record<string, number[]> = {};
  const origin = Date.now();
  let profileFinished = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/auth/') || path.startsWith('/api/v4/user/profile/') || /\/(?:LineagePlannerPage|VeteransBrowserPage)-.*\.js$/.test(path)) (starts[path] ??= []).push(Date.now() - origin);
  });
  await page.route('**/api/auth/me', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: { id: 'owner', display_name: 'Owner', created_at: '' } });
  });
  await page.route('**/api/auth/accounts', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: [{ id: 1, account_id: '123456789012', trainer_name: 'Owner', verification_status: 'verified' }] });
  });
  await page.route('**/api/v4/user/profile/123456789012', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    profileFinished = Date.now() - origin;
    await route.fulfill({ json: { ...profile, veterans: Array.from({ length: 234 }, (_, id) => ({ ...veteran, id: id + 1, trained_chara_id: id + 1 })) } });
  });
  await page.goto('/veterans');
  await expect(page.locator('.veteran-card').first()).toBeVisible();
  const visible = Date.now() - origin;
  await expect.poll(() => Object.keys(starts).some(path => path.includes('/LineagePlannerPage-'))).toBe(true);
  const dataStart = starts['/api/v4/user/profile/123456789012']![0]!;
  const backgroundStart = Object.entries(starts).find(([path]) => path.includes('/LineagePlannerPage-'))![1][0]!;
  const measurements = { dataStart, profileFinished, visible, backgroundStart, starts };
  await info.attach('startup-timing', { body: JSON.stringify(measurements), contentType: 'application/json' });
  console.info('Startup priority:', JSON.stringify(measurements));
  expect.soft(Math.abs(starts['/api/auth/me']![0]! - starts['/api/auth/accounts']![0]!)).toBeLessThan(150);
  expect.soft(starts['/api/auth/accounts']).toHaveLength(1);
  expect.soft(backgroundStart).toBeGreaterThanOrEqual(profileFinished);
});

test('page data paints before ads, analytics and automatic update notices start', async ({ page }) => {
  await mockCommunity(page);
  await page.addInitScript(() => {
    localStorage.setItem('uma-browser-proof-v1', JSON.stringify({ token: 'fixture-proof', expiresAt: Date.now() + 60_000 }));
    localStorage.setItem('lastSeenUpdateVersion', '0');
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  let dataStarted!: () => void;
  const started = new Promise<void>(resolve => dataStarted = resolve);
  await page.route('**/api/v4/circles/list?*', async route => { dataStarted(); await held; await route.fallback(); });
  const providers: string[] = [];
  await page.route(/https:\/\/(?:cdn\.fuseplatform\.net\/.*\/fuse\.js|www\.googletagmanager\.com\/gtag\/js.*)/, async route => {
    providers.push(route.request().url());
    await route.fulfill({ contentType: 'application/javascript', body: `
      window.providerStartupChecks ??= [];
      window.providerStartupChecks.push(Boolean(document.querySelector('.club-list .circle-card')));
      window.fusetag ??= { que: [], registerZone() {}, pageInit() {} };
    ` });
  });
  try {
    await page.goto('/circles'); await started;
    await expect(page.getByRole('heading', { name: 'Club Leaderboard', exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    expect(providers).toEqual([]);
    await expect(page.getByRole('dialog', { name: 'What’s new', exact: true })).toBeHidden();
  } finally { release(); }
  await expect(page.locator('.club-list .circle-card').first()).toBeVisible();
  await expect.poll(() => providers.length).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { providerStartupChecks: boolean[] }).providerStartupChecks)).toEqual([true, true]);
  await expect(page.getByRole('dialog', { name: 'What’s new', exact: true })).toBeVisible();
});

test.describe('fresh browser verification', () => {
test.use({ cachedBrowserProof: false });
test('readable storage with failed writes reuses verification across protected routes', async ({ page }) => {
  await mockCommunity(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'uma-browser-proof-v1') throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
    let callback!: (token: string) => void;
    const runtime = window as unknown as { verificationExecutions: number; turnstile: unknown };
    runtime.verificationExecutions = 0;
    runtime.turnstile = {
      render(_element: HTMLElement, options: { callback: typeof callback }) { callback = options.callback; return 'fixture-widget'; },
      execute() { runtime.verificationExecutions++; queueMicrotask(() => callback('fixture-challenge')); },
      remove() {},
    };
  });
  let exchanges = 0;
  await page.route('**/api/auth/browser-proof', async route => {
    exchanges++;
    await route.fulfill({ body: '', headers: { 'X-Browser-Proof': 'fixture-proof', 'X-Browser-Proof-TTL': '60' } });
  });
  await page.goto('/circles');
  await expect(page.locator('.club-list .circle-card').first()).toBeVisible();
  await page.evaluate(() => { const link = document.createElement('a'); link.href = '/rankings'; document.body.append(link); link.click(); link.remove(); });
  await expect(page.locator('.leaderboard .leader-row').first()).toBeVisible();
  expect(exchanges).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { verificationExecutions: number }).verificationExecutions)).toBe(1);
});
});
