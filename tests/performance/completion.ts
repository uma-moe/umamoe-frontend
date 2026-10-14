import { expect, type Page } from '@playwright/test';

/** Browser-clock readiness: excludes locator lookup and assertion polling time. */
export async function completion(page: Page, label: string, run: () => Promise<unknown>, ready: {
  selector: string; text?: string; count?: number; pathname?: string; attribute?: [string, string];
}) {
  await page.evaluate(({ label, ready }) => {
    const metrics = (window as any).__stress ??= {};
    metrics.completions ??= [];
    metrics.pendingCompletion = label;
    let start: number | undefined, scheduled = false;
    function check() {
      if (start === undefined || scheduled) return;
      const elements = document.querySelectorAll(ready.selector);
      const element = elements[0];
      if (ready.pathname && location.pathname !== ready.pathname ||
          ready.count !== undefined && elements.length !== ready.count ||
          ready.count !== 0 && (!element?.checkVisibility() || ready.text && !element.textContent?.includes(ready.text) || ready.attribute && element.getAttribute(ready.attribute[0]) !== ready.attribute[1])) {
        // Stylesheet loads and layout can make a frame visible without a DOM mutation.
        requestAnimationFrame(check);
        return;
      }
      scheduled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        metrics.completions.push({ label, ms: Math.round(performance.now() - start!), ready });
        metrics.pendingCompletion = undefined;
      }));
    }
    function begin(event: Event) {
      if (start !== undefined) return;
      start = event.timeStamp;
      for (const type of ['click', 'input', 'keydown']) document.removeEventListener(type, begin, true);
      queueMicrotask(check);
    }
    for (const type of ['click', 'input', 'keydown']) document.addEventListener(type, begin, true);
  }, { label, ready });
  await run();
  await page.waitForFunction(() => !(window as any).__stress.pendingCompletion);
  const measurement = await page.evaluate(() => (window as any).__stress.completions.at(-1));
  if (process.env.PERF_ENFORCE !== '0') expect.soft(measurement.ms, `${label}: completed content must appear within 300ms`).toBeLessThanOrEqual(300);
  return measurement;
}
