<script lang="ts">
  import { flushSync, onMount, tick, untrack, type Snippet } from 'svelte';
  import { virtualScrolling } from '@/stores/virtual-scrolling';
  import { revealVirtualItem } from '@/lib/virtual-scroll';
  import { registerFindSource } from '@/lib/find-loaded';
  import {
    LANE_WIDTH,
    timelineDateKey,
    timelinePosition,
    type TimelineAnniversary,
    type TimelineLane
  } from '@/lib/timeline/board/timeline-layout';
  import type { TimelineRecord } from '../timeline-repository';
  import TimelineFeed from './TimelineFeed.svelte';
  import TimelineMonths from './TimelineMonths.svelte';
  import TimelineTrack from './TimelineTrack.svelte';
  import {
    centeredLane,
    nearestEventRow,
    nearestLane,
    scrollBehavior as behavior
  } from './timeline-board-layout';
  import { TimelineBoardViewport } from './timeline-board-viewport.svelte';
  import { TimelineDragScroll } from './timeline-drag-scroll.svelte';

  let {
    lanes,
    events,
    anniversaries,
    end,
    now,
    mobile,
    view,
    card,
    compact = true,
    active = true
  }: {
    lanes: TimelineLane[];
    events: TimelineRecord[];
    anniversaries: TimelineAnniversary[];
    end: Date;
    now: Date;
    mobile: boolean;
    view: 'horizontal' | 'vertical';
    card: Snippet<[TimelineRecord, boolean]>;
    compact?: boolean;
    active?: boolean;
  } = $props();

  const viewport = new TimelineBoardViewport({
    lanes: () => lanes,
    events: () => events,
    anniversaries: () => anniversaries,
    end: () => end,
    now: () => now,
    mobile: () => mobile,
    view: () => view,
    compact: () => compact,
    active: () => active,
    virtualScrolling: () => $virtualScrolling
  });

  const drag = new TimelineDragScroll(
    viewport,
    () => active,
    () => view
  );

  let initialized = $state(false);
  let imagesReady = $state(false);

  let initialToday = false;
  let savedHorizontal = 0,
    savedVertical = 0;

  $effect(() => {
    const host = mobile ? viewport.feed : viewport.board,
      searchable = events;

    if (!active || !host) return;
    const source = registerFindSource({
      host,
      count: () => searchable.length,
      text: (index) => {
        const event = searchable[index]!;
        return [
          event.title,
          event.typeLabel,
          event.dateLabel,
          event.context,
          event.description,
          ...event.relatedCharacters,
          ...event.relatedSupportCardNames,
          ...(event.pickups ?? []).flatMap((pickup) => [pickup.name, pickup.subLabel]),
          ...(event.raceLines ?? []),
          ...event.tags
        ].join(' ');
      },
      reveal: (index) => revealEvent(searchable[index]!)
    });

    return source.destroy;
  });

  async function revealEvent(event: TimelineRecord): Promise<HTMLElement | undefined> {
    drag.stop();
    if (mobile && viewport.feed) {
      const index = viewport.rows.findIndex((row) =>
        row.events.some((item) => item.id === event.id)
      );

      if (index < 0) return;
      window.scrollTo({ top: viewport.feedTop + viewport.offsets[index]!, behavior: 'instant' });
      viewport.updateViewport();
      await tick();
    } else {
      const lane = lanes.find((lane) => lane.events.some((item) => item.id === event.id));
      if (!lane || !viewport.board) return;
      await scrollToLane(lane.key, false);
      await tick();
      if (view === 'horizontal') {
        const host = viewport.board!.querySelector<HTMLElement>(
          `[data-lane-key="${CSS.escape(lane.key)}"] .lane-events`
        );

        if (host)
          await revealVirtualItem(
            host,
            lane.events.findIndex((item) => item.id === event.id)
          );
      }
    }

    const node = (mobile ? viewport.feed : viewport.board)?.querySelector<HTMLElement>(
      `[data-event-id="${CSS.escape(event.id)}"]`
    );

    node?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    viewport.updateViewport();
    return node ?? undefined;
  }

  export async function scrollToToday(smooth = true) {
    drag.stop();
    await tick();
    const { board, feed, rows, offsets } = viewport;
    if (!active || (mobile ? !feed?.isConnected : !board?.isConnected)) return;
    if (mobile) {
      const index = rows.findIndex((row) => row.marker?.type === 'today');
      if (index < 0 || !feed) return;
      viewport.updateViewport();
      window.scrollTo({
        top: Math.max(
          0,
          viewport.feedTop +
            offsets[index]! +
            (offsets[index + 1]! - offsets[index]!) / 2 -
            innerHeight / 2
        ),
        behavior: smooth ? behavior() : 'instant'
      });
    } else if (view === 'horizontal')
      board?.scrollTo({
        left: Math.max(0, viewport.todayPosition + LANE_WIDTH / 2 - viewport.viewportWidth / 2),
        behavior: smooth ? behavior() : 'instant'
      });
    else {
      if (viewport.todayLane) await scrollToLane(viewport.todayLane.key, smooth);
    }

    viewport.updateViewport();
  }

  export async function scrollToLane(key: string, smooth = true) {
    drag.stop();
    const lane = lanes.find((item) => item.key === key);
    const board = viewport.board;
    if (!lane || !board) return;
    if (view === 'horizontal')
      board.scrollTo({
        left: Math.max(0, lane.position + LANE_WIDTH / 2 - viewport.viewportWidth / 2),
        behavior: smooth ? behavior() : 'instant'
      });
    else {
      // Switching direction changes the scrollbar gutter before ResizeObserver runs.
      viewport.viewportWidth = board.clientWidth;
      const index = viewport.months.groups.findIndex((month) => month.key === key.slice(0, 7));
      const month = viewport.months.groups[index];
      if (!month) return;
      const laneIndex = month.lanes.findIndex((lane) => lane.key === key);
      const destination = () =>
        viewport.monthOffsets[index]! + viewport.monthLaneOffsets[index]![laneIndex]!;

      // Mount and measure the destination in CSS pixels before moving the browser's scroll position.
      flushSync(() => (viewport.scrollTop = destination()));
      const heights = Object.fromEntries(
        [...board.querySelectorAll<HTMLElement>('[data-lane-key]')].map((node) => [
          `d:${viewport.viewportWidth}:${node.dataset.laneKey}`,
          node.offsetHeight
        ])
      );

      flushSync(() => {
        viewport.measured = { ...viewport.measured, ...heights };

        viewport.scrollTop = destination();
      });

      board.scrollTop = viewport.scrollTop;
    }

    viewport.updateViewport();
  }

  export async function scrollToDate(date: Date) {
    if (!Number.isFinite(date.getTime()) || !active) return;
    const feed = viewport.feed;
    if (!mobile) {
      const lane =
        lanes.find((lane) => lane.key === timelineDateKey(date)) ?? nearestLane(lanes, date);

      if (lane) await scrollToLane(lane.key, false);
    } else if (feed) {
      drag.stop();
      const row = nearestEventRow(viewport.rows, date);
      if (!row) return;
      const index = viewport.rows.indexOf(row);
      const destination = () =>
        Math.max(
          0,
          viewport.feedTop +
            viewport.offsets[index]! +
            (viewport.offsets[index + 1]! - viewport.offsets[index]!) / 2 -
            innerHeight / 2
        );

      flushSync(() => (viewport.pageY = destination()));
      const heights = Object.fromEntries(
        [...feed.querySelectorAll<HTMLElement>('.feed-row')].map((node, index) => [
          viewport.visibleRows[index]!.key,
          node.offsetHeight
        ])
      );

      flushSync(() => {
        viewport.measured = { ...viewport.measured, ...heights };

        viewport.pageY = destination();
      });

      window.scrollTo({ top: viewport.pageY, behavior: 'instant' });
      viewport.updateViewport();
    }
  }

  export function anchorDate(): Date {
    return centeredLane(lanes, viewport.scrollLeft, viewport.viewportWidth)?.date ?? now;
  }

  export async function restoreAnchor(date: Date) {
    await tick();
    viewport.board?.scrollTo({
      left: Math.max(
        0,
        timelinePosition(lanes, date) + LANE_WIDTH / 2 - viewport.viewportWidth / 2
      ),
      behavior: behavior()
    });
  }

  export async function changeView(next: 'horizontal' | 'vertical') {
    const board = viewport.board;
    if (!board) return;
    drag.stop();
    drag.reset();
    if (next === 'vertical') savedHorizontal = board.scrollLeft;
    else savedVertical = board.scrollTop;
    // Render the saved window before scrolling, so a temporary short DOM cannot clamp it.
    viewport.scrollLeft =
      next === 'horizontal'
        ? savedHorizontal ||
          Math.max(0, viewport.todayPosition + LANE_WIDTH / 2 - viewport.viewportWidth / 2)
        : 0;
    const todayLane = viewport.todayLane;
    const monthIndex = viewport.months.groups.findIndex(
      (month) => month.key === todayLane?.key.slice(0, 7)
    );

    const laneIndex =
      viewport.months.groups[monthIndex]?.lanes.findIndex((lane) => lane.key === todayLane?.key) ??
      -1;

    const todayTop =
      monthIndex >= 0 && laneIndex >= 0
        ? viewport.monthOffsets[monthIndex]! + viewport.monthLaneOffsets[monthIndex]![laneIndex]!
        : 0;

    viewport.scrollTop = next === 'vertical' ? savedVertical || todayTop : 0;
    await tick();
    viewport.viewportWidth = board.clientWidth;
    await tick();
    board.scrollTo({ left: viewport.scrollLeft, top: viewport.scrollTop, behavior: 'instant' });
    if (!(next === 'horizontal' ? savedHorizontal : savedVertical)) await scrollToToday(false);
    viewport.updateViewport();
  }

  $effect(() => {
    if (!active || !initialized) return;
    if (
      initialToday ||
      !(mobile ? viewport.rows.some((row) => row.marker?.type === 'today') : viewport.showToday)
    ) {
      imagesReady = true;
      return;
    }

    initialToday = true;
    let correction = 0;
    const currentOffset = () =>
      mobile
        ? window.scrollY
        : view === 'horizontal'
          ? viewport.board?.scrollLeft
          : viewport.board?.scrollTop;

    const id = requestAnimationFrame(() => {
      void scrollToToday(false).then(() => {
        const offset = currentOffset();
        correction = requestAnimationFrame(async () => {
          // Measuring virtual rows may require a second alignment, but never undo a user's intervening scroll.
          if (currentOffset() === offset) await scrollToToday(false);
          await tick();
          // Native lazy loading would otherwise fetch the launch cards before we jump to Today.
          imagesReady = true;
        });
      });
    });

    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(correction);
    };
  });

  $effect(() => {
    lanes;
    mobile;
    untrack(() => {
      viewport.measuredLaneHeight = 0;
      viewport.scheduleViewport();
    });
  });

  $effect(() => {
    const node = mobile ? viewport.feed : viewport.board;
    if (!active || !node) {
      drag.stop();
      viewport.cancelScheduledViewport();
      drag.reset();
      return;
    }

    untrack(() => {
      if (mobile && initialToday) window.scrollTo({ top: viewport.pageY, behavior: 'instant' });
      viewport.measureViewport();
    });

    let pending = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(viewport.measureViewport);
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
    };
  });

  onMount(() => {
    initialized = true;
    return () => {
      viewport.cancelFrames();
      drag.stop();
    };
  });
</script>

<svelte:window
  onscroll={viewport.scheduleViewport}
  onresize={viewport.measureViewport}
  onmousemove={drag.move}
  onmouseup={drag.end}
/>
{#if mobile}
  <TimelineFeed
    {viewport}
    {imagesReady}
    {card}
  />
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The scrollable date track is keyboard-focusable; mouse dragging supplements native keyboard scrolling.) -->
  <section
    bind:this={viewport.board}
    class="timeline-board desktop"
    style:--timeline-card-width={`${LANE_WIDTH}px`}
    class:horizontal={view === 'horizontal'}
    class:vertical={view === 'vertical'}
    class:dragging={drag.dragging}
    tabindex="0"
    aria-label={view === 'vertical'
      ? 'Vertical event timeline'
      : 'Horizontal event timeline. Scroll or drag to move through dates. Shift + scroll to move up and down.'}
    title={view === 'horizontal'
      ? 'Scroll through dates. Shift + scroll to move up and down.'
      : undefined}
    onmousedown={drag.begin}
    ondragstart={(event) => event.preventDefault()}
    onclickcapture={drag.captureClick}
    onwheel={drag.wheel}
    onscroll={viewport.scheduleViewport}
  >
    {#if view === 'horizontal'}
      <TimelineTrack
        {viewport}
        {imagesReady}
        {active}
        {card}
      />
    {:else}
      <TimelineMonths
        {viewport}
        {imagesReady}
        {now}
        {card}
      />
    {/if}
  </section>
{/if}

<style>
  .timeline-board {
    min-width: 0;
    color: var(--text-primary);
  }
  .desktop {
    width: 100%;
    height: 0;
    min-height: 240px;
    flex: 1 1 0px;
    overflow: auto;
    overscroll-behavior-x: contain;
    background: var(--color-canvas);
    scrollbar-color: var(--border-secondary) transparent;
    scrollbar-width: thin;
  }
  .desktop:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: -1px;
  }
  .desktop {
    cursor: grab;
    overflow-anchor: none;
  }
  .dragging {
    cursor: grabbing;
    user-select: none;
  }
  .vertical {
    overflow-x: hidden;
    scroll-padding-top: 56px;
    scrollbar-gutter: stable;
  }
</style>
