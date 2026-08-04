import { NgZone } from '@angular/core';
import { CookieConsentService } from './cookie-consent.service';
import { FuseAdsService, FuseRuntimeState } from './fuse-ads.service';

describe('FuseAdsService navigation ordering', () => {
  let service: FuseAdsService;
  let originalFuseTag: Window['fusetag'];
  let zoneElement: HTMLElement | null;

  beforeEach(() => {
    originalFuseTag = window.fusetag;
    zoneElement = null;
    service = new FuseAdsService(
      {} as NgZone,
      {} as CookieConsentService,
      document,
      'browser' as unknown as object,
    );
    const readyState: FuseRuntimeState = {
      enabled: true,
      configured: true,
      scriptLoaded: true,
      adsCanRender: true,
      cmpStatus: 'ready',
    };
    (service as any).runtimeStateSubject.next(readyState);
  });

  afterEach(() => {
    zoneElement?.remove();
    window.fusetag = originalFuseTag;
  });

  it('runs pageInit once before registering a connected zone after navigation', () => {
    const calls: string[] = [];
    window.fusetag = {
      que: [],
      pageInit: () => calls.push('pageInit'),
      registerZone: () => calls.push('registerZone'),
    };

    service.beginPageView('/next-page', ['fuse-zone-a'], { allowPageInit: true });

    zoneElement = document.createElement('div');
    zoneElement.id = 'zone-a';
    document.body.appendChild(zoneElement);
    service.registerZone('zone-a', 'fuse-zone-a');

    expect(calls).toEqual(['pageInit', 'registerZone']);
  });

  it('does not call registerZone when the target is absent from the DOM', () => {
    const registerZone = jasmine.createSpy('registerZone');
    window.fusetag = {
      que: [],
      pageInit: jasmine.createSpy('pageInit'),
      registerZone,
    };

    service.registerZone('missing-zone', 'fuse-zone-a');

    expect(registerZone).not.toHaveBeenCalled();
  });

  it('still runs pageInit on navigation to a route without ad zones', () => {
    const pageInit = jasmine.createSpy('pageInit');
    window.fusetag = {
      que: [],
      pageInit,
      registerZone: jasmine.createSpy('registerZone'),
    };

    service.beginPageView('/settings', [], { allowPageInit: true });

    expect(pageInit).toHaveBeenCalledOnceWith();
  });
});
