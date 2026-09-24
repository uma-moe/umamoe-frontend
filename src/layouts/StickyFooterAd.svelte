<script lang="ts">
  import { onMount } from 'svelte';
  import { isElementVisible } from '@/lib/element-visibility';
  import { fuseEnabled } from '@/services/ads/fuse-ads';

  const containers = '.publift-widget-sticky_footer-container, .publift-widget-scrolling_sticky_footer-container';
  const providerButton = '.publift-widget-sticky_footer-button, .publift-widget-scrolling_sticky_footer-button';

  onMount(() => {
    if (!fuseEnabled()) return;
    const destroyed = new WeakSet<HTMLElement>();
    const observed = new WeakSet<HTMLElement>();
    const shown = new WeakSet<Element>();
    const frames = new Set<HTMLIFrameElement>();
    let resizeFrame = 0;
    const sizes = new ResizeObserver(() => {
      // Closing changes layout; apply it outside the observer's delivery cycle.
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(sync);
    });
    const dismissed = () => document.documentElement.classList.contains('footer-ad-dismissed');
    const dismiss = () => {
      if (dismissed()) return;
      // Document state survives SPA navigation, but resets on a fresh page load.
      document.documentElement.classList.add('footer-ad-dismissed');
      sync();
    };
    const destroy = (container: Element) => {
      // Let Publift stop rotation/refresh and restore any page offsets before destroying the zone.
      if (!container.classList.contains('closed')) container.querySelector<HTMLElement>(providerButton)?.click();
      container.querySelectorAll<HTMLElement>('[data-fuse][id]').forEach(zone => {
        if (destroyed.has(zone) || !window.fusetag?.destroyZone) return;
        destroyed.add(zone);
        window.fusetag.destroyZone(zone.id);
      });
    };
    const sync = () => {
      let footerHeight = 0;
      document.querySelectorAll<HTMLElement>(containers).forEach(container => {
        if (dismissed()) {
          destroy(container);
          // Publift retains scroll handlers referencing this wrapper; keep its hidden DOM intact.
          return;
        }
        if (!observed.has(container)) {
          observed.add(container);
          container.classList.add('uma-footer-ad');
          observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
        }
        const creatives = [...container.querySelectorAll('iframe')];
        const visible = creatives.filter(frame => frame.clientWidth > 1 && frame.clientHeight > 1 && isElementVisible(frame, { visibilityProperty: true }));
        // A retained creative that is hidden/collapsed is a close, not a replacement during refresh.
        if (shown.has(container) && (container.classList.contains('closed') ||
          !visible.length && creatives.some(frame => shown.has(frame)) && isElementVisible(container, { visibilityProperty: true }))) {
          dismiss();
          return;
        }
        if (visible.length && !container.classList.contains('closed')) {
          shown.add(container);
          visible.forEach(frame => shown.add(frame));
          const height = `${Math.max(...visible.map(frame => frame.clientHeight))}px`;
          if (container.style.getPropertyValue('--footer-creative-height') !== height) container.style.setProperty('--footer-creative-height', height);
        }
        const empty = !visible.length || container.classList.contains('closed');
        if (container.classList.contains('footer-ad-empty') !== empty) container.classList.toggle('footer-ad-empty', empty);
        if (!empty) footerHeight = Math.max(footerHeight, container.getBoundingClientRect().height);
        for (const frame of creatives) if (!frames.has(frame)) { frames.add(frame); sizes.observe(frame); }
        if (container.querySelector('.footer-ad-close')) return;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'footer-ad-close';
        close.setAttribute('aria-label', 'Close footer ad');
        close.title = 'Close footer ad';
        close.textContent = '×';
        close.onclick = dismiss;
        container.append(close);
      });
      document.documentElement.style.setProperty('--footer-ad-height', `${footerHeight}px`);
      for (const frame of frames) {
        if (!frame.isConnected) { sizes.unobserve(frame); frames.delete(frame); }
      }
    };
    const observer = new MutationObserver(records => {
      // Scrolling creatives change margin-top continuously; only visibility changes need a rescan.
      if (records.some(record => record.type === 'childList' || record.attributeName !== 'style' ||
        record.target instanceof HTMLElement && (record.target.style.display === 'none' || record.target.style.visibility === 'hidden'))) sync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const positions = new WeakMap<HTMLElement, { x: number; y: number }>();
    const scrollTimeline = (event: Event) => {
      const board = event.target;
      if (!(board instanceof HTMLElement) || !board.matches('.timeline-board.desktop')) return;
      const previous = positions.get(board);
      positions.set(board, { x: board.scrollLeft, y: board.scrollTop });
      if (!previous || dismissed()) return;
      const dx = board.scrollLeft - previous.x, dy = board.scrollTop - previous.y;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      document.querySelectorAll<HTMLElement>('.uma-footer-ad > .publift-widget-scrolling_sticky_footer').forEach(widget => {
        const slot = widget.querySelector<HTMLElement>('.fuse-slot-sticky');
        const frame = widget.querySelector('iframe');
        if (!slot || !frame) return;
        const range = Math.max(0, frame.offsetHeight - widget.clientHeight);
        if (!range) return;
        // Match the publisher's gradual reveal while the timeline scrolls inside the page.
        const offset = -(parseFloat(getComputedStyle(slot).marginTop) || 0);
        slot.style.marginTop = `${-Math.max(0, Math.min(range, offset + delta * range / (2 * innerHeight)))}px`;
      });
    };
    document.addEventListener('scroll', scrollTimeline, true);
    sync();
    return () => { observer.disconnect(); sizes.disconnect(); cancelAnimationFrame(resizeFrame); document.removeEventListener('scroll', scrollTimeline, true); document.documentElement.style.removeProperty('--footer-ad-height'); };
  });
</script>

<style>
  /* Fit the creative's width while retaining the publisher's scrolling viewport. */
  :global(.uma-footer-ad) {
    position: fixed !important;
    inset: auto auto 0 50% !important;
    width: max-content !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: translateX(-50%) !important;
    overflow: visible !important;
    border: 0 !important;
    background: var(--surface-overlay) !important;
    box-shadow: 0 0 0 1px var(--border-primary), var(--shadow-md) !important;
    z-index: var(--z-rail) !important;
    transition: none !important;
  }
  :global(.uma-footer-ad > :is(.publift-widget-sticky_footer, .publift-widget-scrolling_sticky_footer)),
  :global(.uma-footer-ad .fuse-slot-sticky),
  :global(.uma-footer-ad .fuse-slot) {
    width: max-content !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    transition: none !important;
  }
  :global(.uma-footer-ad > .publift-widget-sticky_footer) { height: auto !important; }
  :global(.uma-footer-ad > .publift-widget-scrolling_sticky_footer) {
    /* Keep the configured window height for tall creatives; shrink to short banners.
       Publift moves .fuse-slot-sticky with margin-top as the page scrolls. */
    max-height: var(--footer-creative-height, none) !important;
    overflow: hidden !important;
  }
  :global(.uma-footer-ad iframe) { vertical-align: bottom; }
  :global(.uma-footer-ad.footer-ad-empty) { opacity: 0 !important; pointer-events: none !important; }
  :global(.uma-footer-ad > [class$='-container-background']),
  :global(.uma-footer-ad > [class$='-button']),
  :global(.uma-footer-ad:not(:has(iframe))),
  :global(html.footer-ad-dismissed :is(.publift-widget-sticky_footer-container, .publift-widget-scrolling_sticky_footer-container)) { display: none !important; }
  :global(.footer-ad-close) {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    color: var(--text-secondary);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }
  :global(.footer-ad-close:hover) { background: var(--surface-2); color: var(--text-primary); }
  :global(html:has(.mobile-bottom-toolbar:not(.is-footer-visible)) .uma-footer-ad) {
    bottom: var(--timeline-toolbar-height) !important;
  }
  @media (max-width: 767px) {
    :global(.footer-ad-close) { top: 2px; right: 2px; width: 28px; height: 28px; border-radius: 4px; font-size: 20px; }
  }
</style>
