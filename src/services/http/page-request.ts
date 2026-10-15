// Safari rejects fetches started during navigation, including requests following
// a late manifest response. Keep this guard active through the whole operation.
let pageActive = true;
export let pendingPageRequests = 0;
const idleWaiters = new Set<() => void>();

export function whenPageRequestsIdle(): Promise<void> {
  return pendingPageRequests
    ? new Promise((resolve) => idleWaiters.add(resolve))
    : Promise.resolve();
}

function departing(event: BeforeUnloadEvent): void {
  pageActive = false;
  queueMicrotask(() => {
    if (event.defaultPrevented || event.returnValue) pageActive = true;
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => (pageActive = false));
  window.addEventListener('pageshow', () => (pageActive = true));
}

export const pageFetch: typeof fetch = (url, init) =>
  pageActive
    ? fetch(url, init)
    : Promise.reject(new DOMException('Page navigation cancelled the request.', 'AbortError'));

export async function withPageRequest<T>(operation: () => Promise<T>): Promise<T> {
  // Only listen while busy so idle pages remain eligible for the back/forward cache.
  if (++pendingPageRequests === 1 && typeof window !== 'undefined')
    window.addEventListener('beforeunload', departing);
  try {
    return await operation();
  } finally {
    if (--pendingPageRequests === 0) {
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', departing);
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  }
}
