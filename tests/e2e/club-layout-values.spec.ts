import { expect, test, type Page } from './fixtures/test';
import { mockCommunity } from './fixtures/api';
import { clubExportFixture } from './fixtures/club-exports';

test.use({ locale: 'en-US', timezoneId: 'UTC' });

async function loadMembers(page: Page, selector: string, total: number) {
  const rows = page
    .locator(selector)
    .filter({ visible: true })
    .and(page.locator('[data-virtual-index]'));

  if (!total) {
    await expect(rows).toHaveCount(0);
    return;
  }

  await page.locator('.members-section').evaluate((node) =>
    window.scrollTo({
      top: node.getBoundingClientRect().top + scrollY - 100,
      behavior: 'instant'
    })
  );

  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(total);
}

test('Mobile member table keeps compact columns and expands the remaining metrics', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-09-06T12:00:00Z');
  await mockCommunity(page);
  const fixture = clubExportFixture('current');
  await page.route('**/api/v4/circles?*', (route) => route.fulfill({ json: fixture.response }));
  await page.addInitScript(
    (config) => localStorage.setItem('circle_details_config', JSON.stringify(config)),
    fixture.config
  );
  await page.goto('/circles/7?year=2026&month=9');
  await page.getByRole('button', { name: 'Show member rows', exact: true }).click();
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('thead th:visible')).toHaveCount(4);
    const row = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('link', { name: 'Correction', exact: true }) });

    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(48);
    const trainerWidth = (await row.locator('.member-identity').boundingBox())!.width;
    await row.getByRole('button', { name: 'Show stats for Correction', exact: true }).click();
    const detail = page.locator('.member-details');
    await expect(detail).toBeVisible();
    await expect(row.locator('.identity-tools')).toBeHidden();
    await expect(detail.locator('.member-detail-heading .member-id')).toBeVisible();
    expect((await row.locator('.member-identity').boundingBox())!.width).toBeCloseTo(
      trainerWidth,
      0
    );
    for (const label of ['Daily Gain', 'Weekly Gain', 'Total Fans', 'Updated'])
      await expect(detail.getByText(label, { exact: true })).toBeVisible();
    await fits(page);
    await row.getByRole('button', { name: 'Hide stats for Correction', exact: true }).click();
    await expect(detail).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('thead th:visible')).toHaveCount(12);
  await expect(page.locator('.member-expand').first()).toBeHidden();
});

async function fits(page: Page) {
  const overflow = await page.evaluate(() => {
    const selectors =
      '.info-card,.club-fans,.tier-info,.club-metadata,.member-controls,.member-card,.member-stats dd,.primary-metric strong,.member-table-scroll,tbody td';

    return [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({ class: el.className, text: el.textContent?.slice(0, 80) }));
  });

  expect(overflow, 'Values must wrap inside their own containers').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const scenario of [
  'full club',
  'large values',
  'zero values',
  'missing fields',
  'empty club'
] as const) {
  test(`Club layout handles ${scenario} in both themes and narrow layouts`, async ({
    page
  }, info) => {
    test.setTimeout(60_000);
    const fixture = clubExportFixture('current');
    await page.clock.setFixedTime('2026-09-06T12:00:00Z');
    await mockCommunity(page);
    if (scenario === 'full club' || scenario === 'large values') {
      fixture.response.circle.member_count = 30;
      fixture.response.circle.name = 'A club with a much longer name · 星のトレーナー';
      fixture.response.circle.leader_name = 'LeaderWithoutAnySpaces'.repeat(3);
      fixture.response.circle.comment =
        'Training together every day - '.repeat(5) + 'discord.gg/parity';
      fixture.response.members = Array.from({ length: 31 }, (_, i) => ({
        ...fixture.response.members[i % 6]!,
        viewer_id: 123456789000 + i,
        trainer_name:
          i === 0 ? 'TrainerWithoutAnySpaces'.repeat(3) : `Trainer ${i + 1} · メジロマックイーン`,
        membership: i === 0 ? 3 : i === 1 ? 2 : 1,
        daily_fans:
          i === 30
            ? [100, 150]
            : Array.from({ length: 6 }, (_, day) => 1_000_000 + day * (i % 2 ? -100 : 1000) + i)
      }));
    }

    if (scenario === 'large values') {
      fixture.response.circle.monthly_point = 999_999_999_999_999;
      fixture.response.circle.live_points = 1_111_111_111_111_111;
      fixture.response.circle.monthly_rank = 999999;
      fixture.response.fans_to_lower_tier = 999_999_999_999;
      fixture.response.fans_to_next_tier = 1_111_111_111_111;
      fixture.response.members.forEach(
        (member) => (member.daily_fans = member.daily_fans.map((value) => value * 1_000_000))
      );
    }

    if (scenario === 'zero values') {
      fixture.response.circle.monthly_point = 0;
      fixture.response.circle.live_points = 0;
      fixture.response.fans_to_lower_tier = 0;
      fixture.response.fans_to_next_tier = 0;
      fixture.response.members.forEach((member) => (member.daily_fans = [0, 0, 0, 0]));
    }

    if (scenario === 'missing fields') {
      fixture.response = {
        circle: { circle_id: 7, name: 'Minimal club', join_style: 3 },
        members: [{ viewer_id: 7001, trainer_name: 'No snapshots', year: 2026, month: 9 }]
      } as typeof fixture.response;
    }

    if (scenario === 'empty club') {
      fixture.response.members = [];
      fixture.response.circle.member_count = 0;
    }

    await page.route('**/api/v4/circles?*', (route) => route.fulfill({ json: fixture.response }));
    await page.addInitScript(
      (config) => localStorage.setItem('circle_details_config', JSON.stringify(config)),
      fixture.config
    );
    await page.goto('/circles/7?year=2026&month=9');
    await loadMembers(page, '.member-card', fixture.response.members.length);
    await expect(page.locator('.club-chart')).toHaveCount(1);
    if (scenario === 'empty club')
      await expect(page.getByText('No members match your search.', { exact: true })).toBeVisible();
    if (scenario === 'missing fields') {
      await expect(page.locator('.leader-row .value')).toHaveText('Unknown');
      await expect(page.locator('.updated-row,.club-rank-row,.live-row')).toHaveCount(0);
      await expect(page.locator('.club-fans .value')).toHaveText('0');
    }

    if (scenario === 'zero values') {
      await expect(page.locator('.club-fans .value').first()).toHaveText('0');
      await expect(page.locator('.tier-gap-value').first()).toHaveText('0');
      await expect(page.locator('.primary-metric .positive,.primary-metric .negative')).toHaveCount(
        0
      );
    }

    if (scenario === 'large values') {
      await expect(page.locator('.club-fans .value>span').first()).toHaveText('1000T');
      await expect(page.locator('.club-fans .value>small').first()).toHaveText(
        '999,999,999,999,999'
      );
    }

    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: 'Toggle theme' }).click();
      for (const width of [320, 390, 768, 1200]) {
        await page.setViewportSize({ width, height: 900 });
        await fits(page);
        const numberLines = await page
          .locator(
            '.club-fans .value>span,.club-fans .value>small,.tier-gap-value,.tier-delta,.member-stats dd'
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return {
                height: box.height,
                lineHeight: parseFloat(getComputedStyle(node).lineHeight),
                overflow: node.scrollWidth > node.clientWidth + 1
              };
            })
          );

        for (const value of numberLines) {
          expect(value.height).toBeLessThanOrEqual(value.lineHeight + 1);
          expect(value.overflow).toBe(false);
        }

        if (scenario === 'full club' || scenario === 'large values') {
          for (const name of ['Daily Gain', 'Projected Monthly']) {
            const metric = page
              .locator('.member-card')
              .first()
              .locator('.member-stats > div')
              .filter({ has: page.getByText(name, { exact: true }) });

            const label = (await metric.locator('dt').boundingBox())!,
              value = (await metric.locator('dd').boundingBox())!;

            expect(value.x).toBeGreaterThan(label.x + label.width);
            expect(Math.abs(value.y - label.y)).toBeLessThan(4);
          }
        }

        await page.getByRole('button', { name: 'Show member rows', exact: true }).click();
        await loadMembers(page, 'tbody tr', fixture.response.members.length);
        if (width < 768) await fits(page);
        await page.getByRole('button', { name: 'Show member cards', exact: true }).click();
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath(`${scenario}-${theme}.png`) });
      if (scenario === 'large values' || scenario === 'full club')
        await page
          .locator('.member-card')
          .first()
          .screenshot({ path: info.outputPath(`member-${scenario}-${theme}.png`) });
    }

    await expect(
      page.getByRole('figure', { name: 'Club progression by observed day' })
    ).toBeVisible();

    await page
      .getByRole('region', { name: 'Member Progression', exact: true })
      .scrollIntoViewIfNeeded();

    await expect(
      page.getByRole('figure', { name: 'Member progression · cumulative' })
    ).toBeVisible();

    await page.getByRole('region', { name: 'Club members', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('region', { name: 'Club members', exact: true })).toBeVisible();
  });
}

test('Every club tier and join style retains complete labels and boundary values', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime('2026-09-06T12:00:00Z');
  await mockCommunity(page);
  const fixture = clubExportFixture('current');
  await page.route('**/api/v4/circles?*', (route) => route.fulfill({ json: fixture.response }));
  await page.setViewportSize({ width: 320, height: 844 });
  for (let rank = 1; rank <= 11; rank++) {
    fixture.response.club_rank = rank;
    fixture.response.circle.join_style = (rank % 3) + 1;
    fixture.response.fans_to_lower_tier = rank === 1 ? undefined : 999_999_999;
    fixture.response.fans_to_next_tier = rank === 11 ? undefined : 999_999_999;
    await page.goto(`/circles/7?year=2026&month=9&tier=${rank}`);
    await expect(page.locator('.rank-center img')).toHaveAttribute(
      'src',
      new RegExp(`circle_rank_${String(rank).padStart(2, '0')}\\.webp$`)
    );
    await expect(page.locator('.heading-meta')).toContainText(
      ['Open', 'Approval', 'Closed'][rank % 3]
    );
    await expect(page.locator('.lower')).toHaveCount(rank === 1 ? 0 : 1);
    await expect(page.locator('.upper')).toHaveCount(rank === 11 ? 0 : 1);
    await fits(page);
  }
});

test('Every primary metric and visibility setting renders the expected correction and survives view changes', async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime('2026-09-06T12:00:00Z');
  await mockCommunity(page);
  const fixture = clubExportFixture('current');
  await page.route('**/api/v4/circles?*', (route) => route.fulfill({ json: fixture.response }));
  await page.addInitScript(
    (config) => localStorage.setItem('circle_details_config', JSON.stringify(config)),
    fixture.config
  );
  await page.goto('/circles/7?year=2026&month=9');
  const correction = page
    .locator('.member-card')
    .filter({ has: page.getByRole('link', { name: 'Correction', exact: true }) });

  const settings = page.getByRole('dialog', { name: 'Member List Settings' });
  for (const [label, value] of [
    ['Today', '-30'],
    ['Monthly Gain', '-100'],
    ['Weekly Gain', '-70'],
    ['Daily Gain', '-20'],
    ['Avg Daily Gain (7d)', '-23'],
    ['Daily Avg (Month)', '0'],
    ['Projected Monthly', '0'],
    ['Total Fans', '400']
  ]) {
    await page.getByRole('button', { name: 'Display Settings', exact: true }).click();
    await page.locator('#club-member-metric').click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await settings.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(correction.locator('.primary-metric strong')).toHaveText(value);
    await expect(correction.locator('.primary-metric .negative')).toHaveCount(
      value.startsWith('-') ? 1 : 0
    );
    await fits(page);
  }

  await page.getByRole('button', { name: 'Display Settings', exact: true }).click();
  for (const checkbox of await settings.getByRole('checkbox').all()) await checkbox.uncheck();
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(correction.locator('.member-stats dt')).toHaveText(['Last Updated']);
  for (const [label, displayed] of [
    ['Today', 'Today'],
    ['Monthly Gain', 'Monthly Gain'],
    ['Weekly Gain', 'Weekly Gain'],
    ['Daily Gain', 'Daily Gain'],
    ['7 Day Average', '7 Day Avg'],
    ['Daily Average (Month)', 'Daily Avg'],
    ['Projected Monthly', 'Projected Monthly'],
    ['Total Fans', 'Total Fans']
  ]) {
    await page.getByRole('button', { name: 'Display Settings', exact: true }).click();
    await settings.getByRole('checkbox', { name: label, exact: true }).check();
    await settings.getByRole('button', { name: 'Apply', exact: true }).click();
    if (label !== 'Total Fans')
      await expect(
        correction.locator('.member-stats dt').filter({ hasText: new RegExp(`^${displayed}$`) })
      ).toHaveCount(1);
    else await expect(correction.locator('.primary-metric>span')).toHaveText('Total Fans');
  }

  await page.locator('#club-member-search').fill('Correction');
  await expect(page.locator('.chart-legend button')).toHaveText(['Correction']);
  await expect(page.locator('.member-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show member rows', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Correction');
  await expect(page.locator('tbody td.negative')).toHaveCount(5);
  await page.getByRole('button', { name: 'Show member cards', exact: true }).click();
  await expect(correction.locator('.primary-metric strong')).toHaveText('400');
});
