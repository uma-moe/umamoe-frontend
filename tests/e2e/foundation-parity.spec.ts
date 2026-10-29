import { expect, test } from './fixtures/test';
import { homeStats } from './fixtures/api';

test('Coming Soon retains the Angular card and keyboard return-home action without mobile overflow', async ({
  page
}) => {
  await page.route('**/api/stats?days=30', (route) => route.fulfill({ json: homeStats }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/wip');
  const card = page.getByRole('region', { name: 'Coming Soon' });
  await expect(
    card.getByText(
      'This feature is currently under development and will be available in the future.',
      { exact: true }
    )
  ).toBeVisible();

  await expect(card.getByText('Work in Progress', { exact: true })).toBeVisible();
  await expect(page.locator('[data-route-id="wip"]')).toHaveAttribute('data-page-width', 'normal');
  const home = card.getByRole('link', { name: 'Back to Home' });
  for (const width of [1536, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect((await card.boundingBox())!.width).toBeLessThanOrEqual(600);
    expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(width < 768 ? 32 : 44);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 2000 })
      .toBeLessThanOrEqual(width);
  }

  expect(await card.evaluate((node) => getComputedStyle(node, '::before').animationName)).toBe(
    'none'
  );
  await home.focus();
  await home.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.stat-card strong')).toHaveText([
    '4,521',
    '8,123',
    '34,567',
    '2,456,789'
  ]);
});

test('Privacy preserves section order, source jumps and shared page/footer regional privacy choices', async ({
  page,
  isMobile
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/privacy-policy');
  const body = page.locator('.privacy-page');
  await expect(body.locator('section h2')).toHaveText([
    'Overview',
    'Data We Collect',
    'Accounts & Authentication',
    'Cookies & Local Storage',
    'Advertising',
    'Your Rights (GDPR)',
    'Data Retention',
    'Security',
    "Children's Privacy",
    'Changes to This Policy',
    'Contact Us'
  ]);
  const navigation = body.getByRole('navigation', { name: 'Privacy policy sections' });
  const destinations = [
    'overview',
    'information-collection',
    'accounts',
    'cookies',
    'advertising',
    'your-rights',
    'data-retention',
    'security',
    'contact'
  ];

  await expect(navigation.getByRole('button')).toHaveCount(destinations.length);
  for (let i = 0; i < destinations.length; i++) {
    const button = navigation.getByRole('button').nth(i);
    await button.focus();
    await button.press('Enter');
    await expect(body.locator(`#${destinations[i]} h2`)).toBeInViewport();
    await expect(page).toHaveURL(/\/privacy-policy$/);
  }

  await body.getByRole('button', { name: 'Back to top' }).click();
  await expect(body.locator('#overview h2')).toBeInViewport();
  await body.getByRole('button', { name: 'Contact section', exact: true }).click();
  await expect(body.locator('#contact h2')).toBeInViewport();

  const choices = body.getByRole('button', { name: 'open privacy choices', exact: true });
  const footer = page.locator('.site-footer');
  const footerChoices = footer.getByRole('button', { name: 'Privacy Choices', exact: true });
  for (const [api, command, version] of [
    ['__tcfapi', 'displayConsentUi', 2],
    ['__gpp', 'showConsentManager', null],
    ['__uspapi', 'showConsentUi', 1]
  ] as const) {
    await page.evaluate((api) => {
      const runtime = window as unknown as Record<string, unknown>;
      for (const key of ['__tcfapi', '__gpp', '__uspapi']) delete runtime[key];
      runtime.privacyCalls = [];
      runtime[api] = (command: string, version?: number) =>
        (runtime.privacyCalls as unknown[]).push([command, version ?? null]);
    }, api);

    await choices.click();
    await footerChoices.focus();
    await footerChoices.press('Enter');
    expect(
      await page.evaluate(() => (window as unknown as { privacyCalls: unknown[] }).privacyCalls)
    ).toEqual([
      [command, version],
      [command, version]
    ]);
  }

  await page.evaluate(() => {
    delete (window as unknown as { __uspapi?: unknown }).__uspapi;
  });

  await body.getByRole('button', { name: 'privacy choices', exact: true }).click();
  await expect(
    body.getByText(
      'Regional privacy controls are not currently available in this browser or region.'
    )
  ).toBeVisible();
  await footerChoices.click();
  await expect(footer.getByRole('status')).toHaveText(
    'Regional privacy controls are not currently available in this browser or region.'
  );
  if (isMobile) expect((await footerChoices.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const heights = await navigation
      .getByRole('button')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));

    expect(heights.every((height) => height >= 32)).toBe(true);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 2000 })
      .toBeLessThanOrEqual(width);
  }
});
