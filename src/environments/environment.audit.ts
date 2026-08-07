import { environment as productionEnvironment } from './environment.prod';

/**
 * Production-equivalent local environment used by repeatable frontend audits.
 * Browser tests fulfill API/resource requests with deterministic fixtures and
 * all variable third-party integrations are disabled at the source.
 */
export const environment = {
  ...productionEnvironment,
  production: true,
  apiUrl: '',
  resourceUrl: '/resources',
  statusApiUrl: '/audit-api/status',
  googleAnalytics: {
    measurementId: '',
  },
  fuse: {
    ...productionEnvironment.fuse,
    enabled: false,
    alwaysShowFallbacks: false,
    debugLogging: false,
  },
  turnstile: {
    ...productionEnvironment.turnstile,
    enabled: false,
    siteKey: '',
    failOpen: true,
  },
};
