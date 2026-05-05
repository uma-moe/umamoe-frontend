export const environment = {
  production: false,
  apiUrl: 'https://beta.uma.moe',
  enableSearchV3: true, // Enable V3 unified search API
  christmasTheme: false,
  turnstile: {
    enabled: true,
    siteKey: '',
    headerName: 'X-Turnstile-Token',
    action: 'api_request',
    theme: 'auto' as const,
    appearance: 'interaction-only' as const,
    tokenTimeoutMs: 15000,
    tokenMaxAgeMs: 240000,
    failOpen: false,
  }
};
