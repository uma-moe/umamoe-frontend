import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { CookieConsent, CookieConsentService } from './cookie-consent.service';

type ConsentValue = 'granted' | 'denied';
type GoogleAdConsentSource =
  | 'disabled'
  | 'pending'
  | 'cmp'
  | 'regional-default'
  | 'ccpa-opt-out'
  | 'local-opt-out'
  | 'debug-forced';

export interface GoogleAdConsentState {
  adStorage: ConsentValue;
  adUserData: ConsentValue;
  adPersonalization: ConsentValue;
  analyticsStorage: ConsentValue;
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

export interface FuseSlotRenderResult {
  slotId: string;
  hasCreative: boolean;
  gptSlotElementId?: string;
  renderSize?: FuseSlotRenderSize;
}

export interface FuseSlotRenderSize {
  width: number;
  height: number;
}

interface FuseGptSlotRenderEvent {
  size?: unknown;
  slot?: {
    getSlotElementId?: () => string;
  };
}

interface FuseSlotRenderEndedEvent {
  slotId: string;
  hasCreative: boolean;
  size?: unknown;
  gptEvent?: FuseGptSlotRenderEvent;
}

interface FuseTag {
  que?: FuseQueue | Array<() => void>;
  pageInit?: (options?: { blockingFuseIds?: string[]; blockingTimeout?: number }) => void;
  registerZone?: (id: string) => void;
  onSlotRenderEnded?: (callback: (event: FuseSlotRenderEndedEvent) => void) => void;
  onSlotsInitialised?: (callback: () => void) => void;
  onTagInitialised?: (callback: () => void) => void;
}

interface PendingFuseCall {
  label: string;
  persistent?: boolean;
  callback: (fusetag: FuseTag) => void;
}

interface RetainedAdCreative {
  container: HTMLElement;
  overlay: HTMLElement | null;
  storedAt: number;
  expiryTimer: number | null;
}

interface RetainedAdFrame {
  left: number;
  top: number;
  width: number;
  height: number;
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

type GppApi = (
  command: string,
  callback: (data: unknown, success: boolean) => void,
  parameter?: unknown,
  version?: number,
) => void;

declare global {
  interface Window {
    fusetag?: FuseTag;
    __tcfapi?: TcfApi;
    __uspapi?: UspApi;
    __gpp?: GppApi;
  }
}

const DENIED_AD_CONSENT: GoogleAdConsentState = {
  adStorage: 'denied',
  adUserData: 'denied',
  adPersonalization: 'denied',
  analyticsStorage: 'denied',
  source: 'pending',
};
const GRANTED_AD_CONSENT: GoogleAdConsentState = {
  adStorage: 'granted',
  adUserData: 'granted',
  adPersonalization: 'granted',
  analyticsStorage: 'granted',
  source: 'debug-forced',
};
const AD_DEBUG_QUERY_KEYS = ['ad_debug', 'ads_debug', 'fuse_debug'];
const FORCE_AD_CONSENT_QUERY_KEYS = ['force_ad_consent', 'ad_consent', 'ads_consent'];
const FUSE_ENABLED_STORAGE_KEY = 'umamoe-fuse-enabled-v1';
const FUSE_ENABLED_QUERY_KEYS = ['fuse', 'fuse_enabled', 'ads_enabled'];
const FUSE_API_RETRY_MS = 100;
const FUSE_API_MAX_RETRIES = 80;
const PAGE_INIT_DEBOUNCE_MS = 30;
const PRIVACY_CONTROLS_RETRY_MS = 250;
const PRIVACY_CONTROLS_MAX_RETRIES = 32;
const RETAINED_AD_CREATIVE_TTL_MS = 15000;
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

  private readonly slotRenderEndedSubject = new Subject<FuseSlotRenderResult>();
  readonly slotRenderEnded$ = this.slotRenderEndedSubject.asObservable();

  private readonly supportFallbackAllowedSubject = new BehaviorSubject<boolean>(false);
  readonly supportFallbackAllowed$ = this.supportFallbackAllowedSubject.asObservable();

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
  private tcfRetryCount = 0;
  private rawRuntimeState: FuseRuntimeState = this.defaultRuntimeState;
  private regionalGoogleAdConsentState: GoogleAdConsentState = {
    ...DENIED_AD_CONSENT,
    source: 'disabled',
  };
  private registeredZones = new Map<string, string>();
  private persistentZones = new Map<string, string>();
  private pendingFuseCalls: PendingFuseCall[] = [];
  private fuseCallFlushTimer: number | null = null;
  private fuseCallFlushRetries = 0;
  private pageInitTimer: number | null = null;
  private pendingPageInitFuseIds = new Set<string>();
  private pendingPageInitReasons: string[] = [];
  private privacyControlsTimer: number | null = null;
  private privacyControlsRetries = 0;
  private fuseApiBlocked = false;
  private fuseDebugCallbacksAttached = false;
  private retainedCreatives = new Map<string, RetainedAdCreative>();
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

  get diagnosticPlaceholdersEnabled(): boolean {
    return this.debugEnabled;
  }

  beginPageView(reason: string, preloadFuseIds: string[] = []): void {
    if (this.fuseCallFlushTimer !== null && isPlatformBrowser(this.platformId)) {
      this.window.clearTimeout(this.fuseCallFlushTimer);
    }
    this.clearPendingPageInit();

    const pendingBeforeReset = this.pendingFuseCalls.length;
    this.fuseCallFlushTimer = null;
    this.fuseCallFlushRetries = 0;
    this.pendingFuseCalls = this.pendingFuseCalls.filter(call => call.persistent);
    const clearedPendingFuseCalls = pendingBeforeReset - this.pendingFuseCalls.length;
    this.registeredZones = new Map(this.persistentZones);
    this.debug('page view ad state reset', { reason, clearedPendingFuseCalls, preloadFuseIds });

    if (!preloadFuseIds.length) {
      this.clearRetainedCreatives('page has no preloadable slots');
      return;
    }

    this.pageInit(preloadFuseIds, `page swap preload:${reason}`);
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
      adConsentForced: this.adConsentForced,
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
    }, `registerZone:${zoneElementId}:${fuseId}`);
  }

  registerPersistentZone(zoneElementId: string, fuseId: string): void {
    if (!this.canUseFuse || !zoneElementId || !fuseId) {
      this.debugWarn('registerPersistentZone skipped', {
        zoneElementId,
        fuseId,
        canUseFuse: this.canUseFuse,
        runtimeState: this.runtimeStateSubject.value,
      });
      return;
    }

    this.debug('registerPersistentZone queued', { zoneElementId, fuseId });
    this.persistentZones.set(zoneElementId, fuseId);
    this.registeredZones.set(zoneElementId, fuseId);
    this.enqueueFuseCall(fusetag => {
      this.debug('registerPersistentZone executing', { zoneElementId, fuseId });
      fusetag.registerZone?.(zoneElementId);
      fusetag.pageInit?.({
        blockingFuseIds: [fuseId],
        blockingTimeout: environment.fuse.blockingTimeoutMs,
      });
    }, `persistentZone:${zoneElementId}:${fuseId}`, true);
  }

  requestSlotPageInit(fuseId: string, reason = 'slot registered'): void {
    this.pageInit([fuseId], reason);
  }

  storeRetainedCreative(key: string, nodes: Node[], frame?: RetainedAdFrame): boolean {
    if (!isPlatformBrowser(this.platformId) || !key || nodes.length === 0) {
      return false;
    }

    this.removeRetainedCreative(key);
    const container = this.document.createElement('div');
    const retainedNodes = nodes.filter(node => node.parentNode);

    for (const node of retainedNodes) {
      container.appendChild(node);
    }

    if (!container.childNodes.length) {
      return false;
    }

    const overlay = frame ? this.createRetainedCreativeOverlay(container, frame) : null;
    const entry: RetainedAdCreative = {
      container,
      overlay,
      storedAt: Date.now(),
      expiryTimer: null,
    };
    this.retainedCreatives.set(key, entry);
    entry.expiryTimer = this.window.setTimeout(() => {
      const currentEntry = this.retainedCreatives.get(key);
      if (currentEntry?.storedAt === entry.storedAt) {
        this.removeRetainedCreative(key);
      }
    }, RETAINED_AD_CREATIVE_TTL_MS);
    this.pruneRetainedCreatives();
    this.debug('retained ad creative stored', {
      key,
      nodeCount: container.childNodes.length,
    });

    return true;
  }

  takeRetainedCreative(key: string, target: HTMLElement): boolean {
    if (!isPlatformBrowser(this.platformId) || !key) {
      return false;
    }

    this.pruneRetainedCreatives();
    const entry = this.retainedCreatives.get(key);
    if (!entry || !entry.container.childNodes.length) {
      return false;
    }

    target.replaceChildren();
    while (entry.container.firstChild) {
      target.appendChild(entry.container.firstChild);
    }
    this.removeRetainedCreative(key);
    this.debug('retained ad creative restored', {
      key,
      nodeCount: target.childNodes.length,
    });

    return target.childNodes.length > 0;
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
      this.privacyControlsRetries = 0;
      this.requestConsentUiWhenReady();
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
        analyticsStorage: 'granted',
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
        analyticsStorage: 'granted',
        gdprApplies,
        source: 'regional-default',
      });
      return;
    }

    const purposeConsents = tcData.purpose?.consents ?? {};
    const hasPurposeConsent = (purposeId: number): boolean => purposeConsents[String(purposeId)] === true;
    const storageConsent = hasPurposeConsent(1);
    const analyticsConsent = storageConsent && hasPurposeConsent(8);

    this.setRegionalGoogleAdConsent({
      adStorage: this.toConsentValue(storageConsent),
      adUserData: this.toConsentValue(storageConsent && hasPurposeConsent(7)),
      adPersonalization: this.toConsentValue(storageConsent && hasPurposeConsent(3) && hasPurposeConsent(4)),
      analyticsStorage: this.toConsentValue(analyticsConsent),
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
      this.schedulePendingFuseCallFlush('script already present');
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
      this.schedulePendingFuseCallFlush('script loaded');
    });
    script.addEventListener('error', () => {
      this.setSupportFallbackAllowed(true, 'Fuse script failed to load');
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

  private enqueueFuseCall(callback: (fusetag: FuseTag) => void, label = 'Fuse call', persistent = false): void {
    const fusetag = this.ensureFuseQueue();

    if (this.isFuseApiReady(fusetag)) {
      this.fuseApiBlocked = false;
      this.setSupportFallbackAllowed(false, 'Fuse API ready');
      this.attachFuseDebugCallbacks(fusetag);
      this.debug('Fuse API ready; executing call', { label });
      callback(fusetag);
      return;
    }

    this.pendingFuseCalls.push({ label, callback, persistent });
    this.debugWarn('Fuse API not ready; deferring call', {
      label,
      pendingFuseCalls: this.pendingFuseCalls.map(call => call.label),
      fusetagKeys: Object.keys(fusetag),
      queueType: Array.isArray(fusetag.que) ? 'array' : typeof fusetag.que,
    });
    this.schedulePendingFuseCallFlush(`deferred ${label}`);
  }

  private schedulePendingFuseCallFlush(reason: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.flushPendingFuseCalls(reason);
      return;
    }

    if (this.fuseCallFlushTimer !== null) {
      return;
    }

    this.fuseCallFlushTimer = this.window.setTimeout(() => {
      this.fuseCallFlushTimer = null;
      this.flushPendingFuseCalls(reason);
    }, FUSE_API_RETRY_MS);
  }

  private flushPendingFuseCalls(reason: string): void {
    if (this.pendingFuseCalls.length === 0) {
      this.fuseCallFlushRetries = 0;
      return;
    }

    const fusetag = this.ensureFuseQueue();
    if (!this.isFuseApiReady(fusetag)) {
      this.fuseCallFlushRetries += 1;

      if (this.fuseCallFlushRetries >= FUSE_API_MAX_RETRIES) {
        this.fuseApiBlocked = true;
        this.setSupportFallbackAllowed(true, 'Fuse API never became ready');
        this.debugError('Fuse API never became ready; pending calls remain blocked', {
          reason,
          pendingFuseCalls: this.pendingFuseCalls.map(call => call.label),
          fusetagKeys: Object.keys(fusetag),
          hasQueue: Boolean(fusetag.que),
          queueType: Array.isArray(fusetag.que) ? 'array' : typeof fusetag.que,
          runtimeState: this.runtimeStateSubject.value,
        });
        return;
      }

      this.debugWarn('Fuse API still not ready; retrying pending calls', {
        reason,
        retry: this.fuseCallFlushRetries,
        pendingFuseCalls: this.pendingFuseCalls.map(call => call.label),
        fusetagKeys: Object.keys(fusetag),
      });
      this.schedulePendingFuseCallFlush(reason);
      return;
    }

    const calls = this.pendingFuseCalls.splice(0);
    this.fuseCallFlushRetries = 0;
    this.fuseApiBlocked = false;
    this.setSupportFallbackAllowed(false, 'Fuse API ready');
    this.attachFuseDebugCallbacks(fusetag);
    this.debug('Fuse API ready; flushing pending calls', {
      reason,
      calls: calls.map(call => call.label),
    });

    for (const call of calls) {
      try {
        this.debug('Fuse pending call executing', { label: call.label });
        call.callback(fusetag);
      } catch (error) {
        this.debugError('Fuse pending call failed', { label: call.label, error });
      }
    }

    if (this.pendingFuseCalls.length > 0) {
      this.schedulePendingFuseCallFlush('pending calls added during flush');
    }
  }

  private isFuseApiReady(fusetag: FuseTag): boolean {
    return typeof fusetag.registerZone === 'function' && typeof fusetag.pageInit === 'function';
  }

  private attachFuseDebugCallbacks(fusetag: FuseTag): void {
    if (this.fuseDebugCallbacksAttached) {
      return;
    }

    this.fuseDebugCallbacksAttached = true;
    this.debug('Fuse debug callbacks attaching', {
      hasOnTagInitialised: typeof fusetag.onTagInitialised === 'function',
      hasOnSlotsInitialised: typeof fusetag.onSlotsInitialised === 'function',
      hasOnSlotRenderEnded: typeof fusetag.onSlotRenderEnded === 'function',
    });

    fusetag.onTagInitialised?.(() => {
      this.debug('Fuse tag initialised callback');
    });

    fusetag.onSlotsInitialised?.(() => {
      this.debug('Fuse slots initialised callback');
    });

    fusetag.onSlotRenderEnded?.(event => {
      const result: FuseSlotRenderResult = {
        slotId: event.slotId,
        hasCreative: event.hasCreative,
        gptSlotElementId: this.getGptSlotElementId(event),
        renderSize: this.getSlotRenderSize(event),
      };

      this.debug('Fuse slot render ended', result);
      this.ngZone.run(() => this.slotRenderEndedSubject.next(result));
    });
  }

  private getGptSlotElementId(event: FuseSlotRenderEndedEvent): string | undefined {
    try {
      return event.gptEvent?.slot?.getSlotElementId?.();
    } catch {
      return undefined;
    }
  }

  private getSlotRenderSize(event: FuseSlotRenderEndedEvent): FuseSlotRenderSize | undefined {
    return this.parseRenderSize(event.gptEvent?.size) ?? this.parseRenderSize(event.size) ?? undefined;
  }

  private parseRenderSize(value: unknown): FuseSlotRenderSize | null {
    if (Array.isArray(value) && value.length >= 2) {
      const width = Number(value[0]);
      const height = Number(value[1]);
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? { width: Math.round(width), height: Math.round(height) }
        : null;
    }

    if (typeof value === 'string') {
      const match = /^(\d+)\s*x\s*(\d+)$/i.exec(value.trim());
      if (!match) {
        return null;
      }

      return {
        width: Number(match[1]),
        height: Number(match[2]),
      };
    }

    if (value && typeof value === 'object') {
      const candidate = value as { width?: unknown; height?: unknown };
      const width = Number(candidate.width);
      const height = Number(candidate.height);
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? { width: Math.round(width), height: Math.round(height) }
        : null;
    }

    return null;
  }

  private queuePageInit(blockingFuseIds: string[], reason: string): void {
    this.debug('pageInit queued', {
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
    }, `pageInit:${blockingFuseIds.join(',')}`);
  }

  private getRegisteredZonesSummary(): Array<{ zoneElementId: string; fuseId: string }> {
    return Array.from(this.registeredZones.entries()).map(([zoneElementId, fuseId]) => ({
      zoneElementId,
      fuseId,
    }));
  }

  private schedulePageInit(blockingFuseIds: string[], reason: string): void {
    for (const fuseId of blockingFuseIds) {
      this.pendingPageInitFuseIds.add(fuseId);
    }

    this.pendingPageInitReasons.push(reason);

    if (!isPlatformBrowser(this.platformId)) {
      this.flushScheduledPageInit();
      return;
    }

    if (this.pageInitTimer !== null) {
      return;
    }

    this.pageInitTimer = this.window.setTimeout(() => {
      this.pageInitTimer = null;
      this.flushScheduledPageInit();
    }, PAGE_INIT_DEBOUNCE_MS);
  }

  private flushScheduledPageInit(): void {
    const blockingFuseIds = Array.from(this.pendingPageInitFuseIds);
    const reasons = [...this.pendingPageInitReasons];
    this.pendingPageInitFuseIds.clear();
    this.pendingPageInitReasons = [];

    if (!blockingFuseIds.length) {
      return;
    }

    this.queuePageInit(blockingFuseIds, reasons.join(', '));
  }

  private clearPendingPageInit(): void {
    if (this.pageInitTimer !== null && isPlatformBrowser(this.platformId)) {
      this.window.clearTimeout(this.pageInitTimer);
    }

    this.pageInitTimer = null;
    this.pendingPageInitFuseIds.clear();
    this.pendingPageInitReasons = [];
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

  private setSupportFallbackAllowed(allowed: boolean, reason: string): void {
    if (this.supportFallbackAllowedSubject.value === allowed) {
      return;
    }

    this.debug(allowed ? 'support fallback enabled' : 'support fallback disabled', {
      reason,
      fuseApiBlocked: this.fuseApiBlocked,
      runtimeState: this.runtimeStateSubject.value,
    });
    this.supportFallbackAllowedSubject.next(allowed);
  }

  private pruneRetainedCreatives(): void {
    const now = Date.now();

    for (const [key, entry] of this.retainedCreatives.entries()) {
      if (now - entry.storedAt > RETAINED_AD_CREATIVE_TTL_MS) {
        this.removeRetainedCreative(key);
      }
    }
  }

  private createRetainedCreativeOverlay(container: HTMLElement, frame: RetainedAdFrame): HTMLElement | null {
    if (frame.width <= 0 || frame.height <= 0) {
      return null;
    }

    const overlay = this.document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.left = `${Math.round(frame.left)}px`;
    overlay.style.top = `${Math.round(frame.top)}px`;
    overlay.style.width = `${Math.round(frame.width)}px`;
    overlay.style.height = `${Math.round(frame.height)}px`;
    overlay.style.zIndex = '1395';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.style.contain = 'layout paint';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.overflow = 'hidden';
    overlay.appendChild(container);
    this.document.body.appendChild(overlay);

    return overlay;
  }

  private removeRetainedCreative(key: string): void {
    const entry = this.retainedCreatives.get(key);
    if (entry?.expiryTimer !== null && entry?.expiryTimer !== undefined) {
      this.window.clearTimeout(entry.expiryTimer);
    }
    entry?.overlay?.remove();
    this.retainedCreatives.delete(key);
  }

  private clearRetainedCreatives(reason: string): void {
    if (this.retainedCreatives.size === 0) {
      return;
    }

    const keys = Array.from(this.retainedCreatives.keys());
    for (const key of keys) {
      this.removeRetainedCreative(key);
    }
    this.debug('retained ad creatives cleared', { reason, keys });
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
        adConsentForced: this.adConsentForced,
      });
      this.refreshEffectiveConsentState();
    });
  }

  private refreshEffectiveConsentState(): void {
    this.debug('refresh effective consent state', {
      localConsent: this.summarizeLocalConsent(),
      adConsentForced: this.adConsentForced,
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
      this.ensureFuseScript();
      this.attachTcfListener();
      this.attachUspListener();
    });
  }

  private requestConsentUiWhenReady(): void {
    const requested = this.requestConsentUi();
    if (requested) {
      this.debug('privacy controls display command sent', {
        retryCount: this.privacyControlsRetries,
      });
      return;
    }

    if (this.privacyControlsRetries >= PRIVACY_CONTROLS_MAX_RETRIES) {
      this.debugWarn('privacy controls unavailable after retries', {
        retryCount: this.privacyControlsRetries,
        hasTcfApi: typeof this.window.__tcfapi === 'function',
        hasUspApi: typeof this.window.__uspapi === 'function',
        hasGppApi: typeof this.window.__gpp === 'function',
        runtimeState: this.runtimeStateSubject.value,
      });
      return;
    }

    this.privacyControlsRetries += 1;
    this.debug('privacy controls waiting for CMP API', {
      retryCount: this.privacyControlsRetries,
      hasTcfApi: typeof this.window.__tcfapi === 'function',
      hasUspApi: typeof this.window.__uspapi === 'function',
      hasGppApi: typeof this.window.__gpp === 'function',
    });

    if (this.privacyControlsTimer !== null) {
      this.window.clearTimeout(this.privacyControlsTimer);
    }

    this.privacyControlsTimer = this.window.setTimeout(() => {
      this.privacyControlsTimer = null;
      this.requestConsentUiWhenReady();
    }, PRIVACY_CONTROLS_RETRY_MS);
  }

  private requestConsentUi(): boolean {
    let requested = false;

    const tcfApi = this.window.__tcfapi;
    if (tcfApi) {
      try {
        tcfApi('displayConsentUi', 2, () => undefined);
        requested = true;
      } catch {
        // Some regional CMP APIs may not expose this command.
      }
    }

    const uspApi = this.window.__uspapi;
    if (uspApi) {
      try {
        uspApi('displayUspUi', 1, () => undefined);
        requested = true;
      } catch {
        // Some regional CMP APIs may not expose this command.
      }
    }

    const gppApi = this.window.__gpp;
    if (gppApi) {
      try {
        gppApi('displayConsentUi', () => undefined);
        requested = true;
      } catch {
        // Some regional CMP APIs may not expose this command.
      }
    }

    return requested;
  }

  private setRegionalGoogleAdConsent(state: GoogleAdConsentState): void {
    this.regionalGoogleAdConsentState = state;
    this.applyEffectiveGoogleAdConsent();
  }

  private applyEffectiveGoogleAdConsent(): void {
    if (this.adConsentForced) {
      this.googleAdConsentSubject.next({
        ...GRANTED_AD_CONSENT,
        gdprApplies: this.regionalGoogleAdConsentState.gdprApplies,
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

  private getTransientBooleanOverride(queryKeys: string[]): boolean | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    return this.getQueryBooleanOverride(queryKeys);
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
    const override = this.getTransientBooleanOverride(AD_DEBUG_QUERY_KEYS);
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

  private get adConsentForced(): boolean {
    return this.getQueryBooleanOverride(FORCE_AD_CONSENT_QUERY_KEYS) === true;
  }

  private get localAllowsAds(): boolean {
    return true;
  }

  private getScriptNonce(): string {
    const nonceScript = this.document.querySelector<HTMLScriptElement>('script[nonce]');
    return nonceScript?.nonce || nonceScript?.getAttribute('nonce') || '';
  }

  private get window(): Window {
    return this.document.defaultView ?? window;
  }
}
