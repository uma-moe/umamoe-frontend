import { expect, test } from './fixtures/test';
import { profile, homeStats } from './fixtures/api';

test('sign-in keeps the verified session and shows initials while the avatar loads', async ({
  page
}) => {
  let releaseIdentity!: () => void;
  let identity = new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  });

  let releaseAvatar!: () => void;
  const avatar = new Promise<void>((resolve) => {
    releaseAvatar = resolve;
  });

  let identityRequests = 0;
  let documents = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });

  await page.route('**/api/auth/me', async (route) => {
    identityRequests++;
    await identity;
    await route.fulfill({
      json: { id: 'owner', display_name: 'Parity User', avatar_url: '/slow-avatar.svg' }
    });
  });

  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/stats', (route) => route.fulfill({ json: homeStats }));
  await page.route('**/slow-avatar.svg', async (route) => {
    await avatar;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="blue"/></svg>'
    });
  });

  try {
    await page.goto('/signin?token=callback-session', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Checking sign-in', { exact: true })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    releaseIdentity();
    await expect(page).toHaveURL(/\/$/);
    const account = page.getByRole('button', { name: 'Account menu for Parity User', exact: true });
    await expect(account).toBeVisible();
    await expect(account.locator('.account-avatar')).toHaveText('PU');
    await expect(account.locator('img')).toBeHidden();
    expect(documents).toBe(1);
    expect(identityRequests).toBe(1);
    await account.click();
    await expect(page.getByRole('menu', { name: 'Your account' })).toBeVisible();
    releaseAvatar();
    await expect(account.locator('img')).toBeVisible();
    identity = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Checking sign-in', { exact: true })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    releaseIdentity();
    await expect(account).toBeVisible();
    expect(identityRequests).toBe(2);
  } finally {
    releaseIdentity();
    releaseAvatar();
  }
});

test('OAuth redirects to any app page replace an old token and recover from temporary verification failures', async ({
  page
}) => {
  let unavailable = true;
  const tokens: string[] = [];
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('auth_token', 'old-session');
      sessionStorage.setItem('seeded', 'true');
    }
  });

  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/me', (route) => {
    tokens.push(route.request().headers().authorization ?? '');
    return unavailable
      ? route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } })
      : route.fulfill({ json: { id: 'fixture-user', display_name: 'Parity User' } });
  });

  await page.goto('/?token=oauth-new-session');
  await expect(page.getByText('Sign-in failed', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/signin$/);
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBe('oauth-new-session');
  expect(tokens.every((token) => token === 'Bearer oauth-new-session')).toBe(true);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/database?token=another-session');
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBe('another-session');
});

test('Google and Discord keep their login endpoints and recover from provider errors', async ({
  page
}) => {
  const providers: string[] = [];
  await page.route('**/api/auth/login/*?*', (route) => {
    const url = new URL(route.request().url());
    providers.push(url.pathname.split('/').at(-1)!);
    expect(url.searchParams.get('origin')).toBe(new URL(page.url()).origin);
    return route.fulfill({ status: 503, json: { message: 'Sign-in temporarily unavailable' } });
  });

  await page.goto('/login');
  for (const provider of ['Google', 'Discord']) {
    const button = page.getByRole('button', { name: `Sign in with ${provider}`, exact: true });
    await button.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(button).toBeEnabled();
  }

  // The shared GET pipeline retries a 503 once before returning the error.
  expect(providers).toEqual(['google', 'google', 'discord', 'discord']);
});

test('sign-in callback preserves the token contract and clears rejected sessions', async ({
  page
}) => {
  let accepted = true;
  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/me', (route) =>
    accepted
      ? route.fulfill({
          json: {
            id: 'fixture-user',
            display_name: 'Parity User',
            created_at: '2026-01-01T00:00:00Z'
          }
        })
      : route.fulfill({ status: 401, json: { message: 'Expired session' } })
  );

  await page.goto('/signin?token=parity-token');
  await expect(page).toHaveURL(/\/$/);
  const account = page.getByRole('button', { name: 'Account menu for Parity User', exact: true });
  await account.click();
  await expect(
    page.getByRole('menuitem', { name: 'Link game account', exact: true })
  ).toHaveAttribute('href', '/settings');

  await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBe('parity-token');
  await page.evaluate(() => sessionStorage.setItem('auth_return_to', 'https://example.com/'));
  await page.goto('/signin?token=parity-token');
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => sessionStorage.getItem('auth_return_to'))).toBeNull();
  accepted = false;
  await page.goto('/signin?token=expired-token');
  await expect(page.getByText('Sign-in failed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  await page.getByRole('link', { name: 'Return to sign in.' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/signin');
  await expect(page.getByText('Sign-in failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('signed-in account menu opens the active profile, settings and sign out', async ({
  page
}, testInfo) => {
  const activeId = '223456789012';
  let accounts = [
    {
      id: 1,
      account_id: '123456789012',
      trainer_name: 'First Trainer',
      verification_status: 'verified'
    },
    {
      id: 2,
      account_id: activeId,
      trainer_name: 'Active Trainer',
      verification_status: 'verified'
    },
    {
      id: 3,
      account_id: '323456789012',
      trainer_name: 'Pending Trainer',
      verification_status: 'pending'
    }
  ];

  await page.addInitScript(() => {
    if (!sessionStorage.getItem('account-seeded')) {
      localStorage.setItem('auth_token', 'account-menu-token');
      localStorage.setItem('uma:active-workspace', 'account:223456789012');
      sessionStorage.setItem('account-seeded', '1');
    }
  });

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { id: 'owner', display_name: 'Account Tester', avatar_url: '/avatar.png' }
    })
  );

  await page.route('**/avatar.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: accounts }));
  await page.route('**/api/auth/identities', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/api-keys', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/link/*', (route) => {
    accounts = accounts.filter((account) => !route.request().url().endsWith(account.account_id));
    return route.fulfill({ status: 204, body: '' });
  });

  await page.route(`**/api/v4/user/profile/${activeId}`, (route) =>
    route.fulfill({
      json: {
        ...profile,
        trainer: { ...profile.trainer, account_id: activeId, name: 'Active Trainer' },
        circle: null,
        team_stadium: [],
        inheritance: null
      }
    })
  );

  await page.route(`**/api/v4/user/profile/${activeId}/visibility`, (route) =>
    route.fulfill({ json: { profile_hidden: false, hidden_sections: [] } })
  );

  await page.route('**/api/stats', (route) => route.fulfill({ json: homeStats }));
  await page.goto('/tools');
  const trigger = page.getByRole('button', {
    name: 'Account menu for Account Tester',
    exact: true
  });

  await expect(trigger.locator('.account-avatar')).toHaveText('AT');
  await expect(trigger.locator('img')).toBeHidden();
  await trigger.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Your account', exact: true });
  const mine = menu.getByRole('menuitem', { name: 'My profile', exact: true });
  await expect(mine).toBeFocused();
  await expect(mine).toHaveAttribute('href', `/profile/${activeId}`);
  await expect(menu.getByRole('menuitem', { name: 'Profile: First Trainer' })).toHaveAttribute(
    'href',
    '/profile/123456789012'
  );

  await expect(menu).not.toContainText('Pending Trainer');
  await page.screenshot({ path: testInfo.outputPath('account-menu.png') });
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await mine.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/profile/${activeId}$`));
  await expect(menu).toBeHidden();
  await trigger.click();
  await menu.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unlink', exact: true }).nth(1).click();
  await expect(page.getByRole('button', { name: 'Unlink', exact: true })).toHaveCount(2);
  await trigger.click();
  await expect(mine).toHaveAttribute('href', '/profile/123456789012');
  await mine.press('End');
  const signOut = menu.getByRole('menuitem', { name: 'Sign out', exact: true });
  await expect(signOut).toBeFocused();
  await signOut.press('Enter');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  await expect(trigger).toHaveCount(0);
});
