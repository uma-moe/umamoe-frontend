import { test as base, expect, type Locator } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mockAdvertising, mockResources } from './api';
import { auditInteractions, throttleAuditPage } from './interaction-audit';
export { expect } from '@playwright/test';
export type { Page, Locator } from '@playwright/test';

// CodeMirror owns selection in its editor state. Native contenteditable fill()
// can race its DOM observer; exercise the actual keyboard replace-all workflow.
export async function replaceQuery(editor: Locator, value: string): Promise<void> {
  const apple = await editor.evaluate(() => /Mac|iP(hone|ad|od)/.test(`${navigator.platform} ${navigator.userAgent}`));
  await editor.press(apple ? 'Meta+A' : 'Control+A');
  if (value) await editor.page().keyboard.insertText(value);
  else await editor.press('Backspace');
}

// Native range inputs do not support Playwright fill(). Dispatch their input event.
export async function setSliderValue(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((element, next) => {
    (element as HTMLInputElement).value = String(next);
    element.dispatchEvent(new Event('input', {bubbles:true}));
  }, value);
}

export const test = base.extend<{ runtimeErrors: void; allowPageLoadFailure: boolean; interactionAudit: void; cachedBrowserProof: boolean }>({
  cachedBrowserProof: [true, { option: true }],
  allowPageLoadFailure: [false, { option: true }],
  interactionAudit: [async ({ context }, use, info) => {
    if (process.env.PERF_AUDIT) await auditInteractions(context, info, use);
    else await use();
  }, { auto: true }],
  page: async ({ page }, use, info) => {
    await throttleAuditPage(page);
    const profiler = process.env.PERF_PROFILE ? await page.context().newCDPSession(page) : undefined;
    if (profiler) {
      await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
      await profiler.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8', transferMode: 'ReturnAsStream' });
    }
    if (profiler || process.env.PERF_FIREFOX) {
      await page.addInitScript(title => {
        console.timeStamp('Workflow: ' + title);
        document.addEventListener('click', event => {
          const target = event.target instanceof Element ? event.target.closest('button,a,input,[role="radio"],[role="tab"]') : null;
          // Playwright's fixed clock replaces performance.mark; console timestamps keep native trace time.
          if (target) console.timeStamp('Click: ' + (target.getAttribute('aria-label') || target.textContent || target.id).trim().slice(0, 120));
        }, true);
      }, info.title);
    }
    try { await use(page); } finally {
      // Flush the final presented input before Playwright closes the page.
      if (process.env.PERF_AUDIT && !page.isClosed()) await page.waitForTimeout(250);
      if (profiler && !page.isClosed()) {
        const { profile } = await profiler.send('Profiler.stop');
        const path = info.outputPath('cpu.cpuprofile');
        await writeFile(path, JSON.stringify(profile));
        await info.attach('cpu-profile', { path, contentType: 'application/json' });
        const complete = new Promise<string>(resolve => profiler.once('Tracing.tracingComplete', event => resolve(event.stream!)));
        await profiler.send('Tracing.end');
        const handle = await complete;
        const chunks: Buffer[] = [];
        while (true) {
          const chunk = await profiler.send('IO.read', { handle });
          chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
          if (chunk.eof) break;
        }
        await profiler.send('IO.close', { handle });
        const tracePath = info.outputPath('browser-trace.json');
        await writeFile(tracePath, Buffer.concat(chunks));
        await info.attach('browser-profile', { path: tracePath, contentType: 'application/json' });
      }
    }
  },
  runtimeErrors: [async ({ context, allowPageLoadFailure, cachedBrowserProof }, use) => {
    await mockAdvertising(context);
    await context.route('https://status.uma.moe/api/v1/endpoints/statuses', route => route.fulfill({ json: [{ name: 'API', group: 'uma.moe', results: [{ success: true }] }] }));
    // Page-specific resource/failure routes override this populated catalog baseline.
    await mockResources(context);
    // Workflows use a returning visitor; onboarding tests explicitly select the new audience.
    await context.addInitScript(useCachedProof => {
      if (!/^https?:$/.test(location.protocol)) return;
      try {
        if (!localStorage.getItem('page-introduction-audience-v1')) localStorage.setItem('page-introduction-audience-v1', 'existing');
        if (!localStorage.getItem('lastSeenUpdateVersion')) localStorage.setItem('lastSeenUpdateVersion', '18');
        if (useCachedProof) localStorage.setItem('uma-browser-proof-v1', JSON.stringify({ token: 'fixture-proof', expiresAt: Date.now() + 86_400_000 }));
      } catch { /* Sandboxed third-party frames do not share our visitor state. */ }
    }, cachedBrowserProof);
    const errors: string[] = [];
    context.on('page', (page) => {
      page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
      page.on('console', (message) => {
        if (!allowPageLoadFailure && message.type() === 'error' && message.text().startsWith('Page module could not be loaded:')) errors.push(`${page.url()}: ${message.text()}`);
      });
    });
    await use();
    expect(errors, 'Uncaught browser errors, including opened tabs').toEqual([]);
  }, { auto: true }]
});
