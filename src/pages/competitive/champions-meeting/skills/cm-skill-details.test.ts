import { beforeEach, expect, it, vi } from 'vitest';
import type { SkillDetail } from '../cm-exploration';
import { CmSkillDetails } from './cm-skill-details.svelte';

const request = vi.hoisted(() => vi.fn());
vi.mock('../cm-data', () => ({
  cmGet: request,
  snapshotPath: (id: string, path: string) => '/snapshots/' + id + '/' + path
}));

const detail: SkillDetail = {
  snapshotId: 'test',
  skillId: 1,
  bucketCount: 100,
  courseDistance: 1200,
  styles: { Nige: [[70, 3, 2, 1, 1]] }
};

beforeEach(() => {
  request.mockReset();
});

it('shares one in-flight request and retains the result for the list and comparison', async () => {
  request.mockResolvedValue(detail);
  const store = new CmSkillDetails();
  store.reset('test', 1200);

  await Promise.all([store.load(1), store.load(1)]);
  await store.load(1);

  expect(request).toHaveBeenCalledTimes(1);
  expect(store.values[1]).toEqual(detail);
  store.destroy();
});

it('aborts a previous snapshot and discards its late response', async () => {
  let deliver = (_value: SkillDetail) => {};
  request.mockImplementation(
    () =>
      new Promise<SkillDetail>((resolve) => {
        deliver = resolve;
      })
  );
  const store = new CmSkillDetails();
  store.reset('old', 1200);
  const pending = store.load(1);
  const signal = request.mock.calls[0]?.[1];

  store.reset('new', 1200);
  deliver(detail);
  await pending;

  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(true);
  expect(store.values).toEqual({});
  store.destroy();
});

it('loads six visible timings at a time, replaces offscreen queued work and prioritizes inspection', async () => {
  const responses: (() => void)[] = [];
  request.mockImplementation(
    (path: string) =>
      new Promise<SkillDetail>((resolve) => {
        responses.push(() => resolve({ ...detail, skillId: Number(path.split('/').at(-1)) }));
      })
  );
  const store = new CmSkillDetails();
  store.reset('test', 1200);

  store.prefetch([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(request).toHaveBeenCalledTimes(6);
  store.prefetch([9, 10]);
  const inspected = store.load(11);
  expect(request).toHaveBeenCalledTimes(7);
  responses[0]?.();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(8));
  expect(request.mock.calls[7]?.[0]).toContain('/details/9');

  store.reset('next', 1200);
  responses.forEach((respond) => respond());
  await inspected;
  await Promise.resolve();

  expect(request).toHaveBeenCalledTimes(8);
  expect(store.values).toEqual({});
  store.destroy();
});

it('exposes failures and allows a successful retry', async () => {
  request.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(detail);
  const store = new CmSkillDetails();
  store.reset('test', 1200);

  await store.load(1);
  expect(store.errors[1]).toBe('Unavailable');
  await store.load(1);

  expect(store.errors[1]).toBeUndefined();
  expect(store.values[1]).toEqual(detail);
  store.destroy();
});
