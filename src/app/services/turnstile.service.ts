import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Inject, Injectable, NgZone } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

type TurnstileTheme = 'auto' | 'light' | 'dark';
type TurnstileAppearance = 'always' | 'execute' | 'interaction-only';
type TurnstileExecution = 'render' | 'execute';

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: TurnstileTheme;
  appearance?: TurnstileAppearance;
  execution?: TurnstileExecution;
  callback?: (token: string) => void;
  'error-callback'?: (errorCode: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  'unsupported-callback'?: () => void;
  'response-field'?: boolean;
  retry?: 'auto' | 'never';
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  'refresh-timeout'?: 'auto' | 'manual' | 'never';
}

interface TurnstileApi {
  render(container: HTMLElement | string, options: TurnstileRenderOptions): string;
  execute(containerOrWidgetId: HTMLElement | string): void;
  reset(containerOrWidgetId: HTMLElement | string): void;
  remove(containerOrWidgetId: HTMLElement | string): void;
}

interface CachedBrowserProofToken {
  token: string;
  action: string;
  expiresAt: number;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

@Injectable({ providedIn: 'root' })
export class TurnstileService {
  private readonly scriptId = 'cf-turnstile-api';
  private readonly containerId = 'cf-turnstile-api-proof';
  private readonly exchangeHttp: HttpClient;
  private scriptPromise: Promise<void> | null = null;
  private proofQueue: Promise<void> = Promise.resolve();
  private cachedBrowserProof: CachedBrowserProofToken | null = null;
  private browserProofTask: Promise<CachedBrowserProofToken> | null = null;
  private warnedMissingSiteKey = false;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private zone: NgZone,
    httpBackend: HttpBackend,
  ) {
    this.exchangeHttp = new HttpClient(httpBackend);
  }

  get enabled(): boolean {
    return !!environment.turnstile.enabled && !!environment.turnstile.siteKey;
  }

  get proofHeaderName(): string {
    return environment.turnstile.proofHeaderName;
  }

  get proofTtlHeaderName(): string {
    return environment.turnstile.proofTtlHeaderName;
  }

  prime(): void {
    if (!environment.turnstile.enabled) {
      return;
    }

    if (!environment.turnstile.siteKey) {
      this.warnMissingSiteKey();
      return;
    }

    void this.loadScript().catch(() => undefined);
  }

  async getProofToken(action = environment.turnstile.action, forceRefresh = false): Promise<string> {
    if (!environment.turnstile.enabled) {
      return '';
    }

    if (!environment.turnstile.siteKey) {
      this.warnMissingSiteKey();
      return '';
    }

    const normalizedAction = this.normalizeAction(action);

    if (!forceRefresh) {
      const cached = this.cachedBrowserProof;
      if (this.hasUsableBrowserProof(cached, normalizedAction)) {
        return cached.token;
      }

      const existingTask = this.browserProofTask;
      if (existingTask) {
        const proof = await existingTask.catch(() => null);
        if (proof && this.hasUsableBrowserProof(proof, normalizedAction)) {
          return proof.token;
        }
      }
    }

    const proofTask = this.proofQueue.then(() => this.exchangeBrowserProof(normalizedAction));
    this.browserProofTask = proofTask;
    this.proofQueue = proofTask.then(() => undefined, () => undefined);

    try {
      const proof = await proofTask;
      return proof.token;
    } finally {
      this.clearBrowserProofTask(proofTask);
    }
  }

  getCachedProofToken(action = environment.turnstile.action): string {
    const normalizedAction = this.normalizeAction(action);
    const cached = this.cachedBrowserProof;
    return this.hasUsableBrowserProof(cached, normalizedAction) ? cached.token : '';
  }

  storeBrowserProof(token: string, ttlSeconds: number, action = environment.turnstile.action): void {
    const normalizedToken = token.trim();
    if (!normalizedToken || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return;
    }

    this.cachedBrowserProof = {
      token: normalizedToken,
      action: this.normalizeAction(action),
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  }

  invalidateBrowserProof(token?: string): void {
    if (!this.cachedBrowserProof) {
      return;
    }

    if (!token || this.cachedBrowserProof.token === token) {
      this.cachedBrowserProof = null;
    }
  }

  private hasUsableBrowserProof(
    proof: CachedBrowserProofToken | null,
    action: string,
  ): proof is CachedBrowserProofToken {
    return !!proof
      && proof.action === action
      && Date.now() < proof.expiresAt - environment.turnstile.proofRefreshSkewMs;
  }

  private async exchangeBrowserProof(action: string): Promise<CachedBrowserProofToken> {
    const turnstileToken = await this.executeTokenRequest(action);
    const response = await firstValueFrom(this.exchangeHttp.post(this.getExchangeUrl(), null, {
      observe: 'response',
      responseType: 'text',
      withCredentials: true,
      headers: {
        [environment.turnstile.challengeHeaderName]: turnstileToken,
      },
    }));

    const token = response.headers.get(environment.turnstile.proofHeaderName)?.trim() ?? '';
    const ttlSeconds = Number(response.headers.get(environment.turnstile.proofTtlHeaderName) ?? '0');

    if (!token || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(
        'Browser proof exchange succeeded but proof headers were unavailable. Ensure CORS exposes X-Browser-Proof and X-Browser-Proof-TTL.',
      );
    }

    const proof = {
      token,
      action,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    this.storeBrowserProof(token, ttlSeconds, action);
    return proof;
  }

  private getExchangeUrl(): string {
    const exchangePath = environment.turnstile.exchangePath;
    if (/^https?:\/\//i.test(exchangePath)) {
      return exchangePath;
    }

    if (environment.apiUrl && exchangePath.startsWith('/')) {
      return `${environment.apiUrl}${exchangePath}`;
    }

    return exchangePath;
  }

  private async executeTokenRequest(action: string): Promise<string> {
    await this.loadScript();

    const turnstile = window.turnstile;
    if (!turnstile) {
      throw new Error('Turnstile API failed to load');
    }

    const container = this.ensureContainer();

    return new Promise<string>((resolve, reject) => {
      let widgetId = '';
      let settled = false;

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        if (widgetId) {
          try {
            turnstile.remove(widgetId);
          } catch {
            container.replaceChildren();
          }
        } else {
          container.replaceChildren();
        }
        this.zone.run(callback);
      };

      const timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error('Turnstile token request timed out')));
      }, environment.turnstile.tokenTimeoutMs);

      widgetId = turnstile.render(container, {
        sitekey: environment.turnstile.siteKey,
        action,
        theme: environment.turnstile.theme,
        appearance: environment.turnstile.appearance,
        execution: 'execute',
        'response-field': false,
        retry: 'auto',
        'refresh-expired': 'manual',
        'refresh-timeout': 'auto',
        callback: token => finish(() => resolve(token)),
        'error-callback': errorCode => finish(() => reject(new Error(`Turnstile error: ${errorCode}`))),
        'expired-callback': () => finish(() => reject(new Error('Turnstile token expired'))),
        'timeout-callback': () => finish(() => reject(new Error('Turnstile challenge timed out'))),
        'unsupported-callback': () => finish(() => reject(new Error('Turnstile is unsupported in this browser'))),
      });

      turnstile.execute(widgetId);
    });
  }

  private loadScript(): Promise<void> {
    if (window.turnstile) {
      return Promise.resolve();
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = this.document.getElementById(this.scriptId) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true });
        return;
      }

      const script = this.document.createElement('script');
      script.id = this.scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true });
      this.document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  private ensureContainer(): HTMLElement {
    const existing = this.document.getElementById(this.containerId);
    if (existing) {
      return existing;
    }

    const container = this.document.createElement('div');
    container.id = this.containerId;
    container.style.position = 'fixed';
    container.style.right = '16px';
    container.style.bottom = '16px';
    container.style.zIndex = '2147483647';
    container.style.pointerEvents = 'auto';
    this.document.body.appendChild(container);
    return container;
  }

  private normalizeAction(action: string): string {
    const normalized = action.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
    return normalized || 'api_request';
  }

  private warnMissingSiteKey(): void {
    if (this.warnedMissingSiteKey) {
      return;
    }

    this.warnedMissingSiteKey = true;
    console.warn('Turnstile is enabled but no site key is configured. API proof headers will not be added.');
  }

  private clearBrowserProofTask(tokenTask: Promise<CachedBrowserProofToken>): void {
    if (this.browserProofTask === tokenTask) {
      this.browserProofTask = null;
    }
  }
}