import { expect, test } from './fixtures/test';
import { mockDatabase } from './fixtures/api';

test('mobile filters keep the result count visible and jump between filters and results', async ({
  page
}) => {
  await mockDatabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/database');
  await expect(page.locator('.results-info p')).toContainText('25 records found');
  const shortcut = page.locator('.floating-scroll-btn');
  await expect(shortcut).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('[data-filter-group="inheritance"] .group-title').click();
  await page.getByRole('button', { name: 'Add Blue Factor', exact: true }).click();
  await expect(shortcut).toHaveText('Results (25)');
  await expect(shortcut).toBeInViewport();

  let finishSearch!: () => void;
  const searchReady = new Promise<void>((resolve) => {
    finishSearch = resolve;
  });

  await page.route('**/search/query?*', async (route) => {
    await searchReady;
    await route.fulfill({ json: { items: [], total: 0, page: 0, limit: 12, total_pages: 0 } });
  });

  await page.locator('#blue-factors-factor-0').click();
  await page.getByRole('option', { name: 'Stamina', exact: true }).click();
  await expect(shortcut).toHaveText('Searching…');
  finishSearch();
  await expect(shortcut).toHaveText('Results (0)');
  await expect(shortcut).toBeInViewport();
  await shortcut.click();
  await expect(page.locator('.results-info p')).toBeInViewport();
  await expect(shortcut).toHaveText('Back to Top');
  await shortcut.click();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeInViewport();
  await expect(shortcut).toHaveText('Results (0)');
  await page.screenshot({ path: test.info().outputPath('mobile-result-shortcut.png') });

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(shortcut).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('factor AND/OR buttons stay inside their control with vertically centered labels', async ({
  page
}) => {
  await mockDatabase(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/database');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('[data-filter-group="inheritance"] .group-title').click();
  const add = page.getByRole('button', { name: 'Add Blue Factor', exact: true });
  await add.click();
  await add.click();
  const operators = page.getByRole('radiogroup', { name: 'Requirement operator', exact: true });
  for (const width of [320, 390, 620, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await operators.scrollIntoViewIfNeeded();
    for (const button of await operators.getByRole('radio').all()) {
      const dimensions = await button.evaluate((node) => {
        const control = node.parentElement!.getBoundingClientRect();
        const button = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        return {
          top: button.top - control.top,
          bottom: control.bottom - button.bottom,
          textOffset: text.top + text.height / 2 - control.top - control.height / 2
        };
      });

      expect(dimensions.top).toBeGreaterThanOrEqual(0);
      expect(dimensions.bottom).toBeGreaterThanOrEqual(0);
      expect(Math.abs(dimensions.textOffset)).toBeLessThanOrEqual(2);
    }
  }

  await operators.getByRole('radio', { name: 'OR', exact: true }).click();
  await expect(operators.getByRole('radio', { name: 'OR', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );
});
