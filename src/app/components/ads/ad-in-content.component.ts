import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, HostBinding, HostListener, Inject, Input, OnChanges, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { FuseAdsService } from '../../services/fuse-ads.service';
import { AdRouteConfig, AdSlotConfig, getAdRouteConfig, getInContentSlot, getMobileRailSlot } from './ad-layout.config';
import { AdSlotComponent } from './ad-slot.component';
import { isAdFallbackPreviewEnabled } from './ad-fallback-preview';

type InlineAdViewport = 'all' | 'desktop' | 'mobile';
const CONTENT_TOP_BRIDGE_MIN_WIDTH = 900;
const CONTENT_TOP_BRIDGE_DEFAULT_MAX_WIDTH = 1319;

@Component({
  selector: 'app-ad-in-content',
  standalone: true,
  imports: [CommonModule, AdSlotComponent],
  template: `
    <section
      class="ad-in-content"
      [class.ad-in-content--content-top-bridge]="isContentTopBridgeActive"
      [class.ad-in-content--interscroller]="isInterscroller"
      [class.ad-in-content--collapsed]="slotCollapsed"
      *ngIf="(inlineAdLayoutActive && config.fuseId) || fallbackPreviewEnabled"
      aria-label="Sponsored content"
    >
      <app-ad-slot
        [config]="config"
        [forceFallback]="fallbackPreviewEnabled"
        (collapsedChange)="slotCollapsed = $event"
      ></app-ad-slot>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .ad-in-content {
      display: flex;
      justify-content: center;
      width: 100%;
      margin: 0.65rem 0;
      contain: layout paint;
    }

    .ad-in-content--content-top-bridge {
      max-width: min(1200px, calc(100vw - 2rem));
      margin: 0.75rem auto;
    }

    .ad-in-content--interscroller {
      margin: 2px 0;
    }

    .ad-in-content--collapsed {
      display: none;
      height: 0;
      margin: 0;
      overflow: hidden;
    }

    :host.ad-in-content-host--mobile {
      display: none;
    }

    :host.ad-in-content-host--desktop {
      display: block;
    }

    :host.ad-in-content-host--content-top-bridge {
      display: none;
    }

    @media (min-width: 900px) and (max-width: 1319px) {
      :host.ad-in-content-host--content-top-bridge {
        display: block;
      }
    }

    @media (max-width: 899px) {
      :host.ad-in-content-host--mobile {
        display: block;
      }

      :host.ad-in-content-host--desktop {
        display: none;
      }

      .ad-in-content {
        margin: 0.55rem 0;
      }

      .ad-in-content--interscroller {
        margin: 2px 0;
      }
    }
  `],
})
export class AdInContentComponent implements OnChanges, OnInit, OnDestroy {
  @Input({ required: true }) surface!: string;
  @Input() label = '';
  @Input() index = 1;
  @Input() viewport: InlineAdViewport = 'all';
  @Input() contentTopBridge = false;

  readonly fallbackPreviewEnabled: boolean;
  config: AdSlotConfig = getInContentSlot('home', 'home', 1);
  slotCollapsed = false;
  private routeConfig: AdRouteConfig = getAdRouteConfig('/');
  private viewportWidth = 0;
  private adsCanRender = false;
  private supportFallbackAllowed = false;
  private adStateSub?: Subscription;

  @HostBinding('class.ad-in-content-host--mobile')
  get mobileOnly(): boolean {
    return this.viewport === 'mobile';
  }

  @HostBinding('class.ad-in-content-host--desktop')
  get desktopOnly(): boolean {
    return this.viewport === 'desktop';
  }

  @HostBinding('class.ad-in-content-host--content-top-bridge')
  get contentTopBridgeHost(): boolean {
    return this.contentTopBridge;
  }

  @HostBinding('class.ad-in-content-host--content-top-bridge-active')
  get contentTopBridgeActiveHost(): boolean {
    return this.isContentTopBridgeActive;
  }

  get isContentTopBridgeActive(): boolean {
    const bridgeMaxWidth = Math.min(
      CONTENT_TOP_BRIDGE_DEFAULT_MAX_WIDTH,
      (this.routeConfig.sideRailMinWidth ?? CONTENT_TOP_BRIDGE_DEFAULT_MAX_WIDTH + 1) - 1,
    );

    return Boolean(
      this.inlineAdLayoutActive
      &&
      this.contentTopBridge
      && this.routeConfig.contentTop
      && this.viewportWidth >= CONTENT_TOP_BRIDGE_MIN_WIDTH
      && this.viewportWidth <= bridgeMaxWidth,
    );
  }

  get isInterscroller(): boolean {
    return this.config.kind === 'interscroller';
  }

  get inlineAdLayoutActive(): boolean {
    return this.fallbackPreviewEnabled || (this.adsCanRender && !this.supportFallbackAllowed);
  }

  constructor(
    private fuseAdsService: FuseAdsService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router,
  ) {
    this.fallbackPreviewEnabled = isAdFallbackPreviewEnabled(this.document);
    this.updateViewportWidth();
  }

  ngOnChanges(): void {
    this.updateConfig();
  }

  ngOnInit(): void {
    this.adStateSub = combineLatest([
      this.fuseAdsService.adsCanRender$,
      this.fuseAdsService.supportFallbackAllowed$,
    ]).subscribe(([adsCanRender, supportFallbackAllowed]) => {
      const previousBridgeState = this.isContentTopBridgeActive;
      this.adsCanRender = adsCanRender;
      this.supportFallbackAllowed = supportFallbackAllowed;

      if (previousBridgeState !== this.isContentTopBridgeActive) {
        this.updateConfig();
      }
    });
  }

  ngOnDestroy(): void {
    this.adStateSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const previousBridgeState = this.isContentTopBridgeActive;
    this.updateViewportWidth();

    if (previousBridgeState !== this.isContentTopBridgeActive) {
      this.updateConfig();
    }
  }

  private updateConfig(): void {
    this.slotCollapsed = false;
    this.routeConfig = getAdRouteConfig(this.router.url);
    const label = this.label || this.surface;

    if (this.isContentTopBridgeActive && this.routeConfig.contentTop) {
      this.config = this.routeConfig.contentTop;
      return;
    }

    this.config = this.viewport === 'mobile'
      ? getMobileRailSlot(this.surface, label, this.index)
      : getInContentSlot(this.surface, label, this.index);
  }

  private updateViewportWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.viewportWidth = CONTENT_TOP_BRIDGE_MIN_WIDTH;
      return;
    }

    const view = this.document.defaultView;
    this.viewportWidth = view?.innerWidth ?? this.document.documentElement.clientWidth;
  }
}
