import { test, expect } from './fixtures/test';
import {
  mockDatabase,
  mockAffinity,
  mockVeteranProfile,
  mockTimeline,
  profile,
  veteran,
  record
} from './fixtures/api';

test('Find reaches unmounted Database cards, wraps matches, and updates after pagination', async ({
  page,
  isMobile
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.addInitScript(() => localStorage.setItem('db-list-mode', 'paginated'));
  const requests: number[] = [];
  await page.route('**/search/query?*', (route) => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    requests.push(current);
    return route.fulfill({
      json: {
        items: Array.from({ length: current ? 1 : 600 }, (_, index) => {
          const item = record(String(123456789012 + index));
          item.inheritance.inheritance_id = index + 1;
          item.trainer_name = current
            ? 'Different page'
            : (index === 10 || index === 599 ? 'Needle Trainer ' : 'Trainer ') + index;
          return item;
        }),
        total: 601,
        page: current,
        limit: 600,
        total_pages: 2
      }
    });
  });

  await page.goto('/database?page=1');
  await expect(page.locator('.inheritance-card').first()).toBeVisible();
  if (isMobile)
    await page
      .locator('.site-footer')
      .getByRole('button', { name: 'Find loaded results', exact: true })
      .click();
  else await page.keyboard.press('Control+f');
  const bar = page.getByRole('search', { name: 'Find loaded results' });
  const input = bar.getByRole('searchbox', { name: 'Find in loaded results' });
  await expect(input).toBeFocused();
  await input.fill('needle trainer');
  await expect(bar.getByRole('status')).toHaveText('1 / 2');
  await expect(page.locator('[data-find-current]')).toContainText('Needle Trainer 10');
  await expect(page.locator('[data-find-current]')).toBeInViewport();
  await input.press('Enter');
  await expect(bar.getByRole('status')).toHaveText('2 / 2');
  await expect(page.locator('[data-find-current]')).toContainText('Needle Trainer 599');
  await expect(page.locator('[data-find-current]')).toBeInViewport();
  expect(await page.locator('.inheritance-card').count()).toBeLessThan(25);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(CSS.highlights.get('loaded-result-find') ?? [], (range) => range.toString())
      )
    )
    .toEqual(['Needle Trainer']);
  expect(
    await page.evaluate(() =>
      Array.from(CSS.highlights.get('loaded-result-find') ?? []).every((range) =>
        document.querySelector('[data-find-current]')?.contains(range.startContainer)
      )
    )
  ).toBe(true);
  expect(requests).toEqual([0]);
  await bar.screenshot({ path: test.info().outputPath('find-bar.png') });
  await page
    .locator('[data-find-current]')
    .screenshot({ path: test.info().outputPath('highlighted-result.png') });

  const bounds = (await bar.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await input.press('Enter');
  await expect(bar.getByRole('status')).toHaveText('1 / 2');
  await input.press('Shift+Enter');
  await expect(bar.getByRole('status')).toHaveText('2 / 2');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(bar.getByRole('status')).toHaveText('No matches');
  await expect(page.locator('[data-find-current]')).toHaveCount(0);
  expect(await page.evaluate(() => CSS.highlights.has('loaded-result-find'))).toBe(false);
  await input.fill('Different page');
  await expect(bar.getByRole('status')).toHaveText('1 / 1');
  await expect(page.locator('[data-find-current]')).toContainText('Different page');
  await input.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('[data-find-current]')).toHaveCount(0);
  expect(await page.evaluate(() => CSS.highlights.has('loaded-result-find'))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('uma-virtual-scrolling'))).not.toBe(
    'false'
  );
  await page.keyboard.press('Meta+f');
  await expect(input).toBeFocused();
  await bar.getByRole('button', { name: 'Close find', exact: true }).click();
});

test('Find highlights spark text through card updates without adding DOM wrappers', async ({
  page
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.addInitScript(() => localStorage.setItem('db-list-mode', 'paginated'));
  await page.goto('/database');
  await expect(page.locator('.inheritance-card').first()).toBeVisible();
  const nodes = await page.locator('.inheritance-card').first().locator('*').count();
  await page.keyboard.press('Control+f');
  const input = page.getByRole('searchbox', { name: 'Find in loaded results' });
  const highlighted = () =>
    page.evaluate(() =>
      Array.from(CSS.highlights.get('loaded-result-find') ?? [], (range) => range.toString())
    );

  await input.fill('right-handed');
  await expect.poll(highlighted).toEqual(['Right-Handed']);
  const card = page.locator('[data-find-current] .inheritance-card');
  expect(await card.locator('*').count()).toBe(nodes);
  const section = card
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Normal whites' }) });

  await section.locator('summary').click();
  await expect(section).not.toHaveAttribute('open');
  await section.locator('summary').click();
  await expect(section).toHaveAttribute('open');
  await expect.poll(highlighted).toEqual(['Right-Handed']);
  await card.getByRole('button', { name: '★ Stars', exact: true }).click();
  await expect.poll(highlighted).toEqual(['Right-Handed']);
  await input.fill('speed');
  await expect.poll(highlighted).toEqual(['Speed']);
  await input.fill('');
  await expect.poll(highlighted).toEqual([]);
});

test('Find searches resolved Veterans names and Profile history without mounting every result', async ({
  page
}) => {
  await mockVeteranProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans: Array.from({ length: 600 }, (_, index) => ({
          ...veteran,
          id: index + 1,
          trained_chara_id: index + 1
        })),
        circle_history: Array.from({ length: 600 }, (_, index) => ({
          ...profile.circle_history[0],
          circle_id: index + 1,
          circle_name: 'History Club ' + index
        }))
      }
    })
  );

  await page.goto('/veterans/123456789012');
  await expect(page.locator('.veteran-card').first()).toBeVisible();
  const name = (await page.locator('.veteran-card').first().getAttribute('aria-label'))!.replace(
    / veteran$/,
    ''
  );

  await page.keyboard.press('Control+f');
  const input = page.getByRole('searchbox', { name: 'Find in loaded results' });
  await input.fill(name.trim());
  await expect(
    page.getByRole('search', { name: 'Find loaded results' }).getByRole('status')
  ).toHaveText('1 / 600');

  await input.fill('600');
  await expect(page.locator('[data-find-current]')).toHaveAttribute('data-virtual-index', '599');
  await expect(page.locator('[data-find-current]')).toBeInViewport();
  expect(await page.locator('.veteran-card').count()).toBeLessThan(50);
  await page.goto('/profile/123456789012');
  await expect(page.getByRole('table', { name: 'Circle History', exact: true })).toBeAttached();
  await expect(page.getByRole('search', { name: 'Find loaded results' })).toHaveCount(0);
  await page.keyboard.press('Control+f');
  await input.fill('History Club 599');
  await expect(page.locator('[data-find-current]')).toContainText('History Club 599');
  await expect(page.locator('[data-find-current]')).toBeInViewport();
  expect(
    await page
      .getByRole('table', { name: 'Circle History', exact: true })
      .locator('[data-virtual-index]')
      .count()
  ).toBeLessThan(100);
});

test('Find leaves native shortcuts available on pages without loaded collections', async ({
  page
}) => {
  await mockDatabase(page);
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Sign in to uma.moe', exact: true })
  ).toBeVisible();

  const cancelled = await page.evaluate(
    () =>
      !window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
      )
  );

  expect(cancelled).toBe(false);
  await expect(page.getByRole('search', { name: 'Find loaded results' })).toHaveCount(0);
});

test('Find keeps the selected match when infinite scrolling appends more results', async ({
  page
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.addInitScript(() => localStorage.setItem('db-list-mode', 'infinite'));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/search/query?*', async (route) => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    if (current) await pending;
    await route.fulfill({
      json: {
        items: Array.from({ length: 30 }, (_, offset) => {
          const index = current * 30 + offset,
            item = record(String(123456789012 + index));

          item.inheritance.inheritance_id = index + 1;
          item.trainer_name = ([0, 29, 45].includes(index) ? 'Needle ' : 'Trainer ') + index;
          return item;
        }),
        total: 60,
        page: current,
        limit: 30,
        total_pages: 2
      }
    });
  });

  try {
    await page.goto('/database');
    await expect(page.locator('.inheritance-card').first()).toBeVisible();
    await page.keyboard.press('Control+f');
    const bar = page.getByRole('search', { name: 'Find loaded results' });
    await bar.getByRole('searchbox').fill('Needle');
    await expect(bar.getByRole('status')).toHaveText('1 / 2');
    await bar.getByRole('button', { name: 'Next match', exact: true }).click();
    await expect(page.locator('[data-find-current]')).toContainText('Needle 29');
    release();
    await expect(bar.getByRole('status')).toHaveText('2 / 3');
    await expect(page.locator('[data-find-current]')).toContainText('Needle 29');
    await expect(page.locator('[data-find-current]')).toBeInViewport();
    expect(await page.locator('.inheritance-card').count()).toBeLessThan(25);
  } finally {
    release();
  }
});

test('Find reveals distant Timeline events in each layout and dense horizontal lanes', async ({
  page,
  isMobile
}) => {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', (route) =>
    route.fulfill({
      json: {
        events: Array.from({ length: 240 }, (_, index) => ({
          id: 'find-' + index,
          type: 'character_banner',
          title: 'Find banner ' + index,
          global_release_date:
            index < 120 ? '2026-09-01T00:00:00Z' : new Date(Date.UTC(2026, 8, index)).toISOString(),
          is_confirmed: true
        }))
      }
    })
  );

  await page.goto('/timeline');
  await expect(page.locator('.event-card').first()).toBeVisible();
  for (const direction of isMobile ? ['Mobile'] : ['Horizontal', 'Vertical']) {
    if (!isMobile) await page.getByRole('radio', { name: direction, exact: true }).click();
    await page.keyboard.press('Control+f');
    const input = page.getByRole('searchbox', { name: 'Find in loaded results' });
    await input.fill('Find banner 239');
    await expect(page.locator('[data-find-current]')).toHaveAttribute('data-event-id', 'find-239');
    await expect(page.locator('[data-find-current]')).toBeInViewport();
    expect(await page.locator('.event-card').count()).toBeLessThan(140);
    if (direction === 'Horizontal') {
      await input.fill('Find banner 119');
      await expect(page.locator('[data-find-current]')).toHaveAttribute(
        'data-event-id',
        'find-119'
      );
      await expect(page.locator('[data-find-current]')).toBeInViewport();
      expect(await page.locator('.event-card').count()).toBeLessThan(30);
    }

    await input.press('Escape');
  }
});
