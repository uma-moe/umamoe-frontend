import type * as Sentry from '@sentry/svelte';

const stripUrlDetails = (url: string) => url.split(/[?#]/, 1)[0] ?? '';
const failedRequests = new WeakMap<object, Record<string, string | number | boolean>>();

function safeUrl(value: string): string {
  try {
    const url = new URL(value, location.origin);
    if (!/^https?:$/.test(url.protocol)) return '';
    // Never retain credentials, queries or fragments from a request.
    return url.origin + url.pathname;
  } catch {
    return '';
  }
}

function provider(value: string): string | undefined {
  const url = safeUrl(value);
  if (!url) return;
  const host = new URL(url).hostname;
  const vendors: [string, string[]][] = [
    ['publift', ['fuseplatform.net', 'publift.com']],
    ['google-analytics', ['google-analytics.com', 'analytics.google.com', 'googletagmanager.com']],
    [
      'google-ads',
      ['doubleclick.net', 'googlesyndication.com', 'googletagservices.com', 'imasdk.googleapis.com']
    ],
    ['doubleverify', ['doubleverify.com']],
    ['flashtalking', ['ftstatic.com', 'flashtalking.com']],
    ['ias', ['adsafeprotected.com']],
    ['infolinks', ['infolinks.com']],
    ['geoedge', ['geoedge.be', 'geoedge.com']],
    ['ad-recovery', ['btloader.com']],
    ['prebid', ['omnitagjs.com']],
    ['id5', ['id5-sync.com']],
    ['inmobi', ['inmobi.com', 'quantcast.com']],
    ['turnstile', ['challenges.cloudflare.com']]
  ];

  return vendors.find(([, domains]) =>
    domains.some((domain) => host === domain || host.endsWith('.' + domain))
  )?.[0];
}

// Provider callbacks can include our bundled Sentry wrapper. That wrapper
// does not make an otherwise external stack application code.
function isSentryFrame(frame: Sentry.StackFrame, url: URL): boolean {
  return (
    frame.function === 'sentryWrapped' ||
    // Production wrappers are minified; source maps are applied after beforeSend.
    /\/node_modules\/@sentry\//.test(url.pathname) ||
    /^\/app\/sentry-sdk-[\w-]+\.js$/.test(url.pathname)
  );
}

function pageState() {
  return {
    online: navigator.onLine,
    visibility: document.visibilityState,
    lifecycle: document.documentElement.dataset.appLifecycle ?? 'active'
  };
}

function errorSource({
  moduleLoad,
  thirdParty,
  hasStack,
  vendor
}: {
  moduleLoad: boolean;
  thirdParty: boolean;
  hasStack: boolean;
  vendor: string | undefined;
}): string {
  if (moduleLoad) return 'application';
  if (thirdParty) return 'third-party';
  if (!hasStack) return 'unknown';
  return vendor ? 'mixed' : 'application';
}

function networkTarget(url: URL): string {
  if (url.origin !== location.origin) return 'external';
  if (/^\/(api|search)\//.test(url.pathname)) return 'api';
  if (url.pathname.startsWith('/app/')) return 'app-asset';
  if (url.pathname.startsWith('/resources/')) return 'catalog';
  return 'same-origin';
}

export const sentryOptions: Sentry.BrowserOptions = {
  dsn: 'https://687e943c7781beb086ec5b91eaea7569@o4512181830877184.ingest.de.sentry.io/4512181871378512',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  tracePropagationTargets: [],
  dataCollection: {
    userInfo: false,
    cookies: false,
    // Needed for Sentry's browser/version breakdown; excludes auth and referrers.
    httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
    httpBodies: [],
    urlQueryParams: false
  },
  beforeBreadcrumb(breadcrumb, hint) {
    if (typeof breadcrumb.data?.url === 'string')
      breadcrumb.data.url = safeUrl(breadcrumb.data.url);
    // Sentry supplies the actual rejected fetch object as hint.data. Do not guess
    // which concurrent request caused an error from the last breadcrumb alone.
    if (
      breadcrumb.category === 'fetch' &&
      breadcrumb.level === 'error' &&
      hint?.data &&
      typeof hint.data === 'object'
    ) {
      const url = breadcrumb.data?.url;
      if (typeof url === 'string' && url) {
        failedRequests.set(hint.data, {
          url,
          method: String(breadcrumb.data?.method ?? 'GET'),
          ...pageState(),
          ...(typeof hint.endTimestamp === 'number' && typeof hint.startTimestamp === 'number'
            ? { duration_ms: Math.max(0, hint.endTimestamp - hint.startTimestamp) }
            : {})
        });
      }
    }

    return breadcrumb;
  },
  beforeSend(event, hint) {
    if (
      hint.originalException instanceof DOMException &&
      hint.originalException.name === 'AbortError'
    )
      return null;
    // Missing stacks cannot establish ownership. Verification is a critical dependency.
    const frames =
      event.exception?.values?.flatMap((value) => value.stacktrace?.frames ?? []) ?? [];

    const hasStack = frames.some(
      (frame) => frame.filename && (frame.lineno != null || frame.colno != null)
    );

    if (
      !hasStack ||
      event.tags?.['error.kind'] === 'module-load' ||
      event.exception?.values?.some((value) => value.type === 'TurnstileError')
    ) {
      if (event.tags) delete event.tags.third_party_code;
    }

    const request =
      hint.originalException && typeof hint.originalException === 'object'
        ? failedRequests.get(hint.originalException)
        : undefined;

    const vendor =
      [...frames]
        .reverse()
        .map((frame) => provider(frame.filename ?? ''))
        .find(Boolean) ?? (request ? provider(String(request.url)) : undefined);

    const sameOriginFrameUrls = frames.flatMap((frame) => {
      const url = safeUrl(frame.filename ?? '');
      if (!url) return [];
      const parsed = new URL(url);
      if (parsed.origin !== location.origin || isSentryFrame(frame, parsed)) return [];
      return [parsed];
    });

    const hasApplicationFrame = sameOriginFrameUrls.some((url) =>
      /^\/(app|src|node_modules)\//.test(url.pathname)
    );

    const sameOriginRequest = request
      ? new URL(String(request.url)).origin === location.origin
      : false;

    const providerOnly =
      vendor &&
      vendor !== 'turnstile' &&
      !hasApplicationFrame &&
      event.tags?.['error.kind'] !== 'module-load' &&
      !event.exception?.values?.some((value) => value.type === 'TurnstileError') &&
      !sameOriginRequest;

    if (hasApplicationFrame && event.tags) delete event.tags.third_party_code;

    const externalOnly =
      Boolean(event.tags?.third_party_code) &&
      sameOriginFrameUrls.length === 0 &&
      !sameOriginRequest;

    // Ad, analytics and other provider scripts fail on their own; we cannot act on those reports.
    if (providerOnly || externalOnly) return null;

    const externalScript = [...frames]
      .reverse()
      .map((frame) => safeUrl(frame.filename ?? ''))
      .find((url) => {
        if (!url) return false;
        const parsed = new URL(url);
        return (
          parsed.origin !== location.origin &&
          parsed.hostname !== 'sentry.io' &&
          !parsed.hostname.endsWith('.sentry.io')
        );
      });

    const phase = document.documentElement.dataset.appPhase ?? 'loading-entry';
    const state = pageState();
    event.tags = {
      ...event.tags,
      'app.phase': phase,
      'app.build': document.documentElement.dataset.appBuild ?? 'unknown',
      'error.source': errorSource({
        moduleLoad: event.tags?.['error.kind'] === 'module-load',
        thirdParty: Boolean(event.tags?.third_party_code),
        hasStack,
        vendor
      }),
      'network.online': request?.online ?? state.online,
      'page.lifecycle': request?.lifecycle ?? state.lifecycle,
      'error.stack': hasStack ? 'available' : 'missing',
      ...(vendor ? { 'error.provider': vendor } : {}),
      ...(externalScript ? { 'error.script_host': new URL(externalScript).hostname } : {})
    };

    event.contexts = {
      ...event.contexts,
      browser_capabilities: {
        dialog:
          typeof HTMLDialogElement !== 'undefined' &&
          typeof HTMLDialogElement.prototype.showModal === 'function',
        popover: typeof HTMLElement.prototype.showPopover === 'function',
        native_popover_at_start: document.documentElement.dataset.nativePopover,
        array_to_sorted: typeof Array.prototype.toSorted === 'function',
        decompression_stream: typeof DecompressionStream !== 'undefined'
      },
      page_state: { ...state, phase },
      ...(request ? { failed_request: request } : {})
    };

    if (request) {
      const url = new URL(String(request.url));
      event.tags['network.target'] = networkTarget(url);
      event.tags['error.kind'] = 'network';
    } else if (
      !event.tags['error.kind'] &&
      event.exception?.values?.some((value) =>
        /Load failed|Failed to fetch|NetworkError|dynamically imported module|module script|preload CSS/i.test(
          value.value ?? ''
        )
      )
    ) {
      event.tags['error.kind'] = 'network';
    }

    // Sign-in tokens and shared plans can be carried in URL queries and fragments.
    if (event.request?.url) event.request.url = stripUrlDetails(event.request.url);
    for (const breadcrumb of event.breadcrumbs ?? []) {
      if (typeof breadcrumb.data?.url === 'string')
        breadcrumb.data.url = stripUrlDetails(breadcrumb.data.url);
    }

    return event;
  },
  beforeSendSpan(span) {
    span.name = stripUrlDetails(span.name);
    for (const key of ['url.full', 'http.url', 'http.target']) {
      if (typeof span.attributes[key] === 'string')
        span.attributes[key] = stripUrlDetails(span.attributes[key]);
    }

    delete span.attributes['url.query'];
    delete span.attributes['url.fragment'];
    return span;
  }
};
