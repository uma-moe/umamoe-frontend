import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Inject,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AdSlotConfig } from './ad-layout.config';
import { FuseAdsService, FuseSlotRenderResult, FuseSlotRenderSize } from '../../services/fuse-ads.service';

let adSlotId = 0;
const CREATIVE_REFRESH_GRACE_MS = 2400;
const CREATIVE_SWAP_DELAY_MS = 1800;
const MARKUP_BIDDING_GRACE_MS = 9000;
const EMPTY_IFRAME_BACKGROUND = 'transparent';
const SIZE_PATTERN = /^(\d+)x(\d+)$/;
const MOBILE_VIEWPORT_MAX_WIDTH = 899;
const MOBILE_INTERSCROLLER_MAX_ASPECT_HEIGHT = 1.15;
const MOBILE_INTERSCROLLER_MAX_HEIGHT = 360;
const INTERSCROLLER_MAX_ASPECT_HEIGHT = 1.15;
const MOBILE_STICKY_FOOTER_MAX_HEIGHT = 50;
const DESKTOP_STICKY_FOOTER_MAX_HEIGHT = 90;
type SlotCreativeState = 'pending' | 'filled' | 'empty';

interface AdSlotSize {
  width: number;
  height: number;
}

@Component({
  selector: 'app-ad-slot',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './ad-slot.component.html',
  styleUrls: ['./ad-slot.component.scss'],
})
export class AdSlotComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) config!: AdSlotConfig;
  @Input() closable = false;
  @Input() forceFallback = false;
  @Input() maxWidth = 0;
  @Output() close = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();
  @ViewChild('slotShell') private slotShell?: ElementRef<HTMLElement>;
  @ViewChild('adTarget') private adTarget?: ElementRef<HTMLElement>;
  @ViewChild('retainedTarget') private retainedTarget?: ElementRef<HTMLElement>;

  readonly instanceId = ++adSlotId;
  showFallback = false;
  showDiagnostic = false;
  slotWaiting = true;
  slotCollapsed = false;
  slotHasCreative = false;
  slotRetainingCreative = false;
  fallbackPreviewEnabled = false;
  creativeCloseInlineOffset: number | null = null;
  private creativeLayoutSize: AdSlotSize | null = null;
  private emptyCreativeTimer: number | null = null;
  private creativeSwapTimer: number | null = null;
  private lastDebugState = '';
  private mutationObserver: MutationObserver | null = null;
  private slotRenderSub?: Subscription;
  private supportFallbackSub?: Subscription;
  private slotCreativeState: SlotCreativeState = 'pending';
  private supportFallbackAllowed = false;
  private slotHasRetainedCreative = false;
  private slotHasUnsupportedCreative = false;
  private slotRenderSize: FuseSlotRenderSize | null = null;
  private emptyCreativePending = false;
  private markupFirstSeenAt: number | null = null;
  private markupGraceTimer: number | null = null;
  private watchSlotQueued = false;
  private preserveQueuedCreative = false;
  private containerInlineWidth = 0;
  private containerResizeObserver: ResizeObserver | null = null;
  private viewportWidth = 0;
  private observedTarget?: HTMLElement;

  constructor(
    private fuseAdsService: FuseAdsService,
    private hostElement: ElementRef<HTMLElement>,
    private changeDetector: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.updateViewportWidth();
  }

  get sizesLabel(): string {
    return this.activeSizes.join(', ');
  }

  get slotElementId(): string {
    return `ad-slot-${this.config.placement}-${this.instanceId}`;
  }

  get slotWidthStyle(): string | null {
    if (this.config.kind === 'side-rail' && this.maxWidth > 0) {
      const largestAllowedWidth = this.getLargestActiveWidth();
      const clampedWidth = largestAllowedWidth
        ? Math.min(this.maxWidth, largestAllowedWidth)
        : this.maxWidth;

      return `${clampedWidth}px`;
    }

    if (this.creativeLayoutSize && this.usesMeasuredCreativeLayout()) {
      return `min(${this.creativeLayoutSize.width}px, 100%)`;
    }

    const layoutSize = this.getInterscrollerLayoutSize();
    if (layoutSize) {
      return `min(${layoutSize.width}px, 100%)`;
    }

    const size = this.getPrimarySize();

    if (!size || !this.usesConfigDrivenSize()) {
      return null;
    }

    return `min(${size.width}px, calc(100vw - 4px))`;
  }

  get slotHeightStyle(): string | null {
    if (this.creativeLayoutSize && this.usesMeasuredCreativeLayout()) {
      return `${this.creativeLayoutSize.height}px`;
    }

    const layoutSize = this.getInterscrollerLayoutSize();
    if (layoutSize) {
      return `${layoutSize.height}px`;
    }

    const size = this.getPrimarySize();

    if (!size || !this.usesConfigDrivenSize()) {
      return null;
    }

    return `${size.height}px`;
  }

  get closeInlineOffsetStyle(): string | null {
    return this.creativeCloseInlineOffset === null
      ? null
      : `${this.creativeCloseInlineOffset}px`;
  }

  get isFallbackStrip(): boolean {
    const size = this.getPrimarySize();
    return Boolean(size && size.height <= 60);
  }

  get isFallbackCompact(): boolean {
    const size = this.getPrimarySize();
    return Boolean(size && size.height > 60 && size.height <= 110);
  }

  get isFallbackCard(): boolean {
    const size = this.getPrimarySize();
    return Boolean(size && size.height >= 180 && size.width <= 340);
  }

  get diagnosticTitle(): string {
    if (this.slotCreativeState === 'empty') {
      return 'No creative returned';
    }

    if (this.supportFallbackAllowed) {
      return 'Ad runtime blocked';
    }

    return 'Waiting for creative';
  }

  get diagnosticDetail(): string {
    if (this.slotCreativeState === 'empty') {
      return 'Publift reported this slot as empty.';
    }

    if (this.supportFallbackAllowed) {
      return 'Fuse did not become available, so this placeholder is shown for debugging.';
    }

    return 'The zone is registered and waiting for Fuse/GAM.';
  }

  @HostBinding('class.ad-slot-host--collapsed')
  get collapsedHost(): boolean {
    return this.slotCollapsed;
  }

  ngAfterViewInit(): void {
    this.observeContainerInlineWidth();
    this.scheduleWatchSlot(false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const configChanged = changes['config'] && !changes['config'].firstChange;
    const forceFallbackChanged = changes['forceFallback'] && !changes['forceFallback'].firstChange;
    const maxWidthChanged = changes['maxWidth'] && !changes['maxWidth'].firstChange;

    if (configChanged || forceFallbackChanged || maxWidthChanged) {
      this.scheduleWatchSlot((configChanged || maxWidthChanged) && !this.forceFallback);
    }
  }

  ngOnDestroy(): void {
    this.storeCreativeForHandoff();
    this.containerResizeObserver?.disconnect();
    this.containerResizeObserver = null;
    this.clearWatchers();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportWidth();
    this.updateContainerInlineWidth();

    if (this.observedTarget) {
      this.updateCreativeCloseOffset(this.observedTarget);
    }
  }

  private scheduleWatchSlot(preserveCreative: boolean): void {
    this.preserveQueuedCreative = this.preserveQueuedCreative || preserveCreative;

    if (!isPlatformBrowser(this.platformId)) {
      const shouldPreserve = this.preserveQueuedCreative;
      this.preserveQueuedCreative = false;
      this.watchSlot(shouldPreserve);
      return;
    }

    if (this.watchSlotQueued) {
      return;
    }

    this.watchSlotQueued = true;
    window.queueMicrotask(() => {
      this.watchSlotQueued = false;
      const shouldPreserve = this.preserveQueuedCreative;
      this.preserveQueuedCreative = false;
      this.watchSlot(shouldPreserve);
    });
  }

  private watchSlot(preserveCreative = false): void {
    this.clearWatchers();
    const hasRetainedCreative = !this.forceFallback && (
      (
        preserveCreative
        && (this.retainCurrentCreative() || this.slotHasRetainedCreative)
      )
      || this.restoreRetainedCreative()
    );

    this.showFallback = false;
    this.showDiagnostic = false;
    this.slotWaiting = !hasRetainedCreative;
    this.slotHasCreative = false;
    this.slotRetainingCreative = hasRetainedCreative;
    this.creativeCloseInlineOffset = null;
    this.creativeLayoutSize = null;
    this.setCollapsed(false);
    this.lastDebugState = '';
    this.fallbackPreviewEnabled = this.forceFallback;
    this.slotCreativeState = hasRetainedCreative ? 'filled' : 'pending';
    this.supportFallbackAllowed = false;
    this.slotHasUnsupportedCreative = false;
    this.slotRenderSize = null;
    this.emptyCreativePending = false;
    this.markupFirstSeenAt = null;

    if (!hasRetainedCreative) {
      this.clearRetainedCreative();
    }

    this.fuseAdsService.debug('slot watch start', {
      instanceId: this.instanceId,
      slotElementId: this.slotElementId,
      placement: this.config.placement,
      fuseId: this.config.fuseId,
      kind: this.config.kind,
      sizes: this.activeSizes,
      configuredSizes: this.config.sizes,
      maxWidth: this.maxWidth,
      slotWidthStyle: this.slotWidthStyle,
      forceFallback: this.forceFallback,
      hasRetainedCreative,
    });

    if (!isPlatformBrowser(this.platformId) || !this.adTarget?.nativeElement) {
      this.fuseAdsService.debugWarn('slot watch skipped', {
        instanceId: this.instanceId,
        placement: this.config.placement,
        isBrowser: isPlatformBrowser(this.platformId),
        hasTarget: Boolean(this.adTarget?.nativeElement),
      });
      return;
    }

    const target = this.adTarget.nativeElement;
    this.observedTarget = target;

    this.fuseAdsService.registerZone(this.slotElementId, this.config.fuseId);
    this.fuseAdsService.requestSlotPageInit(this.config.fuseId, `slot registered:${this.config.placement}`);

    this.mutationObserver = new MutationObserver(records => {
      this.retainRemovedCreative(records);
      this.updateFallbackState(target);
    });
    this.mutationObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.watchSlotRenderResult(target);
    this.watchSupportFallbackState(target);

    this.updateFallbackState(target);
  }

  private updateFallbackState(target: HTMLElement): void {
    this.prepareIframeSurfaces(target);
    const hasAdMarkup = this.hasAnyAdMarkup(target);
    const hasCurrentCreative = this.hasLikelyCreativeMarkup(target);
    const hasUnsupportedCreative = (!hasCurrentCreative && this.hasUnsupportedCreativeMarkup(target))
      || this.hasUnsupportedRenderedSize();
    const hasRetainedCreative = this.hasVisibleRetainedCreative();
    this.slotHasUnsupportedCreative = hasUnsupportedCreative;
    this.updateCreativeLayoutSize(target);

    if (hasCurrentCreative && this.slotHasRetainedCreative) {
      this.scheduleRetainedCreativeClear(target);
    }

    const markupStillBidding = hasUnsupportedCreative
      ? false
      : this.isMarkupStillBidding(target, hasAdMarkup, hasCurrentCreative);

    if (this.fallbackPreviewEnabled) {
      this.showFallback = true;
      this.slotWaiting = false;
      this.slotHasCreative = false;
      this.slotRetainingCreative = false;
      this.creativeCloseInlineOffset = null;
      this.debugSlotState(target, hasAdMarkup, false, hasCurrentCreative);
      return;
    }

    const canRetainPreviousCreative = hasRetainedCreative;
    const keepSlotStableDuringRefresh = this.emptyCreativePending && this.slotCreativeState === 'filled';
    const hasDisplayCreative = hasCurrentCreative || canRetainPreviousCreative || keepSlotStableDuringRefresh;
    const runtimeBlockedWithoutCreative = this.supportFallbackAllowed && !hasDisplayCreative;
    const hasProtectedCreative = hasDisplayCreative
      || (!runtimeBlockedWithoutCreative && markupStillBidding)
      || (!runtimeBlockedWithoutCreative && !hasUnsupportedCreative && this.slotCreativeState === 'filled' && hasAdMarkup);
    const supportFallbackReady = runtimeBlockedWithoutCreative;
    const noFillReady = hasUnsupportedCreative || (!hasProtectedCreative && (
      supportFallbackReady || this.slotCreativeState === 'empty'
    ));
    const canShowBlockedFooterFallback = this.closable
      && this.config.kind === 'sticky-footer'
      && supportFallbackReady
      && Boolean(this.config.fuseId);
    const canShowDiagnostic = noFillReady
      && !canShowBlockedFooterFallback
      && this.fuseAdsService.diagnosticPlaceholdersEnabled;

    this.showFallback = canShowBlockedFooterFallback;
    this.showDiagnostic = canShowDiagnostic;
    const shouldCollapse = noFillReady && !this.showFallback && !this.showDiagnostic;
    this.setCollapsed(shouldCollapse);
    this.slotHasCreative = hasProtectedCreative;
    this.slotRetainingCreative = canRetainPreviousCreative;
    this.slotWaiting = !hasProtectedCreative && !this.showFallback && !this.showDiagnostic && !shouldCollapse;
    this.updateCreativeCloseOffset(target);
    this.debugSlotState(target, hasAdMarkup, shouldCollapse, hasCurrentCreative);
  }

  private updateCreativeLayoutSize(target: HTMLElement): void {
    if (!this.usesMeasuredCreativeLayout()) {
      this.creativeLayoutSize = null;
      return;
    }

    const creative = this.findVisibleCreativeElement(target)
      ?? this.findVisibleCreativeElement(this.retainedTarget?.nativeElement);
    const nextSize = creative ? this.getCreativeLayoutSize(creative) : null;

    if (
      this.creativeLayoutSize?.width === nextSize?.width
      && this.creativeLayoutSize?.height === nextSize?.height
    ) {
      return;
    }

    this.creativeLayoutSize = nextSize;
    this.changeDetector.markForCheck();
  }

  private setCollapsed(collapsed: boolean): void {
    if (this.slotCollapsed === collapsed) {
      return;
    }

    this.slotCollapsed = collapsed;
    this.collapsedChange.emit(collapsed);
  }

  private debugSlotState(
    target: HTMLElement,
    hasAdMarkup: boolean,
    shouldCollapse: boolean,
    hasLikelyCreativeMarkup: boolean,
  ): void {
    const debugState = JSON.stringify({
      hasAdMarkup,
      hasLikelyCreativeMarkup,
      slotCreativeState: this.slotCreativeState,
      supportFallbackAllowed: this.supportFallbackAllowed,
      showFallback: this.showFallback,
      showDiagnostic: this.showDiagnostic,
      slotWaiting: this.slotWaiting,
      slotCollapsed: this.slotCollapsed,
      slotHasCreative: this.slotHasCreative,
      slotRetainingCreative: this.slotRetainingCreative,
      slotHasRetainedCreative: this.slotHasRetainedCreative,
      slotHasUnsupportedCreative: this.slotHasUnsupportedCreative,
      slotRenderSize: this.slotRenderSize,
      emptyCreativePending: this.emptyCreativePending,
      markupFirstSeenAt: this.markupFirstSeenAt,
      childCount: target.children.length,
      textLength: target.textContent?.trim().length ?? 0,
    });

    if (debugState === this.lastDebugState) {
      return;
    }

    this.lastDebugState = debugState;
    this.fuseAdsService.debug(shouldCollapse ? 'slot collapsed after no-fill' : 'slot state changed', {
      instanceId: this.instanceId,
      slotElementId: this.slotElementId,
      placement: this.config.placement,
      fuseId: this.config.fuseId,
      kind: this.config.kind,
      hasAdMarkup,
      hasLikelyCreativeMarkup,
      slotCreativeState: this.slotCreativeState,
      supportFallbackAllowed: this.supportFallbackAllowed,
      showFallback: this.showFallback,
      showDiagnostic: this.showDiagnostic,
      slotWaiting: this.slotWaiting,
      slotCollapsed: this.slotCollapsed,
      slotHasCreative: this.slotHasCreative,
      slotRetainingCreative: this.slotRetainingCreative,
      slotHasRetainedCreative: this.slotHasRetainedCreative,
      slotHasUnsupportedCreative: this.slotHasUnsupportedCreative,
      emptyCreativePending: this.emptyCreativePending,
      markupFirstSeenAt: this.markupFirstSeenAt,
      targetRect: this.readRect(target),
      children: this.summarizeChildren(target),
    });
  }

  private watchSlotRenderResult(target: HTMLElement): void {
    this.slotRenderSub = this.fuseAdsService.slotRenderEnded$.subscribe(result => {
      if (!this.isRenderResultForTarget(result, target)) {
        return;
      }

      if (result.hasCreative) {
        this.clearEmptyCreativeTimer();
        this.emptyCreativePending = false;
        this.slotRenderSize = result.renderSize ?? null;
        this.slotCreativeState = this.hasUnsupportedRenderedSize() ? 'empty' : 'filled';
      } else {
        this.slotRenderSize = null;
        this.deferEmptyCreativeState(target);
      }

      this.fuseAdsService.debug('slot render result matched', {
        instanceId: this.instanceId,
        slotElementId: this.slotElementId,
        placement: this.config.placement,
        fuseId: this.config.fuseId,
        result,
      });
      this.updateFallbackState(target);
    });
  }

  private watchSupportFallbackState(target: HTMLElement): void {
    this.supportFallbackSub = this.fuseAdsService.supportFallbackAllowed$.subscribe(allowed => {
      this.supportFallbackAllowed = allowed;

      this.updateFallbackState(target);
    });
  }

  private isRenderResultForTarget(result: FuseSlotRenderResult, target: HTMLElement): boolean {
    const ids = [result.slotId, result.gptSlotElementId].filter((id): id is string => Boolean(id));

    return ids.some(id => (
      id === this.slotElementId
      || id === target.id
      || Boolean(target.querySelector(`#${this.escapeSelectorId(id)}`))
    ));
  }

  private hasAnyAdMarkup(target: HTMLElement): boolean {
    return target.children.length > 0 || Boolean(target.textContent?.trim());
  }

  private prepareIframeSurfaces(target: HTMLElement): void {
    target.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => {
      iframe.style.backgroundColor = EMPTY_IFRAME_BACKGROUND;
      iframe.style.colorScheme = 'dark';
      iframe.setAttribute('allowtransparency', 'true');

      if (iframe.dataset['umaEmptyFrameStyled'] !== '1') {
        iframe.dataset['umaEmptyFrameStyled'] = '1';
        iframe.addEventListener('load', () => this.applyEmptyIframeBackground(iframe), { passive: true });
      }

      this.applyEmptyIframeBackground(iframe);
    });
  }

  private applyEmptyIframeBackground(iframe: HTMLIFrameElement): void {
    try {
      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) {
        return;
      }

      const body = iframeDocument.body;
      const documentElement = iframeDocument.documentElement;
      const hasVisibleContent = Boolean(body?.textContent?.trim())
        || Boolean(body?.querySelector('img, picture, video, canvas, object, embed, svg, iframe'));

      if (hasVisibleContent) {
        return;
      }

        documentElement.style.background = EMPTY_IFRAME_BACKGROUND;
        if (body) {
          body.style.margin = '0';
          body.style.background = EMPTY_IFRAME_BACKGROUND;
      }
    } catch {
      // Cross-origin creatives cannot be inspected; the iframe element itself still has a dark surface.
    }
  }

  private isMarkupStillBidding(target: HTMLElement, hasAdMarkup: boolean, hasCurrentCreative: boolean): boolean {
    if (!isPlatformBrowser(this.platformId) || !hasAdMarkup || hasCurrentCreative || this.slotCreativeState === 'empty') {
      this.clearMarkupGraceTimer();
      this.markupFirstSeenAt = null;
      return false;
    }

    this.markupFirstSeenAt ??= Date.now();
    const elapsed = Date.now() - this.markupFirstSeenAt;
    const remaining = MARKUP_BIDDING_GRACE_MS - elapsed;

    if (remaining <= 0) {
      this.clearMarkupGraceTimer();
      return false;
    }

    this.scheduleMarkupGraceUpdate(target, remaining);
    return true;
  }

  private hasLikelyCreativeMarkup(target: HTMLElement): boolean {
    return this.getVisibleCreativeElements(target).length > 0;
  }

  private hasUnsupportedCreativeMarkup(target: HTMLElement): boolean {
    const visibleCreativeElements = this.getVisibleCreativeElements(target, false);
    return visibleCreativeElements.some(element => !this.isCreativeShapeAllowed(element));
  }

  private hasUnsupportedRenderedSize(): boolean {
    return Boolean(this.slotRenderSize && !this.isCreativeSizeAllowedForSlot(this.slotRenderSize));
  }

  private hasVisibleRetainedCreative(): boolean {
    const retained = this.retainedTarget?.nativeElement;
    return Boolean(retained && this.hasLikelyCreativeMarkup(retained));
  }

  private updateCreativeCloseOffset(target: HTMLElement): void {
    if (
      !this.closable
      || this.config.kind !== 'sticky-footer'
      || this.showFallback
      || this.showDiagnostic
      || this.slotCollapsed
      || !isPlatformBrowser(this.platformId)
    ) {
      this.creativeCloseInlineOffset = null;
      return;
    }

    const shell = this.slotShell?.nativeElement;
    const retainedCreative = this.findVisibleCreativeElement(this.retainedTarget?.nativeElement);
    const currentCreative = this.findVisibleCreativeElement(target);
    const creative = this.slotRetainingCreative
      ? retainedCreative ?? currentCreative
      : currentCreative ?? retainedCreative;

    if (!shell || !creative) {
      this.creativeCloseInlineOffset = null;
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const creativeRect = creative.getBoundingClientRect();
    const rightGap = shellRect.right - creativeRect.right;

    if (!Number.isFinite(rightGap) || rightGap < -1) {
      this.creativeCloseInlineOffset = null;
      return;
    }

    const inset = 4;
    this.creativeCloseInlineOffset = Math.max(0, Math.round(rightGap + inset));
  }

  private findVisibleCreativeElement(target?: HTMLElement): HTMLElement | SVGElement | null {
    const visibleElements = this.getVisibleCreativeElements(target);

    if (!visibleElements.length) {
      return null;
    }

    return visibleElements.reduce((largest, element) => (
      this.getElementArea(element) > this.getElementArea(largest)
        ? element
        : largest
    ));
  }

  private getCreativeLayoutSize(element: HTMLElement | SVGElement): AdSlotSize | null {
    const sourceSize = this.getCreativeSourceSize(element);

    if (!sourceSize) {
      return null;
    }

    const { width, height } = sourceSize;
    const availableWidth = this.getAvailableInterscrollerWidth();
    const clampedWidth = availableWidth > 0 ? Math.min(width, availableWidth) : width;
    const scale = width > 0 ? clampedWidth / width : 1;
    const scaledHeight = Math.max(1, Math.round(height * scale));
    const clampedHeight = this.clampMeasuredCreativeHeight(clampedWidth, scaledHeight);

    return {
      width: Math.max(1, Math.round(clampedWidth)),
      height: clampedHeight,
    };
  }

  private getCreativeSourceSize(element: HTMLElement | SVGElement): AdSlotSize | null {
    const declaredWidth = this.readElementSizeValue(element, 'width');
    const declaredHeight = this.readElementSizeValue(element, 'height');
    const rect = element.getBoundingClientRect();
    const width = declaredWidth ?? rect.width;
    const height = declaredHeight ?? rect.height;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  private readElementSizeValue(element: HTMLElement | SVGElement, property: 'width' | 'height'): number | null {
    const attributeValue = element.getAttribute(property);
    const parsedAttribute = attributeValue ? Number.parseFloat(attributeValue) : Number.NaN;

    if (Number.isFinite(parsedAttribute) && parsedAttribute > 0) {
      return parsedAttribute;
    }

    const inlineStyleValue = element.style[property];
    const parsedInlineStyle = inlineStyleValue ? Number.parseFloat(inlineStyleValue) : Number.NaN;

    if (Number.isFinite(parsedInlineStyle) && parsedInlineStyle > 0) {
      return parsedInlineStyle;
    }

    const view = element.ownerDocument.defaultView;
    const styleValue = view?.getComputedStyle(element)[property];
    const parsedStyle = styleValue ? Number.parseFloat(styleValue) : Number.NaN;

    return Number.isFinite(parsedStyle) && parsedStyle > 0 ? parsedStyle : null;
  }

  private getVisibleCreativeElements(target?: HTMLElement, requireAllowedShape = true): Array<HTMLElement | SVGElement> {
    if (!target) {
      return [];
    }

    const mediaElements = target.querySelectorAll<HTMLElement | SVGElement>(
      this.creativeSelector,
    );

    return Array.from(mediaElements).filter(element => (
      this.isVisibleCreativeElement(element)
      && (!requireAllowedShape || this.isCreativeShapeAllowed(element))
    ));
  }

  private getElementArea(element: HTMLElement | SVGElement): number {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  private isVisibleCreativeElement(element: HTMLElement | SVGElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      return false;
    }

    const view = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);

    return !style
      || (
        style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
      );
  }

  private isCreativeShapeAllowed(element: HTMLElement | SVGElement): boolean {
    const sourceSize = this.getCreativeSourceSize(element);
    if (!sourceSize) {
      return true;
    }

    return this.isCreativeSizeAllowedForSlot(sourceSize);
  }

  private isCreativeSizeAllowedForSlot(size: AdSlotSize | FuseSlotRenderSize): boolean {
    if (!this.isSizeAllowedByConfiguredSlot(size)) {
      return false;
    }

    if (this.config.kind === 'interscroller') {
      return this.isInterscrollerSizeAllowed(size);
    }

    return true;
  }

  private isSizeAllowedByConfiguredSlot(size: AdSlotSize | FuseSlotRenderSize): boolean {
    const allowedSizes = this.activeSizes
      .map(candidate => this.parseSize(candidate))
      .filter((candidate): candidate is AdSlotSize => Boolean(candidate));

    if (!allowedSizes.length) {
      return true;
    }

    return allowedSizes.some(candidate => this.sizesMatch(candidate, size));
  }

  private sizesMatch(allowed: AdSlotSize, actual: AdSlotSize | FuseSlotRenderSize): boolean {
    const tolerance = 2;
    return Math.abs(allowed.width - actual.width) <= tolerance
      && Math.abs(allowed.height - actual.height) <= tolerance;
  }

  private escapeSelectorId(id: string): string {
    const css = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS;
    return css?.escape
      ? css.escape(id)
      : id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  private summarizeChildren(target: HTMLElement): Array<Record<string, unknown>> {
    return Array.from(target.children).slice(0, 5).map(child => {
      const element = child as HTMLElement;
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || undefined,
        className: element.className || undefined,
        dataFuse: element.getAttribute('data-fuse') || undefined,
        rect: this.readRect(element),
        textLength: element.textContent?.trim().length ?? 0,
      };
    });
  }

  private readRect(element: HTMLElement): { width: number; height: number; top: number; left: number } {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
    };
  }

  private usesConfigDrivenSize(): boolean {
    return this.config.kind === 'interscroller';
  }

  private usesMeasuredCreativeLayout(): boolean {
    return this.config.kind === 'interscroller' || this.config.kind === 'sticky-footer';
  }

  private getPrimarySize(): AdSlotSize | null {
    const match = SIZE_PATTERN.exec(this.activeSizes[0] ?? '');

    if (!match) {
      return null;
    }

    return {
      width: Number(match[1]),
      height: Number(match[2]),
    };
  }

  private getLargestActiveWidth(): number | null {
    return this.activeSizes.reduce<number | null>((largest, size) => {
      const parsed = this.parseSize(size);

      if (!parsed) {
        return largest;
      }

      return largest === null ? parsed.width : Math.max(largest, parsed.width);
    }, null);
  }

  private getInterscrollerLayoutSize(): AdSlotSize | null {
    if (this.config.kind !== 'interscroller') {
      return null;
    }

    const parsedSizes = this.activeSizes
      .map(size => this.parseSize(size))
      .filter((size): size is AdSlotSize => Boolean(size));

    if (!parsedSizes.length) {
      return null;
    }

    const availableWidth = this.getAvailableInterscrollerWidth() || Number.POSITIVE_INFINITY;
    const fittingSizes = parsedSizes.filter(size => size.width <= availableWidth);
    const candidates = fittingSizes.length ? fittingSizes : parsedSizes;

    return candidates.reduce((largest, size) => {
      if (size.height !== largest.height) {
        return size.height > largest.height ? size : largest;
      }

      return size.width > largest.width ? size : largest;
    });
  }

  private get activeSizes(): string[] {
    const maxWidth = Math.max(0, this.maxWidth);

    if (this.config.kind === 'side-rail' && maxWidth > 0) {
      const parsedSizes = this.config.sizes
        .map(size => ({ size, parsed: this.parseSize(size) }))
        .filter(({ parsed }) => parsed);
      const fittingSizes = parsedSizes.filter(({ parsed }) => parsed!.width <= maxWidth).map(({ size }) => size);

      if (fittingSizes.length) {
        return fittingSizes;
      }

      const smallestWidth = parsedSizes.reduce<number | null>((smallest, { parsed }) => (
        smallest === null ? parsed!.width : Math.min(smallest, parsed!.width)
      ), null);

      if (smallestWidth !== null) {
        return parsedSizes.filter(({ parsed }) => parsed!.width === smallestWidth).map(({ size }) => size);
      }

      const nonStandardFittingSizes = this.config.sizes.filter(size => {
        const parsed = this.parseSize(size);
        return !parsed || parsed.width <= maxWidth;
      });

      return nonStandardFittingSizes.length ? nonStandardFittingSizes : this.config.sizes;
    }

    if (
      this.config.kind === 'interscroller'
      && this.viewportWidth > 0
      && this.viewportWidth <= MOBILE_VIEWPORT_MAX_WIDTH
      && this.config.mobileSizes?.length
    ) {
      const mobileMaxWidth = this.getAvailableInterscrollerWidth();
      const fittingMobileSizes = this.config.mobileSizes.filter(size => {
        const parsed = this.parseSize(size);
        return !parsed || (
          parsed.width <= mobileMaxWidth
          && this.isMobileInterscrollerSizeAllowed(parsed)
        );
      });

      if (fittingMobileSizes.length) {
        return fittingMobileSizes;
      }

      const allowedMobileSizes = this.config.mobileSizes.filter(size => {
        const parsed = this.parseSize(size);
        return !parsed || this.isMobileInterscrollerSizeAllowed(parsed);
      });

      return allowedMobileSizes.length ? allowedMobileSizes : this.config.mobileSizes;
    }

    return this.config.sizes;
  }

  private getAvailableInterscrollerWidth(): number {
    const measuredWidth = this.containerInlineWidth > 0
      ? this.containerInlineWidth
      : this.viewportWidth;

    if (this.viewportWidth <= 340 && measuredWidth >= 300) {
      return 300;
    }

    return Math.max(0, Math.floor(measuredWidth));
  }

  private parseSize(size: string): AdSlotSize | null {
    const match = SIZE_PATTERN.exec(size);

    if (!match) {
      return null;
    }

    return {
      width: Number(match[1]),
      height: Number(match[2]),
    };
  }

  private isMobileInterscrollerSizeAllowed(size: AdSlotSize): boolean {
    return this.isInterscrollerSizeAllowed(size)
      && size.height <= this.getMaxMobileInterscrollerHeight(size.width);
  }

  private isInterscrollerSizeAllowed(size: AdSlotSize): boolean {
    return size.height <= Math.round(size.width * INTERSCROLLER_MAX_ASPECT_HEIGHT);
  }

  private clampMeasuredCreativeHeight(width: number, height: number): number {
    if (this.config.kind === 'sticky-footer') {
      return Math.min(height, this.getStickyFooterMaxHeight());
    }

    if (this.config.kind === 'interscroller' && this.viewportWidth <= MOBILE_VIEWPORT_MAX_WIDTH) {
      return Math.min(height, this.getMaxMobileInterscrollerHeight(width));
    }

    return height;
  }

  private getMaxMobileInterscrollerHeight(width: number): number {
    return Math.min(
      MOBILE_INTERSCROLLER_MAX_HEIGHT,
      Math.max(100, Math.round(width * MOBILE_INTERSCROLLER_MAX_ASPECT_HEIGHT)),
    );
  }

  private getStickyFooterMaxHeight(): number {
    return this.viewportWidth > 0 && this.viewportWidth <= 720
      ? MOBILE_STICKY_FOOTER_MAX_HEIGHT
      : DESKTOP_STICKY_FOOTER_MAX_HEIGHT;
  }

  private updateViewportWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.viewportWidth = 0;
      return;
    }

    this.viewportWidth = window.innerWidth;
  }

  private observeContainerInlineWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.updateContainerInlineWidth();

    const container = this.hostElement.nativeElement.parentElement;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.containerResizeObserver = new ResizeObserver(() => {
      const previousWidth = this.containerInlineWidth;
      this.updateContainerInlineWidth();

      if (previousWidth === this.containerInlineWidth) {
        return;
      }

      this.changeDetector.markForCheck();
      this.scheduleWatchSlot(true);
    });
    this.containerResizeObserver.observe(container);
  }

  private updateContainerInlineWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.containerInlineWidth = 0;
      return;
    }

    const container = this.hostElement.nativeElement.parentElement;
    const rect = container?.getBoundingClientRect();
    this.containerInlineWidth = rect?.width && Number.isFinite(rect.width)
      ? Math.max(0, Math.floor(rect.width))
      : 0;
  }

  private clearWatchers(): void {
    this.clearEmptyCreativeTimer();
    this.clearCreativeSwapTimer();
    this.clearMarkupGraceTimer();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.observedTarget = undefined;
    this.slotRenderSub?.unsubscribe();
    this.slotRenderSub = undefined;
    this.supportFallbackSub?.unsubscribe();
    this.supportFallbackSub = undefined;
  }

  private deferEmptyCreativeState(target: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.slotCreativeState = 'empty';
      return;
    }

    this.clearEmptyCreativeTimer();
    this.emptyCreativePending = true;
    this.emptyCreativeTimer = window.setTimeout(() => {
      this.emptyCreativeTimer = null;
      this.emptyCreativePending = false;
      const hasCurrentCreative = this.hasLikelyCreativeMarkup(target);

      this.slotCreativeState = hasCurrentCreative ? 'filled' : 'empty';

      this.updateFallbackState(target);
    }, CREATIVE_REFRESH_GRACE_MS);
  }

  private clearEmptyCreativeTimer(): void {
    if (this.emptyCreativeTimer !== null && isPlatformBrowser(this.platformId)) {
      window.clearTimeout(this.emptyCreativeTimer);
    }

    this.emptyCreativeTimer = null;
    this.emptyCreativePending = false;
  }

  private scheduleRetainedCreativeClear(target: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId) || this.creativeSwapTimer !== null) {
      return;
    }

    this.creativeSwapTimer = window.setTimeout(() => {
      this.creativeSwapTimer = null;

      if (this.hasLikelyCreativeMarkup(target)) {
        this.clearRetainedCreative();
      }

      this.updateFallbackState(target);
    }, CREATIVE_SWAP_DELAY_MS);
  }

  private clearCreativeSwapTimer(): void {
    if (this.creativeSwapTimer !== null && isPlatformBrowser(this.platformId)) {
      window.clearTimeout(this.creativeSwapTimer);
    }

    this.creativeSwapTimer = null;
  }

  private scheduleMarkupGraceUpdate(target: HTMLElement, delay: number): void {
    if (!isPlatformBrowser(this.platformId) || this.markupGraceTimer !== null) {
      return;
    }

    this.markupGraceTimer = window.setTimeout(() => {
      this.markupGraceTimer = null;
      this.updateFallbackState(target);
    }, Math.max(0, delay));
  }

  private clearMarkupGraceTimer(): void {
    if (this.markupGraceTimer !== null && isPlatformBrowser(this.platformId)) {
      window.clearTimeout(this.markupGraceTimer);
    }

    this.markupGraceTimer = null;
  }

  private retainRemovedCreative(records: MutationRecord[]): void {
    const retained = this.retainedTarget?.nativeElement;
    if (!retained) {
      return;
    }

    const removedNodes = records
      .filter(record => record.type === 'childList')
      .flatMap(record => Array.from(record.removedNodes))
      .filter(node => this.canRetainNode(node) && this.hasCreativeNode(node));
    const removedCreativeNodes = this.getTopLevelRemovedNodes(removedNodes);

    if (!removedCreativeNodes.length) {
      return;
    }

    retained.replaceChildren();

    for (const node of removedCreativeNodes) {
      retained.appendChild(node);
    }

    this.slotHasRetainedCreative = retained.childNodes.length > 0;
  }

  private retainCurrentCreative(): boolean {
    const target = this.adTarget?.nativeElement;
    const retained = this.retainedTarget?.nativeElement;

    if (!target || !retained) {
      return false;
    }

    const currentCreativeNodes = this.getTopLevelRemovedNodes(
      Array.from(target.childNodes)
        .filter(node => this.canRetainNode(node) && this.hasVisibleCreativeNode(node)),
    );

    if (!currentCreativeNodes.length) {
      return false;
    }

    retained.replaceChildren();

    for (const node of currentCreativeNodes) {
      retained.appendChild(node);
    }

    this.slotHasRetainedCreative = this.hasLikelyCreativeMarkup(retained);
    return this.slotHasRetainedCreative;
  }

  private restoreRetainedCreative(): boolean {
    const retained = this.retainedTarget?.nativeElement;

    if (!retained) {
      return false;
    }

    const restored = this.fuseAdsService.takeRetainedCreative(this.retentionKey, retained);
    this.slotHasRetainedCreative = restored && this.hasLikelyCreativeMarkup(retained);

    if (restored && !this.slotHasRetainedCreative) {
      retained.replaceChildren();
    }

    return this.slotHasRetainedCreative;
  }

  private storeCreativeForHandoff(): void {
    if (!isPlatformBrowser(this.platformId) || this.forceFallback) {
      return;
    }

    const nodes = this.collectRetainableCreativeNodes();
    if (!nodes.length) {
      return;
    }

    this.fuseAdsService.storeRetainedCreative(this.retentionKey, nodes, this.getRetentionFrame());
    this.slotHasRetainedCreative = false;
  }

  private clearRetainedCreative(): void {
    this.clearCreativeSwapTimer();
    this.retainedTarget?.nativeElement.replaceChildren();
    this.slotHasRetainedCreative = false;
  }

  private collectRetainableCreativeNodes(): Node[] {
    const retained = this.retainedTarget?.nativeElement;
    const retainedNodes = retained
      ? this.getTopLevelRemovedNodes(
        Array.from(retained.childNodes)
          .filter(node => this.canRetainNode(node) && this.hasVisibleCreativeNode(node)),
      )
      : [];

    if (retainedNodes.length) {
      return retainedNodes;
    }

    const target = this.adTarget?.nativeElement;
    if (!target) {
      return [];
    }

    return this.getTopLevelRemovedNodes(
      Array.from(target.childNodes)
        .filter(node => this.canRetainNode(node) && this.hasVisibleCreativeNode(node)),
    );
  }

  private getRetentionFrame(): { left: number; top: number; width: number; height: number } | undefined {
    const element = this.slotShell?.nativeElement ?? this.hostElement.nativeElement;
    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  private canRetainNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    return tagName !== 'script' && tagName !== 'style';
  }

  private getTopLevelRemovedNodes(nodes: Node[]): Node[] {
    return nodes.filter(node => !nodes.some(candidate => (
      candidate !== node
      && candidate.nodeType === Node.ELEMENT_NODE
      && node.nodeType === Node.ELEMENT_NODE
      && (candidate as Element).contains(node as Element)
    )));
  }

  private hasCreativeNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as HTMLElement;
    return this.isCreativeTag(element) || Boolean(element.querySelector(this.creativeSelector));
  }

  private hasVisibleCreativeNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as HTMLElement;
    if (this.isCreativeTag(element) && this.isVisibleCreativeElement(element)) {
      return true;
    }

    return Array.from(element.querySelectorAll<HTMLElement | SVGElement>(this.creativeSelector))
      .some(creative => this.isVisibleCreativeElement(creative));
  }

  private isCreativeTag(element: Element): boolean {
    return ['iframe', 'img', 'picture', 'video', 'canvas', 'object', 'embed', 'svg']
      .includes(element.tagName.toLowerCase());
  }

  private get creativeSelector(): string {
    return 'iframe, img, picture, video, canvas, object, embed, svg';
  }

  private get retentionKey(): string {
    const placement = this.config.placement.toLowerCase();

    if (this.config.kind === 'side-rail') {
      if (/(^|_)(right|rhs)(_|$)/.test(placement)) {
        return 'side-rail:right';
      }

      return 'side-rail:left';
    }

    if (this.config.kind === 'sticky-footer') {
      return 'sticky-footer';
    }

    if (placement.includes('content_top') || placement.includes('header')) {
      return 'content-top';
    }

    return `${this.config.kind}:${this.config.placement}`;
  }
}
