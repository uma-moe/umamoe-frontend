import { test, expect } from './fixtures/test';
import { mockDatabase, mockAffinity, mockVeteranProfile, profile, veteran, record } from './fixtures/api';

// Opt-in measurement, not a timing gate: run serially against the packaged build.
test.skip(process.env.VIRTUAL_SCROLL_BENCHMARK !== '1', 'Set VIRTUAL_SCROLL_BENCHMARK=1 to compare desktop defaults.');
for (const collection of ['Database', 'Veterans']) for (const count of [24, 600]) for (const enabled of [true, false]) {
  test(`${collection} ${count} items, virtualization ${enabled ? 'on' : 'off'}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const selector = collection === 'Database' ? '.inheritance-list .inheritance-card' : '.veteran-grid .veteran-card';
    await page.addInitScript(({ enabled, selector }) => {
      localStorage.setItem('uma-virtual-scrolling', String(enabled));
      localStorage.setItem('db-list-mode', 'paginated');
      const ready = () => {
        if (!document.querySelector(selector)?.checkVisibility()) { requestAnimationFrame(ready); return; }
        requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('first-card-painted')));
      };
      requestAnimationFrame(ready);
    }, { enabled, selector });
    if (collection === 'Database') {
      await mockDatabase(page); await mockAffinity(page);
      await page.route('**/search/query?*', route => route.fulfill({ json: {
        items: Array.from({ length: count }, (_, index) => {
          const item = record(String(123456789012 + index));
          item.inheritance.inheritance_id = index + 1;
          return item;
        }), total: count, page: 0, limit: count, total_pages: 1,
      } }));
    } else {
      await mockVeteranProfile(page);
      await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: { ...profile,
        veterans: Array.from({ length: count }, (_, index) => ({ ...veteran, id: index + 1, trained_chara_id: index + 1 })),
      } }));
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.VIRTUAL_SCROLL_CPU ?? 1) });
    await page.goto(collection === 'Database' ? '/database?page=1' : '/veterans/123456789012');
    await page.waitForFunction(() => performance.getEntriesByName('first-card-painted').length > 0);
    if (!enabled) await expect(page.locator(selector)).toHaveCount(count);
    await page.waitForTimeout(300); // Let idle overscan finish before collecting retained DOM/heap.
    await cdp.send('HeapProfiler.collectGarbage');
    const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    const initial = await page.evaluate(selector => ({
      firstPaintMs: performance.getEntriesByName('first-card-painted')[0]!.startTime,
      mountedCards: document.querySelectorAll(selector).length,
      elements: document.querySelectorAll('*').length,
    }), selector);
    const frames = await page.evaluate(async selector => {
      const list = document.querySelector(selector)!.closest('.inheritance-list, .veteran-grid')!;
      const samples: number[] = [];
      for (const fraction of [0, .8]) {
        window.scrollTo({ top: list.getBoundingClientRect().top + scrollY + list.scrollHeight * fraction, behavior: 'instant' });
        let previous = performance.now();
        for (let step = 0; step < 90; step++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const now = performance.now(); samples.push(now - previous); previous = now;
          window.scrollBy({ top: 120, behavior: 'instant' });
        }
      }
      const sorted = [...samples].sort((a, b) => a - b);
      return { p95FrameMs: sorted[Math.floor(sorted.length * .95)]!, maxFrameMs: sorted.at(-1)!, framesOver50Ms: samples.filter(ms => ms > 50).length };
    }, selector);
    const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    const result = { collection, count, enabled, repeat: info.repeatEachIndex, cpu: Number(process.env.VIRTUAL_SCROLL_CPU ?? 1), ...initial,
      heapMiB: before.JSHeapUsedSize / 1024 / 1024,
      scrollScriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
      scrollLayoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000, ...frames,
      finalMountedCards: await page.locator(selector).count(),
    };
    console.log('VIRTUAL_BENCHMARK ' + JSON.stringify(result));
    await info.attach('virtual-scroll-benchmark', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });
}
