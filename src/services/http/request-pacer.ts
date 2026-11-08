import { HttpError, retryAfterSeconds } from './http-client';

export interface RequestPacerOptions {
  /** Requests that may start within one window. */
  limit: number;
  windowMs: number;
  /** Times a request is sent again after a 429 before its error is passed on. */
  retries?: number;
}

export interface RequestPacer {
  send<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', abort, { once: true });
  });
}

function isRateLimit(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 429;
}

/** Spaces requests to stay inside a per-window allowance and waits out any 429 before resending. */
export function createRequestPacer({
  limit,
  windowMs,
  retries = 3
}: RequestPacerOptions): RequestPacer {
  const recentStarts: number[] = [];
  let heldUntil = 0;

  function waitBeforeStart(now: number): number {
    const firstInWindow = recentStarts.findIndex((start) => start > now - windowMs);
    recentStarts.splice(0, firstInWindow === -1 ? recentStarts.length : firstInWindow);

    const oldest = recentStarts[0];
    const windowOpens =
      oldest === undefined || recentStarts.length < limit ? now : oldest + windowMs;

    return Math.max(windowOpens, heldUntil) - now;
  }

  async function takeSlot(signal?: AbortSignal) {
    for (let wait = waitBeforeStart(Date.now()); wait > 0; wait = waitBeforeStart(Date.now()))
      await delay(wait, signal);

    recentStarts.push(Date.now());
  }

  return {
    async send(request, signal) {
      for (let attempt = 0; ; attempt++) {
        await takeSlot(signal);

        try {
          return await request();
        } catch (error) {
          if (!isRateLimit(error) || attempt >= retries || signal?.aborted) throw error;

          heldUntil = Math.max(heldUntil, Date.now() + retryAfterSeconds(error.response) * 1000);
        }
      }
    }
  };
}
