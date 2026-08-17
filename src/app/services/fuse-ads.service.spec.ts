import { NgZone } from '@angular/core';
import { CookieConsentService } from './cookie-consent.service';
import { FuseAdsService, FuseRuntimeState } from './fuse-ads.service';

describe('FuseAdsService navigation ordering', () => {
  let service: FuseAdsService;
  let originalFuseTag: Window['fusetag'];
  let zoneElement: HTMLElement | null;
  let fuseScriptElement: HTMLScriptElement | null;

  beforeEach(() => {
    originalFuseTag = window.fusetag;
    zoneElement = null;
    fuseScriptElement = null;
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
    fuseScriptElement?.remove();
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

  it('registers the same connected element only once per page view', () => {
    const registerZone = jasmine.createSpy('registerZone');
    window.fusetag = {
      que: [],
      pageInit: jasmine.createSpy('pageInit'),
      registerZone,
    };
    zoneElement = document.createElement('div');
    zoneElement.id = 'zone-a';
    document.body.appendChild(zoneElement);

    service.registerZone('zone-a', 'fuse-zone-a');
    service.registerZone('zone-a', 'fuse-zone-a');

    expect(registerZone).toHaveBeenCalledOnceWith('zone-a');
  });

  it('registers a replacement DOM element even when it reuses the same id', () => {
    const registerZone = jasmine.createSpy('registerZone');
    window.fusetag = {
      que: [],
      pageInit: jasmine.createSpy('pageInit'),
      registerZone,
    };
    zoneElement = document.createElement('div');
    zoneElement.id = 'zone-a';
    document.body.appendChild(zoneElement);
    service.registerZone('zone-a', 'fuse-zone-a');

    const replacement = document.createElement('div');
    replacement.id = 'zone-a';
    zoneElement.replaceWith(replacement);
    zoneElement = replacement;
    service.registerZone('zone-a', 'fuse-zone-a');

    expect(registerZone).toHaveBeenCalledTimes(2);
  });

  it('allows a connected element to register again after pageInit resets the page view', () => {
    const registerZone = jasmine.createSpy('registerZone');
    window.fusetag = {
      que: [],
      pageInit: jasmine.createSpy('pageInit'),
      registerZone,
    };
    zoneElement = document.createElement('div');
    zoneElement.id = 'zone-a';
    document.body.appendChild(zoneElement);

    service.registerZone('zone-a', 'fuse-zone-a');
    service.beginPageView('/next-page', ['fuse-zone-a'], { allowPageInit: true });
    service.registerZone('zone-a', 'fuse-zone-a');

    expect(registerZone).toHaveBeenCalledTimes(2);
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

  it('uses the configured two-second blocking timeout for navigation auctions', () => {
    const pageInit = jasmine.createSpy('pageInit');
    window.fusetag = {
      que: [],
      pageInit,
      registerZone: jasmine.createSpy('registerZone'),
    };

    service.beginPageView('/next-page', ['fuse-zone-a'], { allowPageInit: true });

    expect(pageInit).toHaveBeenCalledOnceWith({
      blockingFuseIds: ['fuse-zone-a'],
      blockingTimeout: 2000,
    });
  });

  it('waits for an existing async Fuse script to load before marking it loaded', () => {
    window.fusetag = { que: [] };
    fuseScriptElement = document.createElement('script');
    fuseScriptElement.id = 'publift-fuse-js';
    document.head.appendChild(fuseScriptElement);

    (service as any).ensureFuseScript();
    expect((service as any).runtimeStateSubject.value.scriptLoaded).toBeFalse();

    fuseScriptElement.dispatchEvent(new Event('load'));

    expect((service as any).runtimeStateSubject.value.scriptLoaded).toBeTrue();
  });
});
