import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { CookieConsent, CookieConsentService } from './cookie-consent.service';

type ConsentValue = 'granted' | 'denied';
type GoogleAdConsentSource = 'disabled' | 'pending' | 'cmp' | 'regional-default' | 'ccpa-opt-out' | 'local-opt-out';

export interface GoogleAdConsentState {
  adStorage: ConsentValue;
  adUserData: ConsentValue;
  adPersonalization: ConsentValue;
  source: GoogleAdConsentSource;
  gdprApplies?: boolean;
  uspString?: string;
}

export interface FuseRuntimeState {
  enabled: boolean;
  configured: boolean;
  scriptLoaded: boolean;
  adsCanRender: boolean;
  cmpStatus: 'disabled' | 'not-configured' | 'pending' | 'ready' | 'error';
}

interface FuseQueue {
  push(callback: () => void): number | void;
}

interface FuseTag {
  que?: FuseQueue | Array<() => void>;
  pageInit?: (options?: { blockingFuseIds?: string[]; blockingTimeout?: number }) => void;
  registerZone?: (id: string) => void;
}

interface TcfPurposeConsents {
  consents?: Record<string, boolean>;
}

interface TcfData {
  gdprApplies?: boolean;
  eventStatus?: string;
  cmpStatus?: string;
  tcString?: string;
  purpose?: TcfPurposeConsents;
}

interface TcfPingData {
  gdprApplies?: boolean;
  cmpLoaded?: boolean;
  cmpStatus?: string;
}

interface TcfApiCall {
  command: string;
  version: number;
  parameter?: unknown;
  callId?: string;
}

interface TcfApiMessage {
  __tcfapiCall?: TcfApiCall;
}

interface UspData {
  uspString?: string;
}

type TcfApi = (
  command: string,
  version: number,
  callback: (data: unknown, success: boolean) => void,
  parameter?: unknown,
) => void;

type UspApi = (
  command: string,
  version: number,
  callback: (data: unknown, success: boolean) => void,
) => void;

declare global {
  interface Window {
    fusetag?: FuseTag;
    __tcfapi?: TcfApi;
    __uspapi?: UspApi;
    __umamoeTcfStubReady?: boolean;
  }
}

const DENIED_AD_CONSENT: GoogleAdConsentState = {
  adStorage: 'denied',
  adUserData: 'denied',
  adPersonalization: 'denied',
  source: 'pending',
};
const AD_DEBUG_STORAGE_KEY = 'umamoe-ad-debug-v1';
const AD_DEBUG_QUERY_KEYS = ['ad_debug', 'ads_debug', 'fuse_debug'];
const FUSE_ENABLED_STORAGE_KEY = 'umamoe-fuse-enabled-v1';
const FUSE_ENABLED_QUERY_KEYS = ['fuse', 'fuse_enabled', 'ads_enabled'];
const PAGE_INIT_DEBOUNCE_MS = 60;
type AdDebugLevel = 'debug' | 'warn' | 'error';

@Injectable({ providedIn: 'root' })
export class FuseAdsService {
  private readonly defaultRuntimeState: FuseRuntimeState = {
    enabled: false,
    configured: false,
    scriptLoaded: false,
    adsCanRender: false,
    cmpStatus: 'disabled',
  };

  private readonly adsCanRenderSubject = new BehaviorSubject<boolean>(false);
  readonly adsCanRender$ = this.adsCanRenderSubject.asObservable();

  private readonly runtimeStateSubject = new BehaviorSubject<FuseRuntimeState>(this.defaultRuntimeState);
  readonly runtimeState$ = this.runtimeStateSubject.asObservable();

  private readonly googleAdConsentSubject = new BehaviorSubject<GoogleAdConsentState>({
    ...DENIED_AD_CONSENT,
    source: 'disabled',
  });
  readonly googleAdConsent$ = this.googleAdConsentSubject.asObservable();

  private started = false;
  private fuseRuntimeStarted = false;
  private tcfListenerAttached = false;
  private uspListenerAttached = false;
  private tcfPostMessageListenerAttached = false;
  private tcfRetryCount = 0;
  private rawRuntimeState: FuseRuntimeState = this.defaultRuntimeState;
  private regionalGoogleAdConsentState: GoogleAdConsentState = {
    ...DENIED_AD_CONSENT,
    source: 'disabled',
  };
  private pendingPageInitFuseIds = new Set<string>();
  private pageInitTimer: number | null = null;
  private registeredZones = new Map<string, string>();
  private localConsent: CookieConsent | null = null;
  private consentSub?: Subscription;

  constructor(
    private ngZone: NgZone,
    private cookieConsentService: CookieConsentService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  debug(message: string, data?: unknown): void {
    this.writeDebug('debug', message, data);
  }

  debugWarn(message: string, data?: unknown): void {
    this.writeDebug('warn', message, data);
  }

  debugError(message: string, data?: unknown): void {
    this.writeDebug('error', message, data);
  }

  beginPageView(reason: string): void {
    if (this.pageInitTimer !== null && isPlatformBrowser(this.platformId)) {
      this.window.clearTimeout(this.pageInitTimer);
    }

    this.pageInitTimer = null;
    this.pendingPageInitFuseIds.clear();
    this.registeredZones.clear();
    this.debug('page view ad state reset', { reason });
  }

  init(): void {
    if (!isPlatformBrowser(this.platformId) || this.started) {
      return;
    }

    this.started = true;
    this.attachLocalConsentListener();
    this.debug('init', {
      enabled: this.enabled,
      hasScriptUrl: this.hasScriptUrl,
      scriptUrl: environment.fuse.scriptUrl,
      localConsent: this.summarizeLocalConsent(),
      localAllowsAds: this.localAllowsAds,
    });

    if (!this.enabled) {
      this.debugWarn('init skipped: Fuse disabled by environment');
      this.setRuntimeState({
        enabled: false,
        configured: false,
        scriptLoaded: false,
        adsCanRender: false,
        cmpStatus: 'disabled',
      });
      this.setRegionalGoogleAdConsent({ ...DENIED_AD_CONSENT, source: 'disabled' });
      return;
    }

    const configured = this.hasScriptUrl;
    this.setRuntimeState({
      enabled: true,
      configured,
      scriptLoaded: false,
      adsCanRender: configured && this.localAllowsAds,
      cmpStatus: configured ? 'pending' : 'not-configured',
    });
    this.setRegionalGoogleAdConsent({ ...DENIED_AD_CONSENT, source: configured ? 'pending' : 'disabled' });

    if (!configured) {
      this.debugWarn('init skipped: missing Fuse script URL');
      return;
    }

    this.startFuseRuntimeIfAllowed();
  }

  pageInit(fuseIds: string[], reason = 'requested'): void {
    const blockingFuseIds = [...new Set(fuseIds.filter(Boolean))];
    if (!this.canUseFuse || blockingFuseIds.length === 0) {
      this.debugWarn('pageInit skipped', {
        reason,
        requestedFuseIds: fuseIds,
        blockingFuseIds,
        canUseFuse: this.canUseFuse,
        runtimeState: this.runtimeStateSubject.value,
      });
      return;
    }

    this.schedulePageInit(blockingFuseIds, reason);
  }

  registerZone(zoneElementId: string, fuseId: string): void {
    if (!this.canUseFuse || !zoneElementId || !fuseId) {
      this.debugWarn('registerZone skipped', {
        zoneElementId,
        fuseId,
        canUseFuse: this.canUseFuse,
        runtimeState: this.runtimeStateSubject.value,
      });
      return;
    }

    this.debug('registerZone queued', { zoneElementId, fuseId });
    this.registeredZones.set(zoneElementId, fuseId);
    this.enqueueFuseCall(fusetag => {
      this.debug('registerZone executing', { zoneElementId, fuseId });
      fusetag.registerZone?.(zoneElementId);
    });
    this.schedulePageInit([fuseId], 'zone registered');
  }

  openPrivacyControls(): boolean {
    if (!isPlatformBrowser(this.platformId) || !this.enabled || !this.hasScriptUrl) {
      this.debugWarn('privacy controls skipped', {
        isBrowser: isPlatformBrowser(this.platformId),
        enabled: this.enabled,
        hasScriptUrl: this.hasScriptUrl,
      });
      return false;
    }

    this.debug('privacy controls requested');
    this.startFuseRuntime(false);

    this.ngZone.runOutsideAngular(() => {
      this.requestConsentUi();
      this.window.setTimeout(() => this.requestConsentUi(), 700);
      this.window.setTimeout(() => this.requestConsentUi(), 1800);
    });

    return true;
  }

  private attachTcfListener(): void {
    const tcfApi = this.window.__tcfapi;
    if (!tcfApi) {
      this.debugWarn('TCF listener waiting: __tcfapi missing', { retryCount: this.tcfRetryCount });
      this.retryTcfListener();
      return;
    }

    if (this.tcfListenerAttached) {
      this.debug('TCF listener already attached');
      return;
    }

    this.tcfListenerAttached = true;
    this.debug('TCF listener attaching');

    try {
      tcfApi('ping', 2, (pingData, success) => {
        this.debug('TCF ping response', { success, pingData });
        if (success) {
          this.handleTcfPing(pingData as TcfPingData);
        }
      });

      tcfApi('addEventListener', 2, (tcData, success) => {
        this.debug('TCF event response', {
          success,
          tcData: this.summarizeTcfData(tcData as TcfData),
        });
        if (success) {
          this.handleTcfData(tcData as TcfData);
        }
      });
    } catch (error) {
      this.debugError('TCF listener failed', error);
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        cmpStatus: 'error',
      });
    }
  }

  private retryTcfListener(): void {
    if (this.tcfRetryCount >= 20) {
      this.debugWarn('TCF listener retries exhausted');
      return;
    }

    this.tcfRetryCount += 1;
    this.debug('TCF listener retry scheduled', { retryCount: this.tcfRetryCount });
    this.window.setTimeout(() => this.attachTcfListener(), 250);
  }

  private attachUspListener(): void {
    const uspApi = this.window.__uspapi;
    if (!uspApi || this.uspListenerAttached) {
      this.debug('USP listener skipped', {
        hasUspApi: Boolean(uspApi),
        uspListenerAttached: this.uspListenerAttached,
      });
      return;
    }

    this.uspListenerAttached = true;
    this.debug('USP listener attaching');

    try {
      uspApi('getUSPData', 1, (uspData, success) => {
        this.debug('USP data response', { success, uspData });
        if (success) {
          this.handleUspData(uspData as UspData);
        }
      });
    } catch (error) {
      this.debugError('USP listener failed', error);
      return;
    }
  }

  private handleTcfPing(pingData: TcfPingData): void {
    const cmpReady = pingData.cmpLoaded === true || pingData.cmpStatus === 'loaded';

    this.setRuntimeState({
      ...this.runtimeStateSubject.value,
      cmpStatus: cmpReady ? 'ready' : 'pending',
    });

    if (pingData.gdprApplies === false) {
      this.setRegionalGoogleAdConsent({
        adStorage: 'granted',
        adUserData: 'granted',
        adPersonalization: 'granted',
        gdprApplies: false,
        source: 'regional-default',
      });
    }
  }

  private handleTcfData(tcData: TcfData): void {
    const gdprApplies = tcData.gdprApplies;

    this.setRuntimeState({
      ...this.runtimeStateSubject.value,
      cmpStatus: 'ready',
    });

    if (gdprApplies === false) {
      this.setRegionalGoogleAdConsent({
        adStorage: 'granted',
        adUserData: 'granted',
        adPersonalization: 'granted',
        gdprApplies,
        source: 'regional-default',
      });
      return;
    }

    const purposeConsents = tcData.purpose?.consents ?? {};
    const hasPurposeConsent = (purposeId: number): boolean => purposeConsents[String(purposeId)] === true;
    const storageConsent = hasPurposeConsent(1);

    this.setRegionalGoogleAdConsent({
      adStorage: this.toConsentValue(storageConsent),
      adUserData: this.toConsentValue(storageConsent && hasPurposeConsent(7)),
      adPersonalization: this.toConsentValue(storageConsent && hasPurposeConsent(3) && hasPurposeConsent(4)),
      gdprApplies,
      source: 'cmp',
    });
  }

  private handleUspData(uspData: UspData): void {
    const uspString = uspData.uspString;
    if (!uspString || uspString.length < 3) {
      return;
    }

    const userOptedOutOfSale = uspString.charAt(2).toUpperCase() === 'Y';
    if (!userOptedOutOfSale) {
      return;
    }

    const current = this.regionalGoogleAdConsentState;
    this.setRegionalGoogleAdConsent({
      ...current,
      adUserData: 'denied',
      adPersonalization: 'denied',
      source: 'ccpa-opt-out',
      uspString,
    });
  }

  private ensureFuseScript(): void {
    if (this.document.getElementById('publift-fuse-js')) {
      this.debug('Fuse script already present');
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        scriptLoaded: true,
      });
      return;
    }

    const script = this.document.createElement('script');
    script.id = 'publift-fuse-js';
    script.async = true;
    script.src = environment.fuse.scriptUrl.trim();
    script.addEventListener('load', () => {
      this.debug('Fuse script loaded', { src: script.src });
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        scriptLoaded: true,
      });
    });
    script.addEventListener('error', () => {
      this.debugError('Fuse script failed to load', { src: script.src });
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        scriptLoaded: false,
        cmpStatus: 'error',
      });
    });

    const nonce = this.getScriptNonce();
    if (nonce) {
      script.nonce = nonce;
    }

    this.debug('Fuse script injecting', {
      src: script.src,
      hasNonce: Boolean(nonce),
    });
    this.document.head.appendChild(script);
  }

  private ensureFuseQueue(): FuseTag {
    const current = this.window.fusetag;
    if (current) {
      current.que = current.que ?? [];
      this.debug('Fuse queue reused');
      return current;
    }

    const fusetag: FuseTag = { que: [] };
    this.window.fusetag = fusetag;
    this.debug('Fuse queue created');
    return fusetag;
  }

  private enqueueFuseCall(callback: (fusetag: FuseTag) => void): void {
    const fusetag = this.ensureFuseQueue();
    const queue = fusetag.que;

    if (queue && typeof queue.push === 'function') {
      this.debug('Fuse call pushed to queue', { queueType: Array.isArray(queue) ? 'array' : typeof queue });
      queue.push(() => callback(fusetag));
      return;
    }

    this.debug('Fuse call executing immediately');
    callback(fusetag);
  }

  private schedulePageInit(fuseIds: string[], reason: string): void {
    fuseIds.filter(Boolean).forEach(fuseId => this.pendingPageInitFuseIds.add(fuseId));

    this.debug('pageInit scheduled', {
      reason,
      pendingFuseIds: Array.from(this.pendingPageInitFuseIds),
      registeredZones: this.getRegisteredZonesSummary(),
      delayMs: PAGE_INIT_DEBOUNCE_MS,
    });

    if (!isPlatformBrowser(this.platformId)) {
      this.flushPageInit(reason);
      return;
    }

    if (this.pageInitTimer !== null) {
      return;
    }

    this.pageInitTimer = this.window.setTimeout(() => {
      this.pageInitTimer = null;
      this.flushPageInit('debounced flush');
    }, PAGE_INIT_DEBOUNCE_MS);
  }

  private flushPageInit(reason: string): void {
    const blockingFuseIds = Array.from(this.pendingPageInitFuseIds);
    this.pendingPageInitFuseIds.clear();

    if (!this.canUseFuse || blockingFuseIds.length === 0) {
      this.debugWarn('pageInit flush skipped', {
        reason,
        blockingFuseIds,
        canUseFuse: this.canUseFuse,
        runtimeState: this.runtimeStateSubject.value,
        registeredZones: this.getRegisteredZonesSummary(),
      });
      return;
    }

    this.debug('pageInit queued after zone registration window', {
      reason,
      blockingFuseIds,
      blockingTimeout: environment.fuse.blockingTimeoutMs,
      registeredZones: this.getRegisteredZonesSummary(),
    });

    this.enqueueFuseCall(fusetag => {
      this.debug('pageInit executing', {
        reason,
        blockingFuseIds,
        registeredZones: this.getRegisteredZonesSummary(),
      });
      fusetag.pageInit?.({
        blockingFuseIds,
        blockingTimeout: environment.fuse.blockingTimeoutMs,
      });
    });
  }

  private getRegisteredZonesSummary(): Array<{ zoneElementId: string; fuseId: string }> {
    return Array.from(this.registeredZones.entries()).map(([zoneElementId, fuseId]) => ({
      zoneElementId,
      fuseId,
    }));
  }

  private setRuntimeState(state: FuseRuntimeState): void {
    this.rawRuntimeState = state;
    const effectiveState = {
      ...state,
      adsCanRender: state.adsCanRender && this.localAllowsAds,
    };
    this.debug('runtime state updated', {
      requestedState: state,
      effectiveState,
      localAllowsAds: this.localAllowsAds,
    });
    this.runtimeStateSubject.next(effectiveState);
    this.adsCanRenderSubject.next(effectiveState.adsCanRender);
  }

  private attachLocalConsentListener(): void {
    if (this.consentSub) {
      return;
    }

    this.localConsent = this.cookieConsentService.consent;
    this.consentSub = this.cookieConsentService.consent$.subscribe(consent => {
      this.localConsent = consent;
      this.debug('local consent changed', {
        localConsent: this.summarizeLocalConsent(),
        localAllowsAds: this.localAllowsAds,
      });
      this.refreshEffectiveConsentState();
    });
  }

  private refreshEffectiveConsentState(): void {
    this.debug('refresh effective consent state', {
      localConsent: this.summarizeLocalConsent(),
      rawRuntimeState: this.rawRuntimeState,
    });
    this.startFuseRuntimeIfAllowed();
    this.setRuntimeState(this.rawRuntimeState);
    this.applyEffectiveGoogleAdConsent();
  }

  private startFuseRuntimeIfAllowed(): void {
    if (!this.enabled || !this.hasScriptUrl || !this.localAllowsAds) {
      this.debugWarn('Fuse runtime not started', {
        enabled: this.enabled,
        hasScriptUrl: this.hasScriptUrl,
        localAllowsAds: this.localAllowsAds,
        localConsent: this.summarizeLocalConsent(),
      });
      return;
    }

    this.debug('Fuse runtime allowed to start');
    this.startFuseRuntime(true);
  }

  private startFuseRuntime(adsCanRender: boolean): void {
    const runtimeState: FuseRuntimeState = {
      enabled: true,
      configured: true,
      scriptLoaded: this.rawRuntimeState.scriptLoaded,
      adsCanRender: adsCanRender || this.rawRuntimeState.adsCanRender,
      cmpStatus: this.rawRuntimeState.cmpStatus === 'disabled' || this.rawRuntimeState.cmpStatus === 'not-configured'
        ? 'pending'
        : this.rawRuntimeState.cmpStatus,
    };

    if (this.fuseRuntimeStarted) {
      this.debug('Fuse runtime already started; refreshing state', { runtimeState });
      this.setRuntimeState(runtimeState);
      return;
    }

    this.fuseRuntimeStarted = true;
    this.debug('Fuse runtime starting', { runtimeState });
    this.ensureFuseQueue();
    this.setRuntimeState({ ...runtimeState, scriptLoaded: false, cmpStatus: 'pending' });
    this.setRegionalGoogleAdConsent({ ...DENIED_AD_CONSENT, source: 'pending' });

    this.ngZone.runOutsideAngular(() => {
      this.ensureTcfApiStub();
      this.ensureFuseScript();
      this.attachTcfListener();
      this.attachUspListener();
    });
  }

  private requestConsentUi(): void {
    const tcfApi = this.window.__tcfapi;
    if (tcfApi) {
      try {
        tcfApi('displayConsentUi', 2, () => undefined);
      } catch {
        // Some regional CMP APIs may not expose this command.
      }
    }

    const uspApi = this.window.__uspapi;
    if (uspApi) {
      try {
        uspApi('displayUspUi', 1, () => undefined);
      } catch {
        // Some regional CMP APIs may not expose this command.
      }
    }
  }

  private ensureTcfApiStub(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.ensureTcfLocatorFrame();

    if (this.window.__tcfapi) {
      return;
    }

    const queue: IArguments[] = [];

    const stub = function(
      this: void,
      command?: string,
      _version?: number,
      callback?: (data: unknown, success: boolean) => void,
    ): IArguments[] | void {
      if (!arguments.length) {
        return queue;
      }

      if (command === 'ping' && typeof callback === 'function') {
        callback({ cmpLoaded: false, cmpStatus: 'stub' }, true);
        return;
      }

      queue.push(arguments);
    };

    this.window.__tcfapi = stub as unknown as TcfApi;
    this.window.__umamoeTcfStubReady = true;
    this.attachTcfPostMessageBridge();
  }

  private ensureTcfLocatorFrame(): void {
    const locatorName = '__tcfapiLocator';

    if (this.document.querySelector(`iframe[name="${locatorName}"]`)) {
      return;
    }

    if (!this.document.body) {
      this.window.setTimeout(() => this.ensureTcfLocatorFrame(), 5);
      return;
    }

    const frame = this.document.createElement('iframe');
    frame.name = locatorName;
    frame.style.cssText = 'display:none';
    this.document.body.appendChild(frame);
  }

  private attachTcfPostMessageBridge(): void {
    if (this.tcfPostMessageListenerAttached) {
      return;
    }

    this.tcfPostMessageListenerAttached = true;
    this.window.addEventListener('message', event => {
      let data: unknown = event.data;

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      const call = (data as TcfApiMessage | null)?.__tcfapiCall;
      if (!call || !this.window.__tcfapi) {
        return;
      }

      this.window.__tcfapi(call.command, call.version, (returnValue, success) => {
        const response = {
          __tcfapiReturn: {
            returnValue,
            success,
            callId: call.callId,
          },
        };

        event.source?.postMessage(
          typeof event.data === 'string' ? JSON.stringify(response) : response,
          { targetOrigin: '*' },
        );
      }, call.parameter);
    }, false);
  }

  private setRegionalGoogleAdConsent(state: GoogleAdConsentState): void {
    this.regionalGoogleAdConsentState = state;
    this.applyEffectiveGoogleAdConsent();
  }

  private applyEffectiveGoogleAdConsent(): void {
    if (this.localConsent === null) {
      this.googleAdConsentSubject.next({
        ...DENIED_AD_CONSENT,
        source: 'pending',
      });
      return;
    }

    if (!this.localAllowsAds) {
      this.googleAdConsentSubject.next({
        ...DENIED_AD_CONSENT,
        gdprApplies: this.regionalGoogleAdConsentState.gdprApplies,
        source: 'local-opt-out',
        uspString: this.regionalGoogleAdConsentState.uspString,
      });
      return;
    }

    this.googleAdConsentSubject.next(this.regionalGoogleAdConsentState);
  }

  private toConsentValue(granted: boolean): ConsentValue {
    return granted ? 'granted' : 'denied';
  }

  private writeDebug(level: AdDebugLevel, message: string, data?: unknown): void {
    if (!this.debugEnabled) {
      return;
    }

    const method = console[level] ?? console.debug;
    if (data === undefined) {
      method.call(console, `[uma.ads] ${message}`);
      return;
    }

    method.call(console, `[uma.ads] ${message}`, data);
  }

  private summarizeLocalConsent(): CookieConsent | null {
    return this.localConsent
      ? {
        essential: this.localConsent.essential,
        analytics: this.localConsent.analytics,
        advertising: this.localConsent.advertising,
      }
      : null;
  }

  private summarizeTcfData(tcData: TcfData): Partial<TcfData> & { tcStringLength?: number } {
    return {
      gdprApplies: tcData.gdprApplies,
      eventStatus: tcData.eventStatus,
      cmpStatus: tcData.cmpStatus,
      tcStringLength: tcData.tcString?.length,
      purpose: tcData.purpose,
    };
  }

  private getBooleanOverride(queryKeys: string[], storageKey: string): boolean | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const queryOverride = this.getQueryBooleanOverride(queryKeys);
    if (queryOverride !== null) {
      this.setStoredBooleanOverride(storageKey, queryOverride);
      return queryOverride;
    }

    try {
      const stored = this.window.localStorage.getItem(storageKey);
      return stored === null ? null : this.parseBooleanOverride(stored);
    } catch {
      return null;
    }
  }

  private getQueryBooleanOverride(queryKeys: string[]): boolean | null {
    const params = new URLSearchParams(this.window.location.search);

    for (const key of queryKeys) {
      if (!params.has(key)) {
        continue;
      }

      return this.parseBooleanOverride(params.get(key) ?? '');
    }

    return null;
  }

  private parseBooleanOverride(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return !['0', 'false', 'off', 'no', 'disabled'].includes(normalized);
  }

  private setStoredBooleanOverride(storageKey: string, value: boolean): void {
    try {
      this.window.localStorage.setItem(storageKey, value ? '1' : '0');
    } catch {
      return;
    }
  }

  private get debugEnabled(): boolean {
    const override = this.getBooleanOverride(AD_DEBUG_QUERY_KEYS, AD_DEBUG_STORAGE_KEY);
    if (override !== null) {
      return override;
    }

    return (environment.fuse as { debugLogging?: boolean }).debugLogging === true;
  }

  private get canUseFuse(): boolean {
    const state = this.runtimeStateSubject.value;
    return state.enabled && state.configured;
  }

  private get enabled(): boolean {
    const override = this.getBooleanOverride(FUSE_ENABLED_QUERY_KEYS, FUSE_ENABLED_STORAGE_KEY);
    return override ?? environment.fuse.enabled === true;
  }

  private get hasScriptUrl(): boolean {
    return environment.fuse.scriptUrl.trim().length > 0;
  }

  private get localAllowsAds(): boolean {
    return this.localConsent?.advertising === true;
  }

  private getScriptNonce(): string {
    const nonceScript = this.document.querySelector<HTMLScriptElement>('script[nonce]');
    return nonceScript?.nonce || nonceScript?.getAttribute('nonce') || '';
  }

  private get window(): Window {
    return this.document.defaultView ?? window;
  }
}
