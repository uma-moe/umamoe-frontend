import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { availableVersion, serviceStatus, startSiteServices } from './site-services';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  document.head.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('polls status and builds only while visible, deduplicates focus checks, and cleans up', async () => {
  vi.useFakeTimers();
  document.head.innerHTML = '<meta name="app-build-version" content="2.0.371">';
  history.replaceState(null, '', '/database?mode=uql&__uma_version=old#filters');
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.startsWith('/version')
        ? { version: '2.0.372' }
        : [
            { name: 'API', group: 'Global', results: [{ success: false }, { success: true }] },
            { name: 'Search', results: [{ success: false }] }
          ]
    )
  );

  vi.stubGlobal('fetch', fetcher);
  stop = startSiteServices();
  await vi.advanceTimersByTimeAsync(1);
  expect(get(serviceStatus)).toMatchObject({
    state: 'degraded',
    endpoints: [
      { name: 'API', healthy: true },
      { name: 'Search', healthy: false }
    ]
  });

  expect(get(availableVersion)).toBe('2.0.372');
  expect(location.href).toContain('/database?mode=uql#filters');
  window.dispatchEvent(new Event('focus'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  hidden = true;
  await vi.advanceTimersByTimeAsync(300_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(4);
  stop();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('keeps unreachable status neutral and skips local build checks', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  stop = startSiteServices();
  await vi.advanceTimersByTimeAsync(1);
  expect(get(serviceStatus)).toEqual({ state: 'loading', endpoints: [] });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps malformed endpoint and version payloads neutral', async () => {
  vi.useFakeTimers();
  availableVersion.set('');
  document.head.innerHTML = '<meta name="app-build-version" content="2.0.371">';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.startsWith('/version') ? { version: 372 } : [null])
    )
  );

  stop = startSiteServices();
  await vi.advanceTimersByTimeAsync(1);
  expect(get(serviceStatus)).toEqual({ state: 'loading', endpoints: [] });
  expect(get(availableVersion)).toBe('');
});

it('checks the version at most every five minutes even with focus and online events', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.head.innerHTML = '<meta name="app-build-version" content="2.1.20">';
  const fetcher = vi.fn(async (_url: string) => Response.json({ version: '2.1.20' }));
  vi.stubGlobal('fetch', fetcher);
  const versionCalls = () => fetcher.mock.calls.filter(([url]) => url === '/version.json');
  stop = startSiteServices();
  await vi.advanceTimersByTimeAsync(240_000);
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(1);
  expect(versionCalls()).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith(
    '/version.json',
    expect.objectContaining({ cache: 'no-store' })
  );

  await vi.advanceTimersByTimeAsync(60_000);
  expect(versionCalls()).toHaveLength(2);
});
