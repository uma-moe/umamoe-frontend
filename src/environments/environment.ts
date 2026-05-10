export const environment = {
  production: false,
  apiUrl: '',  // relative paths - proxied by ng serve via proxy.conf.json
  enableSearchV3: true, // Enable V3 unified search API
  christmasTheme: false,
  turnstile: {
    enabled: false,
    siteKey: '',
    challengeHeaderName: 'X-Turnstile-Token',
    proofHeaderName: 'X-Browser-Proof',
    proofTtlHeaderName: 'X-Browser-Proof-TTL',
    exchangePath: '/api/auth/browser-proof',
    action: 'api_request',
    theme: 'auto' as const,
    appearance: 'interaction-only' as const,
    tokenTimeoutMs: 15000,
    proofRefreshSkewMs: 5000,
    failOpen: false,
  }
};
