import type { BrowserProofPort } from './http-client';
import { get, writable } from 'svelte/store';
import { runtimeConfig } from '@/services/runtime-config';

interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'auto';
    appearance: 'interaction-only' | 'always';
    execution: 'execute';
    retry: 'never';
    'refresh-expired': 'never';
    callback: (token: string) => void;
    'error-callback': (code?: string) => boolean;
    'expired-callback': () => void;
    'timeout-callback': () => void;
    'unsupported-callback': () => void;
  }): string;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global { interface Window { turnstile?: TurnstileApi; } }

const proofHeader = 'X-Browser-Proof';
const ttlHeader = 'X-Browser-Proof-TTL';
const challengeHeader = 'X-Turnstile-Token';
const exchangePath = '/api/auth/browser-proof';
const action = 'api_request';
const siteKey = runtimeConfig.siteKey.trim();
const devToken = (import.meta.env.VITE_TURNSTILE_DEV_TOKEN ?? '').trim();
const enabled = typeof window !== 'undefined' && runtimeConfig.providersEnabled && Boolean(siteKey || devToken);
export const browserVerification = writable({ pending: false, error: '' });

let cached: { token: string; expiresAt: number } | undefined;
let refreshTask: Promise<string> | undefined;
let scriptTask: Promise<TurnstileApi> | undefined;
const proofStorageKey = 'uma-browser-proof-v1';

function readProof() {
  try {
    const raw = localStorage.getItem(proofStorageKey);
    const value = raw ? JSON.parse(raw) : undefined;
    cached = value && typeof value.token === 'string' && value.token.trim() && Number.isFinite(value.expiresAt)
      ? { token: value.token, expiresAt: value.expiresAt } : undefined;
  } catch { /* Storage may be unavailable; retain the in-memory proof. */ }
  return cached;
}

function saveProof(token: string, ttlSeconds: number) {
  cached = { token, expiresAt: Date.now() + ttlSeconds * 1000 };
  // Persist only our reusable server proof, never the single-use Turnstile token.
  try { localStorage.setItem(proofStorageKey, JSON.stringify(cached)); } catch { /* Memory fallback. */ }
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptTask) return scriptTask;
  scriptTask = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById('cf-turnstile-api') as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const finish = () => {
      window.clearTimeout(timeout);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      if (window.turnstile) resolve(window.turnstile);
      else { script.remove(); reject(new Error('Browser verification could not load. Check your connection and try again.')); }
    };
    const timeout = window.setTimeout(finish, 15_000);
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', finish, { once: true });
    if (existing) return;
    script.id = 'cf-turnstile-api';
    script.async = true;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    document.head.append(script);
  }).catch((error) => { scriptTask = undefined; throw error; });
  return scriptTask;
}

async function challengeToken(visible = false): Promise<string> {
  if (devToken) return devToken;
  const turnstile = await loadTurnstile();
  const container = document.createElement('div');
  container.id = `cf-turnstile-api-proof-${crypto.randomUUID()}`;
  // Turnstile may ask for interaction. A hidden container makes that impossible.
  container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)';
  // Requests also originate inside native modal pickers. Keep the challenge in
  // the active top layer, where it can receive keyboard and pointer input.
  ([...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body).append(container);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let widgetId = '';
    const finish = (token?: string, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (widgetId) turnstile.remove(widgetId);
      container.remove();
      if (token) resolve(token); else reject(error ?? new Error('Turnstile challenge failed.'));
    };
    const timeout = window.setTimeout(() => finish(undefined, new Error('Turnstile challenge timed out.')), visible ? 180_000 : 45_000);
    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action,
        theme: 'auto',
        appearance: visible ? 'always' : 'interaction-only',
        execution: 'execute',
        retry: 'never',
        'refresh-expired': 'never',
        callback: (token) => finish(token),
        'error-callback': (code) => {
          finish(undefined, new Error(`Browser verification failed${code ? ` (${code})` : ''}. Retry verification. If it keeps failing, try a browser profile without extensions or another network.`));
          // The verification notice handles this failure and provides an explicit retry.
          return true;
        },
        'expired-callback': () => finish(undefined, new Error('Turnstile challenge expired.')),
        'timeout-callback': () => finish(undefined, new Error('Turnstile challenge timed out.')),
        'unsupported-callback': () => finish(undefined, new Error('Browser verification is not supported in this browser.'))
      });
      turnstile.execute(widgetId);
    } catch (error) { finish(undefined, error instanceof Error ? error : new Error('Browser verification failed.')); }
  }).catch(error => {
    // Give the visitor one visible attempt before failing all waiting requests.
    if (visible) throw error;
    return challengeToken(true);
  });
}

async function exchange(visible = false): Promise<string> {
  const challenge = await challengeToken(visible);
  const response = await fetch(exchangePath, { method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(15_000), headers: { [challengeHeader]: challenge, accept: 'application/json, text/plain, */*' } });
  const token = response.headers.get(proofHeader)?.trim() ?? '';
  const ttl = Number(response.headers.get(ttlHeader) ?? 0);
  if (!response.ok || !token || !Number.isFinite(ttl) || ttl <= 0) throw new Error(`Browser proof exchange failed (${response.status}).`);
  saveProof(token, ttl);
  return token;
}

const port: BrowserProofPort = {
  proofHeader,
  ttlHeader,
  getCached() {
    readProof();
    if (!cached || cached.expiresAt - Date.now() <= 5000) return undefined;
    return cached.token;
  },
  prime() { if (!port.getCached() && !refreshTask) void port.refresh().catch(() => undefined); },
  refresh(retryAfterFailure = false) {
    // Keep failures shared too, so parallel API calls cannot restart a blocked challenge.
    if (!refreshTask || retryAfterFailure && get(browserVerification).error) {
      browserVerification.set({ pending: true, error: '' });
      refreshTask = exchange(retryAfterFailure).then(token => { refreshTask = undefined; browserVerification.set({ pending: false, error: '' }); return token; }, error => {
        browserVerification.set({ pending: false, error: error instanceof Error ? error.message : 'Browser verification failed.' });
        throw error;
      });
    }
    return refreshTask;
  },
  capture(token, ttlSeconds) {
    if (token && Number.isFinite(ttlSeconds) && ttlSeconds > 0) saveProof(token, ttlSeconds);
  },
  invalidate(token) {
    readProof();
    if (!token || cached?.token === token) {
      cached = undefined;
      try { localStorage.removeItem(proofStorageKey); } catch { /* Memory fallback. */ }
    }
  }
};

export const browserProofPort: BrowserProofPort | undefined = enabled ? port : undefined;
