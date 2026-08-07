import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CPU_PROFILES as profiles,
  HOST,
  REPORTS,
  ROOT,
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

const PORT = 4327;
const ORIGIN = `http://${HOST}:${PORT}`;
const observationMs = numberArg('--observe-ms', 2_000);
const settleMs = numberArg('--settle-ms', 1_500);
const label = stringArg('--label', 'current');
const comparePath = stringArg('--compare', '');
const routeFilter = stringArg('--route', '');
const maxMeanMsPerSecond = numberArg('--max-mean-ms-per-second', 25);
const maxRouteMsPerSecond = numberArg('--max-route-ms-per-second', 100);

const routeInventory = await fs.readFile(join(ROOT, 'tests/frontend-audit/routes.ts'), 'utf8');
const inventoryRoutes = [...routeInventory.matchAll(/\bpath:\s*'([^']+)'/g)].map(match => match[1]);
const routes = routeFilter ? inventoryRoutes.filter(route => route === routeFilter) : inventoryRoutes;
if (!routes.length) throw new Error('No audited routes found in tests/frontend-audit/routes.ts.');

assertAuditBuild();
await ensureReportsDirectory();
const server = await startStaticServer(PORT);
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      ...profile.context,
      serviceWorkers: 'block',
      reducedMotion: 'no-preference',
    });
    await installNetworkFixtures(context);
    await installCpuInstrumentation(context);

    for (let index = 0; index < routes.length; index += 1) {
      const route = routes[index];
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      try {
        await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        await page.waitForTimeout(settleMs);
        await resetRuntimeWindow(page);
        const before = metricsMap(await cdp.send('Performance.getMetrics'));
        await page.waitForTimeout(observationMs);
        const after = metricsMap(await cdp.send('Performance.getMetrics'));
        const runtime = await readRuntimeWindow(page);

        const taskMs = delta(after, before, 'TaskDuration') * 1_000;
        const scriptMs = delta(after, before, 'ScriptDuration') * 1_000;
        const result = {
          profile: profile.name,
          route,
          finalPath: runtime.path,
          taskMs: round(taskMs),
          taskMsPerSecond: round(taskMs / (observationMs / 1_000)),
          scriptMs: round(scriptMs),
          rafCallbacks: runtime.rafCallbacks,
          longTaskCount: runtime.longTasks.length,
          longTaskMs: round(runtime.longTasks.reduce((sum, duration) => sum + duration, 0)),
          animationCount: runtime.animations.length,
          animations: summarizeAnimations(runtime.animations),
          domNodes: Math.round(after.get('Nodes') ?? 0),
          errors,
        };
        results.push(result);
        process.stdout.write(
          `[${profile.name} ${String(index + 1).padStart(2)}/${routes.length}] ${route} ` +
          `${result.taskMsPerSecond}ms CPU/s, ${result.animationCount} animations\n`,
        );
      } catch (error) {
        results.push({ profile: profile.name, route, error: String(error), errors });
        process.stderr.write(`[${profile.name}] ${route}: ${error}\n`);
      } finally {
        await cdp.detach().catch(() => undefined);
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
const report = {
  generatedAt: new Date().toISOString(),
  label,
  cpuThrottleRate: 4,
  settleMs,
  observationMs,
  summaries: profiles.map(profile => summarizeProfile(results, profile.name)),
  results,
};

report.budgets = {
  maxMeanMsPerSecond,
  maxRouteMsPerSecond,
  maxLongTasks: 0,
  maxActiveAnimations: 0,
};
report.failures = [
  ...report.summaries
    .filter(summary => summary.meanCpuMsPerSecond > maxMeanMsPerSecond)
    .map(summary => `${summary.profile} mean ${summary.meanCpuMsPerSecond}ms/s exceeds ${maxMeanMsPerSecond}ms/s`),
  ...results
    .filter(result => !result.error && result.taskMsPerSecond > maxRouteMsPerSecond)
    .map(result => `${result.profile} ${result.route} ${result.taskMsPerSecond}ms/s exceeds ${maxRouteMsPerSecond}ms/s`),
  ...results
    .filter(result => !result.error && result.longTaskCount > 0)
    .map(result => `${result.profile} ${result.route} recorded ${result.longTaskCount} long task(s)`),
  ...results
    .filter(result => !result.error && result.animationCount > 0)
    .map(result => `${result.profile} ${result.route} retained ${result.animationCount} active animation(s)`),
  ...results
    .filter(result => !result.error && result.errors.length > 0)
    .map(result => `${result.profile} ${result.route} raised ${result.errors.length} page error(s)`),
  ...results
    .filter(result => result.error)
    .map(result => `${result.profile} ${result.route} failed: ${result.error}`),
];

if (comparePath) {
  const baseline = JSON.parse(await fs.readFile(resolve(ROOT, comparePath), 'utf8'));
  report.comparison = compareReports(baseline, report);
}

const outputPath = join(REPORTS, `cpu-${safeName(label)}.json`);
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.table(report.summaries);
if (report.comparison) console.table(report.comparison.summaries);
console.log(`CPU report written to ${outputPath}`);
if (report.failures.length) {
  for (const failure of report.failures) console.error(`CPU budget: ${failure}`);
  process.exitCode = 1;
}

function numberArg(name, fallback) {
  const value = stringArg(name, '');
  return value ? Number(value) : fallback;
}

function stringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarizeProfile(allResults, profile) {
  const matching = allResults.filter(result => result.profile === profile && !result.error);
  const task = matching.map(result => result.taskMsPerSecond);
  return {
    profile,
    routes: matching.length,
    meanCpuMsPerSecond: round(task.reduce((sum, value) => sum + value, 0) / matching.length),
    medianCpuMsPerSecond: round(percentile(task, 0.5)),
    p95CpuMsPerSecond: round(percentile(task, 0.95)),
    maxCpuMsPerSecond: round(Math.max(0, ...task)),
    routesWithAnimations: matching.filter(result => result.animationCount > 0).length,
    totalLongTasks: matching.reduce((sum, result) => sum + result.longTaskCount, 0),
  };
}

function compareReports(baseline, current) {
  const rows = [];
  for (const result of current.results) {
    if (result.error) continue;
    const previous = baseline.results.find(candidate =>
      candidate.profile === result.profile && candidate.route === result.route && !candidate.error,
    );
    if (!previous) continue;
    const change = result.taskMsPerSecond - previous.taskMsPerSecond;
    rows.push({
      profile: result.profile,
      route: result.route,
      before: previous.taskMsPerSecond,
      after: result.taskMsPerSecond,
      change: round(change),
      percent: previous.taskMsPerSecond > 0 ? round((change / previous.taskMsPerSecond) * 100) : null,
    });
  }
  return {
    summaries: profiles.map(profile => {
      const matching = rows.filter(row => row.profile === profile.name);
      const before = matching.map(row => row.before);
      const after = matching.map(row => row.after);
      const beforeTotal = before.reduce((sum, value) => sum + value, 0);
      const afterTotal = after.reduce((sum, value) => sum + value, 0);
      return {
        profile: profile.name,
        routes: matching.length,
        beforeMeanCpuMsPerSecond: round(beforeTotal / matching.length),
        afterMeanCpuMsPerSecond: round(afterTotal / matching.length),
        improvement: beforeTotal > 0 ? `${round((1 - afterTotal / beforeTotal) * 100)}%` : 'n/a',
      };
    }),
    routes: rows.sort((a, b) => a.change - b.change),
  };
}
