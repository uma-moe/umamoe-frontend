import {
  AfterViewInit,
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
import { FuseAdsService, FuseSlotRenderResult } from '../../services/fuse-ads.service';

let adSlotId = 0;
const CREATIVE_REFRESH_GRACE_MS = 2400;
const SIZE_PATTERN = /^(\d+)x(\d+)$/;
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
  private emptyCreativeTimer: number | null = null;
  private lastDebugState = '';
  private mutationObserver: MutationObserver | null = null;
  private slotRenderSub?: Subscription;
  private supportFallbackSub?: Subscription;
  private slotCreativeState: SlotCreativeState = 'pending';
  private supportFallbackAllowed = false;
  private slotHasRetainedCreative = false;
  private emptyCreativePending = false;
  private watchSlotQueued = false;
  private preserveQueuedCreative = false;
  private viewportWidth = 0;

  constructor(
    private fuseAdsService: FuseAdsService,
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

    const size = this.getPrimarySize();

    if (!size || !this.usesConfigDrivenSize()) {
      return null;
    }

    return `min(${size.width}px, calc(100vw - 4px))`;
  }

  get slotHeightStyle(): string | null {
    const size = this.getPrimarySize();

    if (!size || !this.usesConfigDrivenSize()) {
      return null;
    }

    return `${size.height}px`;
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
    this.clearWatchers();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportWidth();
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
    const hasRetainedCreative = preserveCreative
      ? this.retainCurrentCreative() || this.slotHasRetainedCreative
      : false;

    this.showFallback = false;
    this.showDiagnostic = false;
    this.slotWaiting = !hasRetainedCreative;
    this.slotHasCreative = false;
    this.slotRetainingCreative = hasRetainedCreative;
    this.setCollapsed(false);
    this.lastDebugState = '';
    this.fallbackPreviewEnabled = this.forceFallback;
    this.slotCreativeState = hasRetainedCreative ? 'filled' : 'pending';
    this.supportFallbackAllowed = false;
    this.emptyCreativePending = false;

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
    const hasAdMarkup = this.hasAnyAdMarkup(target);
    const hasCurrentCreative = this.hasLikelyCreativeMarkup(target);

    if (hasCurrentCreative && this.slotHasRetainedCreative) {
      this.clearRetainedCreative();
    }

    if (this.fallbackPreviewEnabled) {
      this.showFallback = true;
      this.slotWaiting = false;
      this.slotHasCreative = false;
      this.slotRetainingCreative = false;
      this.debugSlotState(target, hasAdMarkup, false, hasCurrentCreative);
      return;
    }

    const canRetainPreviousCreative = !hasCurrentCreative && this.slotHasRetainedCreative;
    const keepSlotStableDuringRefresh = this.emptyCreativePending && this.slotCreativeState === 'filled';
    const hasDisplayCreative = hasCurrentCreative || canRetainPreviousCreative || keepSlotStableDuringRefresh;
    const hasProtectedCreative = hasDisplayCreative || (
      this.slotCreativeState === 'filled'
      && hasAdMarkup
    );
    const noFillReady = !hasProtectedCreative && (
      this.supportFallbackAllowed || this.slotCreativeState === 'empty'
    );
    const canShowBlockedFooterFallback = this.closable
      && this.config.kind === 'sticky-footer'
      && noFillReady
      && this.supportFallbackAllowed
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
    this.debugSlotState(target, hasAdMarkup, shouldCollapse, hasCurrentCreative);
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
      emptyCreativePending: this.emptyCreativePending,
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
      emptyCreativePending: this.emptyCreativePending,
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
        this.slotCreativeState = 'filled';
      } else {
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

  private hasLikelyCreativeMarkup(target: HTMLElement): boolean {
    const mediaElements = target.querySelectorAll<HTMLElement | SVGElement>(
      this.creativeSelector,
    );

    return Array.from(mediaElements).some(element => this.isVisibleCreativeElement(element));
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
      && this.viewportWidth <= 899
      && this.config.mobileSizes?.length
    ) {
      return this.config.mobileSizes;
    }

    return this.config.sizes;
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

  private updateViewportWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.viewportWidth = 0;
      return;
    }

    this.viewportWidth = window.innerWidth;
  }

  private clearWatchers(): void {
    this.clearEmptyCreativeTimer();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
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
        .filter(node => this.canRetainNode(node) && this.hasCreativeNode(node)),
    );

    if (!currentCreativeNodes.length) {
      return false;
    }

    retained.replaceChildren();

    for (const node of currentCreativeNodes) {
      retained.appendChild(node);
    }

    this.slotHasRetainedCreative = retained.childNodes.length > 0;
    return this.slotHasRetainedCreative;
  }

  private clearRetainedCreative(): void {
    this.retainedTarget?.nativeElement.replaceChildren();
    this.slotHasRetainedCreative = false;
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

  private isCreativeTag(element: Element): boolean {
    return ['iframe', 'img', 'picture', 'video', 'canvas', 'object', 'embed', 'svg']
      .includes(element.tagName.toLowerCase());
  }

  private get creativeSelector(): string {
    return 'iframe, img, picture, video, canvas, object, embed, svg';
  }
}
