import { test, expect } from './fixtures/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { matchesTeam } from '../../src/pages/competitive/hakuraku-query';
import type { Performer, Requirement } from '../../src/pages/competitive/hakuraku-types';
const fixture = JSON.parse(
  gunzipSync(readFileSync('tests/e2e/fixtures/hakuraku-cm.json.gz')).toString()
);

test.beforeEach(async ({ page }) => {
  await page.route('https://hakuraku.moe/api/simdata/**', async (route) => {
    const url = new URL(route.request().url());
    let payload: unknown;
    const id = url.pathname.split('/snapshots/')[1]?.split('/')[0] ?? fixture.summary.snapshotId;
    if (url.pathname.endsWith('/manifest'))
      payload = {
        snapshots: [
          ...fixture.manifest.snapshots,
          {
            ...fixture.manifest.snapshots[0],
            snapshotId: 'without-skills',
            label: 'Meeting without timing data',
            skillAnalysis: undefined
          }
        ]
      };
    else if (url.pathname.endsWith('/summary')) payload = { ...fixture.summary, snapshotId: id };
    else if (url.pathname.includes('/characters/')) payload = fixture.context;
    else if (url.pathname.endsWith('/team-distribution'))
      payload = { ...fixture.distribution, snapshotId: id };
    else if (url.pathname.endsWith('/skills/overview')) payload = fixture.skills;
    else if (url.pathname.includes('/skills/details/'))
      payload = { ...fixture.skillDetail, skillId: Number(url.pathname.split('/').at(-1)) };
    else if (url.pathname.endsWith('/teams')) {
      const slots = JSON.parse(url.searchParams.get('slots') ?? '[]') as Requirement[];
      const matching = (fixture.teams.teams as Performer[]).filter((team) =>
        matchesTeam(team.members, slots)
      );

      const unique = [...new Map(matching.map((team) => [team.owner.id, team])).values()];
      const offset = Number(url.searchParams.get('offset'));
      payload = {
        snapshotId: id,
        teams: unique.slice(offset, offset + Number(url.searchParams.get('limit'))),
        totalOwners: unique.length,
        totalTeams: matching.length
      };
    } else if (url.pathname.includes('/teams/'))
      payload = {
        snapshotId: id,
        team: fixture.teams.teams.find(
          (team: Performer) => team.id === url.pathname.split('/').at(-1)
        ),
        skills: {}
      };
    else throw new Error('Unexpected CM request ' + url);
    await route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*' } });
  });
});

test('captured teams keep SP and win share visible together, including zero and missing totals', async ({
  page
}) => {
  const team: Performer = fixture.teams.teams[0];
  const skillPoints = [0, 4430, undefined];
  const members = team.members.map((member, index) => ({
    ...member,
    skills: undefined,
    skillPoints: skillPoints[index]
  }));

  await page.route('**/snapshots/*/teams?*', (route) =>
    route.fulfill({
      json: {
        snapshotId: fixture.summary.snapshotId,
        teams: [{ ...team, members }],
        totalTeams: 1,
        totalOwners: 1
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  );

  await page.goto('/competitive/cm-data?tab=archetypes');
  const card = page.locator('.team-row').first();
  await expect(card.locator('.skill-points')).toHaveText(['0 SP', '4,430 SP', '— SP']);
  await expect(card.locator('.member-share')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Build stats', exact: true }).uncheck();
  await expect(card.locator('.skill-points')).toHaveText(['0 SP', '4,430 SP', '— SP']);
});

test('a full lobby stays compact and keeps all nine places available', async ({ page }, info) => {
  await page.goto('/competitive/cm-data?tab=archetypes');
  const cards = page.locator('.team-row');

  for (let index = 0; index < 3; index++) {
    await cards
      .nth(index)
      .getByRole('button', {
        name: 'Add team ' + (index + 1) + ' to the lobby',
        exact: true
      })
      .click();
  }

  const lobby = page.getByRole('complementary', { name: 'Lobby', exact: true });
  await expect(lobby).toContainText('9/9 Uma');
  await lobby.getByRole('button', { name: 'Review lobby', exact: true }).click();
  await expect(lobby.locator('.place.filled')).toHaveCount(9);

  const bounds = await lobby.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(380);
  expect(bounds?.height).toBeLessThanOrEqual(380);
  expect(await lobby.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await lobby.screenshot({ path: info.outputPath('cm-compact-full-lobby.png') });

  await lobby.getByRole('button', { name: 'Remove lobby team 2', exact: true }).click();
  await expect(lobby).toContainText('6/9 Uma');
  await expect(lobby.locator('.place.filled')).toHaveCount(6);
  await lobby.getByRole('button', { name: 'Clear lobby', exact: true }).click();
  await expect(lobby).toHaveCount(0);
});

test('team details keep the summary compact and align support cards with long or missing metadata', async ({
  page
}, info) => {
  const team: Performer = fixture.teams.teams[0];
  const supportIds = new Set(
    team.members.flatMap((member) => (member.deck ?? []).map((card) => card.id))
  );
  const longName = 'A support card with a much longer character name';
  const supports = Array.from(supportIds, (id, index) => ({
    id: String(id),
    character_name: index % 2 === 0 ? longName : 'Mr. C.B.',
    rarity: index % 4,
    type: 'speed',
    release_date: ''
  }));

  await page.route('**/resources/*/support-cards-db.json*', (route) =>
    route.fulfill({ json: supports })
  );
  await page.goto('/competitive/cm-data?tab=archetypes', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View team 1 details', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Team details', exact: true });
  const builds = dialog.locator('.builds article');
  await expect(builds).toHaveCount(3);
  const firstBuild = builds.first();
  await expect(firstBuild.locator('.aptitude-cell')).toHaveCount(3);
  await expect
    .poll(() =>
      firstBuild.locator('.aptitude').evaluateAll((grades) =>
        grades.every((grade) => {
          const image = grade.querySelector('img');
          return (
            grade.querySelector('b') !== null ||
            (image?.complete === true && image.naturalWidth > 0)
          );
        })
      )
    )
    .toBe(true);
  const headerSpace = await dialog.evaluate((element) => {
    const first = element.querySelector('.build-card');
    return first
      ? first.getBoundingClientRect().top - element.getBoundingClientRect().top
      : Infinity;
  });
  expect(headerSpace).toBeLessThanOrEqual(info.project.name === 'chromium' ? 150 : 180);
  await page.screenshot({ path: info.outputPath('cm-team-details-compact.png') });

  if (info.project.name === 'mobile-chromium') {
    await firstBuild.getByRole('button', { name: 'Training setup', exact: true }).click();
  }

  const deck = firstBuild.locator('.support-deck');
  await expect(deck.locator('.support-name').first()).toHaveText(longName);
  await deck.scrollIntoViewIfNeeded();
  const geometry = await deck.locator('li').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const bounds = tile.getBoundingClientRect();
      const name = tile.querySelector('.support-name')?.getBoundingClientRect();
      const metadata = tile.querySelector('.support-meta')?.getBoundingClientRect();

      return {
        height: bounds.height,
        width: bounds.width,
        nameTop: name ? name.top - bounds.top : NaN,
        metadataTop: metadata ? metadata.top - bounds.top : NaN,
        fits: tile.scrollWidth <= tile.clientWidth
      };
    })
  );

  expect(geometry).toHaveLength(6);
  for (const key of ['height', 'width', 'nameTop', 'metadataTop'] as const) {
    const values = geometry.map((tile) => tile[key]);
    expect(Math.max(...values) - Math.min(...values), key + ' stays aligned').toBeLessThan(1);
  }

  expect(geometry.every((tile) => tile.fits)).toBe(true);
  await deck.screenshot({ path: info.outputPath('cm-aligned-support-deck.png') });
});

test('team details retry a failed request without closing the dialog', async ({ page }) => {
  let failDetail = true;

  await page.route('**/snapshots/*/teams/*', async (route) => {
    if (failDetail) {
      await route.fulfill({
        status: 503,
        json: { error: 'Temporary failure' },
        headers: { 'access-control-allow-origin': '*' }
      });
    } else {
      await route.fallback();
    }
  });

  await page.goto('/competitive/cm-data?tab=archetypes');
  await page.getByRole('button', { name: 'View team 1 details', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Team details', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('HTTP 503');
  await expect(dialog.locator('.builds article')).toHaveCount(0);

  failDetail = false;
  await dialog.getByRole('button', { name: 'Retry loading team', exact: true }).click();

  await expect(
    dialog.getByRole('region', { name: 'Captured team overview', exact: true })
  ).toBeVisible();
  await expect(dialog.locator('.builds article')).toHaveCount(3);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Add team to lobby', exact: true })
  ).toBeEnabled();
});

test('team details preserve loaded builds when copying the link is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('Clipboard access denied', 'NotAllowedError');
        }
      }
    });
  });

  await page.goto('/competitive/cm-data?tab=archetypes');
  await page.getByRole('button', { name: 'View team 1 details', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Team details', exact: true });
  await expect(dialog.locator('.builds article')).toHaveCount(3);

  await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();

  await expect(dialog.getByRole('alert')).toContainText(
    'Check clipboard permissions and try again.'
  );
  await expect(dialog.locator('.builds article')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Retry loading team', exact: true })).toHaveCount(
    0
  );
  await expect(
    dialog.getByRole('button', { name: 'Add team to lobby', exact: true })
  ).toBeEnabled();
});

test('skill details expand within the selected row and comparison stays independent', async ({
  page
}, info) => {
  let fail = true;
  await page.route('**/skills/details/*', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { error: 'Temporary failure' },
        headers: { 'access-control-allow-origin': '*' }
      });
    else {
      const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
      const shift = id === 10071 ? 0 : ((id % 3) + 1) * 8;
      const styles = Object.fromEntries(
        Object.entries(fixture.skillDetail.styles as Record<string, number[][]>).map(
          ([style, buckets]) => [
            style,
            buckets.map(([bucket, ...counts]) => [Math.min(99, (bucket ?? 0) + shift), ...counts])
          ]
        )
      );
      await route.fulfill({
        json: { ...fixture.skillDetail, skillId: id, styles },
        headers: { 'access-control-allow-origin': '*' }
      });
    }
  });

  await page.goto('/competitive/cm-data?tab=skills');
  const navigation = page.getByRole('tablist', { name: 'Champions Meeting views', exact: true });
  await expect(navigation.getByRole('tab')).toHaveCount(5);
  for (const name of ['Overview', 'Strategy', 'Umas', 'Skills', 'Archetypes'])
    await expect(navigation.getByRole('tab', { name, exact: true })).toHaveCount(1);
  const selectedBounds = await navigation
    .getByRole('tab', { name: 'Skills', exact: true })
    .boundingBox();

  expect(selectedBounds!.x).toBeGreaterThanOrEqual(0);
  expect(selectedBounds!.x + selectedBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByRole('tab', { name: 'Proc distributions', exact: true })).toHaveCount(0);
  await expect(page.locator('.lane')).toHaveCount(0);
  const table = page.getByRole('table', { name: 'CM Skill Analysis', exact: true });
  const inspector = page.locator('#cm-skill-detail');
  await expect(table.locator('thead th').last()).toHaveText('Compare');
  const count = new Set(fixture.skills.rows.map((r: number[]) => r[0])).size;
  await expect(table).toHaveAttribute('aria-rowcount', String(count + 1));
  expect(await table.locator('tbody tr[data-virtual-index]').count()).toBeLessThan(count);
  // A phone stacks each skill above its values; wider screens keep one compact line per skill.
  if (page.viewportSize()!.width < 768) {
    await expect(page.locator('.skill-list .table-wrap')).toHaveClass(/stacked/);
  } else {
    const rowHeights = await table
      .locator('tbody tr[data-virtual-index]')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(Math.max(...rowHeights)).toBeLessThanOrEqual(34);
  }
  await page
    .locator('.skill-list')
    .screenshot({ path: info.outputPath('cm-skill-list-compact.png') });
  await table.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Players', exact: true })).toHaveAttribute(
    'aria-sort',
    'ascending'
  );

  const first = Object.entries(fixture.skills.allPlayerCounts as Record<string, number>).sort(
    (a, b) => a[1] - b[1]
  )[0]![1];

  await expect
    .poll(async () =>
      Number(
        (
          await table
            .locator('tbody tr[data-virtual-index]')
            .first()
            .locator('td[data-label="Players"]')
            .innerText()
        ).replaceAll(',', '')
      )
    )
    .toBe(first);
  await table.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Players', exact: true })).toHaveAttribute(
    'aria-sort',
    'descending'
  );

  await expect
    .poll(async () =>
      Number(
        (
          await table
            .locator('tbody tr[data-virtual-index]')
            .first()
            .locator('td[data-label="Players"]')
            .innerText()
        ).replaceAll(',', '')
      )
    )
    .toBe(Math.max(...Object.values(fixture.skills.allPlayerCounts as Record<string, number>)));
  const scroll = page.getByRole('region', { name: 'CM Skill Analysis scroll area' });
  await scroll.evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect
    .poll(async () =>
      Number(
        await table
          .locator('tbody tr[data-virtual-index]')
          .last()
          .getAttribute('data-virtual-index')
      )
    )
    .toBe(count - 1);
  expect(await table.locator('tbody tr[data-virtual-index]').count()).toBeLessThan(count / 2);
  const search = page.getByRole('searchbox', { name: 'Search skills', exact: true });
  await search.fill('10071');
  const inspect = table.getByRole('button', { name: 'Inspect Skill 10071', exact: true });
  await expect(inspect).toHaveAttribute('title', /ID 10071/);
  await table
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: 'Inspect Skill 10071', exact: true }) })
    .locator('td[data-label="Players"]')
    .click();

  await expect(inspect).toHaveAttribute('aria-expanded', 'true');
  await inspect.focus();
  await page.keyboard.press('Enter');
  await expect(inspect).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(inspect).toHaveAttribute('aria-expanded', 'true');
  await expect(inspector).toBeVisible();
  await expect(table).toHaveAttribute(
    'aria-rowcount',
    String(
      new Set<number>(
        fixture.skills.rows
          .map((r: number[]) => r[0])
          .filter((id: number) => String(id).includes('10071'))
      ).size + 2
    )
  );
  expect(
    await inspector.evaluate((element) => element.closest('tr')?.classList.contains('detail-row'))
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Retry activation data', exact: true })
  ).toBeVisible();

  fail = false;
  await page.getByRole('button', { name: 'Retry activation data', exact: true }).click();
  await expect(inspector.locator('.lane svg[role="slider"]')).toHaveCount(1);
  const total = Object.values(fixture.skillDetail.styles as Record<string, number[][]>)
    .flat()
    .reduce((sum, row) => sum + row[1]!, 0);

  await expect(inspector.locator('.event-count')).toContainText(
    total.toLocaleString('en-US') + ' activation events'
  );
  await inspector
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  await expect(inspector.locator('.lane-reading')).toContainText(
    'Central 80% of events 1250–1275 m'
  );
  await inspector
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  await table.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(inspector.getByRole('slider')).toHaveAttribute(
    'aria-label',
    'Skill 10071 activation distribution'
  );
  await expect(inspect).toHaveAttribute('aria-expanded', 'true');
  await expect(
    table.getByRole('button', { name: 'Add Skill 10071 to comparison', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');

  await table.getByRole('button', { name: 'Add Skill 10071 to comparison', exact: true }).click();
  await expect(inspect).toHaveAttribute('aria-expanded', 'true');
  const comparison = page.getByRole('region', { name: 'Skill comparison', exact: true });
  await expect(comparison.locator('.event-count')).toHaveText(
    'Activations scaled to each skill’s peak'
  );
  await expect(comparison.locator('.line-scale')).toContainText('100%');
  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(1);
  await inspect.click();
  await expect(inspector).toHaveCount(0);
  await expect(comparison.locator('.lane')).toHaveCount(1);
  const ids = [...new Set<number>(fixture.skills.rows.map((r: number[]) => r[0]))]
    .filter((id) => id !== 10071)
    .slice(0, 4);

  for (const id of ids.slice(0, 3)) {
    await search.fill(String(id));
    await table
      .getByRole('button', { name: 'Add Skill ' + id + ' to comparison', exact: true })
      .click();
  }

  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(1);
  await expect(comparison.locator('.comparison-line')).toHaveCount(4);
  const add = comparison.getByRole('combobox', { name: 'Add a skill to comparison', exact: true });
  await add.fill(String(ids[3]));
  await page
    .getByRole('option', { name: 'Skill ' + ids[3] + ' (ID ' + ids[3] + ')', exact: true })
    .click();

  await expect(add).toHaveValue('');
  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(1);
  await expect(comparison.locator('.comparison-line')).toHaveCount(5);
  await expect(comparison.locator('.comparison-table tbody tr')).toHaveCount(5);
  const comparedChipWidths = await comparison
    .locator('.legend-skill .skill-chip')
    .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().width));
  expect(Math.max(...comparedChipWidths) - Math.min(...comparedChipWidths)).toBeLessThan(1);
  const charts = comparison.locator('.lane svg[role="slider"]');
  // A burst of pointer events uses the latest position, with one layout read per frame.
  expect(
    await charts.first().evaluate(async (chart) => {
      const bounds = chart.getBoundingClientRect(),
        read = chart.getBoundingClientRect.bind(chart);

      let reads = 0;
      chart.getBoundingClientRect = () => {
        reads++;
        return read();
      };

      for (const position of [0.1, 0.4, 0.985])
        chart.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: bounds.left + bounds.width * position
          })
        );
      await new Promise(requestAnimationFrame);
      delete (chart as Partial<SVGElement>).getBoundingClientRect;
      return reads;
    })
  ).toBe(1);

  for (const chart of await charts.all())
    await expect(chart).toHaveAttribute('aria-valuenow', '98');
  await expect(comparison.locator('.course-cursor')).toHaveCount(1);
  for (const cursor of await comparison.locator('.course-cursor').all())
    await expect(cursor).toHaveAttribute('style', /left:\s*98\.5%/);
  await expect(comparison.locator('input[type="range"]')).toHaveCount(0);
  expect(await comparison.locator('.comparison-line').nth(4).getAttribute('stroke')).not.toBe('');
  await add.fill('10071');
  await expect(
    page.getByRole('option', { name: 'Skill 10071 (ID 10071)', exact: true })
  ).toHaveCount(0);

  await page.keyboard.press('Escape');
  await search.fill('10071');
  await inspect.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Running style', exact: true }).click();
  await page.getByRole('option', { name: 'Pace Chaser', exact: true }).click();
  const pace = fixture.skillDetail.styles.Senko.reduce(
    (sum: number, row: number[]) => sum + row[1]!,
    0
  );

  await expect(inspector.locator('.event-count')).toContainText(
    pace.toLocaleString('en-US') + ' activation events'
  );
  await inspector
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  await expect(inspector.locator('.lane-reading')).toContainText(
    'Central 80% of events 1250–1425 m'
  );
  await inspector
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  const inlineChart = inspector.getByRole('slider', {
    name: 'Skill 10071 activation distribution',
    exact: true
  });

  await expect(inspector.locator('input[type="range"]')).toHaveCount(0);
  await expect(inlineChart).toHaveAttribute('aria-valuenow', '50');
  await expect(inspector.getByLabel('Outcomes at inspected distance')).toContainText('10,989');
  await inlineChart.press('ArrowRight');
  await expect(inlineChart).toHaveAttribute('aria-valuenow', '51');
  await inlineChart.press('ArrowLeft');
  await expect(inlineChart).toHaveAttribute('aria-valuetext', /10,989 events/);
  await inlineChart.press('Home');
  await inlineChart.press('ArrowLeft');
  await expect(inlineChart).toHaveAttribute('aria-valuenow', '0');
  await inlineChart.press('End');
  await inlineChart.press('ArrowRight');
  await expect(inlineChart).toHaveAttribute('aria-valuenow', '99');
  // Touch users inspect the same bins directly on the plot.
  await inlineChart.evaluate((chart) => {
    const bounds = chart.getBoundingClientRect();
    chart.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        clientX: bounds.left + bounds.width * 0.505
      })
    );
  });

  await expect(inlineChart).toHaveAttribute('aria-valuenow', '50');
  await expect(inspector.getByLabel('Outcomes at inspected distance')).toContainText('10,989');
  expect(
    await inspector.evaluate((element) => element.getBoundingClientRect().width)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await comparison
    .getByRole('button', { name: 'Remove Skill 10071 from comparison', exact: true })
    .click();

  await expect(comparison.locator('.comparison-table tbody tr')).toHaveCount(4);
  await expect(comparison.locator('.comparison-line')).toHaveCount(4);
  await expect(inspector.locator('.lane')).toHaveCount(1);
  await navigation.getByRole('tab', { name: 'Umas', exact: true }).click();
  await navigation.getByRole('tab', { name: 'Skills', exact: true }).click();
  await expect(search).toHaveValue('10071');
  await expect(inspect).toHaveAttribute('aria-expanded', 'true');
  await expect(comparison.locator('.comparison-table tbody tr')).toHaveCount(4);
  await comparison.screenshot({ path: info.outputPath('cm-skill-line-comparison.png') });
  await page.screenshot({ path: info.outputPath('cm-inline-skills.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('skill rows load timing automatically and share it with inline details and comparison', async ({
  page
}) => {
  const snapshotId = fixture.summary.snapshotId;
  let detailRequests = 0;

  await page.route('**/api/simdata/manifest', (route) =>
    route.fulfill({
      json: {
        snapshots: fixture.manifest.snapshots.map((snapshot: { snapshotId: string }) => ({
          ...snapshot,
          playerUsage: { schemaVersion: 1 }
        }))
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  );
  await page.route('**/snapshots/*/uma-usage', (route) =>
    route.fulfill({
      json: {
        snapshotId,
        totalPlayers: 20,
        skills: [
          { id: 10071, style: 0, players: 11 },
          { id: 10071, style: 2, players: 0 }
        ]
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  );
  await page.route('**/skills/details/*', (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    if (id === 10071) detailRequests++;
    return route.fulfill({
      json: { ...fixture.skillDetail, skillId: id },
      headers: { 'access-control-allow-origin': '*' }
    });
  });

  await page.goto('/competitive/cm-data?tab=skills');
  await page.getByRole('searchbox', { name: 'Search skills', exact: true }).fill('10071');
  const table = page.getByRole('table', { name: 'CM Skill Analysis', exact: true });
  const row = table.locator('tbody tr[data-virtual-index]').filter({
    has: page.getByRole('button', { name: 'Inspect Skill 10071', exact: true })
  });
  await expect(row.locator('td[data-label="Players"]')).toHaveText('11');
  await expect(row.locator('td[data-label="Mean distance"]')).toHaveText(/^~[\d,]+ m$/);
  await expect(row.locator('td[data-label="Median distance"]')).toHaveText(/^~[\d,]+ m$/);
  await row.getByRole('button', { name: 'Inspect Skill 10071', exact: true }).click();
  const inspector = page.locator('#cm-skill-detail');
  await expect(inspector.getByRole('slider')).toBeVisible();
  const mean = await row.locator('td[data-label="Mean distance"]').innerText();
  expect(mean).toMatch(/^~[\d,]+ m$/);

  await inspector.getByRole('button', { name: 'Close skill details', exact: true }).click();
  await expect(row.locator('td[data-label="Mean distance"]')).toHaveText(mean);
  await table.getByRole('button', { name: 'Mean distance', exact: true }).click();
  await expect(
    table.getByRole('columnheader', { name: 'Mean distance', exact: true })
  ).toHaveAttribute('aria-sort', 'descending');
  await expect(table.locator('tbody tr[data-virtual-index]').first()).toContainText(mean);
  await table.getByRole('button', { name: 'Mean distance', exact: true }).click();
  await expect(table.locator('tbody tr[data-virtual-index]').first()).toContainText(mean);
  await row.getByRole('button', { name: 'Add Skill 10071 to comparison', exact: true }).click();
  await row.getByRole('button', { name: 'Inspect Skill 10071', exact: true }).click();
  await expect(page.locator('.lane svg[role="slider"]')).toHaveCount(2);
  expect(detailRequests).toBe(1);

  await page.getByRole('combobox', { name: 'Running style', exact: true }).click();
  await page.getByRole('option', { name: 'Pace Chaser', exact: true }).click();
  await expect(row.locator('td[data-label="Players"]')).toHaveText('0');
  await expect(row.locator('td[data-label="Mean distance"]')).not.toHaveText('—');

  await page.getByRole('searchbox', { name: 'Search skills', exact: true }).fill('');
  const scrollArea = page.getByRole('region', { name: 'CM Skill Analysis scroll area' });
  expect((await scrollArea.boundingBox())!.height).toBeLessThanOrEqual(960);
});

test('skill outcomes distinguish repeated procs, variants and selected first-activation ranges', async ({
  page
}, info) => {
  const snapshotId = fixture.summary.snapshotId;
  const overview = {
    ...fixture.skills,
    rows: [
      [10071, 'Nige', 2, 20, 12, 17, 5, 4, 1, 7, 2],
      [10071, 'Senko', 2, 10, 8, 8, 0, 2, 1, 4, 1]
    ],
    allPlayerCounts: { 10071: 3 },
    variants: { 10071: [10071, 10081] },
    populationByStyle: { Nige: [100, 20], Senko: [80, 12] }
  };
  const detail = {
    snapshotId,
    skillId: 10071,
    bucketCount: 100,
    courseDistance: overview.courseDistance,
    styles: {
      Nige: [
        [0, 2, 2, 1, 1],
        [70, 15, 10, 3, 6]
      ],
      Senko: [[70, 8, 8, 2, 4]]
    },
    variants: {
      10071: {
        rows: [overview.rows[0]],
        styles: {
          Nige: [
            [0, 2, 2, 1, 1],
            [70, 15, 10, 3, 6]
          ]
        }
      },
      10081: { rows: [overview.rows[1]], styles: { Senko: [[70, 8, 8, 2, 4]] } }
    }
  };
  await page.route('**/skills/overview', (route) =>
    route.fulfill({ json: overview, headers: { 'access-control-allow-origin': '*' } })
  );
  await page.route('**/skills/details/*', (route) =>
    route.fulfill({ json: detail, headers: { 'access-control-allow-origin': '*' } })
  );
  await page.goto('/competitive/cm-data?tab=skills');
  await page.getByRole('button', { name: 'Inspect Skill 10071', exact: true }).waitFor();
  const mainRow = page.locator('.skill-list tr[data-virtual-index]').first();
  await expect(mainRow.locator('.variant-alternatives')).toHaveText('1 alternative');
  await expect(mainRow.locator('.variant-alternatives')).toHaveAttribute('title', 'Skill 10081');
  await expect(mainRow.locator('.skill-label .skill-chip')).toHaveCount(2);
  await expect(mainRow.locator('.style-procs')).toContainText(/Front\s+60\.0%/);
  await expect(mainRow.locator('.style-procs')).toContainText(/Pace\s+80\.0%/);
  await page.getByRole('button', { name: 'Inspect Skill 10071', exact: true }).click();
  const expanded = page.locator('#cm-skill-detail');
  const breakdown = expanded.getByRole('region', { name: 'Skill outcome breakdown', exact: true });
  await expect(breakdown.locator('.outcome-rows tr')).toHaveCount(5);
  const variantChipWidths = await breakdown
    .locator('.outcome-skill .skill-chip')
    .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().width));
  expect(Math.max(...variantChipWidths) - Math.min(...variantChipWidths)).toBeLessThan(1);
  await breakdown
    .getByRole('button', { name: 'How skill percentages are calculated', exact: true })
    .click();
  await expect(breakdown.locator('.rates-help')).toContainText('12 of those 60 entries won');
  await breakdown
    .getByRole('button', { name: 'How skill percentages are calculated', exact: true })
    .click();
  await expect(breakdown.locator('.outcome-rows tr').first()).toContainText('30.0%');
  if (page.viewportSize()!.width > 1000) {
    expect((await expanded.boundingBox())!.height).toBeLessThanOrEqual(560);
  }

  if (page.viewportSize()!.width >= 768) {
    const listRow = page.locator('.skill-list tr[data-virtual-index]:not(.detail-row)').first();
    expect((await listRow.boundingBox())!.height).toBeLessThanOrEqual(34);
  }
  const activationRates = expanded.getByRole('rowgroup', {
    name: 'Activation and double-proc rates'
  });
  await expect(activationRates.getByRole('row', { name: /Repeat activation rate/ })).toContainText(
    '16.7%'
  );
  await expect(activationRates.getByRole('row', { name: /Repeat activation rate/ })).toContainText(
    '25.0%'
  );
  await expect(breakdown.getByRole('row', { name: /No variant learned/ })).toBeVisible();
  await expect(expanded.locator('.spurt-band')).toContainText('Final spurt from 1,667 m');
  await expanded
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  await expect(expanded.locator('.lane-reading')).toContainText('Mean / median');
  await expanded
    .getByRole('button', { name: 'How to read activation distances', exact: true })
    .click();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Colorblind palette', exact: true }).check();
  await expect(mainRow.locator('.style-procs span[title^="Pace Chaser"] i')).toHaveCSS(
    'background-color',
    'rgb(220, 38, 127)'
  );
  await expect(expanded.locator('.style-heading i').nth(2)).toHaveCSS(
    'background-color',
    'rgb(220, 38, 127)'
  );
  await page.getByRole('checkbox', { name: 'Colorblind palette', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.locator('.skill-list').screenshot({ path: info.outputPath('cm-skill-colors.png') });
  const chart = expanded.getByRole('slider');
  await chart.press('Home');
  await expect(expanded.getByLabel('Outcomes at inspected distance')).toContainText(
    'First activations 2'
  );
  await expanded.getByRole('combobox', { name: 'Outcome measure', exact: true }).click();
  await page.getByRole('option', { name: 'Runner entries', exact: true }).click();
  await chart.press('Shift+ArrowRight');
  await expect(breakdown.locator('.outcome-rows tr')).toHaveCount(3);
  await expect(breakdown.locator('.outcome-rows tr').first().locator('td').last()).toHaveText('2');
  await expect(expanded.locator('.range-toolbar')).toContainText('Selected 0–50 m');
  await chart.press('Escape');
  await expect(breakdown.locator('.outcome-rows tr')).toHaveCount(5);
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.705, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.005, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(expanded.locator('.range-toolbar')).toContainText('Selected 0–1775 m');
  await expect(breakdown.locator('.outcome-rows tr').first().locator('td').last()).toHaveText('20');
  await expanded.getByRole('button', { name: 'Clear distance range', exact: true }).click();
  await expect(breakdown.locator('.outcome-rows tr')).toHaveCount(5);
  await expanded.getByRole('combobox', { name: 'Outcome measure', exact: true }).click();
  await page.getByRole('option', { name: 'Individual win rate', exact: true }).click();
  await page.screenshot({ path: info.outputPath('cm-skill-outcomes.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('compared skills use a compact table with expandable outcomes and shared distance filtering', async ({
  page
}, info) => {
  const snapshotId = fixture.summary.snapshotId;
  const overview = {
    ...fixture.skills,
    rows: [
      [10071, 'Nige', 2, 20, 12, 17, 5, 4, 1, 7, 2],
      [10071, 'Senko', 2, 10, 8, 8, 0, 2, 1, 4, 1],
      [10091, 'Nige', 2, 15, 6, 8, 2, 2, 1, 4, 2]
    ],
    allPlayerCounts: { 10071: 3, 10091: 2 },
    variants: { 10071: [10071, 10081, 10082], 10091: [10091] },
    populationByStyle: { Nige: [100, 20], Senko: [80, 12] }
  };
  const details = {
    10071: {
      snapshotId,
      skillId: 10071,
      bucketCount: 100,
      courseDistance: overview.courseDistance,
      styles: {
        Nige: [
          [0, 2, 2, 1, 1],
          [70, 15, 10, 3, 6]
        ],
        Senko: [[70, 8, 8, 2, 4]]
      },
      variants: {
        10071: {
          rows: [overview.rows[0]],
          styles: {
            Nige: [
              [0, 2, 2, 1, 1],
              [70, 15, 10, 3, 6]
            ]
          }
        },
        10081: { rows: [overview.rows[1]], styles: { Senko: [[70, 8, 8, 2, 4]] } }
      }
    },
    10091: {
      snapshotId,
      skillId: 10091,
      bucketCount: 100,
      courseDistance: overview.courseDistance,
      styles: {
        Nige: [
          [0, 3, 3, 1, 2],
          [70, 5, 3, 1, 2]
        ]
      }
    }
  };
  await page.route('**/skills/overview', (route) =>
    route.fulfill({ json: overview, headers: { 'access-control-allow-origin': '*' } })
  );
  await page.route('**/skills/details/*', (route) => {
    const id = Number(route.request().url().split('/').at(-1)) as keyof typeof details;
    return route.fulfill({ json: details[id], headers: { 'access-control-allow-origin': '*' } });
  });

  await page.goto('/competitive/cm-data?tab=skills');
  await expect(page.locator('.variant-alternatives').first()).toHaveText('2 alternatives');
  await expect(page.locator('.variant-alternatives').first()).toHaveAttribute(
    'title',
    'Skill 10081, Skill 10082'
  );
  await page.getByRole('button', { name: 'Add Skill 10071 to comparison', exact: true }).click();
  await page.getByRole('button', { name: 'Add Skill 10091 to comparison', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Skill comparison', exact: true });
  const breakdown = comparison.getByRole('region', {
    name: 'Skill outcome breakdown',
    exact: true
  });
  const firstSkill = breakdown.getByRole('rowgroup', { name: 'Skill 10071 outcomes', exact: true });
  const secondSkill = breakdown.getByRole('rowgroup', {
    name: 'Skill 10091 outcomes',
    exact: true
  });
  const firstToggle = firstSkill.getByRole('button', {
    name: 'Skill 10071 outcome details',
    exact: true
  });
  await expect(breakdown).toHaveCount(1);
  await expect(breakdown.locator('tbody tr')).toHaveCount(2);
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  const measure = comparison.getByRole('combobox', { name: 'Outcome measure', exact: true });
  await expect(measure).toHaveCount(1);
  await expect(firstSkill.locator('.compared-main td.total')).toHaveText('30.0%');
  await expect(secondSkill.locator('.compared-main td.total')).toHaveText('33.3%');
  if (page.viewportSize()!.width > 600) {
    expect((await comparison.locator('.breakdown').boundingBox())!.height).toBeLessThan(160);
  }

  await comparison.screenshot({ path: info.outputPath('cm-compact-skill-comparison.png') });
  await measure.click();
  await page.getByRole('option', { name: 'Runner entries', exact: true }).click();
  await expect(firstSkill.locator('.compared-main td.total')).toHaveText('20');
  await expect(secondSkill.locator('.compared-main td.total')).toHaveText('6');
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(firstSkill.getByRole('row', { name: /Repeat activation rate/ })).toContainText(
    '16.7%'
  );
  await expect(firstSkill.locator('.cohort-row')).toHaveCount(4);
  await expect(secondSkill.locator('tr')).toHaveCount(1);
  await secondSkill
    .getByRole('button', { name: 'Skill 10091 outcome details', exact: true })
    .click();
  await expect(secondSkill.locator('.cohort-row')).toHaveCount(2);

  const chart = comparison.getByRole('slider');
  await chart.press('Home');
  await chart.press('Shift+ArrowRight');
  await expect(firstSkill.locator('.cohort-row')).toHaveCount(2);
  await expect(secondSkill.locator('.cohort-row')).toHaveCount(0);
  await expect(firstSkill.locator('.compared-main td.total')).toHaveText('2');
  await expect(secondSkill.locator('.compared-main td.total')).toHaveText('3');
  await chart.press('Escape');
  await expect(firstSkill.getByRole('row', { name: /No variant learned/ })).toBeVisible();
  await firstToggle.press('Enter');
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(firstSkill.locator('tr')).toHaveCount(1);

  await page.getByRole('combobox', { name: 'Running style', exact: true }).click();
  await page.getByRole('option', { name: 'Front Runner', exact: true }).click();
  await expect(breakdown.locator('thead th')).toHaveCount(3);
  await expect(firstSkill.locator('.compared-main td.total')).toHaveText('12');
  await comparison.screenshot({ path: info.outputPath('cm-compared-skill-details.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await comparison
    .getByRole('button', { name: 'Remove Skill 10071 from comparison', exact: true })
    .click();
  await expect(firstSkill).toHaveCount(0);
  await expect(secondSkill).toHaveCount(1);
  await expect(secondSkill.locator('.cohort-row')).toHaveCount(2);
  await expect(measure).toContainText('Runner entries');
});

test('Uma running-style table replaces the separate explorer and keeps captured builds reachable', async ({
  page
}, info) => {
  await page.goto('/competitive/cm-data?tab=explore&view=umas');
  await expect(page.getByRole('tab', { name: 'Umas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await expect(page.getByRole('tab', { name: 'Running-style table', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  const map = page.getByRole('table', { name: 'Uma role performance map' });
  await expect(map).toBeVisible();
  await map.getByRole('button', { name: /^Front Runner/ }).click();
  await expect(map.getByRole('columnheader', { name: /Front Runner/ })).toHaveAttribute(
    'aria-sort',
    'descending'
  );

  await page.getByRole('combobox', { name: 'Running style', exact: true }).click();
  await page.getByRole('option', { name: 'Front Runner', exact: true }).click();
  await expect(map.locator('thead th')).toHaveCount(2);
  await map.locator('tbody').getByRole('button').first().click();
  await expect(page.getByRole('complementary', { name: 'Selected Uma insight' })).toBeVisible();
  await page.getByRole('button', { name: 'Find captured builds', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Archetypes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await expect(page.locator('.team-row')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'View team 1 details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Team details', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.builds article')).toHaveCount(3);

  // A single runner joins the lobby tray without leaving CM Data.
  await dialog
    .getByRole('button', { name: /^Add .+ to the lobby$/ })
    .first()
    .click();
  await expect(dialog.getByRole('button', { name: /^Remove .+ from the lobby$/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('cm-team-details.png') });
  await page.keyboard.press('Escape');
  const lobby = page.getByRole('complementary', { name: 'Lobby', exact: true });
  await expect(lobby).toContainText('1/9 Uma');
  await expect(lobby.getByRole('button', { name: 'Open in simulator', exact: true })).toBeEnabled();
  await lobby.getByRole('button', { name: 'Review lobby', exact: true }).click();
  await lobby.getByRole('button', { name: 'Clear lobby', exact: true }).click();
  await expect(lobby).toHaveCount(0);
  await page.getByRole('tab', { name: 'Umas', exact: true }).click();
  await page.getByRole('tab', { name: 'Performance ranges', exact: true }).click();
  await expect(page.locator('.ranking')).not.toHaveCount(0);
  await page.screenshot({ path: info.outputPath('cm-uma-ranges.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('captured teams fetch the next batch on scroll and reset on server sorting', async ({
  page
}) => {
  const calls: number[] = [];
  const teams = Array.from({ length: 90 }, (_, i) => ({
    ...fixture.teams.teams[i % fixture.teams.teams.length],
    id: 'virtual-team-' + i
  }));

  await page.route('**/snapshots/*/teams?*', async (route) => {
    const url = new URL(route.request().url()),
      offset = Number(url.searchParams.get('offset'));

    calls.push(offset);
    await route.fulfill({
      json: {
        snapshotId: fixture.summary.snapshotId,
        teams: teams.slice(offset, offset + Number(url.searchParams.get('limit'))),
        totalTeams: 90,
        totalOwners: 90
      },
      headers: { 'access-control-allow-origin': '*' }
    });
  });

  await page.goto('/competitive/cm-data?tab=archetypes');
  await expect(page.locator('.team-row')).not.toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0);
  for (let i = 0; i < 4 && !calls.includes(30); i++) {
    await page.locator('.loaded-count').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  }

  await expect.poll(() => calls).toContain(30);
  expect(await page.locator('.team-row').count()).toBeLessThan(60);
  const ranking = page.getByRole('combobox', { name: 'Rank teams by', exact: true });
  await ranking.click();
  await page.getByRole('option', { name: 'Win rate', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toBe(0);
  await expect(ranking).toContainText('Win rate');
});

test('strategy keeps the familiar chart layout with sortable room data', async ({ page }, info) => {
  await page.goto('/competitive/cm-data?tab=strategy');
  await expect(page.getByRole('radio', { name: 'Team', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  const insight = [...fixture.summary.styles]
    .filter((row: { owners: number; pop: number }) => row.owners >= 30 && row.pop > 0)
    .sort(
      (a: { winShare: number; pop: number }, b: { winShare: number; pop: number }) =>
        b.winShare - b.pop - (a.winShare - a.pop)
    )[0];

  await expect(page.locator('.field-insight')).toContainText(
    ((insight.winShare - insight.pop) * 100).toFixed(1) + ' percentage points'
  );
  await page
    .getByRole('radiogroup', { name: 'Inspect room count', exact: true })
    .getByRole('radio', { name: '2 in room', exact: true })
    .click();

  const frontBucket = fixture.summary.saturation[1].find((bucket: { x: number }) => bucket.x === 2);
  await expect(
    page.locator('.readout-values>div').filter({ hasText: 'Front Runner' })
  ).toContainText((frontBucket.rate * 100).toFixed(1) + '%');

  const roomCounts = page.getByRole('radiogroup', { name: 'Inspect room count', exact: true });
  await expect(roomCounts.getByRole('radio', { name: '2 in room', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.keyboard.press('ArrowLeft');
  await expect(roomCounts.getByRole('radio', { name: '1 in room', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(roomCounts.getByRole('radio', { name: '2 in room', exact: true })).toBeFocused();

  const inspectValues = page
    .locator('.saturation')
    .getByRole('button', { name: 'Inspect values', exact: true });
  await inspectValues.click();
  await expect(inspectValues).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('table', {
      name: 'Per-Uma win rate versus number of the same style values',
      exact: true
    })
  ).toBeVisible();
  await inspectValues.click();
  await expect(inspectValues).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('cm-compact-header-controls.png') });
  await page
    .locator('.representatives')
    .screenshot({ path: info.outputPath('cm-representative-controls.png') });

  const rooms = page.getByRole('table', { name: 'Room compositions', exact: true });
  await rooms.getByRole('button', { name: 'Frequency', exact: true }).click();
  await expect(rooms.getByRole('columnheader', { name: 'Frequency', exact: true })).toHaveAttribute(
    'aria-sort',
    'ascending'
  );

  const expected = Math.min(
    ...fixture.summary.rooms.rows.map((r: { frequency: number }) => r.frequency)
  );

  await expect(rooms.locator('tbody tr[data-virtual-index]').first()).toContainText(
    (expected * 100).toFixed(1) + '%'
  );
  const compositions = page.getByRole('table', {
    name: 'Team composition performance',
    exact: true
  });

  const supported = fixture.summary.archetypes.filter(
    (r: { owners: number }) => r.owners >= Math.ceil(fixture.summary.meta.populationOwners * 0.01)
  );

  await expect(compositions).toHaveAttribute('aria-rowcount', String(supported.length + 1));
  await compositions.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(
    compositions.getByRole('columnheader', { name: 'Players', exact: true })
  ).toHaveAttribute('aria-sort', 'descending');

  await expect(compositions.locator('tbody tr[data-virtual-index]').first()).toContainText(
    Math.max(...supported.map((r: { owners: number }) => r.owners)).toLocaleString('en-US')
  );
  await page
    .getByRole('radiogroup', { name: 'Running style', exact: true })
    .getByRole('radio', { name: 'Front Runner', exact: true })
    .click();

  await expect(page.locator('.style-row')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Front Runner overview' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('cm-strategy-sorted.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('CM cards align, room rows stay compact, and standard tabs support keyboard navigation', async ({
  page
}) => {
  await page.goto('/competitive/cm-data');
  const nav = page.getByRole('tablist', { name: 'Champions Meeting views', exact: true });
  const intro = nav.getByRole('tab', { name: 'Overview', exact: true });
  await expect(intro).toHaveAttribute('aria-selected', 'true');
  const totals = page
    .getByRole('region', { name: 'Dataset summary', exact: true })
    .locator('.dataset-stats');

  await expect(totals).toContainText(fixture.summary.meta.populationRaces.toLocaleString('en-US'));
  expect((await totals.boundingBox())!.width).toBeGreaterThan(250);
  await expect(nav).toHaveClass(/navigation/);
  await intro.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav.getByRole('tab', { name: 'Strategy', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  const rooms = page.getByRole('table', { name: 'Room compositions', exact: true });
  await rooms.scrollIntoViewIfNeeded();
  const heights = await rooms
    .locator('tbody tr[data-virtual-index]')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));

  expect(heights.length).toBeGreaterThan(0);
  expect(Math.max(...heights)).toBeLessThanOrEqual(34);
  if (page.viewportSize()!.width > 1000) {
    for (const selector of ['.top-panels', '.composition-panels']) {
      const heights = await page
        .locator(selector + '>section>.chart-frame')
        .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));

      expect(heights).toHaveLength(2);
      expect(Math.abs(heights[0]! - heights[1]!)).toBeLessThan(2);
      if (selector === '.composition-panels') expect(Math.max(...heights)).toBeLessThanOrEqual(660);
    }
  }

  const saturation = page.locator('.saturation');
  const front = saturation.getByRole('button', { name: 'Front Runner', exact: true });
  await front.click();
  await expect(front).toHaveAttribute('aria-pressed', 'false');
  await expect(
    saturation.locator('.readout-values>div').filter({ hasText: 'Front Runner' })
  ).toHaveCount(0);

  await front.click();
  await expect(
    saturation.locator('.readout-values>div').filter({ hasText: 'Front Runner' })
  ).toHaveCount(1);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});
