import type { Page, Route } from '@playwright/test';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
    headers: { 'cache-control': 'no-store' },
  });
}

/**
 * Keep runtime measurements reproducible. Resource consumers retain their
 * checked-in fallback data, while API failures exercise the normal error UI.
 */
export async function installDeterministicNetwork(page: Page): Promise<void> {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (!LOCAL_HOSTS.has(url.hostname)) {
      await route.abort('blockedbyclient');
      return;
    }

    if (url.pathname === '/resources/manifest.json') {
      await json(route, { version: 'frontend-audit-v1', resources: {} });
      return;
    }

    if (url.pathname === '/audit-api/status') {
      await json(route, []);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await json(route, { error: 'deterministic_audit_fixture' }, 503);
      return;
    }

    await route.continue();
  });
}
