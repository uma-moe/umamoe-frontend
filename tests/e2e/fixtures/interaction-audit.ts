import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export interface InteractionSample {
  document: string;
  route: string;
  control: string;
  scope: string;
  event: string;
  interaction: number;
  duration: number;
  processing: number;
}

/** Opt in without changing the functional workflows or their outcome assertions. */
const throttled = new WeakMap<Page, Promise<void>>();
export async function throttleAuditPage(page: Page) {
  if (!process.env.PERF_AUDIT) return;
  if (!throttled.has(page)) throttled.set(page, (async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU ?? 8) });
  })());
  await throttled.get(page);
}

export async function startInteractionAudit(context: BrowserContext, info: TestInfo) {
  if (!process.env.PERF_AUDIT) return async () => {};
  const throttleErrors: string[] = [];
  const throttle = (page: Page) => { void throttleAuditPage(page).catch(error => { if (!page.isClosed()) throttleErrors.push(String(error)); }); };
  context.on('page', throttle);
  const samples: InteractionSample[] = [];
  await context.exposeBinding('__reportInteractionAudit', (_source, entries: InteractionSample[]) => samples.push(...entries));
  await context.addInitScript(() => {
    if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
    const documentId = crypto.randomUUID();
    const recent: { time: number; control: string; scope: string; route: string }[] = [];
    const selector = 'button,a[href],input,select,textarea,summary,[role="button"],[role="radio"],[role="tab"],[role="option"],[contenteditable="true"]';
    function identify(target: EventTarget | null) {
      const element = target instanceof Element ? target.closest(selector) : null;
      if (!element) return undefined;
      const label = element.getAttribute('aria-label') || element.getAttribute('title') ||
        (element as HTMLInputElement).labels?.[0]?.textContent || element.textContent || element.id || element.tagName;
      const scope = element.closest('dialog,[role="dialog"],section[aria-label],nav[aria-label]');
      return {
        control: `${element.getAttribute('role') || element.tagName.toLowerCase()}: ${label.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
        scope: scope?.getAttribute('aria-label') || scope?.querySelector('h1,h2,h3')?.textContent || '',
        route: location.pathname
      };
    }
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'input']) {
      document.addEventListener(type, event => {
        const identity = identify(event.target);
        if (identity) recent.push({ time: event.timeStamp, ...identity });
        if (recent.length > 100) recent.splice(0, 50);
      }, true);
    }
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries().flatMap(entry => {
        const timing = entry as PerformanceEventTiming;
        if (!timing.interactionId) return [];
        // Capture names before a dialog closes or a route removes the clicked node.
        const captured = recent.findLast(value => Math.abs(value.time - timing.startTime) < 2);
        const identity = captured ?? identify(timing.target);
        return identity ? [{ document: documentId, ...identity, event: timing.name,
          interaction: timing.interactionId, duration: timing.duration,
          processing: timing.processingEnd - timing.processingStart }] : [];
      });
      if (entries.length) (window as any).__reportInteractionAudit(entries);
    });
    observer.observe({ type: 'event', durationThreshold: 16, buffered: true });
  });
  return async () => {
    context.off('page', throttle);
    expect.soft(throttleErrors, 'Every opened page must receive CPU throttling').toEqual([]);
    // Event Timing is delivered after presentation, independently of Playwright's assertions.
    await new Promise(resolve => setTimeout(resolve, 250));
    const interactions = new Map<string, InteractionSample>();
    for (const sample of samples) {
      const key = `${sample.document}:${sample.interaction}`;
      if ((interactions.get(key)?.duration ?? -1) < sample.duration) interactions.set(key, sample);
    }
    const measured = [...interactions.values()];
    await info.attach('interaction-audit', { body: JSON.stringify({ cpu: Number(process.env.PERF_CPU ?? 8), budget: 300, measured }), contentType: 'application/json' });
    if (process.env.PERF_ENFORCE !== '0') {
      expect.soft(measured.filter(sample => sample.duration > 300).map(({ route, control, duration }) => ({ route, control, duration })),
        'Input to next paint must be <=300ms; see interaction-audit attachment').toEqual([]);
    }
  };
}

export async function auditInteractions(context: BrowserContext, info: TestInfo, use: () => Promise<void>) {
  const finish = await startInteractionAudit(context, info);
  try { await use(); } finally { await finish(); }
}
