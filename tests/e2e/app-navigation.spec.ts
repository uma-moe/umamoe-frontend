import { test, expect } from './fixtures/test';
import { mockStatistics, mockTimeline } from './fixtures/api';

test('resizing skips closed navigation popovers and closes an open menu once', async ({ page }) => {
  await page.addInitScript(() => {
    const hide = HTMLElement.prototype.hidePopover;
    HTMLElement.prototype.hidePopover = function () {
      if (!this.matches(':popover-open')) throw new DOMException('Popover already closed', 'InvalidStateError');
      return hide.call(this);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools');
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new Event('resize')); });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new Event('resize')); });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-error')).toBeHidden();
});

test('Tools and Timeline subsections navigate and track the active page in both sidebar sizes', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'Mobile navigation is exercised below.');
  await mockStatistics(page); await mockTimeline(page, false);
  for (const width of [1920, 1536]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/tools');
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await expect(nav.getByRole('link', { name: 'Database', exact: true })).toHaveAccessibleDescription('Updated');
    await expect(nav.getByRole('link', { name: 'Veterans', exact: true })).not.toHaveAccessibleDescription('Updated');
    const tools = nav.getByRole('button', { name: /(?:Open|Collapse) Tools subsections/ });
    await expect(tools).toHaveAccessibleDescription('Updated');
    const indicator = tools.locator('.navigation-badge');
    if (width === 1920) await expect(indicator).toBeVisible();
    else {
      await expect(indicator).toBeHidden();
      expect(await tools.evaluate(node => getComputedStyle(node, '::after').width)).toBe('6px');
    }
    const wasOpen = width === 1920;
    await expect(tools).toHaveAttribute('aria-expanded', String(wasOpen));
    if (width === 1920) await tools.locator('.navigation-label').click();
    else await tools.click();
    await expect(tools).toHaveAttribute('aria-expanded', String(!wasOpen));
    await expect(page).toHaveURL(/\/tools$/);
    await tools.press('Space');
    await expect(tools).toHaveAttribute('aria-expanded', String(wasOpen));
    const expand = async (name: string) => {
      const button = nav.getByRole('button', { name: new RegExp(`(?:Open|Collapse) ${name} subsections`) });
      if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    };
    await expand('Tools');
    await expect(nav.getByRole('link', { name: 'Carat Planner', exact: true })).toHaveAccessibleDescription('Updated');
    await expect(nav.getByRole('link', { name: 'Lineage Planner', exact: true })).toHaveAccessibleDescription('Updated');
    await nav.getByRole('link', { name: 'Statistics', exact: true }).click();
    await expect(page.locator('[data-route-id="statistics"]')).toBeVisible();
    await expand('Tools');
    await expect(nav.getByRole('link', { name: 'Statistics', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`) });
    await nav.getByRole('link', { name: 'Carat Planner', exact: true }).click();
    await expect(page.locator('.planner')).toBeVisible();
    await expand('Timeline');
    await expect(nav.getByRole('link', { name: 'Carat Planner', exact: true })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page.locator('.timeline-board')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.planner')).toBeVisible();
    await expand('Timeline');
    await expect(nav.getByRole('link', { name: 'Carat Planner', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1920) {
      const brand = page.locator('.rail-brand'), rail = page.locator('.side-rail');
      expect((await brand.boundingBox())!.x).toBe((await rail.boundingBox())!.x);
      expect((await brand.boundingBox())!.width).toBeCloseTo((await rail.boundingBox())!.width - 1, 0);
      expect(await brand.locator('strong').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(20);
    }
  }
});

test('Mobile header stays visible and its menu supports subsections, dismissal and navigation', async ({ page }, testInfo) => {
  await mockTimeline(page, false);
  for (const width of [320, 390, 767]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tools');
    await expect(page.locator('[data-route-id="tools"]')).toBeVisible();
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const header = page.locator('[data-shell-utility]'), button = page.locator('.menu-toggle');
    await expect(button).toBeInViewport();
    await expect.poll(async () => (await header.boundingBox())!.y).toBeCloseTo(0, 0);
    await expect(page.locator('[data-shell-bottom]')).toHaveCount(0);
    await button.click();
    const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.locator('.navigation-link')).toHaveCount(8);
    await expect(nav.getByRole('link', { name: 'Database', exact: true }).locator('.navigation-badge')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Carat Planner', exact: true }).locator('.navigation-badge')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lineage Planner', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lineage Planner', exact: true }).locator('.navigation-badge')).toBeVisible();
    const menuBox = (await page.locator('#app-mobile-navigation').boundingBox())!, headerBox = (await header.boundingBox())!;
    expect(menuBox.y).toBeCloseTo(headerBox.y + headerBox.height, 0);
    await page.screenshot({ path: testInfo.outputPath(`navigation-mobile-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(nav).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await nav.getByRole('link', { name: 'Carat Planner', exact: true }).click();
    await expect(page.locator('.planner')).toBeVisible();
    await expect(nav).toHaveCount(0);
    await button.click();
    await expect(nav.getByRole('link', { name: 'Carat Planner', exact: true })).toHaveAttribute('aria-current', 'page');
    await button.click();
    await expect(nav).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
