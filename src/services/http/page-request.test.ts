import { expect, it, vi } from 'vitest';
import { pendingPageRequests, whenPageRequestsIdle, withPageRequest } from './page-request';

it('waits for every active operation, including failures, before resuming background work', async () => {
  let finish!: () => void, fail!: () => void;
  const first = withPageRequest(() => new Promise<void>(resolve => finish = resolve));
  const second = withPageRequest(() => new Promise<void>((_, reject) => fail = () => reject(new Error('offline')))).catch(() => {});
  const idle = vi.fn();
  const waiting = whenPageRequestsIdle().then(idle);
  expect(pendingPageRequests).toBe(2);
  finish(); await first;
  expect(idle).not.toHaveBeenCalled();
  fail(); await second; await waiting;
  expect(pendingPageRequests).toBe(0);
  expect(idle).toHaveBeenCalledOnce();
  await whenPageRequestsIdle();
});
