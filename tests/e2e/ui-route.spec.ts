import { expect, test } from './fixtures/test';

test('hidden UI gallery loads directly with working artwork and keeps its legacy alias', async ({
  page
}) => {
  for (const path of ['/ui', '/ui-lab']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'UI components' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('[data-ui-lab-shell]')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.images]
            .filter(
              (image) =>
                image.getBoundingClientRect().width > 0 &&
                !image.closest('[hidden]') &&
                image.loading !== 'lazy'
            )
            .every((image) => image.complete && image.naturalWidth > 0)
        )
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth)
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'UI components' })).toBeVisible();
  }
});

test('the UI gallery stays out of product navigation and discovery metadata', async ({
  page,
  request
}) => {
  await page.goto('/tools');
  await expect(
    page.getByRole('heading', { name: 'Tools & Calculators', exact: true })
  ).toBeVisible();

  await expect(page.locator('a[href="/ui"], a[href="/ui-lab"]')).toHaveCount(0);
  for (const path of [
    '/sitemap.xml',
    '/meta/features.json',
    '/meta/navigation.json',
    '/llms.txt'
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toMatch(/(?:https:\/\/uma\.moe)?\/ui(?:-lab)?(?:["<\s]|$)/);
  }
});
