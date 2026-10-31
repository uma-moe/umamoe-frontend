import { virtualScrolling } from '@/stores/virtual-scrolling';
import { registerFindSource } from '@/lib/find-loaded';

const revealers = new WeakMap<HTMLElement, (index: number) => Promise<HTMLElement | undefined>>();
export function revealVirtualItem(
  host: HTMLElement,
  index: number
): Promise<HTMLElement | undefined> {
  return revealers.get(host)?.(index) ?? Promise.resolve(undefined);
}

export interface VirtualRange {
  start: number;
  end: number;
}

interface Options<T> {
  items: readonly T[];
  key?: (item: T) => unknown;
  estimate?: number;
  root?: HTMLElement | 'closest' | null;
  active?: boolean;
  onrange: (range: VirtualRange) => void;
  onend?: () => void;
  navigateTo?: number;
  searchText?: (item: T) => string;
}

/** Measured rows, with one viewport prepared in idle time on either side. */
export function virtualScroll<T>(host: HTMLElement, initial: Options<T>) {
  let options = initial,
    items: readonly T[] = [],
    start = 0,
    end = 0;

  let columns = 1,
    gap = 0,
    width = 0,
    offsets = [0],
    dirty = true;

  let frame = 0,
    idle = 0,
    destroyed = false,
    navigation = -1;

  let findIndex: number | undefined;
  let revealGeneration = 0;
  const heights = new Map<number, number>();
  let observed = new Set<HTMLElement>();
  const savedAnchor = host.style.overflowAnchor;
  host.style.overflowAnchor = 'none';
  let root = typeof initial.root === 'object' ? initial.root : null;
  if (initial.root === 'closest') {
    for (let parent = host.parentElement; parent; parent = parent.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        root = parent;
        break;
      }
    }
  }

  const scroller = root ?? window;
  const topSpacer = spacer(),
    bottomSpacer = spacer();

  const resize = new ResizeObserver(() => {
    dirty = true;
    schedule();
  });

  resize.observe(host);
  if (root) resize.observe(root);
  const mutation = new MutationObserver(() => {
    dirty = true;
    schedule();
  });

  mutation.observe(host, { childList: true });
  scroller.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  let enabled = true;
  const unsubscribe = virtualScrolling.subscribe((value) => {
    enabled = value;
    dirty = true;
    schedule();
  });

  async function reveal(index: number): Promise<HTMLElement | undefined> {
    const current = ++revealGeneration;
    findIndex = index;
    navigation = -1;
    schedule();
    for (let attempt = 0; attempt < 8 && !destroyed; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (current !== revealGeneration || destroyed) return;
      const node = host.querySelector<HTMLElement>('[data-virtual-index="' + index + '"]');
      if (!node) continue;
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      schedule();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (current !== revealGeneration || destroyed) return;
      findIndex = undefined;
      navigation = options.navigateTo ?? -1;
      return host.querySelector<HTMLElement>('[data-virtual-index="' + index + '"]') ?? undefined;
    }

    findIndex = undefined;
    return undefined;
  }

  revealers.set(host, reveal);
  const finder = initial.searchText
    ? registerFindSource({
        host,
        count: () => (options.active === false ? 0 : items.length),
        text: (index) => options.searchText?.(items[index]!) ?? '',
        reveal
      })
    : undefined;

  update(initial);

  function total() {
    return Math.max(0, offsets[offsets.length - 1]! - gap);
  }

  function geometry() {
    const rect = host.getBoundingClientRect();
    const scale = rect.width / (parseFloat(getComputedStyle(host).width) || rect.width) || 1;
    return {
      top: ((root ? root.getBoundingClientRect().top + root.clientTop : 0) - rect.top) / scale,
      height: (root?.clientHeight ?? innerHeight) / scale,
      scale
    };
  }

  function update(next: Options<T>) {
    const previous = items;
    options = next;
    items = next.items;
    if (previous !== items) {
      const key = options.key ?? ((item: T) => item);
      if (
        !previous.length ||
        previous.length > items.length ||
        previous.some((item, i) => key(item) !== key(items[i]!))
      ) {
        heights.clear();
        start = end = 0;
        navigation = -1;
      }

      rebuild();
      dirty = true;
      finder?.update();
    }

    schedule();
  }

  function schedule() {
    if (destroyed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function buffer() {
    if (idle || destroyed) return;
    const run = () => {
      idle = 0;
      render(true);
    };

    idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 100 })
        : window.setTimeout(run, 16);
  }

  function render(prepare = false) {
    if (options.active === false || !host.getClientRects().length || !host.clientWidth) return;
    let view = geometry();
    const navigateTo = findIndex ?? options.navigateTo;
    if (!enabled) {
      for (const node of observed) resize.unobserve(node);
      observed.clear();
      topSpacer.remove();
      bottomSpacer.remove();
      host.style.overflowAnchor = savedAnchor;
      if (start !== 0 || end !== items.length) {
        start = 0;
        end = items.length;
        options.onrange({ start, end });
        schedule();
        return;
      }

      if (navigateTo !== undefined && navigateTo >= 0 && navigateTo !== navigation) {
        const target = host.querySelector<HTMLElement>('[data-virtual-index="' + navigateTo + '"]');
        if (target) {
          navigation = navigateTo;
          target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
      }

      if (
        items.length &&
        view.top + 3 * view.height >= host.getBoundingClientRect().height / view.scale
      )
        options.onend?.();
      return;
    }

    host.style.overflowAnchor = 'none';
    const anchor = rowAt(Math.max(0, view.top)),
      anchorItem = anchor * columns,
      anchorOffset = offsets[anchor] ?? 0;

    if (dirty || width !== host.clientWidth) {
      const style = getComputedStyle(host);
      const count = style.display === 'grid' ? style.gridTemplateColumns.split(' ').length : 1;
      if (width !== host.clientWidth || count !== columns) {
        heights.clear();
        width = host.clientWidth;
        columns = count;
      }

      gap = /grid|flex/.test(style.display) ? parseFloat(style.rowGap) || 0 : 0;
      const elements = Array.from(host.children).filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node.hasAttribute('data-virtual-index')
      );

      const current = new Set(elements),
        measured = new Map<number, number>();

      for (const node of observed) if (!current.has(node)) resize.unobserve(node);
      for (const node of elements) {
        if (!observed.has(node)) resize.observe(node);
        const index = Number(node.dataset.virtualIndex),
          css = getComputedStyle(node);

        const height =
          node.getBoundingClientRect().height / view.scale +
          (parseFloat(css.marginTop) || 0) +
          (parseFloat(css.marginBottom) || 0);

        if (height > 0) measured.set(index, (measured.get(index) ?? 0) + height);
      }

      for (const [index, height] of measured) heights.set(index, height);
      observed = current;
      rebuild();
      dirty = false;
    }

    const correction =
      view.top > 0 && view.top < total()
        ? (offsets[Math.floor(anchorItem / columns)] ?? anchorOffset) - anchorOffset
        : 0;

    view.top += correction;
    if (navigateTo !== undefined && navigateTo >= 0 && navigateTo !== navigation && items.length) {
      navigation = navigateTo;
      const row = Math.floor(Math.min(navigation, items.length - 1) / columns);
      const rowTop = offsets[row]!,
        rowBottom = offsets[row + 1]! - gap;

      if (rowTop < view.top || rowBottom > view.top + view.height) {
        const nextTop = rowTop < view.top ? rowTop : rowBottom - view.height;
        updateSpacers();
        scroller.scrollBy({
          top: (nextTop - view.top + correction) * view.scale,
          behavior: 'instant'
        });

        view.top = nextTop;
      }
    } else if (Math.abs(correction) > 0.5) {
      updateSpacers();
      scroller.scrollBy({ top: correction * view.scale, behavior: 'instant' });
    }

    const first = rowAt(Math.max(0, view.top - view.height));
    const last = Math.min(offsets.length - 1, rowAt(Math.max(0, view.top + 2 * view.height)) + 1);
    let nextStart = Math.min(
      rowAt(Math.max(0, view.top)),
      Math.max(first, Math.floor(start / columns))
    );

    let nextEnd = Math.max(
      Math.min(offsets.length - 1, rowAt(Math.max(0, view.top + view.height)) + 1),
      Math.min(last, Math.ceil(end / columns))
    );

    if (prepare) {
      if (nextEnd < last) nextEnd++;
      else if (nextStart > first) nextStart--;
    }

    const pending = nextStart > first || nextEnd < last;
    nextStart *= columns;
    nextEnd = Math.min(items.length, nextEnd * columns);
    if (start !== nextStart || end !== nextEnd) {
      start = nextStart;
      end = nextEnd;
      options.onrange({ start, end });
      dirty = true;
      schedule();
    }

    updateSpacers();
    if (pending) buffer();
    // Check distance on every scroll, measurement and options update, even after jumping past the end.
    if (items.length && view.top + 3 * view.height >= total()) options.onend?.();
  }

  function rebuild() {
    const fallback = unmeasuredHeight();
    offsets = [0];
    for (let index = 0; index < items.length; index += columns) {
      let height = 0;
      for (let column = index; column < Math.min(index + columns, items.length); column++)
        height = Math.max(height, heights.get(column) ?? fallback);
      offsets.push(offsets[offsets.length - 1]! + height + gap);
    }
  }

  /** Items not rendered yet take the mean measured height, so rows taller than the estimate keep the scroll length close. */
  function unmeasuredHeight() {
    if (heights.size === 0) return options.estimate ?? 300;

    let measuredSum = 0;
    for (const height of heights.values()) measuredSum += height;
    return measuredSum / heights.size;
  }

  function rowAt(offset: number) {
    let low = 0,
      high = Math.max(0, offsets.length - 2);

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid + 1]! <= offset) low = mid + 1;
      else high = mid;
    }

    return low;
  }

  function spacer() {
    const node = document.createElement(
      host.tagName === 'TBODY' ? 'tr' : /^(OL|UL)$/.test(host.tagName) ? 'li' : 'div'
    );

    node.setAttribute('aria-hidden', 'true');
    node.style.cssText = 'padding:0;border:0;min-height:0;grid-column:1 / -1;pointer-events:none;';
    if (node instanceof HTMLTableRowElement) {
      const cell = node.insertCell();
      cell.style.cssText = 'padding:0;border:0;height:inherit;';
    }

    return node;
  }

  function updateSpacers() {
    if (host.firstChild !== topSpacer) host.prepend(topSpacer);
    if (host.lastChild !== bottomSpacer) host.append(bottomSpacer);
    if (topSpacer instanceof HTMLTableRowElement && bottomSpacer instanceof HTMLTableRowElement) {
      const span =
        Array.from(host.closest('table')?.rows[0]?.cells ?? [])
          .filter((cell) => getComputedStyle(cell).display !== 'none')
          .reduce((sum, cell) => sum + cell.colSpan, 0) || 1;

      topSpacer.cells[0]!.colSpan = bottomSpacer.cells[0]!.colSpan = span;
    }

    const before = Math.max(0, (offsets[Math.floor(start / columns)] ?? 0) - gap);
    const after = Math.max(0, total() - (offsets[Math.ceil(end / columns)] ?? 0));
    for (const [node, height] of [
      [topSpacer, before],
      [bottomSpacer, after]
    ] as const) {
      node.style.height = `${height}px`;
      node.style.display = height > 0 ? '' : 'none';
    }
  }

  return {
    update,
    destroy() {
      destroyed = true;
      unsubscribe();
      finder?.destroy();
      revealers.delete(host);
      cancelAnimationFrame(frame);
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      else clearTimeout(idle);
      resize.disconnect();
      mutation.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      topSpacer.remove();
      bottomSpacer.remove();
      host.style.overflowAnchor = savedAnchor;
    }
  };
}
