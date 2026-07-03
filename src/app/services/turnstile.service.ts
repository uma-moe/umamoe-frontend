import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AppVersionService } from './app-version.service';

type TurnstileTheme = 'auto' | 'light' | 'dark';
type TurnstileAppearance = 'always' | 'execute' | 'interaction-only';
type TurnstileExecution = 'render' | 'execute';
type TurnstileProofMode = 'background' | 'interactive';
type TurnstileSupportSimulationMode = 'none' | 'failed' | 'stalled' | 'background_failed' | 'background_stalled';
type TurnstileSupportSimulationScope = 'all' | 'background';

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
  source: string;
}

interface TurnstileTokenRequest {
  token: string;
  cleanup: () => void;
}

export type TurnstileProofStage =
  | 'idle'
  | 'disabled'
  | 'misconfigured'
  | 'warmup'
  | 'script_loading'
  | 'challenge_running'
  | 'exchange_running'
  | 'ready'
  | 'failed';

export interface TurnstileDebugState {
  enabled: boolean;
  ready: boolean;
  stage: TurnstileProofStage;
  attempt: number;
  action: string;
  updatedAt: string;
  startedAt?: string;
  elapsedMs?: number;
  message?: string;
  error?: string;
  errorCode?: string;
  mode?: TurnstileProofMode;
  source?: string;
  buildVersion: string;
  buildVersionLabel: string;
  scriptLoaded: boolean;
  tokenTimeoutMs: number;
  scriptTimeoutMs: number;
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
  private readonly interactiveContainerId = 'cf-turnstile-interactive-proof';
  private scriptPromise: Promise<void> | null = null;
  private proofQueue: Promise<void> = Promise.resolve();
  private cachedBrowserProof: CachedBrowserProofToken | null = null;
  private browserProofTask: Promise<CachedBrowserProofToken | null> | null = null;
  private interactiveProofTask: Promise<CachedBrowserProofToken | null> | null = null;
  private primeTask: Promise<void> | null = null;
  private proofReadySubject = new BehaviorSubject<boolean>(false);
  private proofDebugSubject = new BehaviorSubject<TurnstileDebugState>(this.createDebugState('idle'));
  private proofAttempt = 0;
  private warnedMissingSiteKey = false;
  private warnedPrimeFailure = false;
  private supportSimulationMode: TurnstileSupportSimulationMode = 'none';
  private supportSimulationMessage = '';
  private supportSimulationErrorCode = '';

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private zone: NgZone,
    private appVersionService: AppVersionService,
  ) {}

  get enabled(): boolean {
    return !!environment.turnstile.enabled && (!!environment.turnstile.siteKey || !!this.localDevToken);
  }

  get proofHeaderName(): string {
    return environment.turnstile.proofHeaderName;
  }

  get proofTtlHeaderName(): string {
    return environment.turnstile.proofTtlHeaderName;
  }

  get proofSourceHeaderName(): string {
    return 'X-Browser-Proof-Source';
  }

  get proofReady$(): Observable<boolean> {
    return this.proofReadySubject.asObservable();
  }

  get proofDebug$(): Observable<TurnstileDebugState> {
    return this.proofDebugSubject.asObservable();
  }

  get currentProofDebug(): TurnstileDebugState {
    return this.proofDebugSubject.value;
  }

  simulateFailureForSupport(
    message = 'Simulated Turnstile failure for support testing.',
    errorCode = 'simulated_failure',
    scope: TurnstileSupportSimulationScope = 'all',
  ): void {
    if (environment.production) {
      return;
    }

    const attempt = ++this.proofAttempt;
    const startedAt = new Date().toISOString();
    this.supportSimulationMode = scope === 'background' ? 'background_failed' : 'failed';
    this.supportSimulationMessage = message;
    this.supportSimulationErrorCode = errorCode;
    this.cachedBrowserProof = null;
    this.proofReadySubject.next(false);
    this.updateProofDebug({
      stage: 'failed',
      ready: false,
      attempt,
      action: this.normalizeAction(environment.turnstile.action),
      startedAt,
      mode: 'background',
      error: message,
      errorCode,
      message: 'Turnstile browser verification failed.',
    });
  }

  simulateStallForSupport(scope: TurnstileSupportSimulationScope = 'all'): void {
    if (environment.production) {
      return;
    }

    const attempt = ++this.proofAttempt;
    const startedAt = new Date(Date.now() - this.scriptTimeoutMs).toISOString();
    this.supportSimulationMode = scope === 'background' ? 'background_stalled' : 'stalled';
    this.supportSimulationMessage = 'Simulated stalled Turnstile challenge for support testing.';
    this.supportSimulationErrorCode = 'simulated_stall';
    this.cachedBrowserProof = null;
    this.proofReadySubject.next(false);
    this.updateProofDebug({
      stage: 'challenge_running',
      ready: false,
      attempt,
      action: this.normalizeAction(environment.turnstile.action),
      startedAt,
      mode: 'background',
      message: 'Simulated stalled Turnstile challenge for support testing.',
    });
  }

  prime(): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }

    if (!this.primeTask) {
      this.primeTask = this.getProofToken(environment.turnstile.action, false)
        .then(() => undefined)
        .catch(error => this.warnPrimeFailure(error))
        .finally(() => {
          this.primeTask = null;
        });
    }

    return this.primeTask;
  }

  async getProofToken(
    action = environment.turnstile.action,
    forceRefresh = false,
    mode: TurnstileProofMode = 'background',
  ): Promise<string> {
    if (!environment.turnstile.enabled) {
      this.updateProofDebug({
        stage: 'disabled',
        ready: false,
        message: 'Turnstile is disabled for this build.',
      });
      return '';
    }

    if (!environment.turnstile.siteKey && !this.localDevToken) {
      this.warnMissingSiteKey();
      this.updateProofDebug({
        stage: 'misconfigured',
        ready: false,
        message: 'Turnstile is enabled but no site key is configured.',
      });
      return '';
    }

    const normalizedAction = this.normalizeAction(action);

    if (mode === 'interactive') {
      if (this.shouldSimulateSupportProof(mode)) {
        return this.getSimulatedSupportProof(normalizedAction, mode);
      }

      this.supportSimulationMode = 'none';
      this.supportSimulationMessage = '';
      this.supportSimulationErrorCode = '';
    } else if (this.shouldSimulateSupportProof(mode)) {
      return this.getSimulatedSupportProof(normalizedAction, mode);
    }

    const cached = this.cachedBrowserProof;
    if (!forceRefresh && this.hasUsableBrowserProof(cached, normalizedAction)) {
      return cached.token;
    }

    if (mode === 'interactive') {
      const existingInteractiveTask = this.interactiveProofTask;
      if (existingInteractiveTask) {
        const proof = await existingInteractiveTask;
        return proof && this.hasUsableBrowserProof(proof, normalizedAction) ? proof.token : '';
      }

      const interactiveTask = this.exchangeBrowserProof(normalizedAction, 'interactive');
      this.interactiveProofTask = interactiveTask;

      try {
        const proof = await interactiveTask;
        return proof?.token ?? '';
      } finally {
        this.clearInteractiveProofTask(interactiveTask);
      }
    }

    const existingTask = this.browserProofTask;
    if (existingTask && !forceRefresh) {
      const proof = await this.waitForProofTask(existingTask, normalizedAction);
      return proof && this.hasUsableBrowserProof(proof, normalizedAction) ? proof.token : '';
    }

    const proofTask = this.proofQueue.then(() => this.exchangeBrowserProof(normalizedAction, 'background'));
    if (!forceRefresh) {
      this.browserProofTask = proofTask;
    }
    this.proofQueue = proofTask.then(() => undefined, () => undefined);

    try {
      const proof = await this.waitForProofTask(proofTask, normalizedAction);
      return proof?.token ?? '';
    } finally {
      this.clearBrowserProofTask(proofTask);
    }
  }

  async ensureBrowserProof(action = environment.turnstile.action, forceRefresh = false): Promise<string> {
    return this.getProofToken(action, forceRefresh);
  }

  async verifyInteractively(action = environment.turnstile.action): Promise<void> {
    await this.getProofToken(action, true, 'interactive');
  }

  getCachedProofToken(action = environment.turnstile.action, options?: { includeWarmup?: boolean }): string {
    const normalizedAction = this.normalizeAction(action);
    const cached = this.cachedBrowserProof;
    return this.hasUsableBrowserProof(cached, normalizedAction, options?.includeWarmup === true) ? cached.token : '';
  }

  storeBrowserProof(
    token: string,
    ttlSeconds: number,
    action = environment.turnstile.action,
    source = 'turnstile',
  ): void {
    const normalizedSource = (source || 'turnstile').trim().toLowerCase();
    if (this.supportSimulationMode !== 'none' && normalizedSource !== 'turnstile') {
      return;
    }

    const normalizedToken = token.trim();
    const normalizedAction = this.normalizeAction(action);

    if (normalizedSource !== 'turnstile') {
      if (normalizedToken && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        const existingProof = this.cachedBrowserProof;
        if (!this.hasUsableBrowserProof(existingProof, normalizedAction)) {
          this.cachedBrowserProof = {
            token: normalizedToken,
            action: normalizedAction,
            expiresAt: Date.now() + ttlSeconds * 1000,
            source: normalizedSource,
          };
        }
      }

      this.updateProofDebug({
        stage: 'warmup',
        ready: false,
        action: normalizedAction,
        source: normalizedSource,
        message: 'Using temporary browser warmup proof while Turnstile verification completes.',
      });
      this.prime();
      return;
    }

    if (!normalizedToken || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return;
    }

    this.cachedBrowserProof = {
      token: normalizedToken,
      action: normalizedAction,
      expiresAt: Date.now() + ttlSeconds * 1000,
      source: normalizedSource,
    };
    this.supportSimulationMode = 'none';
    this.supportSimulationMessage = '';
    this.supportSimulationErrorCode = '';
    this.proofReadySubject.next(true);
    this.updateProofDebug({
      stage: 'ready',
      ready: true,
      action: normalizedAction,
      source: normalizedSource,
      message: 'Turnstile browser proof is ready.',
    });
  }

  invalidateBrowserProof(token?: string): void {
    if (!this.cachedBrowserProof) {
      return;
    }

    if (!token || this.cachedBrowserProof.token === token) {
      this.cachedBrowserProof = null;
      this.proofReadySubject.next(false);
      this.updateProofDebug({
        stage: 'idle',
        ready: false,
        message: 'Browser proof was invalidated.',
      });
    }
  }

  private hasUsableBrowserProof(
    proof: CachedBrowserProofToken | null,
    action: string,
    includeWarmup = false,
  ): proof is CachedBrowserProofToken {
    const refreshSkewMs = proof?.source === 'turnstile'
      ? environment.turnstile.proofRefreshSkewMs
      : 0;

    return !!proof
      && proof.action === action
      && (proof.source === 'turnstile' || includeWarmup)
      && Date.now() < proof.expiresAt - refreshSkewMs;
  }

  private getSimulatedSupportProof(action: string, mode: TurnstileProofMode): Promise<string> {
    const attempt = ++this.proofAttempt;
    const stalled = this.supportSimulationMode === 'stalled' || this.supportSimulationMode === 'background_stalled';
    const startedAt = new Date(
      stalled
        ? Date.now() - this.turnstileRecoveryPromptMsForSimulation
        : Date.now()
    ).toISOString();

    this.cachedBrowserProof = null;
    this.proofReadySubject.next(false);

    if (stalled) {
      this.updateProofDebug({
        stage: 'challenge_running',
        ready: false,
        attempt,
        action,
        startedAt,
        mode,
        message: this.supportSimulationMessage || 'Simulated stalled Turnstile challenge for support testing.',
      });
      return new Promise<string>(() => undefined);
    }

    const message = this.supportSimulationMessage || 'Simulated Turnstile failure for support testing.';
    this.updateProofDebug({
      stage: 'failed',
      ready: false,
      attempt,
      action,
      startedAt,
      mode,
      error: message,
      errorCode: this.supportSimulationErrorCode || 'simulated_failure',
      message: 'Turnstile browser verification failed.',
    });
    return Promise.reject(new Error(message));
  }

  private shouldSimulateSupportProof(mode: TurnstileProofMode): boolean {
    if (this.supportSimulationMode === 'none') {
      return false;
    }

    if (mode === 'background') {
      return true;
    }

    return this.supportSimulationMode === 'failed' || this.supportSimulationMode === 'stalled';
  }

  private waitForProofTask(
    task: Promise<CachedBrowserProofToken | null>,
    action: string,
  ): Promise<CachedBrowserProofToken | null> {
    const cached = this.cachedBrowserProof;
    if (this.hasUsableBrowserProof(cached, action)) {
      return Promise.resolve(cached);
    }

    let unsubscribe = (): void => undefined;
    const readyTask = new Promise<CachedBrowserProofToken | null>(resolve => {
      let subscription: { unsubscribe(): void } | null = null;
      subscription = this.proofReadySubject.subscribe(ready => {
        if (!ready) {
          return;
        }

        const proof = this.cachedBrowserProof;
        if (this.hasUsableBrowserProof(proof, action)) {
          subscription?.unsubscribe();
          resolve(proof);
        }
      });
      unsubscribe = () => subscription?.unsubscribe();
    });

    return Promise.race([
      task.catch(error => {
        const proof = this.cachedBrowserProof;
        if (this.hasUsableBrowserProof(proof, action)) {
          return proof;
        }
        throw error;
      }),
      readyTask,
    ]).finally(unsubscribe);
  }

  private async exchangeBrowserProof(
    action: string,
    mode: TurnstileProofMode,
  ): Promise<CachedBrowserProofToken | null> {
    const attempt = ++this.proofAttempt;
    const startedAt = new Date().toISOString();

    try {
      for (let exchangeAttempt = 1; exchangeAttempt <= 2; exchangeAttempt++) {
        const tokenRequest = await this.executeTokenRequest(action, attempt, startedAt, mode);
        try {
          const proof = await this.exchangeTurnstileToken(tokenRequest.token, action, attempt, startedAt, mode, exchangeAttempt);
          return proof;
        } catch (error) {
          if (exchangeAttempt < 2 && this.extractTurnstileErrorCode(error) === 'turnstile_invalid') {
            this.updateProofDebug({
              stage: 'challenge_running',
              ready: false,
              attempt,
              action,
              startedAt,
              mode,
              error: this.errorMessage(error),
              errorCode: 'turnstile_invalid',
              message: 'Turnstile token was rejected; requesting a fresh token.',
            });
            continue;
          }

          throw error;
        } finally {
          tokenRequest.cleanup();
        }
      }

      return null;
    } catch (error) {
      const cached = this.cachedBrowserProof;
      if (this.hasUsableBrowserProof(cached, action)) {
        return cached;
      }

      const currentDebug = this.currentProofDebug;
      if (
        mode === 'background'
        && currentDebug.mode === 'interactive'
        && this.isPendingProofStage(currentDebug.stage)
      ) {
        throw error;
      }

      this.updateProofDebug({
        stage: 'failed',
        ready: false,
        attempt,
        action,
        startedAt,
        mode,
        error: this.errorMessage(error),
        errorCode: this.extractTurnstileErrorCode(error),
        message: 'Turnstile browser verification failed.',
      });
      throw error;
    }
  }

  private async exchangeTurnstileToken(
    turnstileToken: string,
    action: string,
    attempt: number,
    startedAt: string,
    mode: TurnstileProofMode,
    exchangeAttempt: number,
  ): Promise<CachedBrowserProofToken> {
    const normalizedToken = turnstileToken.trim();
    if (!normalizedToken) {
      throw new Error('Turnstile returned an empty token');
    }

    this.updateProofDebug({
      stage: 'exchange_running',
      ready: false,
      attempt,
      action,
      startedAt,
      mode,
      message: exchangeAttempt > 1
        ? 'Exchanging fresh Turnstile token for browser proof.'
        : 'Exchanging Turnstile token for browser proof.',
    });

    const exchangeUrl = this.getExchangeUrl();
    const response = await this.postTurnstileExchange(exchangeUrl, normalizedToken);

    const proofToken = response.headers.get(environment.turnstile.proofHeaderName)?.trim() ?? '';
    const ttlSeconds = Number(response.headers.get(environment.turnstile.proofTtlHeaderName) ?? '0');

    if (!proofToken || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Browser proof exchange returned no usable proof token');
    }

    const proof = {
      token: proofToken,
      action,
      expiresAt: Date.now() + ttlSeconds * 1000,
      source: 'turnstile',
    };
    this.storeBrowserProof(proofToken, ttlSeconds, action);
    return proof;
  }

  private async postTurnstileExchange(exchangeUrl: string, turnstileToken: string): Promise<Response> {
    const fetch = this.document.defaultView?.fetch;
    if (!fetch) {
      throw new Error('Browser proof exchange requires fetch support');
    }

    const response = await fetch(exchangeUrl, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        Accept: 'application/json, text/plain, */*',
        [environment.turnstile.challengeHeaderName]: turnstileToken,
      },
    });

    if (!response.ok) {
      let errorBody = response.statusText;
      try {
        errorBody = await response.text();
      } catch {
        // Keep the status text when the body cannot be read.
      }

      throw new HttpErrorResponse({
        error: errorBody,
        status: response.status,
        statusText: response.statusText,
        url: exchangeUrl,
      });
    }

    return response;
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

  private async executeTokenRequest(
    action: string,
    attempt: number,
    startedAt: string,
    mode: TurnstileProofMode,
  ): Promise<TurnstileTokenRequest> {
    const localDevToken = this.localDevToken;
    if (localDevToken) {
      this.updateProofDebug({
        stage: 'ready',
        ready: true,
        attempt,
        action,
        startedAt,
        mode,
        source: 'dev',
        message: 'Using local development Turnstile token.',
      });
      return { token: localDevToken, cleanup: () => undefined };
    }

    this.updateProofDebug({
      stage: 'script_loading',
      ready: false,
      attempt,
      action,
      startedAt,
      mode,
      message: 'Loading Cloudflare Turnstile script.',
    });
    await this.loadScript();

    const turnstile = window.turnstile;
    if (!turnstile) {
      throw new Error('Turnstile API failed to load');
    }

    const container = this.ensureContainer(mode);

    this.updateProofDebug({
      stage: 'challenge_running',
      ready: false,
      attempt,
      action,
      startedAt,
      mode,
      message: 'Requesting Turnstile token from browser challenge.',
    });

    return new Promise<TurnstileTokenRequest>((resolve, reject) => {
      let widgetId = '';
      let settled = false;
      let cleaned = false;

      const cleanupWidget = (): void => {
        if (cleaned) {
          return;
        }

        cleaned = true;
        if (widgetId) {
          try {
            turnstile.remove(widgetId);
          } catch {
            container.replaceChildren();
          }
        } else {
          container.replaceChildren();
        }
      };

      const finish = (callback: () => void, cleanup = true): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        if (cleanup) {
          cleanupWidget();
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
        appearance: mode === 'interactive' ? 'always' : environment.turnstile.appearance,
        execution: mode === 'interactive' ? 'render' : 'execute',
        'response-field': false,
        retry: 'never',
        'refresh-expired': 'manual',
        'refresh-timeout': 'auto',
        callback: token => finish(() => resolve({ token, cleanup: cleanupWidget }), false),
        'error-callback': errorCode => finish(() => reject(new Error(`Turnstile error: ${errorCode}`))),
        'expired-callback': () => finish(() => reject(new Error('Turnstile token expired'))),
        'timeout-callback': () => finish(() => reject(new Error('Turnstile challenge timed out'))),
        'unsupported-callback': () => finish(() => reject(new Error('Turnstile is unsupported in this browser'))),
      });

      if (mode !== 'interactive') {
        turnstile.execute(widgetId);
      }
    });
  }

  private loadScript(): Promise<void> {
    if (window.turnstile) {
      return Promise.resolve();
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    const timeoutMs = this.scriptTimeoutMs;
    this.scriptPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId = 0;

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        callback();
      };

      timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error('Turnstile script load timed out')));
      }, timeoutMs);

      const existingScript = this.document.getElementById(this.scriptId) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => finish(() => resolve()), { once: true });
        existingScript.addEventListener('error', () => finish(() => reject(new Error('Turnstile script failed to load'))), { once: true });
        return;
      }

      const script = this.document.createElement('script');
      script.id = this.scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => finish(() => resolve()), { once: true });
      script.addEventListener('error', () => finish(() => reject(new Error('Turnstile script failed to load'))), { once: true });
      this.document.head.appendChild(script);
    }).catch(error => {
      this.scriptPromise = null;
      throw error;
    });

    return this.scriptPromise;
  }

  private ensureContainer(mode: TurnstileProofMode): HTMLElement {
    const containerId = mode === 'interactive' ? this.interactiveContainerId : this.containerId;
    const existing = this.document.getElementById(containerId);
    if (existing) {
      existing.replaceChildren();
      return existing;
    }

    const container = this.document.createElement('div');
    container.id = containerId;
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

  private createDebugState(stage: TurnstileProofStage): TurnstileDebugState {
    return {
      enabled: this.enabled,
      ready: false,
      stage,
      attempt: this.proofAttempt,
      action: this.normalizeAction(environment.turnstile.action),
      updatedAt: new Date().toISOString(),
      buildVersion: this.appVersionService.getCurrentVersion(),
      buildVersionLabel: this.appVersionService.getCurrentVersionLabel(),
      scriptLoaded: typeof window !== 'undefined' && !!window.turnstile,
      tokenTimeoutMs: environment.turnstile.tokenTimeoutMs,
      scriptTimeoutMs: this.scriptTimeoutMs,
    };
  }

  private updateProofDebug(update: Partial<TurnstileDebugState>): void {
    const previous = this.proofDebugSubject.value;
    const now = Date.now();
    const startedAt = update.startedAt ?? previous.startedAt;
    const startedAtTime = startedAt ? Date.parse(startedAt) : NaN;
    const elapsedMs = Number.isFinite(startedAtTime) ? Math.max(0, now - startedAtTime) : update.elapsedMs;
    const clearsFailure = !!update.stage && update.stage !== 'failed';

    this.proofDebugSubject.next({
      ...previous,
      ...update,
      enabled: this.enabled,
      ready: update.ready ?? previous.ready,
      action: this.normalizeAction(update.action ?? previous.action),
      updatedAt: new Date(now).toISOString(),
      buildVersion: this.appVersionService.getCurrentVersion(),
      buildVersionLabel: this.appVersionService.getCurrentVersionLabel(),
      startedAt,
      elapsedMs,
      error: update.error ?? (clearsFailure ? undefined : previous.error),
      errorCode: update.errorCode ?? (clearsFailure ? undefined : previous.errorCode),
      scriptLoaded: typeof window !== 'undefined' && !!window.turnstile,
      tokenTimeoutMs: environment.turnstile.tokenTimeoutMs,
      scriptTimeoutMs: this.scriptTimeoutMs,
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const bodyError = this.extractErrorCodeFromBody(error.error);
      if (bodyError) {
        return bodyError;
      }

      return `${error.status || 0} ${error.statusText || 'HTTP error'}`.trim();
    }

    if (error instanceof Error) {
      return error.message || error.name;
    }

    return String(error);
  }

  private extractTurnstileErrorCode(error: unknown): string | undefined {
    if (error instanceof HttpErrorResponse) {
      return this.extractErrorCodeFromBody(error.error) || undefined;
    }

    const message = this.errorMessage(error);
    const match = message.match(/^Turnstile error:\s*(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }

    return this.extractErrorCodeFromBody(message) || undefined;
  }

  private extractErrorCodeFromBody(errorBody: unknown): string | null {
    if (typeof errorBody === 'string') {
      try {
        return this.extractErrorCodeFromBody(JSON.parse(errorBody));
      } catch {
        return errorBody.includes('turnstile_invalid') ? 'turnstile_invalid' : null;
      }
    }

    if (!errorBody || typeof errorBody !== 'object') {
      return null;
    }

    const errorCode = (errorBody as { error?: unknown; code?: unknown }).error
      ?? (errorBody as { code?: unknown }).code;
    return typeof errorCode === 'string' ? errorCode : null;
  }

  private isPendingProofStage(stage: TurnstileProofStage): boolean {
    return stage === 'script_loading'
      || stage === 'challenge_running'
      || stage === 'exchange_running';
  }

  private get scriptTimeoutMs(): number {
    const timeoutMs = Number((environment.turnstile as any).scriptTimeoutMs ?? 15000);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
  }

  private get turnstileRecoveryPromptMsForSimulation(): number {
    const promptMs = Number((environment.turnstile as any).recoveryPromptMs ?? 10000);
    return Number.isFinite(promptMs) && promptMs > 0 ? promptMs : 10000;
  }

  private get localDevToken(): string {
    if (environment.production) {
      return '';
    }

    return ((environment.turnstile as any).devToken ?? '').trim();
  }

  private warnMissingSiteKey(): void {
    if (this.warnedMissingSiteKey) {
      return;
    }

    this.warnedMissingSiteKey = true;
    console.warn('Turnstile is enabled but no site key is configured. API proof headers will not be added.');
  }

  private warnPrimeFailure(error: unknown): void {
    if (this.warnedPrimeFailure) {
      return;
    }

    this.warnedPrimeFailure = true;
    console.warn('Turnstile browser proof priming failed.', error);
  }

  private clearBrowserProofTask(tokenTask: Promise<CachedBrowserProofToken | null>): void {
    if (this.browserProofTask === tokenTask) {
      this.browserProofTask = null;
    }
  }

  private clearInteractiveProofTask(tokenTask: Promise<CachedBrowserProofToken | null>): void {
    if (this.interactiveProofTask === tokenTask) {
      this.interactiveProofTask = null;
    }
  }
}
