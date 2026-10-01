import { afterEach, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/svelte';
import { initializeSentry, sentryOptions } from './sentry';

vi.mock('@sentry/svelte', async importOriginal => ({
  ...await importOriginal<typeof Sentry>(),
  init: vi.fn(),
  captureException: vi.fn(),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); document.head.innerHTML = ''; });

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
  const handler = listener.mock.calls.find(([type]) => type === 'umamoe:app-error')![1];
  window.removeEventListener('umamoe:app-error', handler);
  listener.mockRestore();
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
