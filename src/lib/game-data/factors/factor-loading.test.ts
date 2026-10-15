import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('shares cache/live factors with pickers and UQL, rejecting a malformed refresh before persisting it', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const factors = await import('./factors');
  const { UqlCompiler } = await import('@/lib/inheritance/uql/uql-compiler');
  const { validateInheritanceUql } = await import('@/lib/inheritance/uql/uql');
  const { createDatabaseUqlLanguage } = await import('@/pages/database/uql/database-uql-language');
  const bundled = factors.factorOptions();
  expect(validateInheritanceUql('Main has Live Recovery').state).toBe('invalid');
  const cached = [...bundled, { id: '990001', text: 'Cached Recovery', type: 3 }];
  const fresh = [...bundled, { id: '990002', text: 'Live Recovery', type: 3 }];
  const cacheName = 'umamoe-resource-data-test',
    url = '/resources/test/factors.json.gz';

  let stored = new Response(JSON.stringify(cached));
  localStorage.setItem('umamoe_resource_meta_v1:factors', JSON.stringify({ url, cacheName }));
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async () => stored.clone(),
      put: async (_url: string, response: Response) => {
        stored = response.clone();
      }
    })
  });

  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  let body: unknown = { default: fresh };

  const fetch = vi.fn(async (path: string) => {
    if (path.includes('manifest')) return Response.json({ version: 'test' });
    await pending;
    return Response.json(body);
  });

  vi.stubGlobal('fetch', fetch);
  const stop = factors.watchFactors(),
    stopSecond = factors.watchFactors();

  const request = factors.loadFactors();
  expect(factors.loadFactors()).toBe(request);
  await vi.waitFor(() => expect(factors.factorMetadata(990001)?.text).toBe('Cached Recovery'));
  expect(get(factors.factorLoadingState)).toEqual({ loading: false, cached: false, error: '' });
  await request;
  release();
  await vi.waitFor(() => expect(factors.factorMetadata(990002)?.text).toBe('Live Recovery'));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(factors.factorMetadata(990001)).toBeUndefined();
  expect(factors.decodeFactor(9900023)).toMatchObject({
    name: 'Live Recovery',
    level: 3,
    category: 'skills-races'
  });

  expect(get(factors.factorLoadingState)).toEqual({ loading: false, cached: false, error: '' });
  expect(new UqlCompiler().compile('Main has Live Recovery')).toBe(
    'overlaps(main_white_factors, (9900021, 9900022, 9900023))'
  );
  expect(validateInheritanceUql('Main has Live Recovery')).toMatchObject({
    state: 'valid',
    compiled: 'overlaps(main_white_factors, (9900021, 9900022, 9900023))'
  });

  expect(
    createDatabaseUqlLanguage([], [], [])
      .completeForEditor('has Live Rec', 12)
      ?.options.some((option) => option.label === 'Live Recovery')
  ).toBe(true);
  body = [...fresh, { id: '990003', text: 'Invalid type', type: 99 }];
  await factors.loadFactors(true);
  expect(factors.factorMetadata(990002)?.text).toBe('Live Recovery');
  expect(factors.factorMetadata(990003)).toBeUndefined();
  expect(await stored.clone().json()).toEqual({ default: fresh });
  expect(get(factors.factorLoadingState)).toEqual({ loading: false, cached: true, error: '' });
  body = fresh;
  await vi.advanceTimersByTimeAsync(1000);
  await vi.waitFor(() =>
    expect(get(factors.factorLoadingState)).toEqual({ loading: false, cached: false, error: '' })
  );

  stop();
  stopSecond();
});

it('reports missing data during a failed fetch, retries while mounted, and stops retrying after navigation', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const factors = await import('./factors');
  vi.stubGlobal('caches', undefined);
  const fetch = vi.fn(async () => new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const stop = factors.watchFactors();
  await factors.loadFactors();
  expect(factors.factorOptions()).toEqual([]);
  expect(get(factors.factorLoadingState)).toEqual({
    loading: true,
    cached: false,
    error: 'Resource manifest returned 503.'
  });

  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('reports a missing resource instead of silently substituting bundled factors', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const factors = await import('./factors');
  const bundled = factors.factorOptions();
  vi.stubGlobal('caches', undefined);
  const fetch = vi.fn(async (url: string) =>
    url.includes('manifest')
      ? Response.json({ version: 'test', files: { character: '/resources/test/character.json' } })
      : new Response('', { status: 404 })
  );

  vi.stubGlobal('fetch', fetch);
  const stop = factors.watchFactors();
  await factors.loadFactors();
  expect(factors.factorOptions()).toEqual(bundled);
  expect(get(factors.factorLoadingState).error).toContain('404');
  expect(fetch).toHaveBeenCalledTimes(2);
  stop();
});

it('decodes uploaded base and encoded factor IDs before any resource has loaded', async () => {
  vi.resetModules();
  const { decodeFactorEntry, factorOptions } = await import('./factors');
  expect(factorOptions()).toEqual([]);
  expect(decodeFactorEntry(200010, 3)).toMatchObject({ id: 200010, level: 3 });
  expect(decodeFactorEntry(2000103, 3)).toMatchObject({ id: 200010, level: 3 });
  expect(decodeFactorEntry(103, 3)).toMatchObject({ id: 10, level: 3 });
});
