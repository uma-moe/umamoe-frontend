export const environment = {
  production: false,
  apiUrl: '',  // relative paths - proxied by ng serve via proxy.conf.json
  resourceUrl: '/resources',
  statusApiUrl: 'https://status.uma.moe/api/v1/endpoints/statuses',
  enableSearchV3: true, // Enable V3 unified search API
  christmasTheme: false,
  googleAnalytics: {
    measurementId: '',
  },
  turnstile: {
    enabled: true,
    siteKey: '0x4AAAAAADJqTbxKd66xUeWw',
    devToken: '',
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
