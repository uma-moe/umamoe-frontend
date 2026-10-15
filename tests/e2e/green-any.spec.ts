import { expect, test } from './fixtures/test';
import { mockDatabase, mockAffinity } from './fixtures/api';

test('Any green clears on focus and empty edits return to Any', async ({ page }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  let lastQuery = new URLSearchParams();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/search/query')) lastQuery = url.searchParams;
  });

  await page.goto('/database');
  const filters = page.getByRole('button', { name: /Filters/ });
  if (!(await page.locator('[data-filter-group="inheritance"]').isVisible())) await filters.click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  for (const [group, editor] of [
    ['inheritance', 'green-factors'],
    ['main', 'main-green']
  ]) {
    const header = page.locator('[data-filter-group="' + group + '"] .group-title');
    if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
    const section = page.locator('#' + editor);
    await section.getByRole('button', { name: /Add Green Factor/ }).click();
    const input = section.getByRole('combobox');
    await expect(input).toHaveValue('Any');
    await input.click();
    await expect(input).toHaveValue('');
    await input.fill('zzzz-no-match');
    await input.fill('');
    await section.locator('.editor-header').click();
    await expect(input).toHaveValue('Any');
    await input.click();
    await expect(input).toHaveValue('');
    const option = section.getByRole('option').nth(1);
    const name = (await option.innerText()).trim();
    await input.fill(name);
    await section.getByRole('option').filter({ hasText: name }).first().click();
    await expect(input).toHaveValue(name);
    await input.fill('');
    await section.locator('.editor-header').click();
    await expect(input).toHaveValue('Any');
    await input.click();
    await expect(input).toHaveValue('');
    await input.press('Escape');
    await expect(input).toHaveValue('Any');
  }

  await expect.poll(() => lastQuery.get('green_sparks')).toBe('1,2,3');
  await expect.poll(() => lastQuery.get('main_parent_green_sparks')).toBe('1,2,3');
});
