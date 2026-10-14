import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
try {
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 for (const [path, expected] of [
  ['/', '4.521'], ['/database', 'Parity Trainer'], ['/circles', 'Team Sirius'],
  ['/circles/7', 'Gold Ship'], ['/rankings', 'Parity Trainer'], ['/activity', 'Mejiro Analyst'],
  ['/activity/42', 'Mejiro Analyst'], ['/timeline', 'Mejiro McQueen Pickup'],
  ['/tools/statistics', 'Special Week'], ['/tierlist', 'Tierlist Information'],
  ['/profile/123456789012', 'Team Sirius'], ['/profile/123456789012/veterans', 'Grass Wonder']
 ]) {
  await page.goto(`${base}${path}`);
  await page.getByRole('status').filter({ hasText: 'Demo preview' }).waitFor();
  await page.getByText(expected, { exact: false }).first().waitFor({ timeout: 20000 });
  console.log(`PASS ${path}`);
 }
 await page.getByRole('button',{name:'Try legacy selector'}).click();
 const selector=page.getByRole('dialog',{name:'Select Parent',exact:true});
 await expect(selector.locator('.parent-row')).toHaveCount(6);
 await selector.getByRole('button',{name:'Add Spark',exact:true}).click();
  const sparkFilter=page.getByRole('dialog',{name:'Add spark filter',exact:true});
  await sparkFilter.getByRole('button',{name:'Add Speed spark',exact:true}).click();
  await sparkFilter.getByRole('button',{name:'Add filter',exact:true}).click();
  await expect(selector.getByRole('button',{name:'Speed · Combined 1–9★',exact:true})).toBeVisible();
 await selector.getByRole('button',{name:'Select Grass Wonder',exact:true}).click();
 await page.getByRole('button',{name:/Filters/}).click();
 await expect(page.locator('.affinity-tree h3')).toHaveText('Grass Wonder');
 await page.getByRole('button',{name:'Change target character',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Select Character',exact:true}).locator('.affinity-badge').first()).toBeVisible();
 await page.goto(`${base}/veterans`);
 await page.getByRole('button',{name:'View Grass Wonder details',exact:true}).click();
 await page.getByRole('dialog',{name:'Grass Wonder',exact:true}).getByRole('link',{name:'Use as legacy',exact:true}).click();
 await page.getByRole('button',{name:/Filters/}).click();
 await expect(page.locator('.affinity-tree h3')).toHaveText('Grass Wonder');
 console.log('PASS local legacy selector, filters, ace affinity and veteran handoff');
 const result = await fetch(`${base}/api/v4/rankings/monthly?page=0&limit=100`).then(response => response.json());
 assert.equal(result.total, result.rankings.length);
 const empty = await fetch(`${base}/api/v4/rankings/monthly?query=does-not-exist`).then(response => response.json());
 assert.equal(empty.total, 0);
 assert.equal((await fetch(`${base}/api/borrow/views`, { method: 'POST' })).status, 405);
 assert.deepEqual(errors, []);
} finally { await browser.close(); }
