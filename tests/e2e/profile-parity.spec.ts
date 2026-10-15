import { expect, test } from './fixtures/test';
import {
  accountId,
  mockOwnerProfile,
  mockProfilePresentation,
  profile,
  veteran
} from './fixtures/api';

test('Team Stadium decodes packed support cards into artwork, names and limit breaks', async ({
  page
}) => {
  await mockOwnerProfile(page, []);
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans: [],
        team_stadium: [
          { ...veteran, support_cards: [200233, 300152, 300284, 300194, 300360, 300104] }
        ]
      }
    })
  );

  await page.goto(`/profile/${accountId}`);
  const stadium = page.locator('.stadium-section');
  await stadium.scrollIntoViewIfNeeded();
  await stadium.getByRole('button', { name: 'View Grass Wonder details', exact: true }).click();
  const deck = page
    .getByRole('dialog')
    .getByRole('region', { name: 'Training support cards', exact: true });

  await expect(deck.locator('li')).toHaveCount(6);
  await expect(deck.locator('.support-name').nth(2)).toHaveText('Kitasan Black');
  for (const [index, [id, lb]] of [
    [20023, 3],
    [30015, 2],
    [30028, 4],
    [30019, 4],
    [30036, 0],
    [30010, 4]
  ].entries()) {
    const card = deck.locator('li').nth(index);
    await expect(card.locator('.art img')).toHaveAttribute(
      'src',
      `/assets/images/support_card/half/support_card_s_${id}.webp`
    );
    await expect(
      card.getByRole('img', { name: `Limit break ${lb} of 4`, exact: true })
    ).toBeAttached();
  }
});

test('profile overview retains every populated Angular section and owner visibility contract', async ({
  page
}, testInfo) => {
  const visibilityBodies: unknown[] = [];
  await mockOwnerProfile(page, visibilityBodies);
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({ json: { ...profile, trainer: { ...profile.trainer, rank_score: 876800 } } })
  );

  await page.goto(`/profile/${accountId}`);
  await expect(page.getByRole('heading', { name: 'Parity Trainer' })).toBeVisible();
  const header = page.locator('.trainer-summary');
  await expect(header.getByText('Archive points', { exact: true })).toBeVisible();
  await expect(header.getByText('Archive points', { exact: true })).toHaveAttribute(
    'title',
    'Progress toward Archive level'
  );

  await expect(header.locator('.trainer-facts')).toContainText('876.8K');
  await expect(header.locator('.rank')).toHaveCount(0);
  if (page.viewportSize()!.width > 1100) {
    expect((await header.boundingBox())!.height).toBeLessThan(150);
    const identity = await header.locator('.identity').boundingBox();
    const facts = await header.locator('.trainer-facts').boundingBox();
    expect(facts!.x).toBeGreaterThan(identity!.x + identity!.width);
    expect(facts!.y).toBeLessThan(identity!.y + identity!.height);
  }

  await header.screenshot({ path: testInfo.outputPath('profile-header-dark.png') });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await header.screenshot({ path: testInfo.outputPath('profile-header-light.png') });
  for (const heading of [
    'Fan activity',
    'Rolling Gains',
    'All-Time Stats',
    'Current Circle',
    'Circle History',
    'Current borrow',
    'Team Stadium'
  ])
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Victoire Pisa', exact: true })).toBeVisible();
  await expect(page.getByText('76', { exact: true })).toBeVisible();
  await expect(page.getByText('19', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profile Visible' }).click();
  await expect.poll(() => visibilityBodies.length).toBe(1);
  expect(visibilityBodies[0]).toEqual({ profile_hidden: true, hidden_sections: [] });
  await page
    .getByRole('figure', { name: 'Fan activity' })
    .getByRole('button', { name: 'Public' })
    .click();

  await expect.poll(() => visibilityBodies.length).toBe(2);
  expect(visibilityBodies[1]).toEqual({ profile_hidden: true, hidden_sections: ['fan_history'] });
});

test('profile inheritance restores planner, race, and update actions', async ({ page }) => {
  const visibilityBodies: unknown[] = [];
  await mockOwnerProfile(page, visibilityBodies);
  await page.goto(`/profile/${accountId}`);
  await page.evaluate(() => {
    (window as Window & { openedForParity?: string }).open = ((url?: string | URL) => {
      (window as Window & { openedForParity?: string }).openedForParity = String(url);
      return null;
    }) as typeof window.open;
  });

  await page.getByRole('button', { name: 'Plan' }).click();
  expect(
    await page.evaluate(() => (window as Window & { openedForParity?: string }).openedForParity)
  ).toBe('/tools/lineage-planner?from=profile');
  const transfer = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('planner_transfer') ?? 'null')
  );

  expect(transfer.record).toMatchObject({
    accountId,
    mainParentId: 101101,
    leftParentId: 106701,
    rightParentId: 108801,
    supportCardId: 30291
  });

  const card = page.locator('.inheritance-card');
  await expect(card.locator('.record-actions button')).toHaveCount(4);
  await expect(card.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Races', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Race History/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Report this inheritance as outdated and queue a database refresh').click();
  await expect(
    page.getByText('Update requested. It can take up to 5 minutes to appear in the database.')
  ).toBeVisible();
});

test('populated profile remains page-overflow safe at 390px and 320px', async ({ page }) => {
  const visibilityBodies: unknown[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOwnerProfile(page, visibilityBodies);
  await page.goto(`/profile/${accountId}`);
  await expect(page.getByRole('heading', { name: 'Team Stadium' })).toBeVisible();
  await page.locator('.stadium-section').scrollIntoViewIfNeeded();
  await expect(page.locator('.stadium-member .stats img')).toHaveCount(5);
  await expect(page.locator('.stadium-member .stats>div')).toHaveCount(5);
  await page.getByRole('button', { name: 'Fan History', exact: true }).click();
  const history = page.getByRole('region', { name: 'Fan History', exact: true });
  await expect(history.getByRole('columnheader')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.locator('.stadium-section').scrollIntoViewIfNeeded();
  const aptitudes = page.locator('.stadium-member .aptitude-container');
  expect(await aptitudes.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true
  );
});

test('profile does not claim an inheritance refresh succeeded when the API fails', async ({
  page
}) => {
  await mockOwnerProfile(page, []);
  await page.route(`**/api/tasks/report-unavailable/${accountId}`, (route) =>
    route.fulfill({ status: 500, json: { error: 'unavailable' } })
  );

  await page.goto(`/profile/${accountId}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Report this inheritance as outdated and queue a database refresh').click();
  await expect(
    page.getByText('Could not request an inheritance update. Please try again.')
  ).toBeVisible();
  await expect(
    page.getByText('Update requested. It can take up to 5 minutes to appear in the database.')
  ).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`profile ${theme} uses theme gain colors, compact stat typography, and stadium details`, async ({
    page
  }, testInfo) => {
    await mockProfilePresentation(page);
    await page.addInitScript((theme) => localStorage.setItem('uma-color-mode', theme), theme);
    await page.goto(`/profile/${accountId}`);
    const inheritance = page.locator('.inheritance-card');
    await expect(inheritance.locator('.plan-action')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(100, 181, 246)' : 'rgb(21, 101, 192)'
    );
    await expect(inheritance.locator('.share-action')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(77, 182, 172)' : 'rgb(0, 121, 107)'
    );
    await expect(inheritance.locator('.race-action')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(245, 200, 58)' : 'rgb(138, 90, 0)'
    );
    await expect(inheritance.locator('.stat.wins strong')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(76, 175, 80)' : 'rgb(21, 128, 61)'
    );
    await expect(inheritance.locator('.stat.affinity strong')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(233, 30, 99)' : 'rgb(190, 24, 93)'
    );
    await expect(inheritance.locator('.plan-action')).toHaveCSS('font-weight', '600');
    await expect(inheritance.getByText('Update unavailable', { exact: true })).toHaveCount(0);
    const rolling = page
      .getByRole('heading', { name: 'Rolling Gains', exact: true })
      .locator('../..');

    await expect(rolling.locator('.stat')).toHaveCount(3);
    const expectedColors =
      theme === 'dark'
        ? ['rgb(129, 199, 132)', 'rgb(229, 115, 115)', 'rgba(255, 255, 255, 0.5)']
        : ['rgb(21, 128, 61)', 'rgb(185, 28, 28)', 'rgb(75, 85, 99)'];

    for (const [index, text] of ['+4.2M', '-125K', '+0'].entries()) {
      await expect(rolling.locator('.stat strong').nth(index)).toHaveText(text);
      await expect(rolling.locator('.stat strong').nth(index)).toHaveCSS(
        'color',
        expectedColors[index]!
      );
    }

    await page.getByRole('button', { name: 'Fan History', exact: true }).click();
    const gains = page
      .getByRole('region', { name: 'Fan History', exact: true })
      .locator('tbody td:nth-child(3)');

    for (const [index, color] of [
      expectedColors[0],
      expectedColors[2],
      expectedColors[1]
    ].entries())
      await expect(gains.nth(index).locator('span')).toHaveCSS('color', color!);
    await page.getByRole('button', { name: 'Fan History', exact: true }).click();
    const mobile = page.viewportSize()!.width <= 480;
    if (mobile)
      await expect(inheritance.locator('.stat.wins strong')).toHaveCSS('font-size', '14px');
    else {
      const statSize = await inheritance
        .locator('.stat.wins strong')
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

      expect(statSize).toBeGreaterThanOrEqual(16.8);
      expect(statSize).toBeLessThanOrEqual(22.4);
    }

    if (theme === 'light')
      await expect(inheritance.locator('.plan-action')).toHaveCSS(
        'background-color',
        mobile ? 'rgba(0, 0, 0, 0)' : 'rgb(247, 249, 252)'
      );
    if (!mobile) {
      await inheritance.scrollIntoViewIfNeeded();
      await expect(inheritance.locator('.spark-modes')).toBeVisible();
      const alignment = await inheritance.evaluate((card) => ({
        factors: card.querySelector('.spark-modes')!.getBoundingClientRect().y,
        portraits: card.querySelector('.character-panel')!.getBoundingClientRect().y
      }));

      expect(Math.abs(alignment.factors - alignment.portraits)).toBeLessThan(1);
    }

    await expect(rolling.locator('.stat strong').first()).toHaveCSS(
      'font-size',
      mobile ? '13.6px' : '17.6px'
    );
    await expect(rolling.locator('.stat strong').first()).toHaveCSS('font-weight', '600');
    expect(
      await rolling
        .locator('.stat strong')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily)
    ).toContain('Inter');
    await expect(rolling.locator('.stat').first()).toHaveCSS('padding', mobile ? '8px' : '12px');
    const stadium = page.locator('.stadium-section');
    await stadium.scrollIntoViewIfNeeded();
    await expect(stadium).toHaveCSS('border-top-width', '0px');
    await expect(stadium).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(stadium.getByLabel('5 rarity stars')).toHaveText('★★★★★');
    await expect(stadium.locator('.stats-only')).toHaveCount(1);
    await expect(stadium.locator('.stats>div')).toHaveCount(5);
    await expect(stadium.locator('.skill-chip')).toHaveCount(1);
    await expect(stadium.locator('.sp-total')).toBeVisible();
    await expect
      .poll(() =>
        stadium
          .locator('img')
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0)
          )
      )
      .toBe(true);
    await expect(stadium.getByLabel('Turf: A', { exact: true }).locator('img')).toBeVisible();
    await expect(stadium.getByLabel('Dirt: G', { exact: true }).locator('img')).toBeVisible();
    const groups = stadium.locator('.aptitude-group');
    await expect(groups.locator('h4')).toHaveText(['Track', 'Dist', 'Style']);
    const badgeColumns = await groups.evaluateAll((els) =>
      els.map((el) =>
        [...el.querySelectorAll('.aptitude')].map((badge) =>
          Math.round(badge.getBoundingClientRect().x)
        )
      )
    );

    expect(badgeColumns[1]).toEqual(badgeColumns[2]);
    expect(badgeColumns[0]).toEqual(badgeColumns[1]!.slice(0, 2));
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await stadium.screenshot({ path: testInfo.outputPath(`stadium-${theme}.png`) });
  });
}

test('an all-time-only profile card uses the complete available row', async ({ page }) => {
  await mockProfilePresentation(page, true);
  await page.goto(`/profile/${accountId}`);
  const card = page.getByRole('heading', { name: 'All-Time Stats', exact: true }).locator('../..');
  await expect(card.locator('.stat')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Rolling Gains', exact: true })).toHaveCount(0);
  const bounds = await card.evaluate((el) => ({
    card: el.getBoundingClientRect().width,
    row: el.parentElement!.getBoundingClientRect().width
  }));

  expect(Math.abs(bounds.card - bounds.row)).toBeLessThan(1);
});

test('profile inheritance distinguishes absent counts and support data from known zeroes', async ({
  page
}) => {
  const data = await mockProfilePresentation(page);
  const sparse = {
    ...data,
    support_card: null,
    inheritance: {
      ...data.inheritance,
      parent_rank: undefined,
      parent_rarity: undefined,
      white_count: undefined as number | undefined,
      win_count: undefined as number | undefined,
      main_win_saddles: undefined
    }
  };

  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({ json: sparse })
  );

  await page.goto(`/profile/${accountId}`);
  const card = page.locator('.inheritance-card');
  await expect(card).toBeVisible();
  await expect(
    card.locator('.stat.wins,.stat.whites,.rank-score,.support-card-section')
  ).toHaveCount(0);
  sparse.inheritance.win_count = 0;
  sparse.inheritance.white_count = 0;
  await page.reload();
  await expect(card.locator('.stat.wins strong')).toHaveText('0');
  await expect(card.locator('.stat.whites strong')).toHaveText('0');
  await expect(card.locator('.rank-score,.support-card-section')).toHaveCount(0);
});

test('profile inheritance shares borrow tracking, copy feedback, cooldown and failure rollback with Database', async ({
  page
}) => {
  const data = await mockProfilePresentation(page);
  data.inheritance.main_win_saddles = [16, 16];
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) => route.fulfill({ json: data }));
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

  const views: Array<{ views: Array<Record<string, unknown>> }> = [];
  await page.route('**/api/borrow/views', (route) => {
    views.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, accepted_count: 1 } });
  });

  let copies = 0;
  let release = () => {};

  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/borrow/*/copy', async (route) => {
    copies++;
    expect(route.request().postDataJSON()).toMatchObject({
      inheritance_id: data.inheritance.inheritance_id,
      support_card_id: 30291,
      support_card_limit_break: data.support_card.limit_break_count
    });

    if (copies > 1) return route.fulfill({ status: 500, json: { error: 'Unavailable' } });
    await pending;
    return route.fulfill({ json: { success: true, accepted: true, copy_count: 24 } });
  });

  try {
    await page.goto(`/profile/${accountId}`);
    const card = page.locator('.inheritance-card');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.stat.wins strong')).toHaveText('1');
    await expect.poll(() => views.flatMap((batch) => batch.views).length).toBe(1);
    expect(views[0]!.views[0]).toMatchObject({
      trainer_id: accountId,
      inheritance_id: data.inheritance.inheritance_id,
      support_card_id: 30291
    });

    await card.getByTitle(`Copy trainer ID ${accountId}`).click();
    await expect(card.locator('.copy-stat b')).toHaveText('20');
    await expect(page.getByText(`Trainer ID copied: ${accountId}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe(accountId);
    release();
    await expect(card.locator('.copy-stat b')).toHaveText('24');
    await card.getByTitle(`Copy trainer ID ${accountId}`).click();
    await expect(card.locator('.copy-stat b')).toHaveText('24');
    expect(copies).toBe(1);
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith('uma.borrow.copy.')) sessionStorage.removeItem(key);
    });

    await card.getByTitle(`Copy trainer ID ${accountId}`).click();
    await expect.poll(() => copies).toBe(2);
    await expect(card.locator('.copy-stat b')).toHaveText('24');
    await card.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Link copied to clipboard', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe(
      `${new URL(page.url()).origin}/database?trainer_id=${accountId}`
    );
    expect(views.flatMap((batch) => batch.views)).toHaveLength(1);
  } finally {
    release();
  }
});
