import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AppVersionService } from './app-version.service';
import { CookieConsent, CookieConsentService } from './cookie-consent.service';

type GtagFunction = (...args: unknown[]) => void;
type ConsentValue = 'granted' | 'denied';
type GoogleAnalyticsWindow = Window & Record<`ga-disable-${string}`, boolean | undefined>;
export type AnalyticsEventParamValue = string | number | boolean | null | undefined;
export type AnalyticsEventParams = Record<string, AnalyticsEventParamValue>;

interface ConsentModeState {
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
  analytics_storage: ConsentValue;
}

interface ConsentModeUpdate {
  state: ConsentModeState;
  choiceMade: boolean;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAnalyticsService {
  private readonly measurementId = environment.googleAnalytics.measurementId.trim();
  private readonly scriptId = 'google-analytics-gtag';
  private readonly sensitiveEventParamPattern = /(email|password|secret|token|credential|trainer_id|viewer_id|account_id|user_id|search_term|query|raw|name)/i;
  private readonly reservedEventParamNames = new Set(['send_to', 'event_callback', 'event_timeout']);
  private readonly deniedConsentState: ConsentModeState = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  };
  private started = false;
  private initialized = false;
  private defaultConsentSet = false;
  private lastTrackedUrl = '';
  private lastTrackedPageLocation = '';
  private lastNavigationUrl = '';
  private buildContext?: AnalyticsEventParams;
  private currentConsentState: ConsentModeState = this.deniedConsentState;
  private consentChoiceMade = false;
  private engagementTimerId?: number;

  constructor(
    private cookieConsentService: CookieConsentService,
    private appVersionService: AppVersionService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  init(): void {
    const browser = isPlatformBrowser(this.platformId);
    if (!browser || !this.measurementId) {
      return;
    }

    if (this.started) {
      return;
    }

    this.started = true;
    this.ensureGtagFunction();
    this.setGaDisabled(false);
    this.setDefaultConsent();

    this.cookieConsentService.consent$.pipe(
      map(consent => ({
        state: this.toConsentModeState(consent),
        choiceMade: consent !== null,
      })),
      distinctUntilChanged((previous, current) => this.sameConsentModeUpdate(previous, current)),
    ).subscribe(update => this.updateConsent(update));

    this.ensureScript();
    this.ensureConfigured();

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ).subscribe(event => {
      this.lastNavigationUrl = event.urlAfterRedirects;
      this.deferTrackPageView(event.urlAfterRedirects);
    });

    const currentUrl = this.getCurrentStableUrl();
    if (currentUrl) {
      this.deferTrackPageView(currentUrl);
    }
  }

  private ensureScript(): void {
    if (this.document.getElementById(this.scriptId)) {
      return;
    }

    const script = this.document.createElement('script');
    script.id = this.scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.measurementId)}`;
    const nonce = this.getScriptNonce();
    if (nonce) {
      script.nonce = nonce;
    }
    this.document.head.appendChild(script);
  }

  private ensureGtagFunction(): void {
    const windowRef = this.window;
    windowRef.dataLayer = windowRef.dataLayer ?? [];
    windowRef.gtag = windowRef.gtag ?? (function gtag(): void {
      windowRef.dataLayer?.push(arguments);
    } as GtagFunction);
  }

  private setDefaultConsent(): void {
    if (this.defaultConsentSet) {
      return;
    }

    this.window.gtag?.('consent', 'default', this.deniedConsentState);
    this.window.gtag?.('set', 'ads_data_redaction', true);
    this.defaultConsentSet = true;
  }

  private ensureConfigured(): void {
    if (this.initialized) {
      return;
    }

    this.window.gtag?.('js', new Date());
    this.window.gtag?.('config', this.measurementId, { send_page_view: false });
    this.initialized = true;
  }

  trackEvent(eventName: string, params: AnalyticsEventParams = {}): void {
    if (!isPlatformBrowser(this.platformId) || !this.measurementId || !this.initialized || !this.window.gtag) {
      return;
    }

    const normalizedEventName = this.normalizeEventName(eventName);
    if (!normalizedEventName) {
      return;
    }

    const eventParams = this.sanitizeEventParams({
      ...params,
      ...this.getBuildContext(),
      ...this.getConsentContext(),
    });

    this.ngZone.runOutsideAngular(() => {
      this.window.gtag?.('event', normalizedEventName, {
        ...eventParams,
        send_to: this.measurementId,
      });
    });
  }

  private updateConsent(update: ConsentModeUpdate): void {
    const previousConsentState = this.currentConsentState;
    const previousChoiceMade = this.consentChoiceMade;

    this.currentConsentState = update.state;
    this.consentChoiceMade = update.choiceMade;
    this.window.gtag?.('consent', 'update', update.state);

    if (update.state.analytics_storage === 'denied') {
      this.expireGoogleAnalyticsCookies();
    }

    if (
      this.initialized
      && (!this.sameConsentModeState(previousConsentState, update.state) || previousChoiceMade !== update.choiceMade)
    ) {
      this.trackEvent('cookie_consent_update', {
        source: 'cookie_banner',
      });
    }
  }

  private toConsentModeState(consent: CookieConsent | null): ConsentModeState {
    const analyticsConsent = consent?.analytics === true;
    const advertisingConsent = consent?.advertising === true;

    return {
      ad_storage: this.toConsentValue(advertisingConsent),
      ad_user_data: this.toConsentValue(advertisingConsent),
      ad_personalization: this.toConsentValue(advertisingConsent),
      analytics_storage: this.toConsentValue(analyticsConsent),
    };
  }

  private toConsentValue(granted: boolean): ConsentValue {
    return granted ? 'granted' : 'denied';
  }

  private sameConsentModeState(previous: ConsentModeState, current: ConsentModeState): boolean {
    return previous.ad_storage === current.ad_storage
      && previous.ad_user_data === current.ad_user_data
      && previous.ad_personalization === current.ad_personalization
      && previous.analytics_storage === current.analytics_storage;
  }

  private sameConsentModeUpdate(previous: ConsentModeUpdate, current: ConsentModeUpdate): boolean {
    return previous.choiceMade === current.choiceMade
      && this.sameConsentModeState(previous.state, current.state);
  }

  private trackPageView(url: string): void {
    if (!this.initialized) {
      return;
    }

    if (!this.window.gtag) {
      return;
    }

    const trackedUrl = this.sanitizeUrlForAnalytics(url);

    if (!trackedUrl || trackedUrl === this.lastTrackedUrl) {
      return;
    }

    this.lastTrackedUrl = trackedUrl;
    const pageLocation = new URL(trackedUrl, this.document.location.origin).href;
    const pageReferrer = this.lastTrackedPageLocation || this.document.referrer || undefined;
    this.lastTrackedPageLocation = pageLocation;
    const pageContext = this.sanitizeEventParams({
      ...this.getBuildContext(),
      ...this.getConsentContext(),
    });

    this.ngZone.runOutsideAngular(() => {
      this.window.gtag?.('set', {
        page_location: pageLocation,
        page_path: trackedUrl,
        page_title: this.document.title,
      });
      this.window.gtag?.('event', 'page_view', {
        ...pageContext,
        page_location: pageLocation,
        page_path: trackedUrl,
        page_referrer: pageReferrer,
        page_title: this.document.title,
        send_to: this.measurementId,
      });
    });

    this.scheduleEngagementPulse(trackedUrl, pageLocation);
  }

  private getBuildContext(): AnalyticsEventParams {
    if (this.buildContext) {
      return this.buildContext;
    }

    const buildVersion = this.appVersionService.getCurrentVersion();
    const parsedBuild = this.parseBuildVersion(buildVersion);

    this.buildContext = {
      deployment_channel: parsedBuild.channel,
      build_version: buildVersion,
      build_label: this.appVersionService.getCurrentVersionLabel(),
      build_number: parsedBuild.number,
      build_attempt: parsedBuild.attempt,
    };

    return this.buildContext;
  }

  private getConsentContext(): AnalyticsEventParams {
    return {
      analytics_storage_state: this.currentConsentState.analytics_storage,
      ad_storage_state: this.currentConsentState.ad_storage,
      ad_user_data_state: this.currentConsentState.ad_user_data,
      ad_personalization_state: this.currentConsentState.ad_personalization,
      consent_choice_made: this.consentChoiceMade ? 'yes' : 'no',
    };
  }

  private parseBuildVersion(buildVersion: string): { channel: string; number?: number; attempt?: number } {
    const normalizedVersion = buildVersion.trim();
    const appBuild = normalizedVersion.match(/^(beta|prod)-build\.(\d+)\.(\d+)$/i);
    if (appBuild) {
      const [, channel, number, attempt] = appBuild;
      return {
        channel: channel.toLowerCase(),
        number: Number(number),
        attempt: Number(attempt),
      };
    }

    const githubBuild = normalizedVersion.match(/^[a-f0-9]{40}-(\d+)-(\d+)-(.+)$/i);
    if (githubBuild) {
      const [, number, attempt, channel] = githubBuild;
      return {
        channel: this.normalizeDeploymentChannel(channel),
        number: Number(number),
        attempt: Number(attempt),
      };
    }

    return {
      channel: this.resolveFallbackDeploymentChannel(),
    };
  }

  private normalizeDeploymentChannel(channel: string): string {
    const normalized = channel.trim().toLowerCase();
    if (normalized === 'production') {
      return 'prod';
    }
    if (normalized === 'development') {
      return 'dev';
    }
    return normalized || this.resolveFallbackDeploymentChannel();
  }

  private resolveFallbackDeploymentChannel(): string {
    const apiUrl = environment.apiUrl.toLowerCase();

    if (apiUrl.includes('beta.uma.moe')) {
      return 'beta';
    }

    if (environment.production || apiUrl.includes('uma.moe')) {
      return 'prod';
    }

    return 'local';
  }

  private normalizeEventName(eventName: string): string {
    const normalized = eventName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

    if (!normalized) {
      return '';
    }

    return /^[a-z]/.test(normalized) ? normalized : `app_${normalized}`.slice(0, 40);
  }

  private sanitizeEventParams(params: AnalyticsEventParams): Record<string, string | number> {
    const sanitized: Record<string, string | number> = {};

    for (const [rawKey, rawValue] of Object.entries(params)) {
      if (rawValue === undefined || rawValue === null) {
        continue;
      }

      const key = this.normalizeEventParamName(rawKey);
      if (!key || this.reservedEventParamNames.has(key) || this.sensitiveEventParamPattern.test(key)) {
        continue;
      }

      const value = this.sanitizeEventParamValue(rawValue);
      if (value !== null) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private normalizeEventParamName(paramName: string): string {
    const normalized = paramName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

    if (!normalized) {
      return '';
    }

    return /^[a-z]/.test(normalized) ? normalized : `param_${normalized}`.slice(0, 40);
  }

  private sanitizeEventParamValue(value: Exclude<AnalyticsEventParamValue, null | undefined>): string | number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const sanitized = value.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
    return sanitized || null;
  }

  private deferTrackPageView(url: string): void {
    this.window.setTimeout(() => this.trackPageView(url), 0);
  }

  private scheduleEngagementPulse(pagePath: string, pageLocation: string): void {
    if (this.engagementTimerId !== undefined) {
      this.window.clearTimeout(this.engagementTimerId);
    }

    this.engagementTimerId = this.window.setTimeout(() => {
      this.engagementTimerId = undefined;

      if (this.document.visibilityState === 'hidden' || this.lastTrackedPageLocation !== pageLocation) {
        return;
      }

      this.trackEvent('app_engaged', {
        page_path: pagePath,
        engagement_time_msec: 15000,
        visible_seconds: 15,
      });
    }, 15000);
  }

  private getCurrentStableUrl(): string {
    if (this.lastNavigationUrl) {
      return this.lastNavigationUrl;
    }

    return this.router.navigated ? this.router.url : '';
  }

  private sanitizeUrlForAnalytics(url: string): string {
    const parsedUrl = new URL(url, this.document.location.origin);
    const sensitiveParams = ['token', 'access_token', 'id_token', 'refresh_token', 'code', 'state'];

    for (const param of sensitiveParams) {
      parsedUrl.searchParams.delete(param);
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  }

  private expireGoogleAnalyticsCookies(): void {
    const measurementCookieName = this.measurementId.replace(/^G-/, '').replace(/-/g, '_');
    const gtagCookieName = this.measurementId.replace(/-/g, '_');
    const cookieNames = new Set([
      '_ga',
      `_ga_${measurementCookieName}`,
      '_gid',
      '_gat',
      `_gat_gtag_${gtagCookieName}`,
      ...this.getCurrentAnalyticsCookieNames(),
    ]);

    for (const cookieName of cookieNames) {
      for (const domain of this.getCookieDomains()) {
        const domainPart = domain ? `; domain=${domain}` : '';
        const expiredCookie = `${cookieName}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}; SameSite=Lax`;
        this.document.cookie = expiredCookie;

        if (this.document.location.protocol === 'https:') {
          this.document.cookie = `${expiredCookie}; Secure`;
        }
      }
    }
  }

  private getCurrentAnalyticsCookieNames(): string[] {
    return this.document.cookie
      .split(';')
      .map(cookie => cookie.trim().split('=')[0])
      .filter(name => name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name.startsWith('_gat'));
  }

  private getCookieDomains(): string[] {
    const hostname = this.document.location.hostname;

    if (!hostname || hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return [''];
    }

    const domains = new Set<string>(['', hostname, `.${hostname}`]);
    const parts = hostname.split('.');

    for (let index = 1; index < parts.length - 1; index += 1) {
      domains.add(`.${parts.slice(index).join('.')}`);
    }

    return [...domains];
  }

  private setGaDisabled(disabled: boolean): void {
    (this.window as GoogleAnalyticsWindow)[`ga-disable-${this.measurementId}`] = disabled;
  }

  private get window(): Window {
    return this.document.defaultView ?? window;
  }

  private getScriptNonce(): string {
    const nonceScript = this.document.querySelector<HTMLScriptElement>('script[nonce]');
    return nonceScript?.nonce || nonceScript?.getAttribute('nonce') || '';
  }
}
