import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { CookieConsentService } from './cookie-consent.service';

type GtagFunction = (...args: unknown[]) => void;
type GoogleAnalyticsWindow = Window & Record<`ga-disable-${string}`, boolean | undefined>;

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
  private initialized = false;
  private trackingEnabled = false;
  private lastTrackedUrl = '';
  private lastNavigationUrl = '';

  constructor(
    private cookieConsentService: CookieConsentService,
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

    this.cookieConsentService.consent$.pipe(
      map(consent => consent?.analytics ?? false),
      distinctUntilChanged(),
    ).subscribe(analyticsAllowed => analyticsAllowed ? this.enableTracking() : this.disableTracking());

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ).subscribe(event => {
      this.lastNavigationUrl = event.urlAfterRedirects;
      this.deferTrackPageView(event.urlAfterRedirects);
    });
  }

  private enableTracking(): void {
    if (this.trackingEnabled) {
      return;
    }

    this.trackingEnabled = true;
    this.setGaDisabled(false);
    this.ensureScript();
    this.ensureConfigured();

    const currentUrl = this.getCurrentStableUrl();
    if (currentUrl) {
      this.deferTrackPageView(currentUrl);
    }
  }

  private disableTracking(): void {
    this.trackingEnabled = false;
    this.lastTrackedUrl = '';
    this.setGaDisabled(true);
    this.window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
    this.expireGoogleAnalyticsCookies();
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

  private ensureConfigured(): void {
    const windowRef = this.window;
    windowRef.dataLayer = windowRef.dataLayer ?? [];
    windowRef.gtag = windowRef.gtag ?? function gtag(): void {
      windowRef.dataLayer?.push(arguments);
    } as GtagFunction;

    windowRef.gtag('consent', 'update', { analytics_storage: 'granted' });

    if (this.initialized) {
      return;
    }

    windowRef.gtag('js', new Date());
    windowRef.gtag('config', this.measurementId, { send_page_view: false });
    this.initialized = true;
  }

  private trackPageView(url: string): void {
    if (!this.trackingEnabled) {
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

    this.ngZone.runOutsideAngular(() => {
      this.window.gtag?.('event', 'page_view', {
        page_location: pageLocation,
        page_path: trackedUrl,
        page_title: this.document.title,
        send_to: this.measurementId,
      });
    });
  }

  private deferTrackPageView(url: string): void {
    this.window.setTimeout(() => this.trackPageView(url), 0);
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
