export interface BrowserProofPort {
  proofHeader: string;
  ttlHeader: string;
  getCached(): string | undefined;
  prime(): void;
  refresh(retryAfterFailure?: boolean): Promise<string>;
  capture(token: string, ttlSeconds: number): void;
  invalidate(token?: string): void;
}

export interface RateLimitNotice {
  retryAfterSeconds: number;
  url: string;
}

export interface HttpClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  getAuthToken?: () => string | undefined;
  browserProof?: BrowserProofPort;
  onRateLimit?: (notice: RateLimitNotice) => void;
  onUnauthorized?: (url: string) => void;
  retryCount?: number;
}

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[];
  query?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'response';
  /** Force proof for public assets, or opt out for endpoints accepting JWT alone. */
  browserProof?: boolean;
}

interface PipelineRequest {
  url: string;
  init: RequestInit;
  ownApi: boolean;
  proofRequired: boolean;
}

type Next = (request: PipelineRequest) => Promise<Response>;
type Middleware = (request: PipelineRequest, next: Next) => Promise<Response>;

function backendErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const details = body as Record<string, unknown>;
  return [details.message, details.detail, details.error].find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim();
}

export class HttpError<T = unknown> extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly body: T,
    public readonly response: Response
  ) {
    const statusMessage = (String(status) + ' ' + statusText).trim();
    const backendMessage = backendErrorMessage(body);
    super(backendMessage ? `${statusMessage}: ${backendMessage}` : statusMessage);
    this.name = 'HttpError';
  }
}

const retryStatuses = new Set([408, 502, 503, 504]);
const proofErrorCodes = new Set(['browser_proof_required', 'turnstile_invalid', 'browser_context_mismatch', 'invalid_browser_proof', 'browser_proof_warmup_rate_limited', 'browser_proof_warmup_exhausted']);

function isOwnApi(url: string, baseUrl: string): boolean {
  if (url.startsWith('/api/') || url.startsWith('/ingest/') || url.startsWith('/search/')) return true;
  if (!baseUrl) return false;
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return ['/api/', '/ingest/', '/search/'].some((prefix) => url.startsWith(normalizedBase + prefix));
}

function withHeaders(request: PipelineRequest, values: Record<string, string>): PipelineRequest {
  const headers = new Headers(request.init.headers);
  for (const [name, value] of Object.entries(values)) headers.set(name, value);
  return { ...request, init: { ...request.init, headers } };
}

function compose(middleware: Middleware[], transport: Next): Next {
  return middleware.reduceRight<Next>((next, item) => (request) => item(request, next), transport);
}

async function responseBody(response: Response, responseType: HttpRequestOptions['responseType'] = 'json', tolerateInvalidJson = false): Promise<unknown> {
  if (response.status === 204) return null;
  if (responseType === 'blob') return response.blob();
  if (responseType === 'arrayBuffer') return response.arrayBuffer();
  if (responseType === 'text') return response.text();
  if (responseType === 'json') {
    const text = await response.text();
    if (!text) return null;
    const normalized = text.replace(/^\)\]\}',?\n/, '');
    try { return JSON.parse(normalized); }
    catch (error) { if (tolerateInvalidJson) return normalized; throw error; }
  }
  return null;
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = await responseBody(response.clone(), 'json', true);
  if (typeof body === 'string') return [...proofErrorCodes, 'rate_limited'].find((code) => body.includes(code));
  if (!body || typeof body !== 'object') return undefined;
  const candidate = (body as { error?: unknown; code?: unknown }).error ?? (body as { code?: unknown }).code;
  return typeof candidate === 'string' ? candidate : undefined;
}

function retryAfterSeconds(response: Response): number {
  const value = response.headers.get('retry-after');
  if (!value) return 60;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : 60;
}

function serializeBody(body: HttpRequestOptions['body'], headers: Headers): BodyInit | undefined {
  if (body === undefined || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string' || body instanceof ArrayBuffer) return body as BodyInit | undefined;
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return JSON.stringify(body);
}

export function createHttpClient(options: HttpClientOptions = {}) {
  const baseUrl = options.baseUrl?.replace(/\/$/, '') ?? '';
  const fetcher = options.fetcher ?? fetch;
  const retryCount = options.retryCount ?? 1;

  const defaults: Middleware = async (request, next) => {
    const headers = new Headers(request.init.headers);
    if (!headers.has('accept')) headers.set('accept', 'application/json, text/plain, */*');
    return next({
      ...request,
      init: {
        ...request.init,
        headers,
        credentials: request.ownApi || request.proofRequired ? 'omit' : request.init.credentials
      }
    });
  };

  const auth: Middleware = async (request, next) => {
    const token = request.ownApi ? options.getAuthToken?.()?.trim() : undefined;
    const response = await next(token ? withHeaders(request, { authorization: 'Bearer ' + token }) : request);
    if (response.status === 401 && request.ownApi && request.url.includes('/api/auth/')) options.onUnauthorized?.(request.url);
    return response;
  };

  const proof: Middleware = async (request, next) => {
    const port = options.browserProof;
    const headers = new Headers(request.init.headers);
    if (!port || !request.proofRequired || request.init.method === 'OPTIONS' || headers.has(port.proofHeader) || headers.has('x-api-key')) return next(request);
    // Share verification before sending protected requests; concurrent warmup
    // requests exhaust the server allowance and produce avoidable 429 responses.
    const cached = port.getCached() ?? await port.refresh();
    const sent = withHeaders(request, { [port.proofHeader]: cached });
    let response = await next(sent);
    const returnedProof = response.headers.get(port.proofHeader)?.trim();
    if (returnedProof) port.capture(returnedProof, Number(response.headers.get(port.ttlHeader) ?? 0));
    if (response.status !== 403 && response.status !== 429) return response;
    const code = await errorCode(response);
    if (!proofErrorCodes.has(code ?? '')) return response;
    port.invalidate(cached);
    const fresh = await port.refresh();
    response = await next(withHeaders(request, { [port.proofHeader]: fresh }));
    const refreshedProof = response.headers.get(port.proofHeader)?.trim();
    if (refreshedProof) port.capture(refreshedProof, Number(response.headers.get(port.ttlHeader) ?? 0));
    return response;
  };

  const retry: Middleware = async (request, next) => {
    const method = request.init.method ?? 'GET';
    const retryable = method === 'GET' || method === 'HEAD';
    let attempt = 0;
    while (true) {
      try {
        const response = await next(request);
        if (!retryable || attempt >= retryCount || !retryStatuses.has(response.status)) return response;
      } catch (error) {
        if (!retryable || attempt >= retryCount || request.init.signal?.aborted || error instanceof DOMException && error.name === 'AbortError') throw error;
      }
      attempt += 1;
    }
  };

  const rateLimit: Middleware = async (request, next) => {
    const response = await next(request);
    if (response.status === 429) {
      const headers = new Headers(request.init.headers);
      const code = await errorCode(response.clone());
      const warmup = Boolean(options.browserProof) && request.proofRequired && !headers.has(options.browserProof?.proofHeader ?? 'x-browser-proof') && (code === 'browser_proof_warmup_rate_limited' || code === 'browser_proof_warmup_exhausted' || code === 'rate_limited');
      if (!warmup) options.onRateLimit?.({ retryAfterSeconds: retryAfterSeconds(response), url: request.url });
    }
    return response;
  };

  const pipeline = compose([defaults, auth, proof, rateLimit, retry], (request) => fetcher(request.url, request.init));

  async function request<T>(path: string, requestOptions: HttpRequestOptions = {}): Promise<T> {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(requestOptions.query ?? {})) if (value !== undefined) query.set(name, String(value));
    const suffix = query.size ? (path.includes('?') ? '&' : '?') + query : '';
    const url = /^https?:\/\//i.test(path) ? path + suffix : baseUrl + path + suffix;
    const headers = new Headers(requestOptions.headers);
    const init: RequestInit = { ...requestOptions, method: requestOptions.method ?? 'GET', headers, body: serializeBody(requestOptions.body, headers) };
    delete (init as HttpRequestOptions).query;
    delete (init as HttpRequestOptions).responseType;
    delete (init as HttpRequestOptions).browserProof;
    const ownApi = isOwnApi(url, baseUrl);
    const response = await pipeline({ url, init, ownApi, proofRequired: requestOptions.browserProof ?? ownApi });
    if (!response.ok) throw new HttpError(response.status, response.statusText, response.url || url, await responseBody(response, 'json', true), response);
    if (requestOptions.responseType === 'response') return response as T;
    return await responseBody(response, requestOptions.responseType) as T;
  }

  return { request };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
