import { test, expect, type Page } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { completion } from '../performance/completion';

async function sectionLink(page: Page, name: string) {
  const mobile = await page.getByRole('button', { name:'Open navigation', exact:true }).isVisible();
  if (mobile) await page.getByRole('button', { name:'Open navigation', exact:true }).click();
  const navigation = page.getByRole('navigation', { name:mobile ? 'Mobile navigation' : 'Main navigation', exact:true });
  const toggle = navigation.getByRole('button', { name:new RegExp(`^(Open|Collapse) ${name} subsections$`) });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  return navigation.getByRole('link', { name, exact:true });
}

test('Navigation paints usable Timeline controls before cold content code or data loads', async ({ page }, info) => {
  await mockTimeline(page, false);
  const releases: (() => void)[] = [];
  async function hold(pattern: string | RegExp) {
    let release!: () => void;
    const pending = new Promise<void>(resolve => release = resolve);
    releases.push(release);
    await page.route(pattern, async route => { await pending; await route.fallback(); });
    return release;
  }
  const timelineCode = await hold(/\/TimelineContent(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/);
  const timelineData = await hold('**/resources/test/banner_timeline.json*');
  const rewardData = await hold('**/resources/test/planner_rewards.json*');
  const plannerCode = await hold(/\/CaratPlanner(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/);
  const plannerData = await hold('**/resources/test/planner_core.json*');
  const detailsCode = await hold(/\/TimelineEventDetails(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/);
  let plannerRequested = false, detailsRequested = false;
  page.on('request', request => {
    if (/\/CaratPlanner(?:-|\.svelte)/.test(request.url())) plannerRequested = true;
    if (/\/TimelineEventDetails(?:-|\.svelte)/.test(request.url())) detailsRequested = true;
  });
  try {
    await page.goto('/tools');
    const link = await sectionLink(page, 'Timeline');
    const frameTiming = await completion(page, 'Timeline frame with content code held',
      () => link.evaluate((link: HTMLAnchorElement) => link.click()),
      { selector: '.timeline-tabs', pathname: '/timeline' });
    await info.attach('timeline-frame-timing', { body: JSON.stringify(frameTiming), contentType: 'application/json' });
    console.info(`Timeline frame (${process.env.PERF_CPU ?? '1'}x CPU): ${frameTiming.ms} ms`);
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByRole('navigation', { name: 'Timeline tools' })).toBeVisible();
    await expect(page.locator('[data-route-id="tools"]')).toHaveCount(0);
    const filters = page.getByRole('button', { name: /^(Filters|Search & filters)(\s*\(\d+\))?$/ });
    await filters.click();
    await expect(page.getByRole('checkbox', { name: 'Characters', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Characters', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(page.locator('.timeline-board')).toHaveCount(0);
    await expect(page.locator('.route-loading')).toHaveCount(0);
    timelineCode();
    await expect(page.locator('.spinner').filter({ hasText: 'Loading Timeline data' })).toBeVisible();
    await expect(page.locator('.route-loading')).toHaveCount(0);
    await expect(page.locator('.utility-actions .spinner')).toHaveCount(0);
    timelineData();
    await expect(page.locator('.timeline-board')).toBeVisible();
    await filters.click();
    await expect(page.getByRole('checkbox', { name: 'Characters', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Characters', exact: true }).check();
    await page.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(page.locator('.timeline-tabs .spinner')).toHaveText('Loading event rewards');
    rewardData();
    await expect(page.locator('.timeline-tabs .spinner')).toHaveCount(0);
    expect(plannerRequested).toBe(false);
    expect(detailsRequested).toBe(false);
    await page.getByRole('link', { name: /Carat Planner/ }).evaluate((link: HTMLAnchorElement) => link.click());
    await expect(page.locator('.spinner').filter({ hasText: 'Loading Carat Planner' })).toBeVisible();
    plannerCode();
    await expect(page.locator('.planner .spinner').filter({ hasText: 'Loading planner data' })).toBeVisible();
    plannerData();
    await expect(page.locator('.planner .spinner').filter({ hasText: 'Loading planner data' })).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Timeline tools' }).getByRole('link', { name: 'Timeline', exact: true }).click();
    await page.getByRole('button', { name: 'Open details for Mejiro McQueen Pickup', exact: true }).click();
    await expect(page.locator('.spinner').filter({ hasText: 'Loading event details' })).toBeVisible();
    detailsCode();
    await expect(page.getByRole('dialog', { name: 'Mejiro McQueen Pickup', exact: true })).toBeVisible();
  } finally { releases.forEach(release => release()); }
});

for (const eventCount of [5, 1000]) test(`Preloaded Timeline transitions paint within 100 ms with ${eventCount} events`, async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'Measured at the reported desktop resolution. Mobile loading is covered above.');
  await mockTimeline(page, false);
  if (eventCount > 5) {
    const events = Array.from({ length: eventCount }, (_, index) => ({
      id: `performance-${index}`, type: 'character_banner', title: `Release ${index}`,
      global_release_date: new Date(Date.UTC(2026, 2, 1 + index)).toISOString(), is_confirmed: true
    }));
    await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tools');
  const prepared = page.waitForResponse(response => response.url().includes('/banner_timeline.json'));
  await (await sectionLink(page, 'Timeline')).hover();
  await prepared;
  await expect(page.locator('.utility-actions .spinner')).toHaveCount(0);
  const durations: number[] = [];
  for (let visit = 0; visit < 5; visit++) {
    await sectionLink(page, 'Timeline');
    durations.push((await completion(page, `Preloaded Timeline ${eventCount} events, visit ${visit + 1}`,
      async () => (await sectionLink(page, 'Timeline')).click(), { selector: '.timeline-board .event-card' })).ms);
    await (await sectionLink(page, 'Tools')).click();
    await expect(page.locator('[data-route-id="tools"]')).toBeVisible();
  }
  await testInfo.attach('click-to-painted-timeline-ms', { body: JSON.stringify(durations), contentType: 'application/json' });
  await testInfo.attach('interaction-metrics', { body: JSON.stringify(await page.evaluate(() => (window as any).__stress)), contentType: 'application/json' });
  console.info('Click to painted Timeline (ms):', durations.map(duration => Math.round(duration)));
  if (!process.env.PERF_AUDIT) expect(Math.max(...durations), `Click to painted Timeline: ${durations.join(', ')} ms`).toBeLessThan(100);
});
