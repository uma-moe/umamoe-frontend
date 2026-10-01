import { afterEach, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/svelte';
import { initializeSentry } from './sentry';
import { sentryOptions } from './sentry-options';

vi.mock('@sentry/svelte', async importOriginal => ({
  ...await importOriginal<typeof Sentry>(),
  init: vi.fn(),
  captureException: vi.fn(),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); document.head.innerHTML = ''; delete document.documentElement.dataset.appPhase; });

it('keeps local monitoring off and captures startup and Svelte boundary errors with the deployed version', async () => {
  vi.stubEnv('MODE', 'development');
  await initializeSentry();
  expect(Sentry.init).not.toHaveBeenCalled();
  vi.stubEnv('MODE', 'beta');
  document.head.innerHTML = '<meta name="app-build-version" content="2.1.400">';
  const listener = vi.spyOn(window, 'addEventListener');
  const initialized = initializeSentry();
  const startupError = new Error('Startup failure');
  window.dispatchEvent(new ErrorEvent('error', { error: startupError }));
  await initialized;
  expect(Sentry.captureException).toHaveBeenCalledWith(startupError);
  expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: '2.1.400' }));
  const integrations = vi.mocked(Sentry.init).mock.calls[0]![0]!.integrations;
  if (!Array.isArray(integrations)) throw new Error('Expected configured integrations');
  const filter = integrations.find(integration => integration.name === 'ThirdPartyErrorsFilter')!;
  const applicationFrame = { filename: 'https://uma.moe/app/page.js', lineno: 1, module_metadata: { '_sentryBundlerPluginAppKey:umamoe-frontend': true } };
  const vendorFrame = { filename: 'https://provider.invalid/widget.js', lineno: 1 };
  for (const [frames, tagged] of [
    [[{ ...applicationFrame, function: 'sentryWrapped' }, vendorFrame], true],
    [[applicationFrame, vendorFrame], undefined],
    [[applicationFrame], undefined],
  ] as const) {
    const event: Sentry.ErrorEvent = { type: undefined, exception: { values: [{ stacktrace: { frames: [...frames] } }] } };
    const processed = await filter.processEvent!(event, {}, Sentry.getClient()!);
    expect(processed?.tags?.third_party_code).toBe(tagged);
  }
  const error = new Error('Svelte boundary failure');
  window.dispatchEvent(new CustomEvent('umamoe:app-error', { detail: error }));
  expect(Sentry.captureException).toHaveBeenCalledWith(error);
  window.dispatchEvent(new CustomEvent('umamoe:module-error', { detail: error }));
  expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { 'error.kind': 'module-load' } });
  for (const [type, handler] of listener.mock.calls) window.removeEventListener(type, handler);
  listener.mockRestore();
});

it('adds provider labels without guessing ownership from a URL embedded in an error', async () => {
  for (const [host, vendor] of [
    ['cdn.fuseplatform.net', 'publift'], ['imasdk.googleapis.com', 'google-ads'],
    ['cdn.doubleverify.com', 'doubleverify'], ['id5-sync.com', 'id5'],
    ['cmp.inmobi.com', 'inmobi'], ['www.google-analytics.com', 'google-analytics'],
  ]) {
    const result = await sentryOptions.beforeSend!({ type: undefined, tags: { third_party_code: true }, exception: { values: [{ stacktrace: { frames: [{ filename: `https://${host}/synthetic.js?private=1`, lineno: 1 }] } }] } }, {});
    expect(result?.tags).toMatchObject({ 'error.provider': vendor, 'error.source': 'third-party' });
  }
  const unknown = await sentryOptions.beforeSend!({ type: undefined, exception: { values: [{ value: 'Load failed https://cdn.fuseplatform.net/synthetic.js' }] } }, {});
  expect(unknown?.tags).toMatchObject({ 'error.source': 'unknown', 'error.stack': 'missing', 'error.kind': 'network' });
  expect(unknown?.tags?.['error.provider']).toBeUndefined();
});

it('correlates failed requests by error identity and records safe request and capability context', async () => {
  document.documentElement.dataset.appPhase = 'mounted';
  const first = new TypeError('Load failed'), second = new TypeError('Load failed');
  for (const [error, url] of [[first, '/search/query?token=secret#plan'], [second, 'https://user:password@cdn.fuseplatform.net/synthetic?token=secret']] as const) {
    sentryOptions.beforeBreadcrumb!({ category: 'fetch', level: 'error', data: { url, method: 'GET' } }, { data: error, startTimestamp: 10, endTimestamp: 25 });
  }
  const result = await sentryOptions.beforeSend!({ type: undefined, tags: { third_party_code: true }, exception: { values: [{ type: 'TypeError', value: first.message }] } }, { originalException: first });
  expect(result?.tags).toMatchObject({ 'network.target': 'api', 'error.kind': 'network', 'error.source': 'unknown', 'app.phase': 'mounted' });
  expect(result?.tags?.third_party_code).toBeUndefined();
  expect(result?.contexts?.failed_request).toMatchObject({ url: location.origin + '/search/query', duration_ms: 15, method: 'GET', online: true });
  expect(result?.contexts?.browser_capabilities).toHaveProperty('array_to_sorted');
  const vendor = await sentryOptions.beforeSend!({ type: undefined }, { originalException: second });
  expect(vendor?.tags).toMatchObject({ 'error.provider': 'publift', 'network.target': 'external', 'error.source': 'unknown' });
  expect(JSON.stringify(vendor?.contexts?.failed_request)).not.toMatch(/secret|password|user:/);
  const unrelated = await sentryOptions.beforeSend!({ type: undefined }, { originalException: new TypeError('Load failed') });
  expect(unrelated?.contexts?.failed_request).toBeUndefined();
  const module = await sentryOptions.beforeSend!({ type: undefined, tags: { third_party_code: true, 'error.kind': 'module-load' } }, {});
  expect(module?.tags).toMatchObject({ 'error.kind': 'module-load', 'error.source': 'application' });
  expect(module?.tags?.third_party_code).toBeUndefined();
});

it('keeps verification failures and errors with no usable stack in the critical error stream', async () => {
  for (const exception of [
    { values: [{ type: 'TurnstileError', stacktrace: { frames: [{ filename: 'https://challenges.cloudflare.com/turnstile/v0/api.js', lineno: 1 }] } }] },
    { values: [{ type: 'TypeError', value: 'Network failure' }] },
  ]) {
    const event = await sentryOptions.beforeSend!({ type: undefined, exception, tags: { third_party_code: true } }, {});
    expect(event).not.toBeNull();
    expect(event?.tags?.third_party_code).toBeUndefined();
  }
});

it('removes sign-in and shared-plan URL data, and ignores expected request cancellations', async () => {
  const event: Sentry.ErrorEvent = {
    type: undefined,
    request: { url: 'https://uma.moe/signin?token=private#plan-data' },
    breadcrumbs: [{ category: 'fetch', data: { url: '/api/test?token=private#fragment' } }],
  };
  const result = await sentryOptions.beforeSend!(event, {});
  expect(result?.request?.url).toBe('https://uma.moe/signin');
  expect(result?.breadcrumbs?.[0]?.data?.url).toBe('/api/test');
  expect(await sentryOptions.beforeSend!({ type: undefined }, { originalException: new DOMException('cancelled', 'AbortError') })).toBeNull();
  const span = sentryOptions.beforeSendSpan!({
    trace_id: 'trace', span_id: 'span', name: '/signin?token=private', start_timestamp: 1,
    status: 'ok', is_segment: true,
    attributes: { 'url.full': 'https://uma.moe/signin?token=private#plan', 'url.query': 'token=private', 'url.fragment': 'plan' },
  });
  expect(span.name).toBe('/signin');
  expect(span.attributes).toEqual({ 'url.full': 'https://uma.moe/signin' });
});
