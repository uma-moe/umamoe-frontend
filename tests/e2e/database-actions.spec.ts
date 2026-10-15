import { expect, test } from './fixtures/test';
import { mockDatabase, record } from './fixtures/api';

test('Notifications dismiss independently after five seconds and support manual dismissal', async ({
  page
}) => {
  await mockDatabase(page);
  await page.goto('/database');
  const save = page
    .locator('.inheritance-card')
    .first()
    .getByRole('button', { name: 'Save', exact: true });

  await expect(save).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const notices = page.getByLabel('Notifications').locator('article');
  await save.click();
  await expect(notices).toHaveCount(1);
  await expect(notices.first()).toContainText('Sign in to bookmark');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    const bounds = await notices.first().boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(340);
    expect(bounds!.height).toBeLessThanOrEqual(56);
    await notices
      .first()
      .screenshot({ path: test.info().outputPath(`compact-notice-${theme}.png`) });
  }

  await page.clock.fastForward(4000);
  await save.click();
  await expect(notices).toHaveCount(2);
  await page.clock.fastForward(1000);
  await expect(notices).toHaveCount(1);
  await page.clock.fastForward(4000);
  await expect(notices).toHaveCount(0);
  await save.click();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notices).toHaveCount(0);
});

test('Optimal Races preserves Angular turn allocation, dense mobile rows, and dialog isolation', async ({
  page,
  isMobile
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  await mockDatabase(page);
  const first = record();
  first.inheritance.main_win_saddles = [16, 20];
  await page.route('**/search/query?*', (route) =>
    route.fulfill({
      json: {
        items: [
          first,
          {
            ...first,
            account_id: '987654321012',
            trainer_name: 'Second Trainer',
            inheritance: { ...first.inheritance, inheritance_id: 2 }
          }
        ],
        total: 2,
        page: 0,
        limit: 12,
        total_pages: 1
      }
    })
  );

  const filters = Buffer.from(JSON.stringify({ p2w: [16, 17, 15, 30] })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(filters)}`);
  const cards = page.locator('.inheritance-card');
  const best = cards.first().getByTitle('G1 races that overlap P1/P2 and maximize future affinity');
  await expect(best).toBeVisible();
  await expect(cards.first().locator('.record-actions button')).toHaveCount(6);
  if (isMobile) {
    for (const name of ['Plan', 'Share', 'Races', 'Optimal Races', 'Report trainer', 'Save'])
      await expect(cards.first().getByRole('button', { name, exact: true })).toBeVisible();
    for (const box of await cards
      .first()
      .locator('.record-actions button')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        })
      )) {
      expect(box.height).toBe(28);
      expect(box.width).toBeGreaterThanOrEqual(28);
    }
  }

  await best.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Optimal Races', exact: true });
  await expect(dialog).toBeVisible();
  const panel = await dialog.locator(':scope > .dialog-panel').boundingBox();
  expect(
    Math.abs(panel!.y + panel!.height / 2 - page.viewportSize()!.height / 2),
    'The visible panel, not an oversized invisible dialog box, must be centered'
  ).toBeLessThanOrEqual(1);
  const titleIds = await page
    .locator('.optimal-races-dialog > dialog')
    .evaluateAll((dialogs) => dialogs.map((dialog) => dialog.getAttribute('aria-labelledby')));

  expect(new Set(titleIds).size).toBe(2);
  if (isMobile) {
    await expect(dialog.locator('.mobile-schedule .year--junior')).toHaveCount(0);
    await expect(dialog.locator('.mobile-schedule .year--classic .race')).toHaveCount(1);
    await expect(dialog.locator('.mobile-schedule .year--classic .affinity')).toHaveText(
      '+6P1 + P2'
    );
    await expect(dialog.locator('.mobile-schedule .year--senior .race')).toHaveCount(3);
    await expect(dialog.locator('.mobile-schedule .year--senior .race-meta time')).toHaveText([
      'Feb 2nd half',
      'Mar 2nd half',
      'Oct 2nd half'
    ]);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThan(0);
    expect(bounds!.y + bounds!.height).toBeLessThan(844);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
  } else await expect(dialog.getByRole('region', { name: 'Optimal G1 races' })).toBeVisible();

  await page.screenshot({ path: test.info().outputPath('optimal-races.png') });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();
  await expect(best).toBeFocused();
  await cards.nth(1).getByTitle('G1 races that overlap P1/P2 and maximize future affinity').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Database report retains confirmation, failure recovery, and server-owned results', async ({
  page
}) => {
  await mockDatabase(page);
  let searches = 0;
  let reports = 0;
  let submitted = false;
  await page.route('**/search/query?*', (route) => {
    searches++;
    const item = { ...record(), trainer_name: submitted ? 'Refreshed Trainer' : 'Parity Trainer' };

    return route.fulfill({ json: { items: [item], total: 1, page: 0, limit: 12, total_pages: 1 } });
  });

  await page.route('**/api/tasks/report-unavailable/*', async (route) => {
    reports++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({});
    expect(route.request().url()).toContain('/report-unavailable/123456789012');
    if (reports === 1) return route.fulfill({ status: 500, json: { message: 'Unavailable' } });
    submitted = true;
    return route.fulfill({ json: { success: true, task_created: true, report_count: 1 } });
  });

  await page.goto('/database');
  await expect(page.getByText('Parity Trainer', { exact: true })).toBeVisible();
  const before = searches;
  const report = page.getByTitle('Report this trainer as unavailable');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'Report trainer 123456789012 as unavailable or friend list full?'
    );
    await dialog.dismiss();
  });

  await report.click();
  expect(reports).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await report.click();
  await expect(
    page.getByText('Could not report this trainer. Please try again.', { exact: true })
  ).toBeVisible();

  const failure = page.locator('.toast--danger');
  await expect(failure.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
  if (page.viewportSize()!.width <= 480) {
    for (const height of await failure
      .locator('a,button')
      .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height)))
      expect(height).toBeGreaterThanOrEqual(28);
  }

  await failure.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByText('Parity Trainer', { exact: true })).toBeVisible();
  await expect(report).toBeEnabled();
  expect(searches).toBe(before);
  page.once('dialog', (dialog) => dialog.accept());
  await report.click();
  await expect(page.getByText('Trainer reported as unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Refreshed Trainer', { exact: true })).toBeVisible();
  await expect(page.getByText('1 records found')).toBeVisible();
  expect(reports).toBe(2);
  expect(searches).toBeGreaterThan(before);
});

test('Database copy preserves clipboard, optimistic counts, rejection rollback and cooldown', async ({
  page
}) => {
  await mockDatabase(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          sessionStorage.setItem('test-copied-text', value);
        }
      }
    });
  });

  const ids = ['123456789012', '223456789012', '323456789012'];
  const items = ids.map((id, index) => {
    const item = record(id);
    item.inheritance.inheritance_id = index + 1;
    return item;
  });

  await page.route('**/search/query?*', (route) =>
    route.fulfill({ json: { items, total: 3, page: 0, limit: 12, total_pages: 1 } })
  );

  let copies = 0;
  let release = () => {};

  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/borrow/*/copy', async (route) => {
    copies++;
    const id = route.request().url().split('/').at(-2)!;
    expect(route.request().postDataJSON()).toMatchObject({
      inheritance_id: ids.indexOf(id) + 1,
      support_card_id: 30189,
      support_card_limit_break: 4,
      support_card_experience: 45000
    });

    expect(route.request().postDataJSON().borrow_key).toMatch(/^bk1:[0-9a-f]{16}$/);
    if (id === ids[2]) return route.fulfill({ status: 500, json: { error: 'Unavailable' } });
    if (id === ids[0]) await pending;
    return route.fulfill({
      json: {
        success: true,
        accepted: id === ids[0],
        trainer_id: id,
        copy_count: id === ids[0] ? 12 : 5
      }
    });
  });

  try {
    await page.goto('/database');
    const cards = page.locator('.inheritance-card');
    await expect(cards).toHaveCount(3);
    await page.getByTitle(`Copy trainer ID ${ids[0]}`).click();
    await expect(cards.nth(0).locator('.copy-stat b')).toHaveText('8');
    expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe(ids[0]);
    release();
    await expect(cards.nth(0).locator('.copy-stat b')).toHaveText('12');
    await page.getByTitle(`Copy trainer ID ${ids[0]}`).click();
    await expect(cards.nth(0).locator('.copy-stat b')).toHaveText('12');
    expect(copies).toBe(1);
    for (const index of [1, 2]) {
      await page.getByTitle(`Copy trainer ID ${ids[index]}`).click();
      await expect.poll(() => copies).toBe(index + 1);
      await expect(cards.nth(index).locator('.copy-stat b')).toHaveText('7');
    }

    await cards.first().getByTitle('Copy share link').click();
    expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe(
      `${new URL(page.url()).origin}/database?trainer_id=${ids[0]}`
    );
    expect(copies).toBe(3);
    if (page.viewportSize()!.width <= 480) {
      for (const name of ['Plan', 'Share', 'Races', 'Report trainer', 'Save'])
        await expect(cards.first().getByRole('button', { name, exact: true })).toBeVisible();
      for (const height of await cards
        .first()
        .locator('.record-actions button')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height)))
        expect(height).toBe(28);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      page.viewportSize()!.width
    );
  } finally {
    release();
  }
});
