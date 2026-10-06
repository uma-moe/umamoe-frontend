import { expect, test } from './fixtures/test';
import { homeStats, mockAffinity, mockDatabase } from './fixtures/api';

test('Shared factor, distance and race-grade colors retain the Angular vocabulary in both themes', async ({ page }) => {
  await mockDatabase(page); await mockAffinity(page); await page.goto('/database');
  await expect(page.locator('.spark--white').first()).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    expect(await page.locator('.spark--pink').first().evaluate(el => getComputedStyle(el).color)).toBe(theme === 'dark' ? 'rgb(233, 30, 99)' : 'rgb(190, 24, 93)');
    expect(await page.locator('.spark--white').first().evaluate(el => getComputedStyle(el).color)).toBe(theme === 'dark' ? 'rgb(189, 189, 189)' : 'rgb(75, 85, 99)');
    const colors = await page.locator('html').evaluate(el => {
      const css = getComputedStyle(el);
      return ['distance-sprint','distance-mile','distance-medium','distance-long','distance-dirt','race-g1','race-g2','race-g3','grade-g1-base','grade-g2-base','grade-g3-base'].map(key => css.getPropertyValue(`--${key}`).trim());
    });
    expect(colors).toEqual(['#ff9800','#4caf50','#2196f3','#9c27b0','#795548','#7fb3ef','#f48fab','#6fcf85','54 132 227','244 85 129','57 187 84']);
  }
});

test('Tools shares the home landing layout across screen sizes and themes', async ({ page }) => {
  await page.context().route('**/api/stats?days=30', route => route.fulfill({ json: homeStats }));
  const home = await page.context().newPage();
  await home.goto('/');
  await page.goto('/tools');
  await expect(page.locator('.stat-card strong')).toHaveText(['4,521', '8,123', '34,567', '2,456,789']);
  const layout = (target: typeof page) => target.evaluate(() => {
    const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
    const content = document.querySelector('.hero-content')!.getBoundingClientRect();
    return {
      contentX: content.x, contentWidth: content.width,
      heroPadding: style('.hero').padding, heroBackground: style('.hero').backgroundImage,
      columns: style('.quick-links').gridTemplateColumns, gap: style('.quick-links').gap,
      cardPadding: style('.quick-link').padding, cardRadius: style('.quick-link').borderRadius,
      cardBackground: style('.quick-link').backgroundColor, iconWidth: style('.quick-link svg').width,
      statsColumns: style('.stats-grid').gridTemplateColumns, statsPadding: style('.stats-grid').padding
    };
  });
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await home.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 480, 547, 767, 768, 1536, 1920, 2560]) {
      await page.setViewportSize({ width, height: 960 });
      await home.setViewportSize({ width, height: 960 });
      await expect(page.getByRole('heading', { name: 'Tools & Calculators', exact: true })).toBeVisible();
      expect(await layout(page)).toEqual(await layout(home));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await expect(page.locator('.quick-link').filter({hasText:'Race Simulator'}).locator('svg')).toHaveCSS('color',theme==='dark'?'rgb(233, 30, 99)':'rgb(190, 24, 93)');
    await expect(page.getByRole('link',{name:/Lineage Planner/}).locator('svg')).toHaveCSS('color',theme==='dark'?'rgb(129, 199, 132)':'rgb(21, 128, 61)');
  }
  await home.close();
});

test('Character dialog uses shared typography and retains its selection workflow', async ({ page }) => {
  await mockDatabase(page); await mockAffinity(page);
  await page.goto('/database'); await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Pick target character', exact: true });
  await trigger.focus(); await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  expect(await dialog.locator('h2').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  expect(await dialog.locator('.copy strong').first().evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  const search = dialog.getByRole('searchbox', { name: 'Search characters' });
  const viewport = page.viewportSize()!;
  for (const width of [320, 390, 600, 601, 768]) {
    await page.setViewportSize({width, height:viewport.height});
    await expect(dialog.locator('.avatar').first()).toHaveCSS('width', width <= 600 ? '62px' : '66px');
    await expect(dialog.locator('.copy strong').first()).toHaveCSS('font-size', width <= 600 ? '11px' : '12px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.setViewportSize(viewport);
  expect(await search.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  await search.fill('Mejiro McQueen'); await expect(dialog.getByRole('radio')).toHaveCount(2);
  await dialog.getByRole('radio').first().click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Clear target character' }).click(); await page.getByRole('button', { name: 'Pick target character' }).focus(); await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pick target character', exact: true })).toBeFocused();
});

test('Parent picker toolbar stays aligned across tabs and manual editing', async ({ page }) => {
  await mockDatabase(page); await mockAffinity(page);
  await page.goto('/database'); await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  const geometry = () => dialog.locator('.filterbar,.parent-search input,.parent-sort .select-control,.factor-filters').evaluateAll(elements => elements.flatMap(element => {
    const { x, width } = element.getBoundingClientRect();
    return [x, width];
  }));
  for (const width of [320,390,1200]) {
    await page.setViewportSize({width,height:900});
    await dialog.getByRole('tab', { name: /Veterans/ }).click();
    const reference = await geometry();
    for (const name of ['Veterans','Bookmarks','Partner','Manual']) {
      await dialog.getByRole('tab', { name:new RegExp(name) }).click();
      (await geometry()).forEach((value,index) => expect(value).toBeCloseTo(reference[index]!,0));
      const search = (await dialog.getByRole('textbox', {name:'Search parents',exact:true}).boundingBox())!;
      for (const action of await dialog.locator('.parent-actions button').all()) {
        const bounds = (await action.boundingBox())!;
        expect(bounds.y).toBeCloseTo(search.y,0); expect(bounds.height).toBeCloseTo(search.height,0);
      }
    }
    await dialog.getByRole('button', {name:'Add',exact:true}).click();
    (await geometry()).forEach((value,index) => expect(value).toBeCloseTo(reference[index]!,0));
    await dialog.getByRole('button', {name:'Cancel',exact:true}).click();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test('Veteran dialog keeps page typography, usable scrolling, and all four tabs', async ({ page }) => {
  await mockDatabase(page); await mockAffinity(page);
  await page.goto('/database'); await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Pick your legacy', exact: true });
  await trigger.focus(); await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(dialog).toBeVisible();
  const originalViewport = page.viewportSize()!;
  for (const width of [390, 600, 768]) {
    await page.setViewportSize({ width, height: originalViewport.height });
    const expectedHeight = Math.min(1000, originalViewport.height * (width <= 480 ? .96 : .94));
    expect((await dialog.boundingBox())!.height).toBeCloseTo(expectedHeight, 0);
    for (const label of await dialog.locator('.tab-label').all()) {
      await expect(label).toHaveCSS('position', 'static');
      expect((await label.boundingBox())!.width).toBeGreaterThan(30);
    }
    if (width <= 480) await expect(dialog.locator('.tabs button > svg').first()).not.toBeVisible();
  }
  await page.setViewportSize(originalViewport);
  for (const selector of ['h2', '.picker-body', '.signin-footer']) {
    expect(await dialog.locator(selector).evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  }
  await expect(dialog.getByRole('tab')).toHaveCount(4);
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Entry name (optional)' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Search parents', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add Spark', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose Parent 1', exact: true }).focus(); await page.keyboard.press('Enter');
  const child = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(child).toBeVisible();
  await expect(child.locator('header').getByRole('button',{name:'Sort: Default'})).toBeVisible();
  await expect(child.locator('h2')).toHaveCSS('font-size','16px');
  await expect(child.locator('h2')).toHaveCSS('font-weight','650');
  expect(await child.locator('.copy strong').first().evaluate(el=>getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  for(const theme of ['dark','light']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await expect(child.locator('.dialog-panel')).toHaveCSS('background-color',theme==='dark'?'rgb(22, 22, 22)':'rgb(255, 255, 255)');
    await expect(child.locator('.dialog-panel > header')).toHaveCSS('background-color',theme==='dark'?'rgb(22, 22, 22)':'rgb(255, 255, 255)');
  }
  const childSearch=child.getByRole('searchbox',{name:'Search characters'});
  const childHeight = (await child.boundingBox())!.height;
  await childSearch.fill('no matching character');
  await expect(child.getByText('No characters match “no matching character”.')).toBeVisible();
  if (originalViewport.width <= 767) {
    expect((await child.boundingBox())!.height).toBeCloseTo(childHeight, 0);
    await page.setViewportSize({ width: originalViewport.width, height: 450 });
    await expect(child.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
    expect((await child.boundingBox())!.height).toBeLessThanOrEqual(450);
    await page.setViewportSize(originalViewport);
    expect((await child.boundingBox())!.height).toBeCloseTo(childHeight, 0);
  }
  else expect((await child.locator('.dialog-panel').boundingBox())!.height).toBeLessThan(300);
  const panel = (await child.locator('.dialog-panel').boundingBox())!;
  const modal = (await child.boundingBox())!;
  expect(modal.height).toBeCloseTo(panel.height, 0);
  expect(panel.y + panel.height / 2).toBeCloseTo(page.viewportSize()!.height / 2, 0);
  await childSearch.fill('Mejiro McQueen');await expect(child.getByRole('radio')).toHaveCount(2);
  await page.keyboard.press('Escape'); await expect(child).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose Parent 1', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Support picker shows readable cards and resets its search and filters on reopening', async ({ page, isMobile }) => {
  await mockDatabase(page); await mockAffinity(page);
  await page.goto('/database'); await page.getByRole('button', { name: /Filters/ }).click();
  if (isMobile) await page.getByRole('button', { name: 'Support Card & LB', exact: true }).click();
  await page.getByRole('button', { name: 'Borrow support card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Support Card', exact: true });
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  expect(await dialog.locator('.quick-filters label').evaluateAll(labels=>labels.every(label=>getComputedStyle(label).position==='absolute'))).toBe(true);
  if(isMobile)expect(await dialog.evaluate(el=>parseFloat(getComputedStyle(el).maxHeight))).toBeCloseTo(page.viewportSize()!.height-32,2);
  await expect(dialog.locator('.card-copy strong').first()).toHaveCSS('letter-spacing','normal');
  const grid = (await dialog.locator('.cards').boundingBox())!;
  const card = (await dialog.getByRole('radio').first().boundingBox())!;
  expect(card.width).toBeGreaterThanOrEqual(Math.min(grid.width, 250) - 1);
  expect(card.x + card.width).toBeLessThanOrEqual(grid.x + grid.width + 1);
  const search = dialog.getByRole('searchbox', { name: 'Search support cards' });
  const initialHeight = (await dialog.boundingBox())!.height;
  await search.fill('no matching support');
  await expect(dialog.getByText('No support cards match these filters.')).toBeVisible();
  if (isMobile) expect((await dialog.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
  await search.fill('Kitasan Black');
  await dialog.getByRole('combobox', { name: 'Rarity', exact: true }).click();
  await dialog.getByRole('option', { name: 'SSR', exact: true }).click();
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Borrow support card', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await expect(dialog.getByRole('combobox', { name: 'Rarity', exact: true })).toHaveText('All rarities');
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Type', exact: true })).toBeFocused();
  await expect(dialog.getByRole('option', { name: 'Wisdom', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await search.fill('Kitasan Black'); await dialog.getByRole('radio').first().click();
  await expect(dialog).not.toBeVisible(); await expect(page.locator('.compact-trigger.selected')).toBeFocused();
});
