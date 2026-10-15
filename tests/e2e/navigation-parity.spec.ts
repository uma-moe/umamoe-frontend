import { expect, test, type Page } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { createPlan } from '../../src/lib/carat-planner/carat-planner';
import { encodeCompactPlannerShare } from '../../src/lib/carat-planner/planner-share-codec';

// Exercise the installed router's real link handler, including same-route URLs.
async function follow(page: Page, href: string) {
  await page.evaluate(href => {
    const anchor = document.createElement('a'); anchor.href = href;
    document.body.append(anchor); anchor.click(); anchor.remove();
  }, href);
  await expect(page).toHaveURL(new URL(href, page.url()).href);
}

test('a cancelled internal link does not bypass the component that cancelled navigation', async ({ page }) => {
  await mockTimeline(page); await page.goto('/timeline');
  const privacy = page.locator('a[href="/privacy-policy"]').first();
  await privacy.evaluate(anchor => anchor.addEventListener('click', event => event.preventDefault(), { once: true }));
  await privacy.click(); await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.locator('[data-route-id="timeline"]')).toBeVisible();
});

test('desktop modified and middle link clicks open a new page without replacing the current route', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'Desktop browser shortcut gestures; touch navigation is covered by the route workflows.');
  await mockTimeline(page); await page.goto('/timeline');
  const privacy = page.locator('a[href="/privacy-policy"]').first();
  for (const gesture of ['Control', 'Shift', 'middle'] as const) {
    const opened = context.waitForEvent('page', { timeout: 8_000 });
    await privacy.click(gesture === 'middle' ? { button: 'middle' } : { modifiers: [gesture] });
    const next = await opened;
    await expect(next).toHaveURL(/\/privacy-policy$/);
    await expect(page).toHaveURL(/\/timeline$/);
    await next.close();
  }
});

test('Timeline link tabs preserve history, query-driven banners and same-route changes', async ({ page, isMobile }) => {
  await mockTimeline(page); await page.goto('/timeline?unrelated=keep#date');
  const navigation = page.getByRole('navigation', { name: 'Timeline tools', exact: true });
  const timeline = navigation.getByRole('link', { name: 'Timeline', exact: true });
  const planner = navigation.getByRole('link', { name: /^Carat Planner/ });
  await expect(timeline).toHaveAttribute('aria-current', 'page');
  await expect(timeline).toHaveAttribute('href', '/timeline?tab=timeline');
  await expect(planner).toHaveAttribute('href', '/timeline?tab=carat-planner');
  await expect(page).toHaveURL(/\/timeline\?unrelated=keep#date$/);
  const styling = await timeline.evaluate(element => { const style = getComputedStyle(element); return { fontSize: style.fontSize, fontWeight: style.fontWeight, borderRadius: style.borderRadius }; });
  expect(styling).toEqual({ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', borderRadius: '8px' });
  if (isMobile) expect((await planner.boundingBox())!.height).toBeGreaterThanOrEqual(30);
  else expect((await planner.boundingBox())!.height).toBe(34);
  await planner.focus(); await planner.press('Enter');
  await expect(planner).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/\/timeline\?tab=carat-planner$/);
  await expect(page.getByRole('region', { name: 'Planner controls and projection' })).toBeVisible();
  await page.goBack(); await expect(timeline).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/\/timeline\?unrelated=keep#date$/);
  await page.goForward(); await expect(planner).toHaveAttribute('aria-current', 'page');
  await follow(page, '/timeline?tab=carat-planner&banner=character-1');
  const target = page.locator('.target'); await expect(target).toHaveCount(1);
  await target.locator('.stepper input').fill('330'); await target.locator('.stepper input').blur();
  await target.getByRole('button', { name: 'Remove Mejiro McQueen Pickup' }).click();
  await expect(target).toHaveCount(0);
  await follow(page, '/timeline?tab=carat-planner&banner=character-1&unrelated=changed');
  await expect(target).toHaveCount(0); // The same requested banner is handled once per Planner mount.
  await timeline.click(); await expect(page).toHaveURL(/\/timeline\?tab=timeline$/);
  await follow(page, '/timeline?tab=carat-planner&banner=character-1');
  await expect(target).toHaveCount(1); await expect(target.locator('.stepper input')).toHaveValue('330');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Planner accepts Angular compact query links and gives a short share precedence over compact payloads', async ({ page }) => {
  await mockTimeline(page);
  const compact = await encodeCompactPlannerShare(createPlan('Compact query plan'));
  const cloud = createPlan('Short link plan');
  let shareRequests = 0;
  await page.route('**/api/carat-planner/shared/ABCD1234', route => { shareRequests++; return route.fulfill({ json: { plan: cloud, share_id: 'ABCD1234', plan_id: cloud.id, plan_name: cloud.name, updated_at: cloud.updatedAt } }); });
  await page.goto(`/timeline?tab=carat-planner&p=${encodeURIComponent(compact)}`);
  await expect(page.getByRole('textbox', { name: 'Plan name', exact: true })).toHaveValue('Compact query plan (shared)');
  const fragment = await encodeCompactPlannerShare(createPlan('Fragment plan'));
  await page.evaluate(fragment => { location.hash = `p=${fragment}`; }, fragment);
  await expect(page.getByRole('textbox', { name: 'Plan name', exact: true })).toHaveValue('Fragment plan (shared)');
  const ignored = await encodeCompactPlannerShare(createPlan('Must not import'));
  await follow(page, `/timeline?tab=carat-planner&share=ABCD1234#p=${ignored}`);
  await expect(page.getByRole('textbox', { name: 'Plan name', exact: true })).toHaveValue('Short link plan (shared)');
  expect(shareRequests).toBe(1);
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans.map((plan: { name: string }) => plan.name));
  expect(names).not.toContain('Must not import (shared)');
});

test('Timeline prefetches the cached planner manifest on intent without eagerly loading planner datasets', async ({ page }) => {
  await mockTimeline(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => release = resolve);
  await page.route('**/resources/test/banner_timeline.json*', async route => { await delayed; await route.fallback(); });
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  try {
    await page.goto('/timeline');
    const planner = page.getByRole('navigation', { name: 'Timeline tools' }).getByRole('link', { name: 'Carat Planner', exact: true });
    await expect(planner).toBeVisible();
    expect(requests).not.toContain('/resources/planner/manifest.json');
    await planner.focus();
    await expect.poll(() => requests.filter(path => path === '/resources/planner/manifest.json').length).toBe(1);
    await planner.hover(); await planner.blur(); await planner.focus();
    expect(requests.filter(path => path === '/resources/planner/manifest.json')).toHaveLength(1);
    expect(requests.filter(path => /planner_(?:core|income|gacha)/.test(path))).toEqual([]);
  } finally { release(); }
  await expect(page.locator('#timeline-event-character-1')).toBeAttached();
});
