import { expect, test } from './fixtures/test';
import { accountId, mockDatabase, mockOwnerProfile, record } from './fixtures/api';

test.use({ hasTouch: true, locale: 'en-US' });

test('desktop touch screens retain compact spark controls and visible scenario artwork', async ({
  page
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await mockDatabase(page);
  const item = record();
  item.inheritance.scenario_id = 3;
  await page.route('**/search/query?*', (route) =>
    route.fulfill({ json: { items: [item], total: 1, page: 0, limit: 12, total_pages: 1 } })
  );

  await page.goto('/database');
  const card = page.locator('.inheritance-card');
  await expect(card).toBeVisible();
  for (const control of await card.locator('.spark-modes button').all())
    expect((await control.boundingBox())!.height).toBeLessThanOrEqual(28);
  for (const heading of await card.locator('.white-section summary').all())
    expect((await heading.boundingBox())!.height).toBeLessThan(24);
  const logo = card.getByRole('img', { name: 'Grand Concert', exact: true });
  await expect(logo).toBeVisible();
  expect((await logo.boundingBox())!.height).toBe(44);
  await card.screenshot({ path: test.info().outputPath('compact-card-desktop-touch.png') });
  await page.setViewportSize({ width: 320, height: 844 });
  for (const control of await card.locator('.spark-modes button, .white-section summary').all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card
    .locator('.record-stats')
    .screenshot({ path: test.info().outputPath('scenario-mobile.png') });
});

test('profile club ranks fit the shared row and ads follow the standard breakpoint', async ({
  page
}) => {
  await mockOwnerProfile(page, []);
  await page.route('**/api/v4/circles?*', (route) =>
    route.fulfill({
      json: {
        circle: {
          circle_id: 7,
          name: 'adadad',
          monthly_rank: 67554,
          yesterday_rank: 67217,
          live_rank: 67554,
          monthly_point: 1551,
          live_points: 1551,
          member_count: 1,
          club_rank: 1,
          leader_name: 'Club Leader',
          join_style: 2,
          policy: 1,
          comment: 'Training together'
        },
        members: []
      }
    })
  );

  await page.goto('/profile/' + accountId);
  const circle = page.locator('.circle-section .circle-card');
  await expect(circle.locator('.rank-number')).toHaveText('#67,554');
  await expect(circle.locator('.circle-meta')).toContainText('Club Leader');
  await expect(circle.getByText('Approval', { exact: true })).toBeVisible();
  const rail = page.locator('[data-route-id="profile"] [data-ad-position="right-rail"]');
  const inline = page.locator('[data-ad-target="profile_interscroller_1"]');
  for (const width of [1920, 1700, 1699, 1536, 1301, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width >= 1700) {
      await expect(rail).toBeVisible();
      await expect(inline).toBeHidden();
    } else {
      await expect(rail).toBeHidden();
      await expect(inline).toBeVisible();
    }

    const rank = await circle.locator('.rank-number').evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      overflow: element.scrollWidth > element.clientWidth
    }));

    expect(rank.height).toBeLessThanOrEqual(rank.lineHeight + 1);
    expect(rank.overflow).toBe(false);
    expect(await circle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    if (width === 1536 || width === 320)
      await circle.screenshot({ path: test.info().outputPath(`profile-club-${width}.png`) });
  }
});
