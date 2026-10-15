import { expect, test, setSliderValue } from './fixtures/test';
import { mockDatabase, mockAffinity } from './fixtures/api';

test('Database filters split on small screens, share collapse styling, and retain selections', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockDatabase(page);
  await mockAffinity(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();

  const group = (id: string) => page.locator(`[data-filter-group="${id}"]`);
  const header = (id: string) => group(id).locator('.group-title');
  for (const id of ['characters', 'support', 'search', 'inheritance', 'main', 'races']) {
    await expect(group(id).locator('.collapsible-body')).toBeEmpty();
  }

  await header('affinity').click();
  for (const width of [320, 600, 760, 900]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(group('quick')).toHaveCount(0);
    for (const id of ['characters', 'support', 'search']) {
      await expect(header(id)).toBeVisible();
      await expect(header(id)).toHaveAttribute('aria-expanded', 'false');
    }

    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      const styles = await page.locator('.database-filter-card').evaluateAll((cards) =>
        cards.map((card) => {
          const style = getComputedStyle(card);
          const header = card.querySelector('.group-title')!;
          const title = getComputedStyle(header);
          return [
            card.getBoundingClientRect().width,
            style.backgroundColor,
            style.borderStyle,
            style.borderWidth,
            style.borderRadius,
            style.padding,
            header.getBoundingClientRect().height,
            title.color,
            title.fontSize
          ];
        })
      );

      for (const style of styles) expect(style).toEqual(styles[0]);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await header('characters').click();
  await page
    .getByRole('button', { name: 'Add included characters to Main parent (P1/P2)', exact: true })
    .click();

  const characters = page.getByRole('dialog', { name: 'Include Characters', exact: true });
  await characters.locator('.character-grid button').first().click();
  await characters.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect(header('characters').locator('small')).toHaveText('1');
  await header('support').click();
  await setSliderValue(page.locator('#support-limit-break-advanced-start'), 2);
  await page.getByRole('button', { name: 'Borrow support card', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Select Support Card', exact: true })
    .getByRole('radio')
    .first()
    .click();

  await expect(header('support').locator('small')).toHaveText('2');
  await header('search').click();
  await page.locator('#trainer-id').fill('123456789012');
  await page.locator('#trainer-name').fill('Trainer');
  await expect(header('search').locator('small')).toHaveText('2');
  await header('characters').click();
  await expect(header('support')).toHaveAttribute('aria-expanded', 'true');
  await expect(header('search')).toHaveAttribute('aria-expanded', 'true');
  await expect(group('characters').locator('.collapsible-body')).toBeHidden();
  await expect(group('characters').locator('.legacy-tree .chip')).toHaveCount(1);
  await group('support').screenshot({ path: test.info().outputPath('mobile-support-section.png') });

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(group('quick')).toBeVisible();
  await header('quick').click();
  await expect(page.locator('#trainer-id')).toHaveValue('123456789012');
  await expect(page.locator('#trainer-name')).toHaveValue('Trainer');
  await expect(page.locator('#support-limit-break-advanced-start')).toHaveValue('2');
  await expect(page.locator('.legacy-tree .chip')).toHaveCount(1);
  await expect(header('quick').locator('small')).toHaveText('5');
  await expect(page.locator('#trainer-id')).toHaveCount(1);
  await expect(page.locator('.support-quick .selected-support-copy')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header('characters')).toHaveAttribute('aria-expanded', 'false');
  await expect(header('support')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('radio', { name: 'Basic', exact: true }).click();
  await header('general').click();
  await expect(page.locator('#support-limit-break-start')).toHaveValue('2');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.locator('#trainer-name')).toHaveValue('Trainer');
  await expect(header('characters').locator('small')).toHaveText('1');
  await expect(header('support').locator('small')).toHaveText('2');
  await expect(header('search').locator('small')).toHaveText('2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
