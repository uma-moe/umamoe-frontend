// Keep unused SDK features out of the dynamically imported bundle.
export { addBreadcrumb, init, captureException, browserTracingIntegration, breadcrumbsIntegration, consoleIntegration, thirdPartyErrorFilterIntegration, startInactiveSpan, reportPageLoaded } from '@sentry/svelte';
export { sentryOptions } from './sentry-options';
