import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resourceCache } from './resource-cache';
import {
  loadSupportCards,
  readCachedSupportCards
} from '@/lib/game-data/support-cards/support-cards';

const responses = new Map<string, Response>();
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  resourceCache.invalidate();
  responses.clear();
  localStorage.clear();
  vi.stubGlobal('caches', {
    open: async (name: string) => ({
      match: async (url: string) => responses.get(`${name}:${url}`)?.clone(),
      put: async (url: string, response: Response) => {
        responses.set(`${name}:${url}`, response.clone());
      },
      delete: async (url: string) => responses.delete(`${name}:${url}`)
    })
  });
});

afterEach(() => {
  resourceCache.invalidate();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.dispatchEvent(new Event('pageshow'));
});

it.each([
  { version: 42 },
  { files: { example: null } },
  { artifacts: [{ path: ['/resources/example.json'] }] },
  { files: 'not a resource index' }
])(
  'rejects malformed resource manifest fields before resolving a resource: %j',
  async (manifest) => {
    const fetch = vi.fn(async () => Response.json(manifest));
    vi.stubGlobal('fetch', fetch);
    await expect(resourceCache.load('example')).rejects.toThrow('Invalid resource manifest.');
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);

it('ignores malformed persisted metadata without using its cache entry', async () => {
  localStorage.setItem(
    'umamoe_resource_meta_v1:example',
    JSON.stringify({
      url: '/resources/example.json',
      version: { invalid: true },
      cacheName: 'umamoe-resource-data-test',
      cachedAt: 1
    })
  );

  responses.set(
    'umamoe-resource-data-test:/resources/example.json',
    Response.json({ stale: true })
  );

  expect(await resourceCache.readCached('example')).toBeUndefined();
});

it('does not start catalog requests after navigation while a manifest was loading', async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
  vi.stubGlobal('fetch', fetch);
  const loading = resourceCache.load('skills');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const departure = new Event('beforeunload');
  Object.defineProperty(departure, 'returnValue', { value: '' }); // BeforeUnloadEvent uses a string, unlike Event.
  window.dispatchEvent(departure);
  release(Response.json({ version: 'test' }));
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('matches exact artifact names instead of confusing skills with simulator_skills', async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('manifest.json')
        ? {
            artifacts: [
              { name: 'simulator_skills.json', path: '/resources/test/simulator_skills.json.gz' },
              { name: 'skills.json', path: '/resources/test/skills.json.gz' },
              '/resources/test/character_names.json?locale=en'
            ]
          }
        : [{ name: 'Correct resource' }]
    )
  );

  vi.stubGlobal('fetch', fetch);
  await resourceCache.load('skills');
  await resourceCache.load('character_names');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/resources/manifest.json',
    '/resources/test/skills.json.gz',
    '/resources/test/character_names.json?locale=en'
  ]);
});

it('reads the original Angular cache metadata without fetching or changing its keys', async () => {
  const url = '/resources/legacy/example.json.gz';
  const compressed = new Blob([JSON.stringify({ value: 'cached' })])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));

  responses.set(`umamoe-resource-data-legacy:${url}`, new Response(compressed));
  localStorage.setItem(
    'umamoe_resource_meta_v1:example',
    JSON.stringify({
      url,
      version: 'legacy',
      cacheName: 'umamoe-resource-data-legacy',
      cachedAt: 1
    })
  );

  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await resourceCache.readCached('example')).toEqual({ value: 'cached' });
  expect(fetch).not.toHaveBeenCalled();
});

it('persists successful resources but retains the last good cache on failed refreshes', async () => {
  let failed = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) {
        return Response.json({
          version: 'test',
          files: { example: '/resources/test/example.json' }
        });
      }

      if (failed) {
        return new Response('Unavailable', { status: 503 });
      }

      return Response.json({ value: 'fresh' });
    })
  );

  expect(await resourceCache.load('example')).toEqual({ value: 'fresh' });
  failed = true;
  await expect(resourceCache.load('example', true)).rejects.toThrow('503');
  expect(await resourceCache.readCached('example')).toEqual({ value: 'fresh' });
});

it('a late old resource cannot overwrite the refreshed persistent or in-memory cache', async () => {
  let release!: (response: Response) => void,
    started!: () => void,
    manifests = 0;

  const old = new Promise<Response>((resolve) => (release = resolve)),
    firstStarted = new Promise<void>((resolve) => (started = resolve));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json'))
        return Response.json({
          version: String(++manifests),
          files: { example: `/resources/${manifests}/example.json` }
        });
      if (url.includes('/1/')) {
        started();
        return old;
      }

      return Response.json({ value: 'new' });
    })
  );

  const first = resourceCache.load('example');
  await firstStarted;
  expect(await resourceCache.load('example', true)).toEqual({ value: 'new' });
  release(Response.json({ value: 'old' }));
  await first;
  expect(await resourceCache.readCached('example')).toEqual({ value: 'new' });
  expect(await resourceCache.load('example')).toEqual({ value: 'new' });
});

it('unavailable cache storage does not break a successful resource load', async () => {
  vi.stubGlobal('caches', {
    open: async () => {
      throw new Error('Blocked');
    }
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.endsWith('manifest.json') ? { version: 'test' } : { value: 1 })
    )
  );

  expect(await resourceCache.load('example')).toEqual({ value: 1 });
  expect(await resourceCache.readCached('example')).toEqual({ value: 1 });
});

it('returns fresh data without waiting for the persistent cache write', async () => {
  let release!: () => void;
  const disk = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal('caches', {
    open: async () => {
      await disk;
      return { put: async () => {} };
    }
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.endsWith('manifest.json') ? { version: 'test' } : { value: 'ready' })
    )
  );

  try {
    expect(await resourceCache.load('example')).toEqual({ value: 'ready' });
  } finally {
    release();
  }
});

it('rejects malformed support records before they can overwrite a usable Angular cache', async () => {
  let payload: unknown = [
    { id: '30028', name: 'Kitasan Black', rarity: 3, type: 'speed', isReleased_en: true }
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.endsWith('manifest.json') ? { version: 'test' } : payload)
    )
  );

  const original = await loadSupportCards();
  payload = [{ name: 'Missing required ID' }];
  await expect(loadSupportCards(true)).rejects.toThrow('Invalid support-card record');
  expect(await readCachedSupportCards()).toEqual(original);
});

it('renders a persisted Angular resource before a slow manifest and reuses a matching hash', async () => {
  const url = '/resources/legacy/example.json';
  responses.set(`umamoe-resource-data-legacy:${url}`, Response.json({ value: 'cached' }));
  localStorage.setItem(
    'umamoe_resource_meta_v1:example',
    JSON.stringify({
      url,
      version: 'legacy',
      cacheName: 'umamoe-resource-data-legacy',
      fingerprint: 'same',
      cachedAt: 1
    })
  );

  let release!: () => void;
  const manifestReady = new Promise<void>((resolve) => (release = resolve));
  const fetch = vi.fn(async (_url: string) => {
    await manifestReady;
    return Response.json({
      version: 'new',
      files: { example: { path: '/resources/new/example.json', sha256: 'same' } }
    });
  });

  vi.stubGlobal('fetch', fetch);
  expect(await resourceCache.load('example')).toEqual({ value: 'cached' });
  release();
  await resourceCache.revalidate();
  expect(fetch.mock.calls).toHaveLength(1);
  expect(await resourceCache.load('example', true)).toEqual({ value: 'cached' });
  expect(fetch.mock.calls.every(([url]) => url === '/resources/manifest.json')).toBe(true);
});

it('shares manifest requests and keeps resources across reloads without downloading unchanged files', async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('manifest.json')
        ? {
            files: {
              example: { path: '/resources/example.json', sha256: 'a' },
              other: { path: '/resources/other.json', sha256: 'b' }
            }
          }
        : { value: url }
    )
  );

  vi.stubGlobal('fetch', fetch);
  await Promise.all([
    resourceCache.load('example'),
    resourceCache.load('other'),
    resourceCache.load('example')
  ]);
  expect(fetch).toHaveBeenCalledTimes(3);
  await vi.waitFor(() =>
    expect(localStorage.getItem('umamoe_resource_meta_v1:other')).not.toBeNull()
  );
  resourceCache.invalidate();
  fetch.mockClear();
  await Promise.all([resourceCache.load('example'), resourceCache.load('other')]);
  await resourceCache.revalidate();
  await resourceCache.load('example');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/resources/manifest.json']);
});

it('refreshes only changed hashes in the background and removes the superseded disk entry', async () => {
  let hash = 'a';
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('manifest.json')
        ? {
            files: {
              example: { path: '/resources/example.json', sha256: hash },
              other: { path: '/resources/other.json', sha256: 'stable' }
            }
          }
        : { value: url }
    )
  );

  vi.stubGlobal('fetch', fetch);
  await Promise.all([resourceCache.load('example'), resourceCache.load('other')]);
  await vi.waitFor(() => expect(responses.size).toBe(2));
  hash = 'b';
  fetch.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
  const updated = vi.fn();
  const unsubscribe = resourceCache.onUpdate(updated);
  try {
    expect(await resourceCache.load('example')).toEqual({
      value: '/resources/example.json?v=a'
    });

    await resourceCache.revalidate();
    expect(await resourceCache.load('example')).toEqual({
      value: '/resources/example.json?v=b'
    });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/resources/manifest.json',
      '/resources/example.json?v=b'
    ]);
    expect(updated).toHaveBeenCalledExactlyOnceWith('example');
    await vi.waitFor(() =>
      expect(responses.has('umamoe-resource-data-current:/resources/example.json?v=a')).toBe(false)
    );
    expect(responses.size).toBe(2);
  } finally {
    unsubscribe();
  }
});

it('keeps warm data usable when background manifest checks fail', async () => {
  let offline = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      offline
        ? new Response('Offline', { status: 503 })
        : Response.json(
            url.endsWith('manifest.json') ? { version: 'test' } : { value: 'last good' }
          )
    )
  );

  await resourceCache.load('example');
  offline = true;
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
  expect(await resourceCache.load('example')).toEqual({ value: 'last good' });
  await resourceCache.revalidate();
  expect(await resourceCache.readCached('example')).toEqual({ value: 'last good' });
});

it('caches raw data so one caller cannot replace another caller’s decoded shape', async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(url.endsWith('manifest.json') ? { version: 'test' } : { value: 42 })
  );

  vi.stubGlobal('fetch', fetch);
  expect(
    await resourceCache.load('example', false, (data) => (data as { value: number }).value)
  ).toBe(42);
  expect(await resourceCache.load('example')).toEqual({ value: 42 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rehashes persisted JSON in the background and repairs only a corrupt resource, including legacy gzip caches', async () => {
  const good = '{ "value": "original", "count": 7 }';
  const fingerprint = createHash('sha256').update(good).digest('hex');
  const url = `/resources/example.json.gz?v=${fingerprint}`;
  const key = `umamoe-resource-data-test:${url}`;
  responses.set(key, new Response(new Uint8Array(gzipSync(good)).buffer));
  localStorage.setItem(
    'umamoe_resource_meta_v1:example',
    JSON.stringify({
      url,
      version: 'test',
      cacheName: 'umamoe-resource-data-test',
      fingerprint,
      cachedAt: 1
    })
  );

  const fetch = vi.fn(async (path: string) =>
    path.endsWith('manifest.json')
      ? Response.json({
          version: 'test',
          files: { example: { path: '/resources/example.json.gz', sha256: fingerprint } }
        })
      : new Response(good)
  );

  vi.stubGlobal('fetch', fetch);
  expect(await resourceCache.load('example')).toEqual({ value: 'original', count: 7 });
  await resourceCache.revalidate();
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/resources/manifest.json']);

  // Valid JSON and valid metadata can still contain damaged data.
  responses.set(key, new Response(new Uint8Array(gzipSync(good.replace('7', '8'))).buffer));
  resourceCache.invalidate();
  fetch.mockClear();
  const updated = vi.fn();
  const unsubscribe = resourceCache.onUpdate(updated);
  try {
    expect(await resourceCache.load('example')).toEqual({ value: 'original', count: 8 });
    await resourceCache.revalidate();
    expect(await resourceCache.readCached('example')).toEqual({ value: 'original', count: 7 });
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/resources/manifest.json', url]);
    expect(updated).toHaveBeenCalledExactlyOnceWith('example');
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:example')!).checksum).toBe(
        fingerprint
      )
    );
  } finally {
    unsubscribe();
  }
});

it('rejects a response whose JSON bytes do not match the manifest without overwriting good data', async () => {
  let payload = '{"value":1}';
  let fingerprint = createHash('sha256').update(payload).digest('hex');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path.endsWith('manifest.json')
        ? Response.json({
            files: { example: { path: '/resources/example.json', sha256: fingerprint } }
          })
        : new Response(payload)
    )
  );

  expect(await resourceCache.load('example')).toEqual({ value: 1 });
  await vi.waitFor(() =>
    expect(localStorage.getItem('umamoe_resource_meta_v1:example')).not.toBeNull()
  );
  const originalMeta = localStorage.getItem('umamoe_resource_meta_v1:example');
  fingerprint = createHash('sha256').update('{"value":2}').digest('hex');
  payload = '{"value":999}';
  await expect(resourceCache.load('example', true)).rejects.toThrow('integrity check');
  expect(await resourceCache.readCached('example')).toEqual({ value: 1 });
  expect(localStorage.getItem('umamoe_resource_meta_v1:example')).toBe(originalMeta);
});

it('locates the published master database without letting a malformed entry block resources', async () => {
  const masterPath = '/resources/simulator/v1/master.mdb.gz';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ version: 'v1', master: { path: masterPath, marker: '1.35.2:10008300' } })
    )
  );

  expect(await resourceCache.masterDatabase()).toEqual({
    path: masterPath,
    marker: '1.35.2:10008300'
  });

  resourceCache.invalidate();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path.endsWith('manifest.json')
        ? Response.json({
            files: { example: '/resources/example.json' },
            master: { path: 'https://elsewhere.test/master.mdb.gz' }
          })
        : Response.json({ value: 1 })
    )
  );

  expect(await resourceCache.masterDatabase()).toBeUndefined();
  expect(await resourceCache.load('example')).toEqual({ value: 1 });
});
