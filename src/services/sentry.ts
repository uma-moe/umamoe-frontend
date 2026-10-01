import type * as Sentry from '@sentry/svelte';
import { buildVersion } from './site-services';

const stripUrlDetails = (url: string) => url.split(/[?#]/, 1)[0]!;

export const sentryOptions: Sentry.BrowserOptions = {
  dsn: 'https://687e943c7781beb086ec5b91eaea7569@o4512181830877184.ingest.de.sentry.io/4512181871378512',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  tracePropagationTargets: [],
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
  beforeSend(event, hint) {
    if (hint.originalException instanceof DOMException && hint.originalException.name === 'AbortError') return null;
    // Missing stacks cannot establish ownership. Verification is a critical dependency.
    const frames = event.exception?.values?.flatMap(value => value.stacktrace?.frames ?? []) ?? [];
    if (!frames.some(frame => frame.filename && (frame.lineno != null || frame.colno != null)) ||
      event.exception?.values?.some(value => value.type === 'TurnstileError')) {
      if (event.tags) delete event.tags.third_party_code;
    }
    // Sign-in tokens and shared plans can be carried in URL queries and fragments.
    if (event.request?.url) event.request.url = stripUrlDetails(event.request.url);
    for (const breadcrumb of event.breadcrumbs ?? []) {
      if (typeof breadcrumb.data?.url === 'string') breadcrumb.data.url = stripUrlDetails(breadcrumb.data.url);
    }
    return event;
  },
  beforeSendSpan(span) {
    span.name = stripUrlDetails(span.name);
    for (const key of ['url.full', 'http.url', 'http.target']) {
      if (typeof span.attributes[key] === 'string') span.attributes[key] = stripUrlDetails(span.attributes[key]);
    }
    delete span.attributes['url.query'];
    delete span.attributes['url.fragment'];
    return span;
  },
};

export async function initializeSentry(): Promise<void> {
  if (!['production', 'beta'].includes(import.meta.env.MODE) && import.meta.env.VITE_SENTRY_ENABLED !== 'true') return;
  // Keep monitoring off the render path while retaining errors during SDK loading.
  const pending: unknown[] = [];
  // ponytail: retain the first 20 startup errors; raise the cap only if diagnostics need more.
  let capture = (error: unknown): void => { if (pending.length < 20) pending.push(error); };
  const onError = (event: ErrorEvent) => capture(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => capture(event.reason);
  const onBoundary = (event: Event) => capture((event as CustomEvent).detail);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('umamoe:app-error', onBoundary);
  try {
    const { init, captureException, browserTracingIntegration, breadcrumbsIntegration, consoleIntegration, thirdPartyErrorFilterIntegration } = await import('./sentry-sdk');
    init({
      ...sentryOptions,
      release: buildVersion(),
      integrations: [
        browserTracingIntegration(),
        breadcrumbsIntegration({ dom: false, history: false }),
        consoleIntegration({ levels: [] }),
        thirdPartyErrorFilterIntegration({
          filterKeys: ['umamoe-frontend'],
          behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
          ignoreSentryInternalFrames: true,
        }),
      ],
    });
    capture = error => { captureException(error); };
    pending.forEach(capture);
  } catch {
    window.removeEventListener('umamoe:app-error', onBoundary);
    console.warn('Error monitoring could not load.');
  } finally {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    pending.length = 0;
  }
}
