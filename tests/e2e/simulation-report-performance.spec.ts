import { expect, test } from './fixtures/test';
import { mockDatabase, mockAffinity, mockVeteranProfile } from './fixtures/api';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

declare global {
  interface Window {
    reportLongTasks: number[];
  }
}

const origin = process.env.SIMULATOR_TEST_ORIGIN;
const resources = JSON.parse(
  gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString()
);

for (const runners of [9, 18])
  test(
    'Large native report remains comparable and responsive: ' + runners + ' runners',
    async ({ page }) => {
      test.skip(!origin, 'Set SIMULATOR_TEST_ORIGIN to an isolated local simulator.');
      expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      test.setTimeout(120_000);
      const errors: string[] = [];
      let replays = 0,
        comparisons = 0,
        reportRequests = 0;

      const phases: Partial<Record<'load' | 'interaction', number[]>> = {};

      page.on('pageerror', (error) => errors.push(error.message));
      await mockDatabase(page);
      await mockAffinity(page);
      await mockVeteranProfile(page);
      for (const [name, json] of Object.entries(resources))
        await page.route('**/resources/*/' + name + '.json*', (route) => route.fulfill({ json }));
      await page.route('**/resources/*/room_match_races.json*', (route) =>
        route.fulfill({ json: { races: [{ race_instance_id: 800023, course_set_id: 10506 }] } })
      );

      await page.route('**/api/sim/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace('/api', '');
        if (path.includes('replay')) replays++;
        if (path.endsWith('comparison')) comparisons++;
        if (
          path.endsWith('monte-carlo') &&
          route.request().postDataJSON().output_mode === 'report'
        ) {
          reportRequests++;
          expect(route.request().postDataJSON().report_version).toBe(2);
        }

        const response = await route.fetch({ url: origin + path });
        await route.fulfill({ response });
      });

      await page.addInitScript(() => {
        localStorage.setItem('uma:theme', 'dark');
        window.reportLongTasks = [];
        new PerformanceObserver((list) => {
          window.reportLongTasks.push(...list.getEntries().map((e) => e.duration));
        }).observe({ type: 'longtask', buffered: true });
      });

      await page.goto('/simulator/race');
      await expect(page.locator('.field .runner')).toHaveCount(9);
      if (runners === 18)
        for (let i = 0; i < 9; i++)
          await page
            .getByRole('region', { name: 'Race field', exact: true })
            .getByRole('button', { name: /^Copy / })
            .first()
            .click();
      await page.getByLabel('Sampled races', { exact: true }).fill('1000');
      await page.evaluate(() => {
        window.reportLongTasks = [];
      });

      const started = Date.now();
      await page.getByRole('button', { name: 'Run 1000 races', exact: true }).click();
      await expect(page.locator('.outcome-row')).toHaveCount(runners, { timeout: 30_000 });
      const ready = Date.now() - started;
      expect(replays).toBe(0);
      expect(comparisons).toBe(0);
      await page
        .getByRole('region', { name: 'Race progression', exact: true })
        .scrollIntoViewIfNeeded();

      await expect(page.locator('#simulation-progression .chart-host svg')).toHaveCount(1);
      await expect(page.locator('.telemetry-plot')).toHaveAttribute('aria-busy', 'false');
      phases.load = await page.evaluate(() => window.reportLongTasks);
      await page.evaluate(() => {
        window.reportLongTasks = [];
      });

      for (const width of [320, 390, 768, 1536, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }

      await page.setViewportSize({ width: 1536, height: 960 });
      await page.locator('.step-title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '.tmp/report-' + runners + '-desktop.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '.tmp/report-' + runners + '-mobile.png' });
      await page.setViewportSize({ width: 1536, height: 960 });
      const bar = page.getByLabel('Shared runner comparison', { exact: true });
      const selectedBefore = await bar.locator('.comparison-runner').count();
      await bar
        .getByRole('button', { name: /^Remove / })
        .last()
        .click();

      await expect(bar.locator('.comparison-runner')).toHaveCount(selectedBefore - 1);
      await page.getByRole('button', { name: /Show every sampled run/ }).click();
      await expect(page.locator('.telemetry-key')).toContainText('1000 runs');
      await expect(page.locator('.telemetry-plot canvas')).toBeVisible();
      await expect(page.locator('.telemetry-key')).not.toContainText('drawing curves', {
        timeout: 30000
      });

      await page.getByRole('button', { name: 'Compare mean curves' }).click();
      expect(replays).toBe(0);
      expect(comparisons).toBe(0);
      phases.interaction = await page.evaluate(() => window.reportLongTasks);
      expect(reportRequests).toBe(1);
      const stats = {
        runners,
        races: 1000,
        ready_ms: ready,
        long_tasks_ms: phases,
        report_requests: reportRequests,
        replay_requests: replays,
        implicit_comparisons: comparisons
      };

      writeFileSync('.tmp/report-browser-' + runners + '.json', JSON.stringify(stats, null, 2));
      console.log(JSON.stringify(stats));
      if (runners === 9 && process.env.SIMULATOR_TEST_DETAILS) {
        await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await page.locator('.step-title').scrollIntoViewIfNeeded();
        await page.screenshot({ path: '.tmp/report-light.png' });
        const skills = page.getByRole('region', { name: 'Skill analysis', exact: true });
        await skills.locator('.skill-status').scrollIntoViewIfNeeded();
        await expect(skills.locator('.runner-skills')).toHaveCount(9);
        expect(comparisons).toBe(0);
        await skills
          .getByRole('button', { name: /All skills for/ })
          .first()
          .click();

        await skills
          .getByRole('button', { name: 'Test priority skills · 128 races', exact: true })
          .click();

        await expect.poll(() => comparisons, { timeout: 30_000 }).toBe(1);
        await expect(
          skills.getByRole('button', { name: 'Cancel testing', exact: true })
        ).toHaveCount(0, { timeout: 30_000 });

        await expect(skills.getByRole('alert')).toHaveCount(0);
        expect(comparisons).toBe(1);
        await skills.getByRole('button', { name: 'Close list', exact: true }).click();
        await skills.locator('.skill-pick').first().click();
        await expect(skills.locator('.shared-skill')).toBeVisible();
        for (const plot of await skills.locator('.distribution-plots .chart-host').all()) {
          await plot.scrollIntoViewIfNeeded();
          await expect(plot.locator('svg')).toBeVisible();
        }

        await skills.screenshot({ path: '.tmp/report-skills-light.png' });
        await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
        await skills.screenshot({ path: '.tmp/report-skills-dark.png' });
        const samples = page.getByRole('region', {
          name: 'Sampled races and reproducibility',
          exact: true
        });

        await samples.getByRole('button', { name: 'Median race', exact: true }).first().click();
        await expect(samples.locator('.replay')).toBeVisible();
        await samples.getByRole('button', { name: 'Full replay diagnostics', exact: true }).click();
        await expect(
          samples.getByRole('button', { name: 'Full replay diagnostics', exact: true })
        ).toHaveCount(0, { timeout: 30_000 });

        await expect(samples.getByRole('alert')).toHaveCount(0);
        expect(replays).toBe(1); // Only the explicit detailed replay; the normal sample uses /monte-carlo.
        await samples.screenshot({ path: '.tmp/report-sample-diagnostics.png' });
      }

      expect(errors).toEqual([]);
    }
  );
