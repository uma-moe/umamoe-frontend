<script lang="ts">
  import { flushSync, onMount, tick, untrack, type Snippet } from 'svelte';
  import Icon from '@/components/Icon.svelte';
  import { virtualScrolling } from '@/stores/virtual-scrolling';
  import { virtualScroll, revealVirtualItem, type VirtualRange } from '@/lib/virtual-scroll';
  import { registerFindSource } from '@/lib/find-loaded';
  import AdRegion from '@/layouts/AdRegion.svelte';
  import { buildTimelineFeed, LANE_STEP, LANE_WIDTH, timelineDateKey, timelineMonths, timelinePosition, type TimelineAnniversary, type TimelineLane, type TimelineMarker } from '@/lib/timeline/timeline-layout';
  import type { TimelineRecord } from './timeline-repository';

  let { lanes, events, anniversaries, end, now, mobile, view, card, compact = true, active = true }: {
    lanes: TimelineLane[]; events: TimelineRecord[]; anniversaries: TimelineAnniversary[]; end: Date; now: Date;
    mobile: boolean; view: 'horizontal' | 'vertical'; card: Snippet<[TimelineRecord, boolean]>; compact?: boolean; active?: boolean;
  } = $props();
  const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
  let board = $state<HTMLElement>();
  let feed = $state<HTMLElement>();
  let laneRanges = $state.raw<Record<string, VirtualRange>>({});
  let scrollLeft = $state(0), scrollTop = $state(0), viewportWidth = $state(1500), viewportHeight = $state(800), pageY = $state(0), feedTop = $state(0);
  let measured = $state.raw<Record<string, number>>({});
  let pendingHeights: Record<string, number> = {}, measurementFrame = 0;
  let measuredLaneHeight = $state(0);
  let initialized = $state(false);
  let imagesReady = $state(false);
  let initialToday = false;
  let savedHorizontal = 0, savedVertical = 0;
  let drag: { x: number; y: number; lastX: number; lastY: number; time: number; vx: number; vy: number } | undefined;
  let suppressClick = false;
  let dragging = $state(false);
  let momentum = 0, frame = 0;
  const months = $derived(timelineMonths(lanes, compact));
  const columns = $derived(Math.max(1, Math.floor((viewportWidth - 160 + 12) / (LANE_WIDTH + 12))));
  const laneHeight = (lane: TimelineLane) => 32 + Math.ceil((lane.events.length + lane.markers.length) / columns) * 195;
  const monthLaneOffsets = $derived(months.groups.map(month => {
    const offsets = [0];
    for (const lane of month.lanes) offsets.push(offsets.at(-1)! + (measured[`d:${viewportWidth}:${lane.key}`] ?? laneHeight(lane)));
    return offsets;
  }));
  function verticalWindow(monthIndex: number) {
    const offsets = monthLaneOffsets[monthIndex]!;
    if (!$virtualScrolling) return { first: 0, last: offsets.length - 1 };
    const top = scrollTop - monthOffsets[monthIndex]! - 56;
    const start = offsets.findIndex(offset => offset > Math.max(0, top - viewportHeight));
    const first = start < 0 ? Math.max(0, offsets.length - 2) : Math.max(0, start - 1);
    const end = offsets.findIndex(offset => offset > top + 2 * viewportHeight);
    const last = end < 0 ? offsets.length - 1 : end;
    return { first, last };
  }
  const monthOffsets = $derived.by(() => {
    const result = [0];
    for (const offsets of monthLaneOffsets) result.push(result.at(-1)! + 68 + offsets.at(-1)!);
    return result;
  });
  const firstMonth = $derived.by(() => {
    if (!$virtualScrolling) return 0;
    const index = monthOffsets.findIndex(offset => offset > Math.max(0, scrollTop - viewportHeight));
    return index < 0 ? Math.max(0, months.groups.length - 1) : Math.max(0, index - 1);
  });
  const lastMonth = $derived.by(() => { if (!$virtualScrolling) return months.groups.length; const index = monthOffsets.findIndex(offset => offset > scrollTop + 2 * viewportHeight); return index < 0 ? months.groups.length : index; });
  const width = $derived((lanes.at(-1)?.position ?? 0) + LANE_WIDTH + 48);
  // Keep one screen mounted before and after the visible lanes.
  const firstLane = $derived.by(() => { const index = lanes.findIndex(lane => lane.position + LANE_WIDTH >= scrollLeft - viewportWidth); return index < 0 ? lanes.length : index; });
  const lastLane = $derived.by(() => { const index = lanes.findIndex(lane => lane.position > scrollLeft + 2 * viewportWidth); return index < 0 ? lanes.length : index; });
  const visibleLanes = $derived($virtualScrolling ? lanes.slice(firstLane, lastLane) : lanes);
  const todayPosition = $derived(timelinePosition(lanes, now));
  const nearestLane = (date: Date) => lanes.reduce<TimelineLane | undefined>((best, lane) => !best || Math.abs(lane.date.getTime() - date.getTime()) < Math.abs(best.date.getTime() - date.getTime()) ? lane : best, undefined);
  const todayLane = $derived(nearestLane(now));
  const showToday = $derived(Boolean(lanes.length && now >= lanes[0]!.date && now <= lanes.at(-1)!.date));
  const trackHeight = $derived(Math.max(360, measuredLaneHeight, ...lanes.map(lane => {
    const count = lane.events.length;
    return 96 + lane.markers.reduce((sum, marker) => sum + (marker.image ? 108 : 42), 0) + count * 220 + Math.max(0, count - 1) * 9 + (lane.events.length > 3 ? 38 : 0);
  })));
  const rows = $derived(buildTimelineFeed(events, anniversaries, end, now));
  const offsets = $derived.by(() => {
    const result = [0];
    for (const row of rows) result.push(result.at(-1)! + (measured[row.key] ?? ((row.marker ? row.marker.image ? 164 : 98 : 49 + row.events.reduce((sum, event) => sum + (event.image ? 195 : 111), 0) + Math.max(0, row.events.length - 1) * 7) + (row.adIndex ? 86 : 0))));
    return result;
  });
  function indexAt(offset: number, positions = offsets): number {
    let low = 0, high = Math.max(0, positions.length - 2);
    while (low < high) { const mid = Math.floor((low + high) / 2); if (positions[mid + 1]! <= offset) low = mid + 1; else high = mid; }
    return low;
  }
  // Prepare the neighboring screen before it enters view; older rows stay unmounted.
  const start = $derived($virtualScrolling ? Math.max(0, indexAt(Math.max(0, pageY - feedTop - viewportHeight)) - 1) : 0);
  const finish = $derived($virtualScrolling ? Math.min(rows.length, indexAt(Math.max(0, pageY - feedTop) + 2 * viewportHeight) + 2) : rows.length);
  const visibleRows = $derived(rows.slice(start, finish));
  const behavior = (): ScrollBehavior => matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

  $effect(() => {
    const host = mobile ? feed : board, searchable = events;
    if (!active || !host) return;
    const source = registerFindSource({ host, count: () => searchable.length,
      text: index => { const event = searchable[index]!; return [event.title, event.typeLabel, event.dateLabel, event.context, event.description,
        ...event.relatedCharacters, ...event.relatedSupportCardNames, ...(event.pickups ?? []).flatMap(pickup => [pickup.name, pickup.subLabel]),
        ...(event.raceLines ?? []), ...event.tags].join(' '); },
      reveal: index => revealEvent(searchable[index]!),
    });
    return source.destroy;
  });
  async function revealEvent(event: TimelineRecord): Promise<HTMLElement | undefined> {
    cancelAnimationFrame(momentum);
    if (mobile && feed) {
      const index = rows.findIndex(row => row.events.some(item => item.id === event.id));
      if (index < 0) return;
      window.scrollTo({ top: feedTop + offsets[index]!, behavior:'instant' }); updateViewport(); await tick();
    } else {
      const lane = lanes.find(lane => lane.events.some(item => item.id === event.id));
      if (!lane || !board) return;
      await scrollToLane(lane.key, false); await tick();
      if (view === 'horizontal') {
        const host = board.querySelector<HTMLElement>(`[data-lane-key="${CSS.escape(lane.key)}"] .lane-events`);
        if (host) await revealVirtualItem(host, lane.events.findIndex(item => item.id === event.id));
      }
    }
    const node = (mobile ? feed : board)?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(event.id)}"]`);
    node?.scrollIntoView({ block:'center', inline:'center', behavior:'instant' }); updateViewport();
    return node ?? undefined;
  }

  function updateViewport() {
    if (!active) return;
    if (board) { scrollLeft = board.scrollLeft; scrollTop = board.scrollTop; }
    if (mobile) pageY = scrollY;
  }
  function measureViewport() {
    if (!active) return;
    if (board) {
      viewportWidth = board.clientWidth;
      board.parentElement?.style.setProperty('--timeline-viewport-top', `${board.getBoundingClientRect().top}px`);
    }
    viewportHeight = mobile ? innerHeight : board?.clientHeight ?? innerHeight;
    if (feed) feedTop = feed.getBoundingClientRect().top + scrollY;
    updateViewport();
  }
  function scheduleViewport() { if (active && !frame) frame = requestAnimationFrame(() => { frame = 0; updateViewport(); }); }
  function applyMeasurements(heights: Record<string, number>) {
    if (!board || mobile || view !== 'vertical' || !months.groups.length) {
      measured = { ...measured, ...heights }; return;
    }
    const top = board.scrollTop;
    const atEnd = top >= board.scrollHeight - board.clientHeight - 1;
    const month = indexAt(top + 56, monthOffsets);
    const lane = indexAt(top - monthOffsets[month]!, monthLaneOffsets[month]);
    const before = monthOffsets[month]! + monthLaneOffsets[month]![lane]!;
    // Change spacers and the visible window together, preserving the row below the sticky header.
    flushSync(() => {
      measured = { ...measured, ...heights };
      scrollTop = Math.max(0, top + monthOffsets[month]! + monthLaneOffsets[month]![lane]! - before);
    });
    board.scrollTo({ top: atEnd ? board.scrollHeight : scrollTop, behavior: 'instant' });
    updateViewport();
  }
  function measureRow(node: HTMLElement, key: string) {
    const observer = new ResizeObserver(([entry]) => {
      if (!active || !entry) return;
      const height = Math.ceil(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
      if (height <= 0 || Math.abs((measured[key] ?? 0) - height) <= 2) return;
      pendingHeights[key] = height;
      // All rows resize together when changing direction. Recalculate offsets once.
      if (!measurementFrame) measurementFrame = requestAnimationFrame(() => {
        measurementFrame = 0;
        if (active) applyMeasurements(pendingHeights);
        pendingHeights = {};
      });
    });
    observer.observe(node);
    return { update(next: string) { delete pendingHeights[key]; key = next; }, destroy() { observer.disconnect(); delete pendingHeights[key]; } };
  }
  function measureLane(node: HTMLElement) {
    let pending = 0;
    const observer = new ResizeObserver(([entry]) => { const height = entry?.borderBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? 0; cancelAnimationFrame(pending); pending = requestAnimationFrame(() => {
      if (active) measuredLaneHeight = Math.max(measuredLaneHeight, Math.ceil(height));
    }); });
    observer.observe(node);
    return { destroy() { observer.disconnect(); cancelAnimationFrame(pending); } };
  }
  export async function scrollToToday(smooth = true) {
    cancelAnimationFrame(momentum);
    await tick();
    if (!active || (mobile ? !feed?.isConnected : !board?.isConnected)) return;
    if (mobile) {
      const index = rows.findIndex(row => row.marker?.type === 'today');
      if (index < 0 || !feed) return;
      updateViewport();
      window.scrollTo({ top: Math.max(0, feedTop + offsets[index]! + (offsets[index + 1]! - offsets[index]!) / 2 - innerHeight / 2), behavior: smooth ? behavior() : 'instant' });
    } else if (view === 'horizontal') board?.scrollTo({ left: Math.max(0, todayPosition + LANE_WIDTH / 2 - viewportWidth / 2), behavior: smooth ? behavior() : 'instant' });
    else {
      if (todayLane) await scrollToLane(todayLane.key, smooth);
    }
    updateViewport();
  }
  export async function scrollToLane(key: string, smooth = true) {
    cancelAnimationFrame(momentum);
    const lane = lanes.find(item => item.key === key);
    if (!lane || !board) return;
    if (view === 'horizontal') board.scrollTo({ left: Math.max(0, lane.position + LANE_WIDTH / 2 - viewportWidth / 2), behavior: smooth ? behavior() : 'instant' });
    else {
      // Switching direction changes the scrollbar gutter before ResizeObserver runs.
      viewportWidth = board.clientWidth;
      const index = months.groups.findIndex(month => month.key === key.slice(0, 7));
      const month = months.groups[index];
      if (!month) return;
      const laneIndex = month.lanes.findIndex(lane => lane.key === key);
      const destination = () => monthOffsets[index]! + monthLaneOffsets[index]![laneIndex]!;
      // Mount and measure the destination in CSS pixels before moving the browser's scroll position.
      flushSync(() => scrollTop = destination());
      const heights = Object.fromEntries([...board.querySelectorAll<HTMLElement>('[data-lane-key]')].map(node => [`d:${viewportWidth}:${node.dataset.laneKey}`, node.offsetHeight]));
      flushSync(() => { measured = { ...measured, ...heights }; scrollTop = destination(); });
      board.scrollTop = scrollTop;
    }
    updateViewport();
  }
  export async function scrollToDate(date: Date) {
    if (!Number.isFinite(date.getTime()) || !active) return;
    if (!mobile) {
      const lane = lanes.find(lane => lane.key === timelineDateKey(date)) ?? nearestLane(date);
      if (lane) await scrollToLane(lane.key, false);
    } else if (feed) {
      cancelAnimationFrame(momentum);
      const row = rows.filter(row => !row.marker).reduce<typeof rows[number] | undefined>((best, row) => !best || Math.abs(row.date.getTime() - date.getTime()) < Math.abs(best.date.getTime() - date.getTime()) ? row : best, undefined);
      if (!row) return;
      const index = rows.indexOf(row);
      const destination = () => Math.max(0, feedTop + offsets[index]! + (offsets[index + 1]! - offsets[index]!) / 2 - innerHeight / 2);
      flushSync(() => pageY = destination());
      const heights = Object.fromEntries([...feed.querySelectorAll<HTMLElement>('.feed-row')].map((node, index) => [visibleRows[index]!.key, node.offsetHeight]));
      flushSync(() => { measured = { ...measured, ...heights }; pageY = destination(); });
      window.scrollTo({ top: pageY, behavior: 'instant' });
      updateViewport();
    }
  }
  export function anchorDate(): Date {
    return lanes.reduce<TimelineLane | undefined>((best, lane) => !best || Math.abs(lane.position + LANE_WIDTH/2 - scrollLeft - viewportWidth / 2) < Math.abs(best.position + LANE_WIDTH/2 - scrollLeft - viewportWidth / 2) ? lane : best, undefined)?.date ?? now;
  }
  export async function restoreAnchor(date: Date) { await tick(); board?.scrollTo({ left: Math.max(0, timelinePosition(lanes, date) + LANE_WIDTH/2 - viewportWidth / 2), behavior: behavior() }); }
  export async function changeView(next: 'horizontal' | 'vertical') {
    if (!board) return;
    cancelAnimationFrame(momentum); dragging = false; drag = undefined;
    if (next === 'vertical') savedHorizontal = board.scrollLeft; else savedVertical = board.scrollTop;
    // Render the saved window before scrolling, so a temporary short DOM cannot clamp it.
    scrollLeft = next === 'horizontal' ? savedHorizontal || Math.max(0, todayPosition + LANE_WIDTH / 2 - viewportWidth / 2) : 0;
    const monthIndex = months.groups.findIndex(month => month.key === todayLane?.key.slice(0, 7));
    const laneIndex = months.groups[monthIndex]?.lanes.findIndex(lane => lane.key === todayLane?.key) ?? -1;
    const todayTop = monthIndex >= 0 && laneIndex >= 0 ? monthOffsets[monthIndex]! + monthLaneOffsets[monthIndex]![laneIndex]! : 0;
    scrollTop = next === 'vertical' ? savedVertical || todayTop : 0;
    await tick();
    viewportWidth = board.clientWidth;
    await tick();
    board.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'instant' });
    if (!(next === 'horizontal' ? savedHorizontal : savedVertical)) await scrollToToday(false);
    updateViewport();
  }
  function wheel(event: WheelEvent) {
    if (!active || !board || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    cancelAnimationFrame(momentum);
    if (view !== 'horizontal') return;
    const mode = event.deltaMode;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    const unit = mode === 1 ? 18 : mode === 2 ? (event.shiftKey ? board.clientHeight : board.clientWidth) : 1;
    // The axis stays consistent over cards and at the ends. Shift accesses tall event stacks.
    event.preventDefault();
    board.scrollBy({ [event.shiftKey ? 'top' : 'left']: delta * unit, behavior: 'instant' });
  }
  function beginDrag(event: MouseEvent) {
    cancelAnimationFrame(momentum);
    suppressClick = false;
    if (event.button || !active || !board || (event.target as HTMLElement).closest('button:not(.open-action),a:not(.pickups > a),input,select,textarea')) return;
    const rect = board.getBoundingClientRect();
    if (event.clientX >= rect.left + board.clientLeft + board.clientWidth || event.clientY >= rect.top + board.clientTop + board.clientHeight) return;
    drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, time: performance.now(), vx: 0, vy: 0 };
  }
  function moveDrag(event: MouseEvent) {
    if (!drag || !board) return;
    if (!dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) return;
    dragging = true; suppressClick = true; event.preventDefault();
    const elapsed = performance.now() - drag.time;
    if (elapsed > 0) { drag.vx = (event.clientX - drag.lastX) / elapsed * 16; drag.vy = (event.clientY - drag.lastY) / elapsed * 16; }
    // Incremental movement preserves virtual-row corrections made during the drag.
    board.scrollLeft -= event.clientX - drag.lastX;
    board.scrollTop -= event.clientY - drag.lastY;
    drag.lastX = event.clientX; drag.lastY = event.clientY; drag.time = performance.now();
    scheduleViewport();
  }
  function endDrag() {
    let vx = drag?.vx ?? 0, vy = drag?.vy ?? 0;
    const coast = () => { if (!board || Math.hypot(vx, vy) <= .5) return; board.scrollLeft -= vx; board.scrollTop -= vy; vx *= .92; vy *= .92; updateViewport(); momentum = requestAnimationFrame(coast); };
    if (dragging && drag && performance.now() - drag.time < 100 && !matchMedia('(prefers-reduced-motion: reduce)').matches) coast();
    dragging = false; drag = undefined;
  }
  function captureClick(event: MouseEvent) {
    if (suppressClick && event.detail) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }
  $effect(() => {
    if (!active || !initialized) return;
    if (initialToday || !(mobile ? rows.some(row => row.marker?.type === 'today') : showToday)) { imagesReady = true; return; }
    initialToday = true;
    let correction = 0;
    const currentOffset = () => mobile ? window.scrollY : view === 'horizontal' ? board?.scrollLeft : board?.scrollTop;
    const id = requestAnimationFrame(() => { void scrollToToday(false).then(() => {
      const offset = currentOffset();
      correction = requestAnimationFrame(async () => {
        // Measuring virtual rows may require a second alignment, but never undo a user's intervening scroll.
        if (currentOffset() === offset) await scrollToToday(false);
        await tick();
        // Native lazy loading would otherwise fetch the launch cards before we jump to Today.
        imagesReady = true;
      });
    }); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(correction); };
  });
  $effect(() => { lanes; mobile; untrack(() => { measuredLaneHeight = 0; scheduleViewport(); }); });
  $effect(() => {
    const node = mobile ? feed : board;
    if (!active || !node) {
      cancelAnimationFrame(momentum); cancelAnimationFrame(frame); frame = 0;
      dragging = false; drag = undefined;
      return;
    }
    untrack(() => {
      if (mobile && initialToday) window.scrollTo({ top: pageY, behavior: 'instant' });
      measureViewport();
    });
    let pending = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(measureViewport); });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(pending); };
  });
  onMount(() => {
    initialized = true;
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(momentum); cancelAnimationFrame(measurementFrame); };
  });
</script>

<svelte:window onscroll={scheduleViewport} onresize={measureViewport} onmousemove={moveDrag} onmouseup={endDrag}/>
{#snippet markerView(marker: TimelineMarker)}
  <div class="lane-marker" class:is-anniversary={marker.type === 'anniversary'} data-marker-type={marker.type}>
    {#if marker.image}<img class="marker-banner" src={imagesReady ? marker.image : undefined} alt={marker.label} width="512" height="125" loading="lazy" decoding="async"/>{/if}
    <div class="marker-label"><Icon name={marker.type === 'anniversary' ? 'gift' : marker.type === 'launch' ? 'diamond' : 'calendar'} size={mobile ? 18 : 13}/><span>{marker.label}</span></div>
  </div>
{/snippet}
{#if mobile}
  <section class="timeline-board mobile-feed" aria-label="Mobile event timeline" bind:this={feed}>
    <div class="spine" aria-hidden="true"></div>
    <div aria-hidden="true" style:height={`${offsets[start] ?? 0}px`}></div>
    {#each visibleRows as row (row.key)}
      <div class="feed-row" use:measureRow={row.key}>
        <article class="feed-item" class:timeline-today-marker={row.marker?.type === 'today'} data-event-type={row.events[0]?.eventType} data-lane-key={row.marker ? undefined : timelineDateKey(row.date)}>
          <div class="dot" aria-hidden="true"></div>
          <header class="feed-date"><time>{row.label}</time>{#if row.days !== 0}<span>{row.days > 0 ? '+' : ''}{row.days}d</span>{/if}{#if row.events.length > 1}<small>{row.events.length} events</small>{/if}</header>
          {#if row.marker}{@render markerView(row.marker)}{:else}<div class="feed-events">{#each row.events as event (event.id)}{@render card(event, imagesReady)}{/each}</div>{/if}
        </article>
        {#if row.adIndex}<div class="feed-ad"><AdRegion placement={`timeline_interscroller_${row.adIndex}`} kind="inline" sizes={['320x50', '300x50']} active/></div>{/if}
      </div>
    {/each}
    <div aria-hidden="true" style:height={`${Math.max(0, offsets.at(-1)! - (offsets[finish] ?? 0))}px`}></div>
  </section>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The scrollable date track is keyboard-focusable; mouse dragging supplements native keyboard scrolling.) -->
  <section bind:this={board} class="timeline-board desktop" style:--timeline-card-width={`${LANE_WIDTH}px`} class:horizontal={view === 'horizontal'} class:vertical={view === 'vertical'} class:dragging tabindex="0" aria-label={view === 'vertical' ? 'Vertical event timeline' : 'Horizontal event timeline. Scroll or drag to move through dates. Shift + scroll to move up and down.'} title={view === 'horizontal' ? 'Scroll through dates. Shift + scroll to move up and down.' : undefined} onmousedown={beginDrag} ondragstart={event => event.preventDefault()} onclickcapture={captureClick} onwheel={wheel} onscroll={scheduleViewport}>
    {#if view === 'horizontal'}
      <div class="timeline-track" style:width={`${width}px`} style:min-height={`${trackHeight}px`}>
        {#each months.spans as month (month.key)}<div class="month-span" style:left={`${month.position}px`} style:width={`${month.width}px`} aria-hidden="true"></div>{/each}
        <div class="timeline-rail" aria-hidden="true"></div>
        {#if showToday}<div class="timeline-today-marker" style:left={`${todayPosition + LANE_WIDTH/2}px`}><span>Today</span></div>{/if}
        {#each visibleLanes as lane (lane.key)}
          <section class="date-lane" data-lane-key={lane.key} style:left={`${lane.position}px`} style:width={`${LANE_WIDTH}px`} use:measureLane>
            <header class="lane-header">
              <time datetime={lane.key} title={lane.label}>{dateFormatter.format(lane.date)}</time>
              <div class="lane-meta">{#if lane.events.length}<span>{lane.events.length} {lane.events.length === 1 ? 'event' : 'events'}</span>{/if}{#if lane.gapDays > 1}<span class="lane-gap">{lane.gapDays}d later</span>{/if}</div>
            </header>
            {#each lane.markers as marker}{@render markerView(marker)}{/each}
            <div class="lane-events" use:virtualScroll={{ items: lane.events, key: event => event.id, root: 'closest', active, estimate: 220, onrange: range => laneRanges = { ...laneRanges, [lane.key]: range } }}>
              {#each lane.events.slice(laneRanges[lane.key]?.start ?? 0, laneRanges[lane.key]?.end ?? 3) as event, index (event.id)}<div data-virtual-index={(laneRanges[lane.key]?.start ?? 0) + index}>{@render card(event, imagesReady)}</div>{/each}
            </div>
          </section>
        {/each}
      </div>
    {:else}
      <div class="vertical-timeline">
        <div aria-hidden="true" style:height={`${monthOffsets[firstMonth] ?? 0}px`}></div>
        {#each months.groups.slice(firstMonth, lastMonth) as month, index (month.key)}
          {@const window = verticalWindow(firstMonth + index)}
          {@const offsets = monthLaneOffsets[firstMonth + index]!}
          <!-- Position rows from the same offsets as scrolling: mounting an unmeasured row must not push its neighbors. -->
          <section class="vertical-month" data-month-key={month.key} style:height={`${68 + offsets.at(-1)!}px`}><header class="month-header"><h2>{month.label}</h2>{#if month.count}<span>{month.count} {month.count === 1 ? 'event' : 'events'}</span>{/if}</header>
            {#each month.lanes.slice(window.first, window.last) as lane, laneIndex (lane.key)}
              <section use:measureRow={`d:${viewportWidth}:${lane.key}`} style:top={`${56 + offsets[window.first + laneIndex]!}px`} class="vertical-date" class:is-today={lane.key === timelineDateKey(now)} data-lane-key={lane.key}>
                <header><time datetime={lane.key} title={lane.label}><strong>{lane.date.getUTCDate()}</strong><span>{weekdayFormatter.format(lane.date)}</span></time>{#if lane.events.length}<span>{lane.events.length} {lane.events.length === 1 ? 'event' : 'events'}</span>{/if}</header>
                <div class="vertical-events">{#each lane.markers as marker}{@render markerView(marker)}{/each}{#each lane.events as event (event.id)}{@render card(event, imagesReady)}{/each}</div>
              </section>
            {/each}
          </section>
        {/each}
        <div aria-hidden="true" style:height={`${Math.max(0, monthOffsets.at(-1)! - (monthOffsets[lastMonth] ?? 0))}px`}></div>
      </div>
    {/if}
  </section>
{/if}

<style>
  .timeline-board{min-width:0;color:var(--text-primary)}.desktop{width:100%;height:0;min-height:240px;flex:1 1 0px;overflow:auto;overscroll-behavior-x:contain;background:var(--color-canvas);scrollbar-color:var(--border-secondary) transparent;scrollbar-width:thin}.desktop:focus-visible{outline:1px solid var(--accent-primary);outline-offset:-1px}.desktop{cursor:grab;overflow-anchor:none}.dragging{cursor:grabbing;user-select:none}.timeline-track{position:relative;min-width:100%;height:100%;padding-bottom:18px}
  .month-span{position:absolute;inset-block:0;pointer-events:none;border-left:1px solid rgb(var(--accent-primary-rgb)/.15);background:transparent}.month-span:nth-child(even){background:rgb(var(--accent-primary-rgb)/.025)}.timeline-rail{position:absolute;top:52px;left:0;right:0;height:1px;background:var(--border-secondary)}
  .date-lane{position:absolute;z-index:2;top:0;display:flex;flex-direction:column;padding-bottom:16px;isolation:isolate}.lane-header{height:72px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 12px 16px}.lane-header::before{position:absolute;content:'';top:54px;left:50%;height:18px;width:1px;background:var(--border-secondary)}.lane-header::after{position:absolute;content:'';top:49px;left:calc(50% - 3px);width:7px;height:7px;border:2px solid var(--accent-primary);border-radius:50%;background:var(--color-canvas)}.lane-header time{color:var(--text-primary);font-size:13px;line-height:18px;font-weight:650;white-space:nowrap}.lane-meta{display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:11px;line-height:14px}.lane-gap{font-size:10px}.lane-meta span+span::before{content:'·';margin-right:8px}.lane-events{display:grid;gap:10px;order:2}
  .lane-marker{margin:3px 0 8px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:4px;background:var(--surface-1);order:1}.lane-marker.is-anniversary{margin-top:7px;order:4}.marker-banner{display:block;width:100%;height:auto;aspect-ratio:512/125;object-fit:contain;background:var(--bg-primary);border-bottom:1px solid var(--border-subtle)}.marker-label{display:flex;min-height:28px;padding:4px 7px;align-items:center;gap:5px;color:var(--text-secondary);font-size:10px;font-weight:650}.marker-label :global(svg){color:var(--accent-primary)}.horizontal .timeline-today-marker{position:absolute;top:52px;bottom:0;width:1px;pointer-events:none;background:var(--timeline-today-color,var(--accent-error))}.horizontal .timeline-today-marker>span{position:absolute;top:-10px;left:8px;padding:2px 5px;border:1px solid currentColor;border-radius:4px;background:var(--surface-overlay);color:var(--timeline-today-color,var(--accent-error));font-size:9px;font-weight:700}
  .vertical{overflow-x:hidden;scroll-padding-top:56px;scrollbar-gutter:stable}.vertical-timeline{width:100%;margin-inline:auto;padding:0 24px 28px}.vertical-month{position:relative;padding-bottom:12px}.month-header{position:sticky;z-index:12;top:0;display:flex;align-items:center;justify-content:space-between;min-height:56px;gap:16px;background:var(--bg-primary);border-bottom:1px solid var(--border-primary)}.month-header h2{margin:0;color:var(--text-primary);font-size:18px;font-weight:700}.month-header>span{color:var(--text-secondary);font-size:12px}.vertical-date{position:absolute;inset-inline:0;display:grid;grid-template-columns:88px minmax(0,1fr);padding:16px 0;gap:24px;}.vertical-date::after{position:absolute;content:'';inset-block:0;left:98px;width:1px;background:var(--border-primary)}.vertical-date::before{position:absolute;z-index:1;content:'';top:30px;left:94px;width:9px;height:9px;border:2px solid var(--accent-primary);border-radius:50%;background:var(--bg-primary)}.vertical-date.is-today::before{border-color:var(--timeline-today-color,var(--accent-error))}.vertical-date>header{display:flex;min-width:0;flex-direction:column;gap:4px;align-self:start;text-align:right}.vertical-date time{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;color:var(--text-primary)}.vertical-date time strong{font-size:26px;line-height:32px;font-weight:700;font-variant-numeric:tabular-nums}.vertical-date time span{font-size:12px}.vertical-date>header>span{font-size:11px;color:var(--text-secondary)}.vertical-events{display:grid;min-width:0;grid-template-columns:repeat(auto-fill,minmax(0,min(100%,var(--timeline-card-width))));align-items:start;gap:12px}.vertical-events .lane-marker{margin:0;order:initial}.vertical-events .marker-label{min-height:44px;font-size:13px;padding:8px 12px}
  .mobile-feed{position:relative;width:100%;padding:12px 10px 24px 28px;background:var(--color-canvas)}.spine{position:absolute;inset-block:0;left:15px;width:1px;background:var(--border-secondary)}.feed-row{position:relative}.feed-item{position:relative;padding-bottom:10px;min-width:0}.dot{position:absolute;top:14px;left:-17px;width:8px;height:8px;border:2px solid var(--accent-primary);border-radius:50%;background:var(--surface-overlay)}.feed-item[data-event-type='support_card_banner'] .dot,.feed-item[data-event-type='champions_meeting'] .dot{border-color:var(--accent-purple)}.feed-item[data-event-type='paid_banner'] .dot,.feed-item[data-event-type='story_event'] .dot{border-color:var(--accent-warning)}.feed-item[data-event-type='campaign'] .dot{border-color:var(--accent-secondary)}.feed-date{position:sticky;z-index:8;top:0;display:flex;align-items:center;gap:6px;height:30px;margin:0 -2px 6px;padding:0 3px;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary);font-size:11px;font-variant-numeric:tabular-nums}.feed-date time{font-weight:680}.feed-date>span{color:var(--text-muted)}.feed-date small{margin-left:auto;color:var(--text-muted);font-size:9px}.feed-events{display:grid;gap:7px}.mobile-feed .lane-marker{margin:0;min-height:52px;border-color:var(--border-primary);border-radius:5px}.mobile-feed .marker-label{min-height:50px;padding:8px 10px;gap:8px;font-size:12px}.feed-ad{--page-gutter-current:2px;--ad-inline-mobile-height:50px;--ad-leaderboard-height:50px;margin:2px 0 14px}.feed-ad :global(.ad-region){width:100%;margin-inline:0}
  @media(max-width:360px){.mobile-feed{padding-right:8px}}
</style>
