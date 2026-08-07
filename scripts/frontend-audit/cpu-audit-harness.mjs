import { createReadStream, existsSync, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const DIST = join(ROOT, 'dist/browser');
export const REPORTS = join(ROOT, 'reports/frontend-audit');
export const HOST = '127.0.0.1';

export const CPU_PROFILES = [
  {
    name: 'desktop',
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  },
  {
    name: 'mobile',
    context: {
      viewport: { width: 412, height: 915 },
      screen: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36',
    },
  },
];

export function assertAuditBuild() {
  if (!existsSync(join(DIST, 'index.html')) || !existsSync(join(ROOT, 'dist/stats.json'))) {
    throw new Error('Missing deterministic audit build. Run npm run build:audit before the CPU audit.');
  }
}

export async function installNetworkFixtures(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== HOST) return route.abort('blockedbyclient');
    if (url.pathname === '/resources/manifest.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"cpu-audit-v1","resources":{}}' });
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/search/')) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"cpu_audit_fixture"}' });
    }
    return route.continue();
  });
}

export async function installCpuInstrumentation(context) {
  await context.addInitScript(() => {
    const state = { callbacks: 0, longTasks: [] };
    Object.defineProperty(window, '__cpuAudit', { value: state, configurable: false });
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => nativeRequestAnimationFrame(timestamp => {
      state.callbacks += 1;
      callback(timestamp);
    });
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });
}

export function resetRuntimeWindow(page) {
  return page.evaluate(() => {
    window.__cpuAudit.callbacks = 0;
    window.__cpuAudit.longTasks.length = 0;
  });
}

export function readRuntimeWindow(page) {
  return page.evaluate(() => {
    const animations = document.getAnimations({ subtree: true })
      .filter(animation => animation.playState === 'running')
      .map(animation => {
        const target = animation.effect?.target;
        if (!(target instanceof Element)) return { name: 'unknown', target: 'unknown' };
        return {
          name: getComputedStyle(target).animationName || 'web-animation',
          target: `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${
            [...target.classList].slice(0, 3).map(value => `.${value}`).join('')
          }`,
        };
      });
    return {
      animations,
      rafCallbacks: window.__cpuAudit.callbacks,
      longTasks: [...window.__cpuAudit.longTasks],
      path: `${location.pathname}${location.search}`,
    };
  });
}

export function metricsMap(response) {
  return new Map(response.metrics.map(metric => [metric.name, metric.value]));
}

export function delta(after, before, key) {
  return (after.get(key) ?? 0) - (before.get(key) ?? 0);
}

export function round(value) {
  return Math.round(value * 100) / 100;
}

export function summarizeAnimations(animations) {
  const counts = new Map();
  for (const animation of animations) {
    const key = `${animation.name} @ ${animation.target}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([animation, count]) => ({ animation, count }))
    .sort((a, b) => b.count - a.count || a.animation.localeCompare(b.animation));
}

export function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

export async function ensureReportsDirectory() {
  await fs.mkdir(REPORTS, { recursive: true });
}

export function startStaticServer(port) {
  const origin = `http://${HOST}:${port}`;
  const mimeTypes = new Map([
    ['.css', 'text/css'], ['.html', 'text/html'], ['.ico', 'image/x-icon'],
    ['.js', 'text/javascript'], ['.json', 'application/json'], ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
  ]);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
    const requested = normalize(pathname).replace(/^([/\\])+/, '');
    let filePath = join(DIST, requested || 'index.html');
    let stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() && !extname(pathname)) {
      filePath = join(DIST, 'index.html');
      stat = await fs.stat(filePath).catch(() => null);
    }
    if (!stat?.isFile() || !resolve(filePath).startsWith(resolve(DIST))) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolveStart(server));
  });
}
