import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  CPU_PROFILES,
  HOST,
  REPORTS,
  assertAuditBuild,
  delta,
  ensureReportsDirectory,
  installCpuInstrumentation,
  installNetworkFixtures,
  metricsMap,
  readRuntimeWindow,
  resetRuntimeWindow,
  round,
  safeName,
  startStaticServer,
  summarizeAnimations,
} from './cpu-audit-harness.mjs';

const PORT = 4328;
const ORIGIN = `http://${HOST}:${PORT}`;
const CPU_THROTTLE_RATE = 4;
const LOAD_SETTLE_MS = 1_500;
const SETUP_SETTLE_MS = 1_500;
const ACTION_SETTLE_MS = 2_000;
const IDLE_OBSERVATION_MS = 1_500;
const label = stringArg('--label', 'deep-current');
const scenarioFilter = stringArg('--scenario', '');
const scenarioPrefix = stringArg('--scenario-prefix', '');
const profileFilter = stringArg('--profile', '');
const maxIdleMsPerSecond = numberArg('--max-idle-ms-per-second', 25);
const maxActionTaskMs = numberArg('--max-action-task-ms', 1_300);
const actionBudgetOverride = process.argv.includes('--max-action-task-ms');
const ACTION_TASK_BUDGETS = {
  'database-basic-expand': 700,
  'database-advanced-switch': 2_200,
  'database-uql-open': 1_400,
  'database-uql-editor': 2_500,
  'database-uql-reference': 1_000,
  'database-bookmarks-tab': 500,
  'database-list-mode': 1_100,
  'database-scroll-resize': 1_300,
  'lineage-populated': 100,
  'lineage-odds-tabs': 1_200,
  'lineage-per-run-toggle': 600,
  'lineage-mobile-ggp': 800,
  'lineage-saves-dialog': 600,
  'lineage-character-dialog': 600,
  'lineage-resize': 500,
  'carat-populated': 150,
  'carat-income-open': 1_000,
  'carat-income-cycles': 1_500,
  'carat-setup-tabs': 1_500,
  'carat-scroll-resize': 1_500,
};

const LINEAGE_POSITIONS = [
  'target',
  'p1', 'p2',
  'p1-1', 'p1-2', 'p2-1', 'p2-2',
  'p1-1-1', 'p1-1-2', 'p1-2-1', 'p1-2-2',
  'p2-1-1', 'p2-1-2', 'p2-2-1', 'p2-2-2',
];
const LINEAGE_CHARACTER_IDS = [
  104003, 113301, 108602, 111002, 113201,
  109001, 104603, 109802, 112701, 107002,
  108402, 110702, 109601, 113101, 111501,
];
const LINEAGE_STATE = LINEAGE_POSITIONS.map((position, index) => ({
  position,
  characterId: LINEAGE_CHARACTER_IDS[index],
  // Veteran identity keeps a populated node valid even when the character
  // fallback and affinity resources finish in the opposite order.
  veteran: {
    member_id: index + 1,
    card_id: LINEAGE_CHARACTER_IDS[index],
    trained_chara_id: Math.floor(LINEAGE_CHARACTER_IDS[index] / 100),
  },
  sparks: index > 0 && index < 7
    ? [
        { factorId: `audit-blue-${index}`, level: 3, name: 'Speed', type: 0 },
        { factorId: `audit-white-${index}`, level: 2, name: 'Corner Adept', type: 3 },
      ]
    : [],
  manualWinSaddleIds: index < 7 ? [101, 102, 103 + (index % 2)] : [],
}));

const CARAT_PLAN = {
  id: 'cpu-audit-carat-plan',
  name: 'CPU audit long-range plan',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  projectionStartDate: '2026-01-01',
  balances: {
    freeJewels: 30_000,
    paidJewels: 5_000,
    umaTickets: 20,
    supportTickets: 20,
    rainbowCrystals: 2,
    goldCrystals: 4,
  },
  enabledIncomeRuleIds: ['audit-daily', 'audit-monthly', 'premium-training-pass'],
  enabledRewardIds: [],
  disabledRewardIds: [],
  enabledRewardEventIds: [],
  disabledEventIds: [],
  scenarioSelections: { speculative_income: 'include', training_pass: 'premium' },
  variableRewardSelections: {},
  freePullCampaignSelections: {},
  resourceDefaultsApplied: true,
  customIncome: [],
  targets: Array.from({ length: 12 }, (_value, index) => {
    const date = new Date(Date.UTC(2026, 5 + index * 6, 15)).toISOString().slice(0, 10);
    return {
      id: `cpu-audit-target-${index}`,
      eventId: `cpu-audit-event-${index}`,
      title: `Audit target ${index + 1}`,
      bannerKind: 'other',
      bannerStart: date,
      bannerEnd: date,
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      pickupGoals: [],
      useTickets: true,
      allowPaidJewels: true,
    };
  }),
};
const CARAT_COLLECTION = {
  version: 1,
  activePlanId: CARAT_PLAN.id,
  plans: [CARAT_PLAN],
};

const scenarios = [
  {
    name: 'database-basic-expand',
    route: '/database',
    action: async page => {
      await ensureDatabaseExpanded(page);
      await page.getByRole('button', { name: 'Basic', exact: true }).click();
    },
  },
  {
    name: 'database-advanced-switch',
    route: '/database',
    action: async page => {
      await ensureDatabaseExpanded(page);
      const advanced = page.getByRole('button', { name: 'Advanced', exact: true });
      const basic = page.getByRole('button', { name: 'Basic', exact: true });
      await advanced.click();
      await basic.click();
      await advanced.click();
    },
  },
  {
    name: 'database-uql-open',
    route: '/database',
    action: async page => openUql(page),
  },
  {
    name: 'database-uql-editor',
    route: '/database',
    setup: async page => openUql(page),
    action: async page => {
      const editor = page.locator('.cm-content');
      await editor.click();
      for (const query of ['Speed >= 3', 'Wins >= 10 and Speed >= 6', 'Main Speed >= 3 and GP Speed >= 3']) {
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.type(query);
        await page.waitForTimeout(120);
      }
    },
  },
  {
    name: 'database-uql-reference',
    route: '/database',
    setup: async page => openUql(page),
    action: async page => {
      await page.locator('.uql-wiki-panel summary').click();
      const topics = page.locator('.uql-doc-reference-nav button');
      for (let index = 0; index < await topics.count(); index += 1) {
        await topics.nth(index).click();
      }
    },
  },
  {
    name: 'database-bookmarks-tab',
    route: '/database',
    action: async page => {
      const database = page.locator('.tab-btn').filter({ hasText: 'Database' });
      const bookmarks = page.locator('.tab-btn').filter({ hasText: 'Bookmarks' });
      await bookmarks.click();
      await database.click();
      await bookmarks.click();
    },
  },
  {
    name: 'database-list-mode',
    route: '/database',
    action: async page => {
      const toggle = page.locator('.list-mode-badge');
      await toggle.click();
      await toggle.click();
      await toggle.click();
    },
  },
  {
    name: 'database-scroll-resize',
    route: '/database',
    action: async (page, profile) => {
      await ensureDatabaseExpanded(page);
      for (let index = 0; index < 5; index += 1) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      const original = profile.context.viewport;
      await page.setViewportSize({ width: Math.max(360, original.width - 80), height: original.height });
      await page.setViewportSize(original);
    },
  },
  {
    name: 'lineage-populated',
    route: '/tools/lineage-planner',
    lineage: true,
    action: async page => page.waitForTimeout(50),
  },
  {
    name: 'lineage-odds-tabs',
    route: '/tools/lineage-planner',
    lineage: true,
    setup: async page => page.locator('.odds-tabs [role="tab"]').first().waitFor({ timeout: 15_000 }),
    action: async page => {
      const tabs = page.locator('.odds-tabs [role="tab"]');
      for (let index = 0; index < await tabs.count(); index += 1) {
        await tabs.nth(index).click();
      }
    },
  },
  {
    name: 'lineage-per-run-toggle',
    route: '/tools/lineage-planner',
    lineage: true,
    setup: async page => page.locator('.odds-toggle').waitFor({ timeout: 15_000 }),
    action: async page => {
      const toggle = page.locator('.odds-toggle');
      for (let index = 0; index < 6; index += 1) await toggle.click();
    },
  },
  {
    name: 'lineage-mobile-ggp',
    route: '/tools/lineage-planner',
    lineage: true,
    profiles: ['mobile'],
    action: async page => {
      const toggles = page.locator('.ggp-mobile-toggle');
      for (let pass = 0; pass < 2; pass += 1) {
        for (let index = 0; index < await toggles.count(); index += 1) await toggles.nth(index).click();
      }
    },
  },
  {
    name: 'lineage-saves-dialog',
    route: '/tools/lineage-planner',
    lineage: true,
    action: async page => {
      await page.locator('.saves-btn').click();
      await page.locator('.saves-dialog').waitFor();
      await page.locator('.saves-dialog .text-input').fill('CPU audit tree');
      await page.locator('.saves-dialog .close-btn').click();
    },
  },
  {
    name: 'lineage-character-dialog',
    route: '/tools/lineage-planner',
    lineage: true,
    action: async page => {
      await page.locator('.n-btn--swap').first().click();
      await page.locator('.select-dialog').waitFor();
      await page.locator('.select-dialog .search-input').fill('Gold');
      await page.locator('.select-dialog .close-btn').click();
    },
  },
  {
    name: 'lineage-resize',
    route: '/tools/lineage-planner',
    lineage: true,
    action: async (page, profile) => {
      const original = profile.context.viewport;
      for (const width of [Math.max(360, original.width - 160), Math.max(360, original.width - 80), original.width]) {
        await page.setViewportSize({ width, height: original.height });
      }
    },
  },
  {
    name: 'carat-populated',
    route: '/timeline?tab=carat-planner',
    carat: true,
    action: async page => page.waitForTimeout(50),
  },
  {
    name: 'carat-income-open',
    route: '/timeline?tab=carat-planner',
    carat: true,
    action: async page => openCaratIncome(page),
  },
  {
    name: 'carat-income-cycles',
    route: '/timeline?tab=carat-planner',
    carat: true,
    setup: async page => openCaratIncome(page),
    action: async page => {
      for (const name of ['Training Pass', 'Speculative income']) {
        const next = page.getByRole('button', { name: `Next ${name} option` });
        for (let index = 0; index < 4; index += 1) await next.click();
      }
    },
  },
  {
    name: 'carat-setup-tabs',
    route: '/timeline?tab=carat-planner',
    carat: true,
    setup: async page => {
      await page.locator('.cp').waitFor({ timeout: 15_000 });
      await page.locator('.cp-assumptions-bar').click();
    },
    action: async page => {
      for (let pass = 0; pass < 2; pass += 1) {
        for (const name of ['Income', 'Rewards', 'Balance']) {
          await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
        }
      }
    },
  },
  {
    name: 'carat-scroll-resize',
    route: '/timeline?tab=carat-planner',
    carat: true,
    action: async (page, profile) => {
      await page.locator('.cp').waitFor({ timeout: 15_000 });
      for (let index = 0; index < 4; index += 1) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      const original = profile.context.viewport;
      await page.setViewportSize({ width: Math.max(360, original.width - 100), height: original.height });
      await page.setViewportSize(original);
    },
  },
].filter(scenario => (!scenarioFilter || scenario.name === scenarioFilter)
  && (!scenarioPrefix || scenario.name.startsWith(`${scenarioPrefix}-`)));

if (!scenarios.length) {
  throw new Error(`No deep CPU scenario matches scenario="${scenarioFilter}" prefix="${scenarioPrefix}".`);
}

assertAuditBuild();
await ensureReportsDirectory();
const server = await startStaticServer(PORT);
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const profile of CPU_PROFILES.filter(profile => !profileFilter || profile.name === profileFilter)) {
    const matchingScenarios = scenarios.filter(scenario => !scenario.profiles || scenario.profiles.includes(profile.name));
    for (let index = 0; index < matchingScenarios.length; index += 1) {
      const scenario = matchingScenarios[index];
      const context = await browser.newContext({
        ...profile.context,
        serviceWorkers: 'block',
        reducedMotion: 'no-preference',
      });
      await installNetworkFixtures(context);
      await installDeepNetworkFixtures(context);
      await installCpuInstrumentation(context);
      await context.addInitScript(() => {
        // The update dialog is a separate shell concern and would intercept
        // controls in every isolated deep scenario. Route tests cover it;
        // these measurements intentionally target the feature interaction.
        localStorage.setItem('lastSeenUpdateVersion', '10');
      });
      if (scenario.lineage) {
        await context.addInitScript(state => {
          localStorage.setItem('lineage-planner-state-v1', JSON.stringify(state));
        }, LINEAGE_STATE);
      }
      if (scenario.carat) {
        await context.addInitScript(collection => {
          localStorage.setItem('carat-planner-plans-v1', JSON.stringify(collection));
        }, CARAT_COLLECTION);
      }

      const page = await context.newPage();
      const errors = [];
      const apiRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/search/') || url.pathname.startsWith('/resources/')) {
          apiRequests.push({ path: `${url.pathname}${url.search}`, status: response.status() });
        }
      });
      page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/search/') || url.pathname.startsWith('/resources/')) {
          apiRequests.push({ path: `${url.pathname}${url.search}`, failure: request.failure()?.errorText ?? 'failed' });
        }
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });

      try {
        const loadBefore = metricsMap(await cdp.send('Performance.getMetrics'));
        await page.goto(`${ORIGIN}${scenario.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        await page.waitForTimeout(LOAD_SETTLE_MS);
        const loadAfter = metricsMap(await cdp.send('Performance.getMetrics'));
        const loadRuntime = await readRuntimeWindow(page);

        if (scenario.setup) {
          await scenario.setup(page, profile);
          await page.waitForTimeout(SETUP_SETTLE_MS);
        }
        await resetRuntimeWindow(page);
        const actionBefore = metricsMap(await cdp.send('Performance.getMetrics'));
        const actionStarted = performance.now();
        await scenario.action(page, profile);
        const actionWallMs = performance.now() - actionStarted;
        // Include deferred filter emissions, network results, render batches,
        // and dialog teardown in the interaction CPU window.
        await page.waitForTimeout(ACTION_SETTLE_MS);
        const actionAfter = metricsMap(await cdp.send('Performance.getMetrics'));
        const actionRuntime = await readRuntimeWindow(page);

        await resetRuntimeWindow(page);
        const idleBefore = metricsMap(await cdp.send('Performance.getMetrics'));
        await page.waitForTimeout(IDLE_OBSERVATION_MS);
        const idleAfter = metricsMap(await cdp.send('Performance.getMetrics'));
        const idleRuntime = await readRuntimeWindow(page);
        const busyIndicators = await page.locator('mat-spinner:visible, mat-progress-spinner:visible').evaluateAll(elements =>
          elements.map(element => ({
            tag: element.tagName.toLowerCase(),
            parentClass: element.parentElement?.className ?? '',
            parentText: element.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
          })),
        );

        const result = {
          profile: profile.name,
          scenario: scenario.name,
          route: scenario.route,
          finalPath: idleRuntime.path,
          loadTaskMs: round(delta(loadAfter, loadBefore, 'TaskDuration') * 1_000),
          loadScriptMs: round(delta(loadAfter, loadBefore, 'ScriptDuration') * 1_000),
          loadLongTaskCount: loadRuntime.longTasks.length,
          loadLongTaskMs: round(loadRuntime.longTasks.reduce((sum, duration) => sum + duration, 0)),
          actionWallMs: round(actionWallMs),
          actionTaskMs: round(delta(actionAfter, actionBefore, 'TaskDuration') * 1_000),
          actionBudgetMs: actionBudgetOverride
            ? maxActionTaskMs
            : (ACTION_TASK_BUDGETS[scenario.name] ?? maxActionTaskMs),
          actionScriptMs: round(delta(actionAfter, actionBefore, 'ScriptDuration') * 1_000),
          actionRafCallbacks: actionRuntime.rafCallbacks,
          actionLongTaskCount: actionRuntime.longTasks.length,
          actionLongTaskMs: round(actionRuntime.longTasks.reduce((sum, duration) => sum + duration, 0)),
          idleTaskMsPerSecond: round(
            delta(idleAfter, idleBefore, 'TaskDuration') * 1_000 / (IDLE_OBSERVATION_MS / 1_000),
          ),
          idleRafCallbacks: idleRuntime.rafCallbacks,
          idleLongTaskCount: idleRuntime.longTasks.length,
          idleAnimationCount: idleRuntime.animations.length,
          idleAnimations: summarizeAnimations(idleRuntime.animations),
          unexpectedIdleAnimationCount: idleRuntime.animations
            .filter(animation => animation.name !== 'cm-blink2').length,
          busyIndicators,
          apiRequests,
          domNodes: Math.round(idleAfter.get('Nodes') ?? 0),
          errors,
        };
        results.push(result);
        process.stdout.write(
          `[${profile.name} ${String(index + 1).padStart(2)}/${matchingScenarios.length}] ${scenario.name}: ` +
          `${result.actionTaskMs}ms action, ${result.idleTaskMsPerSecond}ms CPU/s idle, ${result.domNodes} nodes\n`,
        );
      } catch (error) {
        const diagnostic = await page.evaluate(() => ({
          path: `${location.pathname}${location.search}`,
          filledNodes: document.querySelectorAll('.node.n-filled').length,
          oddsTabs: document.querySelectorAll('.odds-tabs [role="tab"]').length,
          oddsPlaceholder: document.querySelector('.odds-placeholder')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          bodyText: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
        })).catch(() => null);
        results.push({ profile: profile.name, scenario: scenario.name, route: scenario.route, error: String(error), errors, apiRequests, diagnostic });
        process.stderr.write(`[${profile.name}] ${scenario.name}: ${error}\n`);
      } finally {
        await cdp.detach().catch(() => undefined);
        await page.close();
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

const complete = results.filter(result => !result.error);
const report = {
  generatedAt: new Date().toISOString(),
  label,
  cpuThrottleRate: CPU_THROTTLE_RATE,
  loadSettleMs: LOAD_SETTLE_MS,
  setupSettleMs: SETUP_SETTLE_MS,
  actionSettleMs: ACTION_SETTLE_MS,
  idleObservationMs: IDLE_OBSERVATION_MS,
  budgets: {
    maxIdleMsPerSecond,
    defaultMaxActionTaskMs: maxActionTaskMs,
    actionTaskMsByScenario: ACTION_TASK_BUDGETS,
    maxIdleLongTasks: 0,
    maxIdleAnimations: 0,
    maxPageErrors: 0,
  },
  summaries: CPU_PROFILES.map(profile => summarize(complete, profile.name)),
  results,
};
report.failures = [
  ...complete.filter(result => result.actionTaskMs > result.actionBudgetMs)
    .map(result => `${result.profile} ${result.scenario} action ${result.actionTaskMs}ms exceeds ${result.actionBudgetMs}ms`),
  ...complete.filter(result => result.idleTaskMsPerSecond > maxIdleMsPerSecond)
    .map(result => `${result.profile} ${result.scenario} idle ${result.idleTaskMsPerSecond}ms/s exceeds ${maxIdleMsPerSecond}ms/s`),
  ...complete.filter(result => result.idleLongTaskCount > 0)
    .map(result => `${result.profile} ${result.scenario} retained ${result.idleLongTaskCount} idle long task(s)`),
  ...complete.filter(result => result.unexpectedIdleAnimationCount > 0)
    .map(result => `${result.profile} ${result.scenario} retained ${result.unexpectedIdleAnimationCount} unexpected idle animation(s)`),
  ...complete.filter(result => result.busyIndicators.length > 0)
    .map(result => `${result.profile} ${result.scenario} retained ${result.busyIndicators.length} busy indicator(s)`),
  ...complete.filter(result => result.errors.length > 0)
    .map(result => `${result.profile} ${result.scenario} raised ${result.errors.length} page error(s)`),
  ...results.filter(result => result.error)
    .map(result => `${result.profile} ${result.scenario} failed: ${result.error}`),
];

const outputPath = join(REPORTS, `cpu-${safeName(label)}.json`);
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.table(report.summaries);
console.log(`Deep CPU report written to ${outputPath}`);
if (report.failures.length) {
  for (const failure of report.failures) console.error(`Deep CPU budget: ${failure}`);
  process.exitCode = 1;
}

async function ensureDatabaseExpanded(page) {
  if (!await page.locator('.filter-inner').isVisible()) await page.locator('.filter-header').click();
  await page.locator('.filter-inner').waitFor();
}

async function openUql(page) {
  await ensureDatabaseExpanded(page);
  await page.getByRole('button', { name: 'UQL', exact: true }).click();
  await page.locator('.cm-content').waitFor({ timeout: 15_000 });
}

async function openCaratIncome(page) {
  await page.locator('.cp').waitFor({ timeout: 15_000 });
  await page.locator('.cp-assumptions-bar').click();
  await page.getByRole('tab', { name: /^Income/ }).click();
  await page.locator('.cp-setup-panel--income').waitFor();
}

async function installDeepNetworkFixtures(context) {
  // Deep interaction runs need stable successful results. Failure and retry
  // states remain covered by the route audit's generic 503 fixtures.
  await context.route('**/resources/manifest.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 'cpu-deep-v1',
      resources: { affinity: 'affinity.json' },
    }),
    headers: { 'cache-control': 'no-store' },
  }));
  await context.route('**/resources/affinity.json*', route => {
    const chars = [...new Set(LINEAGE_CHARACTER_IDS.map(id => Math.floor(id / 100)))];
    const size = chars.length;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chars,
        aff2: Array.from({ length: size * size }, (_value, index) =>
          Math.floor(index / size) === index % size ? 0 : 10),
        aff3: Array.from({ length: size * size * size }, () => 5),
      }),
      headers: { 'cache-control': 'no-store' },
    });
  });
  await context.route('**/resources/planner/manifest.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 'cpu-deep-carat-v1',
      resources: {
        'planner_core.json': 'planner/planner_core.json',
        'planner_income.json': 'planner/planner_income.json',
        'planner_rewards.json': 'planner/planner_rewards.json',
      },
    }),
    headers: { 'cache-control': 'no-store' },
  }));
  await context.route('**/resources/planner/planner_core.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jewel_cost_per_pull: 150, default_spark_pulls: 200 }),
    headers: { 'cache-control': 'no-store' },
  }));
  await context.route('**/resources/planner/planner_income.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ rules: [
      { id: 'audit-daily', label: 'Daily income', currency: 'free_jewels', amount: 50, cadence: 'daily', start_date: '2026-01-01' },
      { id: 'audit-monthly', label: 'Monthly income', currency: 'free_jewels', amount: 1200, cadence: 'monthly', start_date: '2026-01-01', day_of_month: 1 },
      { id: 'premium-training-pass', label: 'Legacy Training Pass', currency: 'paid_jewels', amount: 350, cadence: 'monthly', start_date: '2027-08-20' },
    ] }),
    headers: { 'cache-control': 'no-store' },
  }));
  await context.route('**/resources/planner/planner_rewards.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      rewards: [],
      event_benefits: [],
      free_pull_campaigns: [],
      competitive_variants: [],
      global_reward_comparison: {
        observation_end: '2026-08-06',
        speculative_monthly_carats: 1233,
        speculative_recent_median_monthly_carats: 775,
        speculative_months: Array.from({ length: 72 }, (_value, index) => ({
          month: `${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`,
          total_carats: 500 + index,
        })),
      },
    }),
    headers: { 'cache-control': 'no-store' },
  }));
  await context.route('**/search/query**', async route => {
    const url = new URL(route.request().url());
    const page = Number(url.searchParams.get('page') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const items = page < 2
      ? Array.from({ length: limit }, (_value, index) => buildInheritanceRecord(page * limit + index))
      : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, total: limit * 2, page, limit, total_pages: 2 }),
      headers: { 'cache-control': 'no-store' },
    });
  });
}

function buildInheritanceRecord(index) {
  const id = index + 1;
  return {
    account_id: `audit-${String(id).padStart(4, '0')}`,
    trainer_name: `Audit Trainer ${id}`,
    follower_num: 100 + id,
    borrow_view_count: id * 2,
    borrow_copy_count: id,
    last_updated: '2030-01-01T00:00:00Z',
    support_card: null,
    inheritance: {
      inheritance_id: id,
      account_id: `audit-${String(id).padStart(4, '0')}`,
      main_parent_id: LINEAGE_CHARACTER_IDS[index % LINEAGE_CHARACTER_IDS.length],
      parent_left_id: LINEAGE_CHARACTER_IDS[(index + 1) % LINEAGE_CHARACTER_IDS.length],
      parent_right_id: LINEAGE_CHARACTER_IDS[(index + 2) % LINEAGE_CHARACTER_IDS.length],
      parent_rank: 8,
      parent_rarity: 5,
      scenario_id: 1,
      blue_sparks: [103, 203, 303],
      pink_sparks: [1103, 3203],
      green_sparks: [],
      white_sparks: [10013, 10023, 10032],
      blue_stars_sum: 9,
      pink_stars_sum: 6,
      green_stars_sum: 0,
      white_stars_sum: 8,
      win_count: 12,
      white_count: 3,
      affinity_score: 84,
      main_blue_factors: 103,
      main_pink_factors: 1103,
      main_green_factors: 0,
      main_white_factors: [10013],
      main_white_count: 1,
      left_blue_factors: 203,
      left_pink_factors: 3203,
      left_green_factors: 0,
      left_white_factors: [10023],
      left_white_count: 1,
      right_blue_factors: 303,
      right_pink_factors: 1103,
      right_green_factors: 0,
      right_white_factors: [10032],
      right_white_count: 1,
      main_win_saddles: [101, 102],
      left_win_saddles: [101],
      right_win_saddles: [102],
      race_results: [101, 102],
    },
  };
}

function summarize(allResults, profile) {
  const matching = allResults.filter(result => result.profile === profile);
  return {
    profile,
    scenarios: matching.length,
    meanLoadTaskMs: mean(matching.map(result => result.loadTaskMs)),
    maxLoadTaskMs: round(Math.max(0, ...matching.map(result => result.loadTaskMs))),
    meanActionTaskMs: mean(matching.map(result => result.actionTaskMs)),
    maxActionTaskMs: round(Math.max(0, ...matching.map(result => result.actionTaskMs))),
    meanIdleTaskMsPerSecond: mean(matching.map(result => result.idleTaskMsPerSecond)),
    maxIdleTaskMsPerSecond: round(Math.max(0, ...matching.map(result => result.idleTaskMsPerSecond))),
    totalLoadLongTasks: matching.reduce((sum, result) => sum + result.loadLongTaskCount, 0),
    totalActionLongTasks: matching.reduce((sum, result) => sum + result.actionLongTaskCount, 0),
    scenariosWithUnexpectedIdleAnimations: matching.filter(result => result.unexpectedIdleAnimationCount > 0).length,
  };
}

function mean(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function numberArg(name, fallback) {
  const value = stringArg(name, '');
  return value ? Number(value) : fallback;
}

function stringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}
