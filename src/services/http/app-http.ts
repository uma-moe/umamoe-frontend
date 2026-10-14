import { createHttpClient, type HttpRequestOptions } from './http-client';
import { clearAuthToken, getAuthToken } from '@/services/auth/auth-token';
import { browserProofPort } from './browser-proof';
import { pageFetch, withPageRequest } from './page-request';

/** One HTTP entry point for product repositories. Auth and browser-proof ports can be
 * attached here without reintroducing feature-specific interceptors. */
const client = createHttpClient({
  baseUrl: '',
  fetcher: pageFetch,
  getAuthToken,
  browserProof: browserProofPort,
  onUnauthorized: clearAuthToken,
  onRateLimit: (notice) => window.dispatchEvent(new CustomEvent('uma:rate-limit', { detail: notice }))
});

export const appHttp = {
  request<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return withPageRequest(() => client.request<T>(path, options));
  }
};
