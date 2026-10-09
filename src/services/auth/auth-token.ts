const TOKEN_KEY = 'auth_token';
let memoryToken: string | undefined;
let memoryOnly = false;

export function getAuthToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!memoryOnly) {
    try { memoryToken = window.localStorage.getItem(TOKEN_KEY)?.trim() || undefined; }
    catch { /* Blocked storage must not prevent startup or API requests. */ }
  }
  return memoryToken;
}

export function setAuthToken(token: string): void {
  memoryToken = token.trim() || undefined;
  try { window.localStorage.setItem(TOKEN_KEY, token.trim()); memoryOnly = false; }
  catch { memoryOnly = true; }
}

export function clearAuthToken(): void {
  memoryToken = undefined;
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(TOKEN_KEY); memoryOnly = false; }
  catch { memoryOnly = true; }
}
