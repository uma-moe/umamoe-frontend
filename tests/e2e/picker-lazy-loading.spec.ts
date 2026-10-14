import { test, expect } from './fixtures/test';
import { mockDatabase, mockAffinity } from './fixtures/api';
import { stressCatalogs } from '../performance/data';

test('catalog pickers evict offscreen options and search the full catalog', async ({ page, isMobile }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await stressCatalogs(page);
  await page.goto('/database');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick target character', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  expect(await dialog.getByRole('radio').count()).toBeLessThan(100);
  await dialog.locator('.character-grid').evaluate(grid=>{
    let root=grid.parentElement!;
    while(root.parentElement&&!/auto|scroll/.test(getComputedStyle(root).overflowY))root=root.parentElement;
    root.scrollTop=root.scrollHeight;
  });
  await expect.poll(async()=>Number(await dialog.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(100);
  expect(await dialog.getByRole('radio').count()).toBeLessThan(100);
  await page.getByRole('searchbox', { name: 'Search characters', exact: true }).fill('Stress Uma 199');
  await expect(dialog.getByRole('radio', { name: 'Stress Uma 199', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  if (isMobile) await page.locator('[data-filter-group="support"] .group-title').click();
  await page.getByRole('button', { name: 'Borrow support card', exact: true }).click();
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  expect(await dialog.getByRole('radio').count()).toBeLessThan(100);
  await dialog.locator('.cards').evaluate(grid=>{
    let root=grid.parentElement!;
    while(root.parentElement&&!/auto|scroll/.test(getComputedStyle(root).overflowY))root=root.parentElement;
    root.scrollTop=root.scrollHeight;
  });
  await expect.poll(async()=>Number(await dialog.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(350);
  expect(await dialog.getByRole('radio').count()).toBeLessThan(100);
  await page.getByRole('searchbox', { name: 'Search support cards', exact: true }).fill('Stress Support 499');
  await dialog.getByRole('radio', { name: /Stress Support 499/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change support card', exact: true })).toBeVisible();
});
