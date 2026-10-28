import { test, expect } from './fixtures/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const fixture = JSON.parse(
  gunzipSync(readFileSync('tests/e2e/fixtures/hakuraku-cm.json.gz')).toString()
);

test('skill loading prioritizes visible timings and does not wait for the summary', async ({
  page
}, info) => {
  let summaryFinished = false;
  let releaseSummary = () => {};
  const summaryGate = new Promise<void>((resolve) => {
    releaseSummary = resolve;
  });
  let detailRequests = 0;
  let concurrentDetails = 0;
  let peakConcurrentDetails = 0;
  await page.route('https://hakuraku.moe/api/simdata/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let payload: unknown;
    if (path.endsWith('/manifest'))
      payload = {
        snapshots: fixture.manifest.snapshots.map((snapshot: { snapshotId: string }) => ({
          ...snapshot,
          playerUsage: { schemaVersion: 1 }
        }))
      };
    else if (path.endsWith('/summary')) {
      await summaryGate;
      summaryFinished = true;
      payload = fixture.summary;
    } else if (path.endsWith('/uma-usage')) {
      await summaryGate;
      payload = { snapshotId: fixture.summary.snapshotId, totalPlayers: 20, skills: [] };
    } else if (path.endsWith('/skills/overview')) payload = fixture.skills;
    else if (path.includes('/skills/details/')) {
      detailRequests++;
      concurrentDetails++;
      peakConcurrentDetails = Math.max(peakConcurrentDetails, concurrentDetails);
      await new Promise((resolve) => setTimeout(resolve, 60));
      payload = { ...fixture.skillDetail, skillId: Number(path.split('/').at(-1)) };
    } else throw new Error('Unexpected request ' + path);

    await route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*' } });
    if (path.includes('/skills/details/')) concurrentDetails--;
  });
  const started = Date.now();
  await page.goto('/competitive/cm-data?tab=skills');
  const table = page.getByRole('table', { name: 'CM Skill Analysis', exact: true });
  await expect(table).toBeVisible();
  const listReadyMs = Date.now() - started;
  const waitedForSummary = summaryFinished;
  await expect(
    table.locator('tbody tr[data-virtual-index]').first().locator('td[data-label="Players"]')
  ).toHaveText('…');
  releaseSummary();
  expect(waitedForSummary).toBe(false);
  await page.waitForTimeout(1500);
  const totalSkills = new Set(fixture.skills.rows.map((row: number[]) => row[0])).size;
  const metrics = {
    listReadyMs,
    waitedForSummary,
    detailRequests,
    peakConcurrentDetails,
    totalSkills
  };
  console.log('Skill loading', metrics);
  await info.attach('skill-loading', {
    body: JSON.stringify(metrics),
    contentType: 'application/json'
  });
  expect(peakConcurrentDetails).toBeLessThanOrEqual(2);
  expect(detailRequests).toBeLessThan(totalSkills / 2);
  const scroll = page.getByRole('region', { name: 'CM Skill Analysis scroll area', exact: true });
  if (page.viewportSize()!.width > 600)
    expect((await scroll.boundingBox())!.height).toBeGreaterThan(650);
  await expect(
    table.locator('tbody tr[data-virtual-index]').first().locator('td[data-label="Mean distance"]')
  ).toHaveText(/^~[\d,]+ m$/);
});
