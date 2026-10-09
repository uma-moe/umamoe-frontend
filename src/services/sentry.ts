import { buildVersion } from './site-services';
import { afterPageReady } from '@/routes/after-page-paint';
import { sanitizeAnalyticsUrl } from './analytics-url';

type VerificationPhase = 'challenge' | 'exchange';
let recordVerification = (_phase: VerificationPhase, _start: number, _end: number, _path: string, _success: boolean): void => {};

export async function withVerificationTiming<T>(phase: VerificationPhase, operation: () => Promise<T>): Promise<T> {
  const start = Date.now() / 1000, path = sanitizeAnalyticsUrl(location.href);
  let success = false;
  try { const result = await operation(); success = true; return result; }
  finally { recordVerification(phase, start, Date.now() / 1000, path, success); }
}

export async function initializeSentry(): Promise<void> {
  if (!['production', 'beta'].includes(import.meta.env.MODE) && import.meta.env.VITE_SENTRY_ENABLED !== 'true') return;
  // Keep monitoring off the render path while retaining errors during SDK loading.
  const pending: { error: unknown; moduleLoad: boolean }[] = [];
  // ponytail: retain the first 20 startup errors; raise the cap only if diagnostics need more.
  let capture = (error: unknown, moduleLoad = false): void => { if (pending.length < 20) pending.push({ error, moduleLoad }); };
  const onError = (event: ErrorEvent) => capture(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => capture(event.reason);
  const onBoundary = (event: Event) => capture((event as CustomEvent).detail);
  const onModuleError = (event: Event) => capture((event as CustomEvent).detail, true);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('umamoe:app-error', onBoundary);
  window.addEventListener('umamoe:module-error', onModuleError);
  try {
    const { init, captureException, browserTracingIntegration, breadcrumbsIntegration, consoleIntegration, thirdPartyErrorFilterIntegration, sentryOptions, addBreadcrumb, startInactiveSpan, reportPageLoaded } = await import('./sentry-sdk');
    init({
      ...sentryOptions,
      release: buildVersion(),
      integrations: [
        browserTracingIntegration({
          enableReportPageLoaded: true,
          beforeStartSpan: options => ({ ...options, name: sanitizeAnalyticsUrl(location.href) }),
        }),
        breadcrumbsIntegration({ dom: false, history: false }),
        consoleIntegration({ levels: [] }),
        thirdPartyErrorFilterIntegration({
          filterKeys: ['umamoe-frontend'],
          behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
          ignoreSentryInternalFrames: true,
        }),
      ],
    });
    recordVerification = (phase, startTime, end, path, success) => {
      const span = startInactiveSpan({ name: `Browser verification ${phase}`, op: `browser.verification.${phase}`, startTime, attributes: { 'url.path': path } });
      span.setStatus({ code: success ? 1 : 2 });
      span.end(end);
    };
    void afterPageReady().then(() => reportPageLoaded());
    capture = (error, moduleLoad = false) => {
      if (moduleLoad) captureException(error, { tags: { 'error.kind': 'module-load' } });
      else captureException(error);
    };
    pending.forEach(({ error, moduleLoad }) => capture(error, moduleLoad));
    for (const type of ['pagehide', 'pageshow', 'online', 'offline']) {
      window.addEventListener(type, () => {
        if (type === 'pagehide' || type === 'pageshow') document.documentElement.dataset.appLifecycle = type === 'pagehide' ? 'departing' : 'active';
        addBreadcrumb({ category: 'app.lifecycle', message: type, data: { online: navigator.onLine, visibility: document.visibilityState } });
      });
    }
    window.addEventListener('vite:preloadError', () => {
      // Optional background imports can fail too; annotate without turning every
      // failed warm-up into a new incident. The actual route failure is captured.
      addBreadcrumb({ category: 'app.module', level: 'warning', message: 'Module or stylesheet preload failed' });
    });
  } catch {
    window.removeEventListener('umamoe:app-error', onBoundary);
    window.removeEventListener('umamoe:module-error', onModuleError);
    console.warn('Error monitoring could not load.');
  } finally {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    pending.length = 0;
  }
}
