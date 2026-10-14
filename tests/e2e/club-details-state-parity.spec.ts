import { expect, test } from './fixtures/test';
import { mockCommunity } from './fixtures/api';
import { clubDetailsFixture } from './fixtures/club-details';

test('Club information retains live freshness, timestamp precedence, tier changes and comment links', async ({ page }, testInfo) => {
  await page.clock.setFixedTime('2026-09-06T12:00:00Z');
  await mockCommunity(page);
  let state = 'current';
  await page.route('**/api/v4/circles?*', route => {
    const query = new URL(route.request().url()).searchParams;
    const value = clubDetailsFixture(Number(query.get('year')), Number(query.get('month')));
    if (state === 'stale') value.circle.last_live_update = '2026-09-05T14:59:59Z';
    if (state === 'fallback' || state === 'missing') value.circle.last_live_update = 'invalid';
    if (state === 'fallback') {
      value.yesterday_fans_to_lower_tier = 600000; value.yesterday_fans_to_next_tier = 200000;
    }
    if (state === 'missing') {
      value.circle.last_updated = 'invalid'; value.members.forEach(member => member.last_updated = 'invalid');
      value.club_rank = 11; value.fans_to_lower_tier = 0; value.fans_to_next_tier = 0;
      value.yesterday_fans_to_lower_tier = 0; value.yesterday_fans_to_next_tier = null;
    }
    if (state === 'no-tiers') {
      value.fans_to_lower_tier = null; value.fans_to_next_tier = undefined;
      value.yesterday_fans_to_lower_tier = undefined; value.yesterday_fans_to_next_tier = undefined;
    }
    return route.fulfill({ json: value });
  });
  const info = page.locator('.info-card');
  await page.goto('/circles/7?year=2026&month=9');
  await expect(info).toContainText('Live Points');
  await expect(info.locator('.live-row')).toContainText('1,100,000');
  await expect(info.locator('.updated-row')).toContainText('5m ago');
  await expect(info.locator('.lower .tier-delta')).toHaveText('+100K');
  await expect(info.locator('.lower .tier-delta')).toHaveAttribute('title', '+100,000');
  await expect(info.locator('.upper .tier-delta')).toHaveText('-50K');
  await expect(info.locator('.tier-delta.positive')).toHaveCount(2);
  await expect(info.getByRole('link', { name: 'discord.gg/parity' })).toHaveAttribute('href', 'https://discord.gg/parity');
  await expect(info.locator('img[alt="Lower Tier"]')).toHaveAttribute('src', /circle_rank_04.webp$/);
  await expect(info.locator('img[alt="Next Tier"]')).toHaveAttribute('src', /circle_rank_06.webp$/);
  await info.screenshot({ path: testInfo.outputPath('club-information.png') });
  await expect(page.getByRole('region', { name: 'Club members', exact: true })).toBeVisible();
  await expect(page.locator('.club-chart')).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    const expectedFill = theme === 'light' ? 'rgb(71, 85, 105)' : 'rgb(255, 255, 255)';
    for (const chart of [page.locator('.club-chart'), page.locator('.member-progression .chart-area')]) {
      await chart.scrollIntoViewIfNeeded();
      await expect(chart.locator('svg text').first()).toHaveCSS('fill', expectedFill);
    }
  }
  for (const width of [320, 390, 768, 1024, 1536]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.overview-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width <= 900 ? 1 : 2);
  }
  await page.goto('/circles/7?year=2026&month=8');
  await expect(info.locator('.updated-row')).toContainText('1m ago');
  await expect(info).toContainText('700,000');
  await expect(info.locator('.rank-label')).toHaveText('Rank #18');
  state = 'stale'; await page.goto('/circles/7?year=2026&month=9');
  await expect(info.locator('.live-row')).toHaveCount(0);
  await expect(info.locator('.updated-row')).toContainText('21h ago');
  state = 'fallback'; await page.reload();
  await expect(info.locator('.updated-row')).toContainText('1m ago');
  await expect(info.locator('.tier-delta.negative')).toHaveCount(2);
  state = 'missing'; await page.reload();
  await expect(info).toBeVisible();
  await expect(info.locator('.updated-row, .live-row, .upper')).toHaveCount(0);
  await expect(info.locator('.lower .tier-gap-value')).toHaveText('0');
  await expect(info.locator('.tier-delta')).toHaveText('0');
  await expect(info.locator('.tier-delta.positive, .tier-delta.negative')).toHaveCount(0);
  state = 'no-tiers'; await page.reload();
  await expect(info.locator('.rank-label')).toHaveText('Rank #12');
  await expect(info.locator('.tier-side, .tier-delta')).toHaveCount(0);
});

test('Club details keeps cached expiry, populated refreshes, retry recovery and month isolation', async ({ page }) => {
  await page.clock.install({ time: '2026-09-06T12:00:00Z' });
  await page.clock.pauseAt('2026-09-06T12:01:00Z');
  await mockCommunity(page);
  let requests = 0, fail = false, release = () => {};
  let gate = Promise.resolve();
  await page.route('**/api/v4/circles?*', async route => {
    requests++;
    const query = new URL(route.request().url()).searchParams;
    const value = clubDetailsFixture(Number(query.get('year')), Number(query.get('month')));
    await gate;
    if (fail) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    return route.fulfill({ json: value });
  });
  await page.goto('/circles/7');
  await expect(page.getByRole('region', { name: 'Club Information', exact: true })).toBeVisible();
  await page.clock.fastForward(120000);
  await expect(page.locator('.live-status')).toContainText('3:00');
  await page.getByRole('link', { name: 'Back to clubs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Club Leaderboard' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.live-status')).toContainText('3:00');
  expect(requests).toBe(1);
  gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.getByRole('button', { name: 'Update now', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('.live-status')).toContainText('Updating…');
    await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeDisabled();
    await expect(page.locator('.info-card')).toContainText('1,000,000');
    await expect(page.locator('.loading')).toHaveCount(0);
    fail = true; release();
    const error = page.locator('.banner').filter({ hasText: 'Club details unavailable' });
    await expect(error).toBeVisible();
    await expect(error.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
    expect(requests).toBe(3);
    await page.clock.fastForward(360000); expect(requests).toBe(3);
    fail = false; await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect(page.locator('.live-status')).toContainText('5:00');
    await page.clock.fastForward(300000); await expect.poll(() => requests).toBe(5);
    await expect(page.locator('.live-status')).toContainText('5:00');
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await expect(page.locator('.info-card')).toContainText('700,000');
    await expect(page.locator('.live-refresh-bar')).toHaveCount(0);
    const settled = requests;
    await page.clock.fastForward(360000); expect(requests).toBe(settled);
    fail = true; await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await expect(error).toBeVisible();
    await expect(page.locator('.info-card')).toHaveCount(0);
    fail = false; await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Club Information', exact: true })).toBeVisible();
  } finally { release(); }
});
