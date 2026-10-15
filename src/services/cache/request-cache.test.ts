import { expect, it, vi } from 'vitest';
import { RequestCache } from './request-cache';

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

it('reports remaining freshness without extending it on cached reads', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const cache = new RequestCache();
    expect(cache.remainingMs('clubs')).toBe(0);
    await cache.get('clubs', 1000, async () => 'first');
    now.mockReturnValue(1400);
    expect(await cache.get('clubs', 1000, async () => 'unexpected')).toBe('first');
    expect(cache.remainingMs('clubs')).toBe(600);
    now.mockReturnValue(2100);
    expect(cache.remainingMs('clubs')).toBe(0);
    await cache.get('clubs', 1000, async () => 'fresh');
    expect(cache.remainingMs('clubs')).toBe(1000);
    cache.invalidate('clubs');
    expect(cache.remainingMs('clubs')).toBe(0);
  } finally {
    now.mockRestore();
  }
});

it('keeps the latest refresh pending when an older read finishes', async () => {
  const cache = new RequestCache();
  await cache.get('profile:1', 1000, async () => 'cached');
  const old = deferred(),
    fresh = deferred();

  const first = cache.get('profile:1', 1000, () => old.promise, true);
  const second = cache.get('profile:1', 1000, () => fresh.promise, true);
  old.resolve('old');
  await first;
  const unnecessary = vi.fn(async () => 'unexpected');
  const concurrent = cache.get('profile:1', 1000, unnecessary);
  fresh.resolve('new');
  expect(await second).toBe('new');
  expect(await concurrent).toBe('new');
  expect(unnecessary).not.toHaveBeenCalled();
  expect(await cache.get('profile:1', 1000, unnecessary)).toBe('new');
});

it('does not overwrite refreshed data when an older response arrives last', async () => {
  const cache = new RequestCache(),
    old = deferred();

  const pending = cache.get('clubs:1', 1000, () => old.promise);
  await cache.get('clubs:1', 1000, async () => 'new', true);
  old.resolve('old');
  await pending;
  expect(await cache.get('clubs:1', 1000, async () => 'unexpected')).toBe('new');
});

it('invalidates pending reads without discarding other domains', async () => {
  const cache = new RequestCache(),
    old = deferred();

  await cache.get('rankings:1', 1000, async () => 'ranking');
  const pending = cache.get('clubs:1', 1000, () => old.promise);
  cache.invalidate('clubs:');
  old.resolve('old');
  await pending;
  expect(await cache.get('clubs:1', 1000, async () => 'new')).toBe('new');
  expect(await cache.get('rankings:1', 1000, async () => 'unexpected')).toBe('ranking');
});

it('allows another load after a failed request', async () => {
  const cache = new RequestCache();
  await expect(
    cache.get('data', 1000, async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');

  expect(await cache.get('data', 1000, async () => 'retried')).toBe('retried');
});
