import { pendingPageRequests, whenPageRequestsIdle } from '@/services/http/page-request';

/** Let the destination frame paint before mounting its heavier content. */
export function afterPagePaint(): Promise<void> {
  if (document.hidden) return Promise.resolve();
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Keep optional providers behind the initial page code, data and paint. */
export async function afterPageReady(): Promise<void> {
  await afterPagePaint();
  do {
    await whenPageRequestsIdle();
    await afterPagePaint();
  } while (pendingPageRequests);
}
