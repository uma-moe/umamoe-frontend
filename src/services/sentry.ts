import { buildVersion } from './site-services';

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
    const { init, captureException, browserTracingIntegration, breadcrumbsIntegration, consoleIntegration, thirdPartyErrorFilterIntegration, sentryOptions, addBreadcrumb } = await import('./sentry-sdk');
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
