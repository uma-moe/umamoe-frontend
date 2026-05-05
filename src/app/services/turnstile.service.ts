import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone } from '@angular/core';
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

interface CachedTurnstileToken {
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
  private scriptPromise: Promise<void> | null = null;
  private tokenQueue: Promise<void> = Promise.resolve();
  private cachedToken: CachedTurnstileToken | null = null;
  private primedTokenTask: Promise<CachedTurnstileToken> | null = null;
  private warnedMissingSiteKey = false;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private zone: NgZone,
  ) {}

  get enabled(): boolean {
    return !!environment.turnstile.enabled && !!environment.turnstile.siteKey;
  }

  get headerName(): string {
    return environment.turnstile.headerName;
  }

  prime(): void {
    if (!environment.turnstile.enabled) {
      return;
    }

    if (!environment.turnstile.siteKey) {
      this.warnMissingSiteKey();
      return;
    }

    const action = this.normalizeAction(environment.turnstile.action);
    const cached = this.cachedToken;
    if (cached && cached.action === action && cached.expiresAt > Date.now()) {
      return;
    }

    if (this.primedTokenTask) {
      return;
    }

    const tokenTask = this.tokenQueue
      .then(() => this.executeTokenRequest(action))
      .then(token => {
        const primedToken = {
          token,
          action,
          expiresAt: Date.now() + environment.turnstile.tokenMaxAgeMs,
        };
        this.cachedToken = primedToken;
        return primedToken;
      });

    this.primedTokenTask = tokenTask;
    this.tokenQueue = tokenTask.then(() => undefined, () => undefined);

    tokenTask
      .then(
        () => this.clearPrimedTask(tokenTask),
        () => this.clearPrimedTask(tokenTask),
      );
  }

  async getToken(action = environment.turnstile.action): Promise<string> {
    if (!environment.turnstile.enabled) {
      return '';
    }

    if (!environment.turnstile.siteKey) {
      this.warnMissingSiteKey();
      return '';
    }

    const normalizedAction = this.normalizeAction(action);
    const cached = this.cachedToken;
    if (cached && cached.action === normalizedAction && cached.expiresAt > Date.now()) {
      this.cachedToken = null;
      return cached.token;
    }

    if (cached) {
      this.cachedToken = null;
    }

    const primedTokenTask = this.primedTokenTask;
    if (primedTokenTask) {
      const primedToken = await primedTokenTask.catch(() => null);
      if (primedToken && primedToken.action === normalizedAction && primedToken.expiresAt > Date.now()) {
        if (this.cachedToken?.token === primedToken.token) {
          this.cachedToken = null;
        }
        return primedToken.token;
      }
    }

    const tokenTask = this.tokenQueue.then(() => this.executeTokenRequest(normalizedAction));
    this.tokenQueue = tokenTask.then(() => undefined, () => undefined);
    return tokenTask;
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

  private clearPrimedTask(tokenTask: Promise<CachedTurnstileToken>): void {
    if (this.primedTokenTask === tokenTask) {
      this.primedTokenTask = null;
    }
  }
}