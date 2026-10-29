import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fuse: vi.fn(() => false) }));
vi.mock('../runtime-config', () => ({
  runtimeConfig: { providersEnabled: true, measurementId: 'G-TEST' }
}));

vi.mock('../ads/fuse-ads', () => ({ fuseEnabled: mocks.fuse, loadFuse: vi.fn(async () => false) }));
import { sanitizeAnalyticsUrl, startAnalytics, trackEvent, trackPageView } from './analytics';
import { withPageRequest } from '../http/page-request';
import { loadFuse } from '../ads/fuse-ads';
const analyticsWindow = window as Window & {
  gtag?: ReturnType<typeof vi.fn>;
  __tcfapi?: (
    command: string,
    version: number,
    callback: (data: unknown, success: boolean) => void
  ) => void;
  __uspapi?: (
    command: string,
    version: number,
    callback: (data: unknown, success: boolean) => void
  ) => void;
};

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  document.head.innerHTML = '';
  delete analyticsWindow.__tcfapi;
  delete analyticsWindow.__uspapi;
  delete analyticsWindow.gtag;
  mocks.fuse.mockReturnValue(false);
  vi.mocked(loadFuse).mockResolvedValue(false);
});

it('retains stored consent, strips tokens and account identifiers, and avoids duplicate page views', () => {
  vi.useFakeTimers();
  history.replaceState(null, '', '/profile/12345?token=secret#private');
  localStorage.setItem('cookie-consent', JSON.stringify({ analytics: false, advertising: false }));
  const gtag = vi.fn();
  analyticsWindow.gtag = gtag;
  stop = startAnalytics();
  expect(gtag).toHaveBeenCalledWith(
    'consent',
    'default',
    expect.objectContaining({ analytics_storage: 'denied' })
  );

  expect(sanitizeAnalyticsUrl(location.href)).toBe('/profile/:id');
  expect(sanitizeAnalyticsUrl('/veterans/12345?token=secret')).toBe('/veterans/:id');
  trackPageView('/profile/99999?token=another');
  expect(gtag.mock.calls.filter((call) => call[1] === 'page_view')).toHaveLength(1);
  trackEvent('filter_applied', { trainer_name: 'private', token: 'secret', result_count: 3 });
  expect(gtag).toHaveBeenLastCalledWith(
    'event',
    'filter_applied',
    expect.objectContaining({ result_count: 3 })
  );

  expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/secret|12345|99999|private/);
  localStorage.setItem('cookie-consent', JSON.stringify({ analytics: true, advertising: false }));
  window.dispatchEvent(new Event('storage'));
  expect(gtag).toHaveBeenLastCalledWith(
    'consent',
    'update',
    expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied' })
  );
});

it('defers analytics until page data paints and attaches consent when the deferred CMP arrives', async () => {
  vi.useFakeTimers();
  mocks.fuse.mockReturnValue(true);
  let releaseData!: () => void, releaseFuse!: () => void;
  const data = withPageRequest(() => new Promise<void>((resolve) => (releaseData = resolve)));
  const fuse = new Promise<boolean>((resolve) => (releaseFuse = () => resolve(true)));
  vi.mocked(loadFuse).mockReturnValue(fuse);
  stop = startAnalytics();
  await vi.advanceTimersByTimeAsync(6000);
  expect(document.getElementById('google-analytics-gtag')).toBeNull();
  const tcf = vi.fn();
  analyticsWindow.__tcfapi = tcf;
  releaseData();
  await data;
  await vi.advanceTimersByTimeAsync(50);
  expect(document.getElementById('google-analytics-gtag')).not.toBeNull();
  releaseFuse();
  await fuse;
  await Promise.resolve();
  expect(tcf).toHaveBeenCalledWith('addEventListener', 2, expect.any(Function));
  vi.mocked(loadFuse).mockResolvedValue(false);
});

it('updates CMP purpose consent and keeps a sale opt-out when CMP updates again', () => {
  vi.useFakeTimers();
  mocks.fuse.mockReturnValue(true);
  const gtag = vi.fn();
  analyticsWindow.gtag = gtag;
  let callback!: (data: unknown, success: boolean) => void;
  analyticsWindow.__tcfapi = vi.fn((_cmd, _version, cb) => (callback = cb));
  analyticsWindow.__uspapi = (_cmd, _version, cb) => cb({ uspString: '1YYN' }, true);
  stop = startAnalytics();
  callback(
    {
      gdprApplies: true,
      eventStatus: 'useractioncomplete',
      listenerId: 1,
      purpose: { consents: { 1: true, 3: true, 4: true, 7: true, 8: true } }
    },
    true
  );

  expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });

  callback(
    { gdprApplies: true, eventStatus: 'useractioncomplete', purpose: { consents: {} } },
    true
  );

  expect(gtag).toHaveBeenLastCalledWith(
    'consent',
    'update',
    expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })
  );

  mocks.fuse.mockReturnValue(false);
});
