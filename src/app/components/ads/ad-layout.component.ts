import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, HostListener, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, combineLatest, filter } from 'rxjs';
import { AdSlotComponent } from './ad-slot.component';
import { isAdFallbackPreviewEnabled } from './ad-fallback-preview';
import { AdRouteConfig, PUBLIFT_XL_MIN_WIDTH, getAdRouteConfig, getGlobalStickyFooterSlot } from './ad-layout.config';
import { FuseAdsService } from '../../services/fuse-ads.service';

const AD_SIDE_RAIL_PAGE_CLASS = 'ad-side-rail-page';
const AD_LEFT_RAIL_RESERVED_CLASS = 'ad-left-rail-reserved';
const AD_BOTTOM_POPUP_VISIBLE_CLASS = 'ad-bottom-popup-visible';
const DEFAULT_SIDE_RAIL_MIN_WIDTH = PUBLIFT_XL_MIN_WIDTH;
const DEFAULT_SIDE_RAIL_ANCHOR_SELECTORS = [
  '.content-container',
  '.tierlist-container',
  '.planner-scroll',
  '.section-content',
  '.quick-links',
  '.hero-content',
  '.page-header .header-content',
];
const SIDE_RAIL_COMPACT_WIDTH = 120;
const SIDE_RAIL_WIDE_WIDTH = 160;
const SIDE_RAIL_EDGE_GAP = 16;
const SIDE_RAIL_CONTENT_GAP = 16;
const SINGLE_SIDE_RAIL_MAX_WIDTH = 1535;
const LEFT_RAIL_RESERVE_MAX_WIDTH = 9999;
const CONTENT_TOP_MAX_WIDTH = PUBLIFT_XL_MIN_WIDTH - 1;
const SIDE_RAIL_MAX_HEIGHT = 600;
const SIDE_RAIL_MIN_HEIGHT = 420;
const SIDE_RAIL_NAV_OFFSET = 60;
const SIDE_RAIL_VERTICAL_MARGIN = 16;
const SIDE_RAIL_FRAME_TOP_SELECTORS = ['.page-header'];
const SIDE_RAIL_LAYOUT_RETRY_MS = [80, 300, 900];
const BOTTOM_POPUP_DISMISSED_STORAGE_KEY = 'uma.ad.bottom-popup.dismissed';
type SideRailLayout = 'none' | 'left' | 'right' | 'both';

@Component({
  selector: 'app-ad-layout',
  standalone: true,
  imports: [CommonModule, AdSlotComponent],
  templateUrl: './ad-layout.component.html',
  styleUrls: ['./ad-layout.component.scss'],
})
export class AdLayoutComponent implements OnInit, OnDestroy {
  config: AdRouteConfig = getAdRouteConfig('/');
  readonly adsCanRender$ = this.fuseAdsService.adsCanRender$;
  readonly stickyFooterConfig = getGlobalStickyFooterSlot();
  readonly stickyFooterFallbackConfig = {
    ...getGlobalStickyFooterSlot(),
    fuseId: '',
  };
  bottomPopupClosed = false;
  fallbackPreviewEnabled = false;
  adsCanRender = false;
  supportFallbackAllowed = false;
  sideRailsVisible = false;
  sideRailLayout: SideRailLayout = 'none';
  sideRailLeft = SIDE_RAIL_EDGE_GAP;
  sideRailRight = SIDE_RAIL_EDGE_GAP;
  sideRailTop = 50;
  sideRailWidth = SIDE_RAIL_WIDE_WIDTH;
  leftSideRailCollapsed = false;
  rightSideRailCollapsed = false;
  providerStickyFooterCollapsed = false;
  providerStickyFooterClosed = false;
  contentTopAllowed = true;
  private routerSub?: Subscription;
  private adStateSub?: Subscription;
  private layoutFrame: number | null = null;
  private layoutRetryTimers: number[] = [];
  private observedAnchor: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private router: Router,
    private fuseAdsService: FuseAdsService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    this.updateFallbackPreviewState();
    this.restoreBottomPopupDismissal();
    this.adStateSub = combineLatest([
      this.fuseAdsService.adsCanRender$,
      this.fuseAdsService.supportFallbackAllowed$,
    ]).subscribe(([adsCanRender, supportFallbackAllowed]) => {
      this.adsCanRender = adsCanRender;
      this.supportFallbackAllowed = supportFallbackAllowed;
      if (supportFallbackAllowed) {
        this.providerStickyFooterCollapsed = false;
      }
      this.updateBottomPopupRootState();

      if (!this.adLayoutActive) {
        this.clearAdLayoutGeometry();
        return;
      }

      this.scheduleSideRailLayout(true);
    });
    this.syncConfig(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.syncConfig(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.adStateSub?.unsubscribe();
    this.cancelSideRailLayout();
    this.updateAdShellReservation(false);
    this.updateBottomPopupRootState(false);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateContentTopAllowed();
    this.updateBottomPopupRootState();
    this.scheduleSideRailLayout();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scheduleSideRailLayout();
  }

  private syncConfig(url: string): void {
    this.updateFallbackPreviewState();
    const nextConfig = getAdRouteConfig(url);
    const preserveVisibleSideRails = this.sideRailsVisible
      && Boolean(this.config.sideRails)
      && this.canPreserveSideRailsForRoute(nextConfig);

    this.config = nextConfig;
    this.leftSideRailCollapsed = false;
    this.rightSideRailCollapsed = false;
    this.updateContentTopAllowed();
    this.fuseAdsService.beginPageView(url, this.getPageSwapPreloadFuseIds(this.config));
    this.updateBottomPopupRootState();
    this.fuseAdsService.debug('route ad config synced', {
      url,
      enabled: this.config.enabled,
      contentTopAllowed: this.contentTopAllowed,
      stickyFooterFuseId: this.stickyFooterConfig.fuseId,
      sideRails: this.config.sideRails
        ? {
          left: this.config.sideRails.left.fuseId,
          right: this.config.sideRails.right.fuseId,
        }
        : undefined,
      preserveVisibleSideRails,
    });
    if (!preserveVisibleSideRails) {
      this.sideRailsVisible = false;
    }
    this.disconnectAnchorObserver();
    this.scheduleSideRailLayout(true);
  }

  private updateFallbackPreviewState(): void {
    this.fallbackPreviewEnabled = isAdFallbackPreviewEnabled(this.document);
  }

  get adLayoutActive(): boolean {
    return this.fallbackPreviewEnabled || (this.adsCanRender && !this.supportFallbackAllowed);
  }

  get shouldShowProviderStickyFooter(): boolean {
    return Boolean(
      this.stickyFooterConfig.fuseId
      && this.adLayoutActive
      && !this.supportFallbackAllowed
      && !this.fallbackPreviewEnabled
      && !this.providerStickyFooterClosed
    );
  }

  get shouldShowBottomSupportFallback(): boolean {
    if (this.bottomPopupClosed || !(this.stickyFooterConfig.fuseId || this.fallbackPreviewEnabled)) {
      return false;
    }

    return this.supportFallbackAllowed
      || this.fallbackPreviewEnabled
      || (!this.providerStickyFooterClosed && this.providerStickyFooterCollapsed);
  }

  closeBottomPopup(): void {
    this.bottomPopupClosed = true;
    this.storeBottomPopupDismissal();
    this.updateBottomPopupRootState(false);
  }

  onSideRailCollapsed(side: 'left' | 'right', collapsed: boolean): void {
    if (side === 'left') {
      this.leftSideRailCollapsed = collapsed;
    } else {
      this.rightSideRailCollapsed = collapsed;
    }

    this.scheduleSideRailLayout();
  }

  onProviderStickyFooterCollapsed(collapsed: boolean): void {
    if (this.providerStickyFooterClosed) {
      return;
    }

    if (this.providerStickyFooterCollapsed === collapsed) {
      return;
    }

    this.providerStickyFooterCollapsed = collapsed;
    this.updateBottomPopupRootState();
  }

  closeProviderStickyFooter(): void {
    this.providerStickyFooterClosed = true;
    this.providerStickyFooterCollapsed = false;
    this.updateBottomPopupRootState();
  }

  private updateBottomPopupRootState(visible = this.shouldShowBottomSupportFallback): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.document.documentElement.classList.toggle(
      AD_BOTTOM_POPUP_VISIBLE_CLASS,
      visible,
    );
  }

  private updateContentTopAllowed(): boolean {
    const previous = this.contentTopAllowed;

    if (!isPlatformBrowser(this.platformId)) {
      this.contentTopAllowed = true;
      return previous !== this.contentTopAllowed;
    }

    const view = this.document.defaultView;
    const viewportWidth = view?.innerWidth ?? this.document.documentElement.clientWidth;
    const sideRailMinWidth = this.config.sideRailMinWidth ?? DEFAULT_SIDE_RAIL_MIN_WIDTH;
    const contentTopMaxWidth = Math.min(CONTENT_TOP_MAX_WIDTH, sideRailMinWidth - 1);
    this.contentTopAllowed = viewportWidth <= contentTopMaxWidth;

    return previous !== this.contentTopAllowed;
  }

  private restoreBottomPopupDismissal(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      this.bottomPopupClosed = this.document.defaultView?.sessionStorage
        .getItem(BOTTOM_POPUP_DISMISSED_STORAGE_KEY) === '1';
    } catch {
      this.bottomPopupClosed = false;
    }
  }

  private storeBottomPopupDismissal(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      this.document.defaultView?.sessionStorage
        .setItem(BOTTOM_POPUP_DISMISSED_STORAGE_KEY, '1');
    } catch {
      // Session storage can be unavailable in hardened browser contexts.
    }
  }

  private getPageSwapPreloadFuseIds(config: AdRouteConfig): string[] {
    const ids = [
      this.contentTopAllowed ? config.contentTop?.fuseId : undefined,
      ...this.getLikelyInitialSideRailFuseIds(config),
    ];

    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  }

  private getLikelyInitialSideRailFuseIds(config: AdRouteConfig): string[] {
    if (!isPlatformBrowser(this.platformId) || !config.sideRails) {
      return [];
    }

    const view = this.document.defaultView;
    const viewportWidth = this.document.documentElement.clientWidth || view?.innerWidth || 0;
    const minWidth = config.sideRailMinWidth ?? DEFAULT_SIDE_RAIL_MIN_WIDTH;

    if (viewportWidth < minWidth) {
      return [];
    }

    const preferredSide = config.preferredSideRail ?? 'left';
    const singleRailMaxWidth = config.singleSideRailMaxWidth ?? SINGLE_SIDE_RAIL_MAX_WIDTH;
    if (viewportWidth > singleRailMaxWidth) {
      return [config.sideRails.left.fuseId, config.sideRails.right.fuseId];
    }

    const reserveLeftRail = config.reserveLeftRail !== false
      && preferredSide === 'left'
      && viewportWidth <= LEFT_RAIL_RESERVE_MAX_WIDTH;

    if (reserveLeftRail) {
      return [config.sideRails.left.fuseId];
    }

    return [preferredSide === 'right' ? config.sideRails.right.fuseId : config.sideRails.left.fuseId];
  }

  private scheduleSideRailLayout(withRetries = false): void {
    if (!this.adLayoutActive) {
      this.clearAdLayoutGeometry();
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this.sideRailsVisible = false;
      return;
    }

    const view = this.document.defaultView;
    if (!view) {
      this.sideRailsVisible = false;
      return;
    }

    if (this.layoutFrame !== null) {
      view.cancelAnimationFrame(this.layoutFrame);
    }

    this.layoutFrame = view.requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.updateSideRailLayout();
    });

    if (!withRetries) {
      return;
    }

    this.clearLayoutRetryTimers();
    this.layoutRetryTimers = SIDE_RAIL_LAYOUT_RETRY_MS.map(delay => view.setTimeout(() => {
      this.updateSideRailLayout();
    }, delay));
  }

  private updateSideRailLayout(): void {
    if (!this.adLayoutActive) {
      this.clearAdLayoutGeometry();
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this.sideRailsVisible = false;
      return;
    }

    const view = this.document.defaultView;
    if (!view) {
      this.sideRailsVisible = false;
      return;
    }

    const viewportWidth = this.document.documentElement.clientWidth || view.innerWidth;
    const minWidth = this.config.sideRailMinWidth ?? DEFAULT_SIDE_RAIL_MIN_WIDTH;
    const hasConfiguredRail = Boolean(
      this.config.sideRails && (
        this.fallbackPreviewEnabled
        || (this.config.sideRails.left.fuseId && !this.leftSideRailCollapsed)
        || (this.config.sideRails.right.fuseId && !this.rightSideRailCollapsed)
      ),
    );
    if (!this.config.sideRails || !hasConfiguredRail || viewportWidth < minWidth) {
      this.sideRailsVisible = false;
      this.sideRailLayout = 'none';
      this.updateAdShellReservation(false);
      return;
    }

    this.updateAdShellReservation(true, false, viewportWidth);

    const anchor = this.findSideRailAnchor(viewportWidth, view);
    if (!anchor) {
      this.sideRailsVisible = false;
      this.sideRailLayout = 'none';
      this.updateAdShellReservation(false);
      return;
    }

    const verticalAnchor = this.config.sideRailVerticalAnchorSelectors?.length
      ? this.findSideRailAnchor(
        viewportWidth,
        view,
        this.config.sideRailVerticalAnchorSelectors,
      )
      : null;
    const anchorRect = this.getAdRailFrame(anchor.element, anchor.rect, viewportWidth, view);
    const leftGutter = Math.max(0, anchorRect.left);
    const rightGutter = Math.max(0, viewportWidth - anchorRect.right);
    const sideRailOverlay = this.config.sideRailOverlay === true;
    let reserveLeftRail = false;
    let railPlacement = this.resolveSideRailPlacement(
      viewportWidth,
      leftGutter,
      rightGutter,
      sideRailOverlay,
    );
    const reserveCandidate = this.shouldReserveLeftRail(viewportWidth, minWidth, hasConfiguredRail)
      ? this.resolveReservedLeftRailPlacement(viewportWidth)
      : null;

    if (reserveCandidate && railPlacement?.layout !== 'both') {
      reserveLeftRail = true;
      railPlacement = reserveCandidate;
    }

    if (!railPlacement || railPlacement.layout === 'none') {
      this.sideRailsVisible = false;
      this.sideRailLayout = 'none';
      this.updateAdShellReservation(false);
      return;
    }

    this.watchAnchorSize(anchor.element);
    this.sideRailWidth = railPlacement.width;
    this.updateAdShellReservation(
      true,
      reserveLeftRail,
      viewportWidth,
      railPlacement.width,
    );
    const placementAnchor = reserveLeftRail
      ? this.findSideRailAnchor(viewportWidth, view) ?? anchor
      : anchor;
    const placementRect = this.getAdRailFrame(placementAnchor.element, placementAnchor.rect, viewportWidth, view);
    const placementLeftGutter = Math.max(0, placementRect.left);
    const placementRightGutter = Math.max(0, viewportWidth - placementRect.right);
    this.sideRailLeft = sideRailOverlay
      ? SIDE_RAIL_EDGE_GAP
      : this.centerRailInGutter(placementLeftGutter, railPlacement.width);
    this.sideRailRight = sideRailOverlay
      ? SIDE_RAIL_EDGE_GAP
      : this.centerRailInGutter(placementRightGutter, railPlacement.width);
    this.sideRailTop = verticalAnchor
      ? this.centerRailOnAnchor(verticalAnchor.rect, view)
      : this.centerRailInViewportFrame(view);
    this.sideRailLayout = railPlacement.layout;
    this.sideRailsVisible = true;
  }

  private resolveSideRailPlacement(
    viewportWidth: number,
    leftGutter: number,
    rightGutter: number,
    sideRailOverlay: boolean,
  ): { layout: SideRailLayout; width: number } | null {
    const preferredSide = this.config.preferredSideRail ?? 'left';
    let fallbackPlacement: { layout: SideRailLayout; width: number } | null = null;

    for (const width of this.getSideRailWidthCandidates(viewportWidth)) {
      const minimumGutter = sideRailOverlay
        ? 0
        : width + SIDE_RAIL_CONTENT_GAP + SIDE_RAIL_EDGE_GAP;
      const layout = this.resolveSideRailLayout(
        viewportWidth,
        leftGutter,
        rightGutter,
        minimumGutter,
      );

      if (layout !== 'none') {
        const placement = { layout, width };

        if (layout === 'both' || layout === preferredSide) {
          return placement;
        }

        fallbackPlacement ??= placement;
      }
    }

    return fallbackPlacement;
  }

  private resolveReservedLeftRailPlacement(viewportWidth: number): { layout: SideRailLayout; width: number } | null {
    const hasLeftRail = Boolean(
      this.fallbackPreviewEnabled
      || (this.config.sideRails?.left.fuseId && !this.leftSideRailCollapsed),
    );

    if (!hasLeftRail) {
      return null;
    }

    return {
      layout: 'left',
      width: this.getReservedSideRailWidth(viewportWidth),
    };
  }

  private resolveSideRailLayout(
    viewportWidth: number,
    leftGutter: number,
    rightGutter: number,
    minimumGutter: number,
  ): SideRailLayout {
    const hasLeftRail = Boolean(
      this.fallbackPreviewEnabled
      || (this.config.sideRails?.left.fuseId && !this.leftSideRailCollapsed),
    );
    const hasRightRail = Boolean(
      this.fallbackPreviewEnabled
      || (this.config.sideRails?.right.fuseId && !this.rightSideRailCollapsed),
    );
    const leftAvailable = hasLeftRail && leftGutter >= minimumGutter;
    const rightAvailable = hasRightRail && rightGutter >= minimumGutter;
    const singleRailMaxWidth = this.config.singleSideRailMaxWidth ?? SINGLE_SIDE_RAIL_MAX_WIDTH;

    if (this.config.sideRailOverlay) {
      return this.resolveSingleSideRail(hasLeftRail, hasRightRail);
    }

    if (viewportWidth > singleRailMaxWidth && leftAvailable && rightAvailable) {
      return 'both';
    }

    return this.resolveSingleSideRail(leftAvailable, rightAvailable);
  }

  private resolveSingleSideRail(leftAvailable: boolean, rightAvailable: boolean): SideRailLayout {
    const preferredSide = this.config.preferredSideRail ?? 'left';

    if (preferredSide === 'left') {
      return leftAvailable ? 'left' : rightAvailable ? 'right' : 'none';
    }

    return rightAvailable ? 'right' : leftAvailable ? 'left' : 'none';
  }

  private getSideRailWidth(viewportWidth: number): number {
    const singleRailMaxWidth = this.config.singleSideRailMaxWidth ?? SINGLE_SIDE_RAIL_MAX_WIDTH;
    return viewportWidth <= singleRailMaxWidth ? SIDE_RAIL_COMPACT_WIDTH : SIDE_RAIL_WIDE_WIDTH;
  }

  private getReservedSideRailWidth(viewportWidth: number): number {
    const preferredWidth = this.getSideRailWidth(viewportWidth);
    const maxWidth = this.config.sideRailMaxWidth;
    const configuredWidths = this.getConfiguredSideRailWidths();
    const widths = configuredWidths.length
      ? configuredWidths
      : [
        preferredWidth,
        SIDE_RAIL_WIDE_WIDTH,
        SIDE_RAIL_COMPACT_WIDTH,
      ];

    return [...new Set(widths)]
      .filter(width => !maxWidth || width <= maxWidth)[0]
      ?? this.getSideRailWidthCandidates(viewportWidth)[0]
      ?? preferredWidth;
  }

  private getSideRailWidthCandidates(viewportWidth: number): number[] {
    const preferredWidth = this.getSideRailWidth(viewportWidth);
    const widths = this.config.sideRailOverlay
      ? [SIDE_RAIL_WIDE_WIDTH, SIDE_RAIL_COMPACT_WIDTH]
      : [preferredWidth, SIDE_RAIL_WIDE_WIDTH, SIDE_RAIL_COMPACT_WIDTH];
    const maxWidth = this.config.sideRailMaxWidth;
    const configuredWidths = this.getConfiguredSideRailWidths();
    const preferredOrder = configuredWidths.length ? configuredWidths : widths;

    return [...new Set(preferredOrder)]
      .filter(width => !maxWidth || width <= maxWidth);
  }

  private getConfiguredSideRailWidths(): number[] {
    const sizes = [
      ...(this.config.sideRails?.left.sizes ?? []),
      ...(this.config.sideRails?.right.sizes ?? []),
    ];

    const widths = sizes
      .map(size => /^(\d+)x\d+$/.exec(size)?.[1])
      .filter((width): width is string => Boolean(width))
      .map(width => Number(width))
      .filter(width => Number.isFinite(width) && width > 0)
      .filter(width => width <= SIDE_RAIL_WIDE_WIDTH)
      .sort((a, b) => b - a);

    return [...new Set(widths)];
  }

  private shouldReserveLeftRail(viewportWidth: number, minWidth: number, hasConfiguredRail: boolean): boolean {
    const preferredSide = this.config.preferredSideRail ?? 'left';

    return Boolean(
      this.config.sideRails
      && this.config.reserveLeftRail !== false
      && hasConfiguredRail
      && !this.leftSideRailCollapsed
      && preferredSide === 'left'
      && viewportWidth >= minWidth
      && viewportWidth <= LEFT_RAIL_RESERVE_MAX_WIDTH,
    );
  }

  private canPreserveSideRailsForRoute(config: AdRouteConfig): boolean {
    if (!isPlatformBrowser(this.platformId) || !config.sideRails) {
      return false;
    }

    const view = this.document.defaultView;
    const viewportWidth = this.document.documentElement.clientWidth || view?.innerWidth || 0;
    const minWidth = config.sideRailMinWidth ?? DEFAULT_SIDE_RAIL_MIN_WIDTH;

    return viewportWidth >= minWidth;
  }

  private updateAdShellReservation(
    sideRailPage: boolean,
    reserveLeftRail = false,
    viewportWidth?: number,
    reservedRailWidth?: number,
  ): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const root = this.document.documentElement;
    root.classList.toggle(AD_SIDE_RAIL_PAGE_CLASS, sideRailPage);
    root.classList.toggle(AD_LEFT_RAIL_RESERVED_CLASS, reserveLeftRail);

    if (!reserveLeftRail || !viewportWidth) {
      root.style.removeProperty('--ad-left-rail-width');
      root.style.removeProperty('--ad-left-rail-reserve');
      return;
    }

    const railWidth = reservedRailWidth ?? this.getReservedSideRailWidth(viewportWidth);
    const reserve = railWidth + SIDE_RAIL_EDGE_GAP + SIDE_RAIL_CONTENT_GAP;
    root.style.setProperty('--ad-left-rail-width', `${railWidth}px`);
    root.style.setProperty('--ad-left-rail-reserve', `${reserve}px`);
  }

  private findSideRailAnchor(
    viewportWidth: number,
    view: Window,
    selectorOverride?: string[],
  ): { element: HTMLElement; rect: DOMRect } | null {
    const selectors = selectorOverride
      ? selectorOverride
      : this.config.sideRailAnchorSelectors?.length
        ? this.config.sideRailAnchorSelectors
      : DEFAULT_SIDE_RAIL_ANCHOR_SELECTORS;

    if (!selectors.length) {
      return null;
    }

    for (const selector of selectors) {
      const elements = Array.from(this.document.querySelectorAll<HTMLElement>(selector));

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const style = view.getComputedStyle(element);
        const isUsable = rect.width > 0
          && rect.height > 0
          && rect.left >= 0
          && rect.right <= viewportWidth
          && style.display !== 'none'
          && style.visibility !== 'hidden';

        if (isUsable) {
          return { element, rect };
        }
      }
    }

    return null;
  }

  private getAdRailFrame(
    element: HTMLElement,
    rect: DOMRect,
    viewportWidth: number,
    view: Window,
  ): Pick<DOMRect, 'left' | 'right' | 'width'> {
    const paddedRect = this.getContentBoxFrame(element, rect, view);
    const maxWidth = this.config.sideRailAnchorMaxWidth;
    if (
      !maxWidth
      || paddedRect.width <= maxWidth
      || this.document.documentElement.classList.contains(AD_LEFT_RAIL_RESERVED_CLASS)
    ) {
      return paddedRect;
    }

    const width = Math.min(maxWidth, viewportWidth);
    const left = Math.round((viewportWidth - width) / 2);
    return {
      left,
      right: left + width,
      width,
    };
  }

  private getContentBoxFrame(
    element: HTMLElement,
    rect: DOMRect,
    view: Window,
  ): Pick<DOMRect, 'left' | 'right' | 'width'> {
    const style = view.getComputedStyle(element);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const left = rect.left + paddingLeft;
    const right = rect.right - paddingRight;
    const width = Math.max(0, right - left);

    return { left, right, width };
  }

  private centerRailInGutter(gutterWidth: number, railWidth: number): number {
    if (gutterWidth <= railWidth) {
      return Math.max(0, gutterWidth - railWidth);
    }

    const centered = Math.round((gutterWidth - railWidth) / 2);
    const minOffset = gutterWidth >= railWidth + SIDE_RAIL_EDGE_GAP ? SIDE_RAIL_EDGE_GAP : 0;
    const contentBoundedOffset = Math.max(0, gutterWidth - railWidth - SIDE_RAIL_CONTENT_GAP);
    const maxOffset = Math.max(minOffset, contentBoundedOffset);

    return Math.min(Math.max(minOffset, centered), maxOffset);
  }

  private centerRailOnAnchor(anchorRect: DOMRect, view: Window): number {
    const railHeight = this.getRailHeight(view);
    const minCenter = SIDE_RAIL_NAV_OFFSET + SIDE_RAIL_VERTICAL_MARGIN + (railHeight / 2);
    const maxCenter = view.innerHeight - SIDE_RAIL_VERTICAL_MARGIN - (railHeight / 2);
    const anchorCenter = anchorRect.top + (anchorRect.height / 2);

    return Math.round(Math.min(Math.max(anchorCenter, minCenter), maxCenter));
  }

  private centerRailInViewportFrame(view: Window): number {
    const railHeight = this.getRailHeight(view);
    const frameTop = this.getViewportFrameTop(view);
    const frameBottom = this.getViewportFrameBottom(view);
    const frameCenter = frameTop + ((frameBottom - frameTop) / 2);
    const minCenter = frameTop + (railHeight / 2);
    const maxCenter = frameBottom - (railHeight / 2);

    if (minCenter > maxCenter) {
      return Math.round(frameCenter);
    }

    return Math.round(Math.min(Math.max(frameCenter, minCenter), maxCenter));
  }

  private getRailHeight(view: Window): number {
    return Math.min(
      SIDE_RAIL_MAX_HEIGHT,
      Math.max(SIDE_RAIL_MIN_HEIGHT, view.innerHeight - SIDE_RAIL_NAV_OFFSET - 120),
    );
  }

  private getViewportFrameTop(view: Window): number {
    const fallbackTop = SIDE_RAIL_NAV_OFFSET + SIDE_RAIL_VERTICAL_MARGIN;

    for (const selector of SIDE_RAIL_FRAME_TOP_SELECTORS) {
      const element = this.document.querySelector<HTMLElement>(selector);
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const style = view.getComputedStyle(element);
      const isVisible = rect.height > 0
        && rect.bottom > SIDE_RAIL_NAV_OFFSET
        && rect.top < view.innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden';

      if (isVisible) {
        return Math.max(fallbackTop, Math.round(rect.bottom + SIDE_RAIL_VERTICAL_MARGIN));
      }
    }

    return fallbackTop;
  }

  private getViewportFrameBottom(view: Window): number {
    return view.innerHeight - SIDE_RAIL_VERTICAL_MARGIN;
  }

  private watchAnchorSize(anchor: HTMLElement): void {
    if (this.observedAnchor === anchor || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.disconnectAnchorObserver();
    this.observedAnchor = anchor;
    this.resizeObserver = new ResizeObserver(() => this.scheduleSideRailLayout());
    this.resizeObserver.observe(anchor);
  }

  private cancelSideRailLayout(): void {
    if (isPlatformBrowser(this.platformId)) {
      const view = this.document.defaultView;
      if (view && this.layoutFrame !== null) {
        view.cancelAnimationFrame(this.layoutFrame);
      }
    }

    this.layoutFrame = null;
    this.clearLayoutRetryTimers();
    this.disconnectAnchorObserver();
  }

  private clearLayoutRetryTimers(): void {
    if (isPlatformBrowser(this.platformId)) {
      const view = this.document.defaultView;
      if (view) {
        this.layoutRetryTimers.forEach(timer => view.clearTimeout(timer));
      }
    }

    this.layoutRetryTimers = [];
  }

  private disconnectAnchorObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedAnchor = null;
  }

  private clearAdLayoutGeometry(): void {
    this.sideRailsVisible = false;
    this.sideRailLayout = 'none';
    this.leftSideRailCollapsed = false;
    this.rightSideRailCollapsed = false;
    this.cancelSideRailLayout();
    this.updateAdShellReservation(false);
  }
}
