import { expect, test } from './fixtures/test';
import { mockDatabase, record } from './fixtures/api';

test.use({ locale: 'en-US' });

test('database pagination shows nearby pages, result ranges and direct page navigation', async ({ page, isMobile }) => {
  await mockDatabase(page);
  await page.route('**/search/query?*', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    const item = record(); item.trainer_name = `Page ${current + 1} Trainer`;
    return route.fulfill({ json: { items: [item], total: 10000, page: current, limit: 12, total_pages: 834 } });
  });
  await page.goto('/database?page=2');
  const pagination = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await expect(pagination).toContainText('13–24 of 10,000 results');
  if (!isMobile) {
    await expect(pagination.getByRole('button', { name: 'Page 3', exact: true })).toBeVisible();
    await expect(pagination.getByRole('button', { name: 'Page 5', exact: true })).toBeVisible();
  }
  const jump = pagination.getByRole('spinbutton', { name: 'Go to page' });
  const jumpToggle = pagination.getByRole('button', { name: 'Jump to page', exact: true });
  await expect(jump).toBeHidden();
  await jumpToggle.click();
  await expect(jump).toBeFocused();
  await jump.fill('417'); await jump.press('Enter');
  await expect(page.locator('.inheritance-card')).toContainText('Page 417 Trainer');
  await expect(pagination).toContainText('4,993–5,004 of 10,000 results');
  await pagination.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=418/);
  await pagination.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page).toHaveURL(/page=417/);
  await jumpToggle.click();
  await jump.fill('834'); await pagination.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(pagination).toContainText('9,997–10,000 of 10,000 results');
  await expect(pagination.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await jumpToggle.click();
  await jump.fill('835'); await jump.press('Enter');
  expect(await jump.evaluate(element => (element as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await expect(page).toHaveURL(/page=834/);
  await jump.press('Escape');
  await expect(jump).toBeHidden();
  await expect(jumpToggle).toBeFocused();
  await pagination.screenshot({ path: test.info().outputPath('database-pagination.png') });
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(pagination.getByText('Page 834')).toBeVisible();
  await pagination.screenshot({ path: test.info().outputPath('database-pagination-320.png') });
  await jumpToggle.click();
  await expect(jump).toBeVisible();
  expect(await pagination.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await jump.fill('2'); await jump.press('Enter');
  await expect(page).toHaveURL(/page=2/);
  await expect(jump).toBeHidden();
});

test('database pagination keeps small result sets in one centered control', async ({ page }) => {
  await mockDatabase(page);
  await page.route('**/search/query?*', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ json: { items: [record()], total: 25, page: current, limit: 12, total_pages: 3 } });
  });
  await page.goto('/database?page=1');
  const pagination = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await expect(pagination).toContainText('1–12 of 25 results');
  await expect(pagination.getByRole('button', { name: 'Jump to page', exact: true })).toHaveCount(0);
  await expect(pagination.getByRole('spinbutton')).toHaveCount(0);
  await pagination.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(pagination).toContainText('13–24 of 25 results');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await pagination.boundingBox();
    const current = await pagination.getByRole('button', { name: 'Page 2', exact: true }).boundingBox();
    expect(Math.abs(current!.x + current!.width / 2 - (bounds!.x + bounds!.width / 2))).toBeLessThan(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pagination.screenshot({ path: test.info().outputPath(`database-pagination-small-${width}.png`) });
  }
});

test('database follows publisher viewport breakpoints with a scrollbar and registers only visible placements', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 1699, height: 900 });
  await mockDatabase(page);
  await page.route('**/search/query?*', route => route.fulfill({ json: {
    items: Array.from({ length: 12 }, (_, index) => { const item = record(String(123456789012 + index)); item.inheritance.inheritance_id = index + 1; return item; }),
    total: 12, page: 0, limit: 12, total_pages: 1
  } }));
  await page.route('https://cdn.fuseplatform.net/**/fuse.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.adRegistrations = [];
    window.adDestroyed = [];
    window.adPages = [];
    window.fusetag = { registerZone(id) {
      const element = document.getElementById(id);
      window.adRegistrations.push({ id, fuse: element.dataset.fuse, width: element.getBoundingClientRect().width });
      const rail = element.dataset.fuse.includes('sticky_vrec');
      // Tag 4302 has no rail sizes below xl; don't let this mock hide that mismatch.
      if (rail && innerWidth < 1700) return;
      element.innerHTML = rail ? '<div style="height:600px;width:160px">Rail advertisement</div>' : '<div style="height:250px;width:300px">Test advertisement</div>';
    }, pageInit() { window.adPages.push(location.pathname); }, destroyZone(id) { window.adDestroyed.push(id); } };
  ` }));
  await page.goto('/database');
  await page.addStyleTag({ content: 'html{overflow-y:scroll;scrollbar-gutter:stable}::-webkit-scrollbar{width:15px}' });
  if (!isMobile) expect((await page.locator('[data-app-shell]').boundingBox())!.width).toBeLessThan(1699);
  const inline = page.locator('[data-ad-kind="inline"]');
  const top = page.locator('[data-ad-kind="leaderboard"]');
  const right = page.locator('[data-ad-position="right-rail"]');
  await expect(inline).toHaveCount(1);
  await expect(top).toBeVisible();
  expect((await top.boundingBox())!.height).toBe(90);
  expect((await inline.boundingBox())!.height).toBeGreaterThanOrEqual(250);
  await expect(inline.first()).toBeVisible(); await expect(right).toBeHidden();
  await expect(page.locator('[data-ad-target="database_content_top"]')).toHaveAttribute('data-fuse', 'database_header');
  await expect(page.locator('[data-ad-target="database_interscroller_2"]')).toHaveAttribute('data-fuse', 'database_incontent_2');
  await expect.poll(() => page.evaluate(() => (window as unknown as { adRegistrations: Array<{ id: string }> }).adRegistrations?.map(item => item.id))).toEqual(['ad-database_content_top', 'ad-database_interscroller_2']);
  const middle = page.locator('.inheritance-list [data-ad-kind="inline"]');
  expect(await middle.evaluate(element => [...element.parentElement!.children].slice(0, [...element.parentElement!.children].indexOf(element)).filter(sibling => sibling.matches('.inheritance-card')).length)).toBe(6);
  for (const width of [1700, 1714, 1715, 1799, 1800, 1815, 2199, 2200, 2214, 2215, 2560, 1699, 1536, 1301, 390, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    if (width >= 1700) {
      await expect(right).toBeVisible(); await expect(inline.first()).toBeHidden(); await expect(top).toBeHidden();
      await expect(right.getByText('Rail advertisement')).toBeVisible();
      expect(await right.locator('[data-ad-target]').evaluate(element => [getComputedStyle(element).maxWidth, getComputedStyle(element).maxHeight])).toEqual(['160px', '600px']);
      await expect.poll(() => page.evaluate(() => (window as unknown as { adRegistrations: Array<{ id: string }> }).adRegistrations.some(item => item.id === 'ad-database_sticky_vrec_right'))).toBe(true);
    } else { await expect(right).toBeHidden(); await expect(inline.first()).toBeVisible(); await expect(top).toBeVisible(); expect((await top.boundingBox())!.height).toBe(width < 768 ? 50 : 90); }
    if (width >= 2200) {
      const left = page.locator('[data-ad-position="left-rail"]');
      await expect(left.getByText('Rail advertisement')).toBeVisible();
      expect(await left.locator('[data-ad-target]').evaluate(element => [getComputedStyle(element).maxWidth, getComputedStyle(element).maxHeight])).toEqual(['160px', '600px']);
    } else await expect(page.locator('[data-ad-position="left-rail"]')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const registrations = await page.evaluate(() => (window as unknown as { adRegistrations: Array<{ width: number }> }).adRegistrations);
  expect(registrations.every(item => item.width > 0)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { adPages: string[] }).adPages)).toEqual(['/database']);
  expect(await page.evaluate(() => (window as unknown as { adDestroyed: string[] }).adDestroyed)).toEqual(expect.arrayContaining(['ad-database_content_top', 'ad-database_interscroller_2', 'ad-database_sticky_vrec_right']));
});

test('Fuse starts in the document head once and respects advertising opt-outs before startup', async ({ page }) => {
  let requests = 0;
  await page.route('https://cdn.fuseplatform.net/**/fuse.js', route => { requests++; return route.fulfill({ contentType: 'application/javascript', body: 'window.fusetag = { que: [], registerZone() {}, destroyZone() {}, pageInit() {} };' }); });
  const response = await page.goto('/tools');
  const html = await response!.text();
  expect(html.indexOf('publift-fuse-js')).toBeGreaterThan(0);
  expect(html.indexOf('publift-fuse-js')).toBeLessThan(html.indexOf('type="module"'));
  await expect(page.locator('head #publift-fuse-js')).toHaveCount(1);
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => localStorage.setItem('cookie-consent', JSON.stringify({ advertising: false })));
  await page.reload();
  await expect(page.locator('[data-app-shell]')).toBeVisible();
  await expect(page.locator('#publift-fuse-js')).toHaveCount(0);
  expect(requests).toBe(1);
});
