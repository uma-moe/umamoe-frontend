import { ChangeDetectorRef, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { FuseAdsService, FuseRuntimeState } from '../../services/fuse-ads.service';
import { AdLayoutComponent } from './ad-layout.component';
import { getAdRouteConfig } from './ad-layout.config';

describe('AdLayoutComponent navigation lifecycle', () => {
  const readyState: FuseRuntimeState = {
    enabled: true,
    configured: true,
    scriptLoaded: true,
    adsCanRender: true,
    cmpStatus: 'ready',
  };

  function createComponent(routerNavigated: boolean): {
    component: AdLayoutComponent;
    routerEvents: Subject<NavigationEnd>;
  } {
    const routerEvents = new Subject<NavigationEnd>();
    const router = {
      url: '/',
      navigated: routerNavigated,
      events: routerEvents,
    } as unknown as Router;
    const fuseAdsService = {
      supportFallbackAllowed$: new BehaviorSubject(false),
      runtimeState$: new BehaviorSubject(readyState),
    } as unknown as FuseAdsService;
    const component = new AdLayoutComponent(
      router,
      fuseAdsService,
      {} as NgZone,
      {} as ChangeDetectorRef,
      document,
      'browser' as unknown as object,
    );

    spyOn<any>(component, 'resetProviderStickyFooterDismissal');
    spyOn<any>(component, 'attachProviderStickyFooterDismissHandler');
    spyOn<any>(component, 'observeProviderStickyFooterPresence');
    spyOn<any>(component, 'updateFallbackPreviewState');
    spyOn<any>(component, 'updateProviderStickyFooterPresence');
    spyOn<any>(component, 'updateBottomPopupRootState');
    spyOn<any>(component, 'scheduleProviderStickyFooterMeasurementIfPresent');
    spyOn<any>(component, 'scheduleSideRailLayout');

    return { component, routerEvents };
  }

  it('suppresses pageInit for the first NavigationEnd when initial navigation is pending', () => {
    const { component, routerEvents } = createComponent(false);
    const syncConfig = spyOn<any>(component, 'syncConfig');
    component.ngOnInit();

    routerEvents.next(new NavigationEnd(1, '/?filter=active', '/?filter=active'));
    routerEvents.next(new NavigationEnd(2, '/database', '/database'));

    expect(syncConfig.calls.allArgs()).toEqual([
      ['/', false],
      ['/?filter=active', false],
      ['/database', true],
    ]);
    component.ngOnDestroy();
  });

  it('allows pageInit for the first observed navigation after initial navigation completed', () => {
    const { component, routerEvents } = createComponent(true);
    const syncConfig = spyOn<any>(component, 'syncConfig');
    component.ngOnInit();

    routerEvents.next(new NavigationEnd(2, '/database', '/database'));

    expect(syncConfig.calls.mostRecent().args).toEqual(['/database', true]);
    component.ngOnDestroy();
  });

  it('preserves side rails only when both placement and Fuse identities are unchanged', () => {
    const { component } = createComponent(true);
    const wideDocument = {
      defaultView: { innerWidth: 1600 },
      documentElement: { clientWidth: 1600 },
    } as unknown as Document;
    (component as any).document = wideDocument;
    component.config = getAdRouteConfig('/');

    expect((component as any).canPreserveSideRailsForRoute(getAdRouteConfig('/?filter=active'))).toBeTrue();
    expect((component as any).canPreserveSideRailsForRoute(getAdRouteConfig('/database'))).toBeFalse();
  });
});
