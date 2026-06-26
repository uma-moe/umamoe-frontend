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
  private localConsent: CookieConsent | null = null;
  private consentSub?: Subscription;

  constructor(
    private ngZone: NgZone,
    private cookieConsentService: CookieConsentService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  init(): void {
    if (!isPlatformBrowser(this.platformId) || this.started) {
      return;
    }

    this.started = true;
    this.attachLocalConsentListener();

    if (!this.enabled) {
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
      return;
    }

    this.startFuseRuntimeIfAllowed();
  }

  pageInit(fuseIds: string[]): void {
    const blockingFuseIds = [...new Set(fuseIds.filter(Boolean))];
    if (!this.canUseFuse || blockingFuseIds.length === 0) {
      return;
    }

    this.enqueueFuseCall(fusetag => {
      fusetag.pageInit?.({
        blockingFuseIds,
        blockingTimeout: environment.fuse.blockingTimeoutMs,
      });
    });
  }

  registerZone(zoneElementId: string, fuseId: string): void {
    if (!this.canUseFuse || !zoneElementId || !fuseId) {
      return;
    }

    this.enqueueFuseCall(fusetag => {
      fusetag.registerZone?.(zoneElementId);
    });
  }

  openPrivacyControls(): boolean {
    if (!isPlatformBrowser(this.platformId) || !this.enabled || !this.hasScriptUrl) {
      return false;
    }

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
      this.retryTcfListener();
      return;
    }

    if (this.tcfListenerAttached) {
      return;
    }

    this.tcfListenerAttached = true;

    try {
      tcfApi('ping', 2, (pingData, success) => {
        if (success) {
          this.handleTcfPing(pingData as TcfPingData);
        }
      });

      tcfApi('addEventListener', 2, (tcData, success) => {
        if (success) {
          this.handleTcfData(tcData as TcfData);
        }
      });
    } catch {
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        cmpStatus: 'error',
      });
    }
  }

  private retryTcfListener(): void {
    if (this.tcfRetryCount >= 20) {
      return;
    }

    this.tcfRetryCount += 1;
    this.window.setTimeout(() => this.attachTcfListener(), 250);
  }

  private attachUspListener(): void {
    const uspApi = this.window.__uspapi;
    if (!uspApi || this.uspListenerAttached) {
      return;
    }

    this.uspListenerAttached = true;

    try {
      uspApi('getUSPData', 1, (uspData, success) => {
        if (success) {
          this.handleUspData(uspData as UspData);
        }
      });
    } catch {
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
      this.setRuntimeState({
        ...this.runtimeStateSubject.value,
        scriptLoaded: true,
      });
    });
    script.addEventListener('error', () => {
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

    this.document.head.appendChild(script);
  }

  private ensureFuseQueue(): FuseTag {
    const current = this.window.fusetag;
    if (current) {
      current.que = current.que ?? [];
      return current;
    }

    const fusetag: FuseTag = { que: [] };
    this.window.fusetag = fusetag;
    return fusetag;
  }

  private enqueueFuseCall(callback: (fusetag: FuseTag) => void): void {
    const fusetag = this.ensureFuseQueue();
    const queue = fusetag.que;

    if (queue && typeof queue.push === 'function') {
      queue.push(() => callback(fusetag));
      return;
    }

    callback(fusetag);
  }

  private setRuntimeState(state: FuseRuntimeState): void {
    this.rawRuntimeState = state;
    const effectiveState = {
      ...state,
      adsCanRender: state.adsCanRender && this.localAllowsAds,
    };
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
      this.refreshEffectiveConsentState();
    });
  }

  private refreshEffectiveConsentState(): void {
    this.startFuseRuntimeIfAllowed();
    this.setRuntimeState(this.rawRuntimeState);
    this.applyEffectiveGoogleAdConsent();
  }

  private startFuseRuntimeIfAllowed(): void {
    if (!this.enabled || !this.hasScriptUrl || !this.localAllowsAds) {
      return;
    }

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
      this.setRuntimeState(runtimeState);
      return;
    }

    this.fuseRuntimeStarted = true;
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

  private get canUseFuse(): boolean {
    const state = this.runtimeStateSubject.value;
    return state.enabled && state.configured;
  }

  private get enabled(): boolean {
    return environment.fuse.enabled === true;
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
