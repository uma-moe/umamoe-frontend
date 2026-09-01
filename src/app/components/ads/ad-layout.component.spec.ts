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

  function mountScrollingStickyFooter(creativeHeight: number): HTMLElement {
    const shell = document.createElement('div');
    shell.className = 'publift-widget-scrolling_sticky_footer-container';
    shell.style.position = 'fixed';

    const button = document.createElement('div');
    button.className = 'publift-widget-scrolling_sticky_footer-button';
    button.style.position = 'absolute';

    const footer = document.createElement('div');
    footer.className = 'publift-widget-scrolling_sticky_footer';
    const creative = document.createElement('iframe');
    footer.appendChild(creative);
    shell.append(button, footer);
    document.body.appendChild(shell);

    spyOn(shell, 'getBoundingClientRect').and.returnValue(new DOMRect(60, 474, 970, 126));
    spyOn(button, 'getBoundingClientRect').and.returnValue(new DOMRect(996, 478, 30, 30));
    spyOn(creative, 'getBoundingClientRect').and.returnValue(new DOMRect(60, 474, 970, creativeHeight));

    return shell;
  }

  function clearStickyFooterTestState(shell: HTMLElement): void {
    shell.remove();
    document.documentElement.style.removeProperty('--ad-provider-sticky-footer-height');
    document.documentElement.style.removeProperty('--ad-provider-sticky-footer-close-inline-offset');
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

  it('caps an oversized scrolling sticky-footer creative at the allowed banner height', () => {
    const { component } = createComponent(true);
    const shell = mountScrollingStickyFooter(250);

    (component as any).updateProviderStickyFooterCloseOffset();

    expect(document.documentElement.style.getPropertyValue('--ad-provider-sticky-footer-height')).toBe('90px');
    clearStickyFooterTestState(shell);
  });

  it('shrinks the footer shell to a smaller creative', () => {
    const { component } = createComponent(true);
    const shell = mountScrollingStickyFooter(50);

    (component as any).updateProviderStickyFooterCloseOffset();

    expect(document.documentElement.style.getPropertyValue('--ad-provider-sticky-footer-height')).toBe('50px');
    clearStickyFooterTestState(shell);
  });
});
