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
import { environment } from '../../../environments/environment';

let adSlotId = 0;
const FALLBACK_REVEAL_DELAY_MS = Math.max(environment.fuse.blockingTimeoutMs + 800, 2200);
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
  @Output() close = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();
  @ViewChild('adTarget') private adTarget?: ElementRef<HTMLElement>;

  readonly instanceId = ++adSlotId;
  showFallback = false;
  slotWaiting = true;
  slotCollapsed = false;
  fallbackPreviewEnabled = false;
  private fallbackReady = false;
  private fallbackTimer: number | null = null;
  private lastDebugState = '';
  private mutationObserver: MutationObserver | null = null;
  private slotRenderSub?: Subscription;
  private slotCreativeState: SlotCreativeState = 'pending';
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

  @HostBinding('class.ad-slot-host--collapsed')
  get collapsedHost(): boolean {
    return this.slotCollapsed;
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.watchSlot();
      return;
    }

    window.queueMicrotask(() => this.watchSlot());
  }

  ngOnChanges(changes: SimpleChanges): void {
    const configChanged = changes['config'] && !changes['config'].firstChange;
    const forceFallbackChanged = changes['forceFallback'] && !changes['forceFallback'].firstChange;

    if (configChanged || forceFallbackChanged) {
      this.watchSlot();
    }
  }

  ngOnDestroy(): void {
    this.clearWatchers();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportWidth();
  }

  private watchSlot(): void {
    this.clearWatchers();
    this.showFallback = false;
    this.slotWaiting = true;
    this.setCollapsed(false);
    this.lastDebugState = '';
    this.fallbackPreviewEnabled = this.forceFallback;
    this.fallbackReady = this.fallbackPreviewEnabled;
    this.slotCreativeState = 'pending';
    this.fuseAdsService.debug('slot watch start', {
      instanceId: this.instanceId,
      slotElementId: this.slotElementId,
      placement: this.config.placement,
      fuseId: this.config.fuseId,
      kind: this.config.kind,
      sizes: this.activeSizes,
      forceFallback: this.forceFallback,
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

    this.mutationObserver = new MutationObserver(() => this.updateFallbackState(target));
    this.mutationObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.watchSlotRenderResult(target);

    if (!this.fallbackPreviewEnabled) {
      this.fallbackTimer = window.setTimeout(() => {
        this.fallbackReady = true;
        this.fuseAdsService.debugWarn('slot fallback timeout reached', {
          instanceId: this.instanceId,
          placement: this.config.placement,
          fuseId: this.config.fuseId,
        });
        this.updateFallbackState(target);
      }, FALLBACK_REVEAL_DELAY_MS);
    }

    this.updateFallbackState(target);
  }

  private updateFallbackState(target: HTMLElement): void {
    const hasAdMarkup = this.hasAnyAdMarkup(target);
    const hasLikelyCreativeMarkup = this.hasLikelyCreativeMarkup(target);

    if (this.fallbackPreviewEnabled) {
      this.showFallback = true;
      this.slotWaiting = false;
      this.debugSlotState(target, hasAdMarkup, false, hasLikelyCreativeMarkup);
      return;
    }

    const hasFilledCreative = this.slotCreativeState === 'filled'
      || (this.slotCreativeState !== 'empty' && hasLikelyCreativeMarkup);
    const noFillReady = this.fallbackReady && !hasFilledCreative;
    const canShowBlockedFooterFallback = this.closable
      && this.config.kind === 'sticky-footer'
      && noFillReady
      && Boolean(this.config.fuseId);

    this.showFallback = canShowBlockedFooterFallback;
    const shouldCollapse = noFillReady && !this.showFallback;
    this.setCollapsed(shouldCollapse);
    this.slotWaiting = !hasFilledCreative && !this.showFallback && !shouldCollapse;
    this.debugSlotState(target, hasAdMarkup, shouldCollapse, hasLikelyCreativeMarkup);
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
      showFallback: this.showFallback,
      slotWaiting: this.slotWaiting,
      slotCollapsed: this.slotCollapsed,
      fallbackReady: this.fallbackReady,
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
      showFallback: this.showFallback,
      slotWaiting: this.slotWaiting,
      slotCollapsed: this.slotCollapsed,
      fallbackReady: this.fallbackReady,
      targetRect: this.readRect(target),
      children: this.summarizeChildren(target),
    });
  }

  private watchSlotRenderResult(target: HTMLElement): void {
    this.slotRenderSub = this.fuseAdsService.slotRenderEnded$.subscribe(result => {
      if (!this.isRenderResultForTarget(result, target)) {
        return;
      }

      this.slotCreativeState = result.hasCreative ? 'filled' : 'empty';

      if (!result.hasCreative) {
        this.fallbackReady = true;
        this.clearFallbackTimer();
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
      'iframe, img, picture, video, canvas, object, embed, svg',
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

  private get activeSizes(): string[] {
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

  private updateViewportWidth(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.viewportWidth = 0;
      return;
    }

    this.viewportWidth = window.innerWidth;
  }

  private clearWatchers(): void {
    this.clearFallbackTimer();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.slotRenderSub?.unsubscribe();
    this.slotRenderSub = undefined;
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer !== null && isPlatformBrowser(this.platformId)) {
      window.clearTimeout(this.fallbackTimer);
    }

    this.fallbackTimer = null;
  }
}
