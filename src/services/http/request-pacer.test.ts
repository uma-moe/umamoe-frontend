import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './http-client';
import { createRequestPacer } from './request-pacer';

function httpError(status: number, retryAfter?: string) {
  const headers = retryAfter === undefined ? undefined : { 'retry-after': retryAfter };
  const response = new Response(null, { status, headers });

  return new HttpError(status, '', '/api/sim/race', null, response);
}

describe('request pacer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts up to the limit at once and holds the next until the oldest start leaves the window', async () => {
    const pacer = createRequestPacer({ limit: 2, windowMs: 1000 });
    const request = vi.fn(async () => 'done');

    const results = Promise.all([pacer.send(request), pacer.send(request), pacer.send(request)]);
    await vi.advanceTimersByTimeAsync(999);
    const startedWithinWindow = request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);

    expect(startedWithinWindow).toBe(2);
    await expect(results).resolves.toEqual(['done', 'done', 'done']);
  });

  it('waits out a 429 for its Retry-After before resending the request', async () => {
    const pacer = createRequestPacer({ limit: 10, windowMs: 60_000 });
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(httpError(429, '5'))
      .mockResolvedValue('replay');

    const result = pacer.send(request);
    await vi.advanceTimersByTimeAsync(4999);
    const attemptsDuringHold = request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);

    expect(attemptsDuringHold).toBe(1);
    await expect(result).resolves.toBe('replay');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('holds every other request while a 429 is waited out', async () => {
    const pacer = createRequestPacer({ limit: 10, windowMs: 60_000 });
    const limited = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(httpError(429, '5'))
      .mockResolvedValue('first');
    const next = vi.fn(async () => 'second');

    const first = pacer.send(limited);
    await vi.advanceTimersByTimeAsync(0);
    const second = pacer.send(next);
    await vi.advanceTimersByTimeAsync(4999);
    const heldRequestStarted = next.mock.calls.length > 0;
    await vi.advanceTimersByTimeAsync(1);

    expect(heldRequestStarted).toBe(false);
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  });

  it('passes the 429 on once its retries are used up', async () => {
    const pacer = createRequestPacer({ limit: 10, windowMs: 60_000, retries: 1 });
    const request = vi.fn(async () => {
      throw httpError(429, '1');
    });

    const result = pacer.send(request);
    const rejection = expect(result).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(1000);

    await rejection;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('passes other failures on without resending', async () => {
    const pacer = createRequestPacer({ limit: 10, windowMs: 60_000 });
    const request = vi.fn(async () => {
      throw httpError(500);
    });

    await expect(pacer.send(request)).rejects.toMatchObject({ status: 500 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a slot when the request is cancelled', async () => {
    const pacer = createRequestPacer({ limit: 1, windowMs: 60_000 });
    const controller = new AbortController();
    const queued = vi.fn(async () => 'never');
    await pacer.send(async () => 'first');

    const result = pacer.send(queued, controller.signal);
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();

    await rejection;
    expect(queued).not.toHaveBeenCalled();
  });
});
