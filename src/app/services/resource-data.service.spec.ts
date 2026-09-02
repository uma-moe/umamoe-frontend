import { ReplaySubject } from 'rxjs';
import { ResourceDataService } from './resource-data.service';

describe('ResourceDataService cache revalidation', () => {
  it('refreshes a fingerprint-current cached resource when revalidation is requested', async () => {
    const service = new ResourceDataService({} as never, {
      buildVersion: 'test',
      buildVersionLabel: 'test',
    } as never);
    const internal = service as unknown as {
      resourceLoadOptions: Map<string, { revalidateCached?: boolean }>;
      loadResource<T>(resourceName: string, subject: ReplaySubject<T>): Promise<void>;
    };
    const cached = { events: [] };
    const refreshed = { events: [{ id: 'banner' }] };
    const subject = new ReplaySubject<typeof cached | typeof refreshed>(2);
    const emissions: Array<typeof cached | typeof refreshed> = [];
    subject.subscribe(value => emissions.push(value));

    internal.resourceLoadOptions.set('banner_timeline', { revalidateCached: true });
    spyOn<any>(service, 'hasCachedResourceMeta').and.returnValue(true);
    spyOn<any>(service, 'readCachedResource').and.resolveTo(cached);
    spyOn<any>(service, 'fetchManifest').and.resolveTo({ version: 'v1' });
    spyOn<any>(service, 'getManifestVersion').and.returnValue('v1');
    spyOn<any>(service, 'getManifestGeneratedAt').and.returnValue(null);
    spyOn<any>(service, 'resolveResource').and.returnValue({ url: '/resources/banner.json', fingerprint: 'hash' });
    spyOn<any>(service, 'readCacheMeta').and.returnValue({
      url: '/resources/banner.json',
      version: 'v1',
      cacheName: 'cache-v1',
      cachedAt: 1,
      fingerprint: 'hash',
    });
    spyOn<any>(service, 'isCacheFresh').and.returnValue(true);
    spyOn<any>(service, 'waitForBrowserProofBeforeResourceFetch').and.resolveTo();
    const fetchResource = spyOn<any>(service, 'fetchAndCacheResource').and.resolveTo(refreshed);
    spyOn<any>(service, 'cleanupOldCaches').and.resolveTo();

    await internal.loadResource('banner_timeline', subject);

    expect(fetchResource).toHaveBeenCalled();
    expect(emissions).toEqual([cached, refreshed]);
  });
});
