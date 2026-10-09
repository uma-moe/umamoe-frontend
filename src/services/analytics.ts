import { runtimeConfig } from './runtime-config';
import { fuseEnabled, loadFuse } from './ads/fuse-ads';
import { buildVersion } from './site-services';
import { afterPageReady } from '@/routes/after-page-paint';
import { sanitizeAnalyticsUrl } from './analytics-url';
export { sanitizeAnalyticsUrl } from './analytics-url';

type ConsentValue = 'granted' | 'denied';
type Consent = Record<'ad_storage' | 'ad_user_data' | 'ad_personalization' | 'analytics_storage', ConsentValue>;
interface TcfData { listenerId?: number; gdprApplies?: boolean; eventStatus?: string; purpose?: { consents?: Record<string, boolean> }; }
interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __tcfapi?: (command: string, version: number, callback: (data: TcfData, success: boolean) => void, listenerId?: number) => void;
  __uspapi?: (command: string, version: number, callback: (data: { uspString?: string }, success: boolean) => void) => void;
}
const denied: Consent = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
let consent = { ...denied };
let started = false;
let lastPage = '';
let engagement: ReturnType<typeof setTimeout> | undefined;
const runtime = () => window as AnalyticsWindow;

export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!started) return;
  const event = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40);
  if (!/^[a-z]/.test(event)) return;
  const safe = Object.fromEntries(Object.entries(params).filter(([key, value]) => /^[a-z][a-z0-9_]{0,39}$/.test(key) && !/(email|password|secret|token|credential|trainer_id|viewer_id|account_id|user_id|search_term|query|raw|name|send_to|event_callback|event_timeout)/i.test(key) && (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 100) : value]));
  runtime().gtag?.('event', event, { ...safe, build_version: buildVersion(), deployment_channel: __APP_ENVIRONMENT__, analytics_storage_state: consent.analytics_storage, send_to: runtimeConfig.measurementId });
}
export function trackPageView(value = location.href): void {
  if (!started) return;
  const path = sanitizeAnalyticsUrl(value);
  if (path === '/signin' || path === lastPage) return;
  const locationUrl = new URL(path, location.origin).href;
  const referrer = lastPage ? new URL(lastPage, location.origin).href : '';
  lastPage = path;
  // Titles on profile pages contain trainer names; use the route shape instead.
  runtime().gtag?.('set', { page_location: locationUrl, page_path: path, page_title: path });
  trackEvent('page_view', { page_location: locationUrl, page_path: path, page_referrer: referrer, page_title: path });
  clearTimeout(engagement);
  engagement = setTimeout(() => { if (!document.hidden) trackEvent('app_engaged', { page_path: path, engagement_time_msec: 15000, visible_seconds: 15 }); }, 15_000);
}
function updateConsent(next: Consent): void {
  consent = next;
  runtime().gtag?.('consent', 'update', next);
  if (next.analytics_storage === 'denied') {
    const parts = location.hostname.split('.');
    const domains = ['', location.hostname, ...parts.slice(0, -1).map((_, index) => `.${parts.slice(index).join('.')}`)];
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0]!;
      if (!/^(_ga(?:_|$)|_gid$|_gat)/.test(name)) continue;
      for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domain ? `; domain=${domain}` : ''}`;
    }
  }
}
export function startAnalytics(): () => void {
  // Fuse also owns the regional Privacy Choices UI on pages without ad slots.
  const fuse = loadFuse();
  if (started || !runtimeConfig.providersEnabled || !runtimeConfig.measurementId.trim()) return () => {};
  started = true;
  const win = runtime();
  win.dataLayer ??= [];
  win.gtag ??= function () { win.dataLayer!.push(arguments); };
  win.gtag('consent', 'default', denied);
  win.gtag('set', 'ads_data_redaction', true);
  win.gtag('js', new Date());
  win.gtag('config', runtimeConfig.measurementId, { send_page_view: false, page_location: new URL(sanitizeAnalyticsUrl(location.href), location.origin).href, page_referrer: '', page_title: sanitizeAnalyticsUrl(location.href) });
  let listenerId: number | undefined;
  let tcfAttached = false;
  let optedOut = false;
  let stopped = false;
  void afterPageReady().then(() => {
    if (stopped || document.getElementById('google-analytics-gtag')) return;
    const script = document.createElement('script');
    script.id = 'google-analytics-gtag'; script.async = true; script.fetchPriority = 'low';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(runtimeConfig.measurementId)}`;
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
    document.head.append(script);
  });
  const localConsent = () => {
    if (fuseEnabled()) return;
    let analytics = false;
    try { analytics = JSON.parse(localStorage.getItem('cookie-consent') ?? 'null')?.analytics === true; } catch {}
    updateConsent({ ...denied, analytics_storage: analytics ? 'granted' : 'denied' });
  };
  const attach = () => {
    localConsent();
    if (!fuseEnabled()) return;
    if (win.__tcfapi && !tcfAttached) {
      tcfAttached = true;
      try { win.__tcfapi('addEventListener', 2, (data, success) => {
        if (stopped || !success) return;
        listenerId = data.listenerId;
        if (data.gdprApplies !== false && !['tcloaded', 'useractioncomplete'].includes(data.eventStatus ?? '')) return;
        const has = (id: number) => data.gdprApplies === false || data.purpose?.consents?.[String(id)] === true;
        const value = (allowed: boolean): ConsentValue => allowed ? 'granted' : 'denied';
        updateConsent({ ad_storage: value(has(1)), ad_user_data: value(!optedOut && has(1) && has(7)), ad_personalization: value(!optedOut && has(1) && has(3) && has(4)), analytics_storage: value(has(1) && has(8)) });
      }); } catch { tcfAttached = false; }
    }
    try { win.__uspapi?.('getUSPData', 1, (data, success) => {
      if (!stopped && success && data.uspString?.[2]?.toUpperCase() === 'Y') { optedOut = true; updateConsent({ ...consent, ad_user_data: 'denied', ad_personalization: 'denied' }); }
    }); } catch { /* CMP unavailable: retain denied consent. */ }
  };
  attach();
  void fuse.then(() => { if (!stopped) attach(); });
  // CMP loads asynchronously; retry briefly, then revisit on tab focus/privacy changes.
  let attempts = 0;
  const timer = setInterval(() => { attach(); if (++attempts >= 20) clearInterval(timer); }, 250);
  window.addEventListener('storage', attach);
  window.addEventListener('focus', attach);
  trackPageView();
  return () => {
    stopped = true; started = false; lastPage = ''; clearInterval(timer); clearTimeout(engagement);
    window.removeEventListener('storage', attach); window.removeEventListener('focus', attach);
    if (listenerId !== undefined) try { win.__tcfapi?.('removeEventListener', 2, () => {}, listenerId); } catch {}
  };
}
