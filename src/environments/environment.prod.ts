export const environment = {
  production: true,
  apiUrl: 'https://uma.moe',
  resourceUrl: 'https://uma.moe/resources',
  statusApiUrl: 'https://status.uma.moe/api/v1/endpoints/statuses',
  enableSearchV3: true, // Enable V3 unified search API
  christmasTheme: false,
  googleAnalytics: {
    measurementId: '',
  },
  turnstile: {
    enabled: true,
    siteKey: '',
    challengeHeaderName: 'X-Turnstile-Token',
    proofHeaderName: 'X-Browser-Proof',
    proofTtlHeaderName: 'X-Browser-Proof-TTL',
    exchangePath: '/api/auth/browser-proof',
    action: 'api_request',
    theme: 'auto' as const,
    appearance: 'interaction-only' as const,
    tokenTimeoutMs: 45000,
    scriptTimeoutMs: 15000,
    recoveryPromptMs: 10000,
    proofRefreshSkewMs: 5000,
    failOpen: false,
  }
};
