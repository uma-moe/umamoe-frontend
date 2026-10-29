import { flushSync } from 'svelte';
import type { VirtualRange } from '@/lib/virtual-scroll';
import {
  buildTimelineFeed,
  LANE_WIDTH,
  timelineMonths,
  timelinePosition,
  type TimelineAnniversary,
  type TimelineLane
} from '@/lib/timeline/board/timeline-layout';
import type { TimelineRecord } from '../timeline-repository';
import {
  buildFeedOffsets,
  buildMonthLaneOffsets,
  buildMonthOffsets,
  estimatedTrackHeight,
  indexAt,
  nearestLane
} from './timeline-board-layout';

export interface TimelineBoardInputs {
  lanes: () => TimelineLane[];
  events: () => TimelineRecord[];
  anniversaries: () => TimelineAnniversary[];
  end: () => Date;
  now: () => Date;
  mobile: () => boolean;
  view: () => 'horizontal' | 'vertical';
  compact: () => boolean;
  active: () => boolean;
  virtualScrolling: () => boolean;
}

/** Scroll position, measured sizes and the virtual windows shared by the board's views. */
export class TimelineBoardViewport {
  board = $state<HTMLElement>();
  feed = $state<HTMLElement>();
  laneRanges = $state.raw<Record<string, VirtualRange>>({});
  scrollLeft = $state(0);
  scrollTop = $state(0);
  viewportWidth = $state(1500);
  viewportHeight = $state(800);
  pageY = $state(0);
  feedTop = $state(0);
  measured = $state.raw<Record<string, number>>({});
  measuredLaneHeight = $state(0);

  #inputs: TimelineBoardInputs;
  #pendingHeights: Record<string, number> = {};

  #measurementFrame = 0;
  #frame = 0;

  constructor(inputs: TimelineBoardInputs) {
    this.#inputs = inputs;
  }

  months = $derived.by(() => timelineMonths(this.#inputs.lanes(), this.#inputs.compact()));
  monthLaneOffsets = $derived(
    buildMonthLaneOffsets(this.months, this.measured, this.viewportWidth)
  );

  monthOffsets = $derived(buildMonthOffsets(this.monthLaneOffsets));
  firstMonth = $derived.by(() => {
    if (!this.#inputs.virtualScrolling()) return 0;
    const index = this.monthOffsets.findIndex(
      (offset) => offset > Math.max(0, this.scrollTop - this.viewportHeight)
    );

    return index < 0 ? Math.max(0, this.months.groups.length - 1) : Math.max(0, index - 1);
  });

  lastMonth = $derived.by(() => {
    if (!this.#inputs.virtualScrolling()) return this.months.groups.length;
    const index = this.monthOffsets.findIndex(
      (offset) => offset > this.scrollTop + 2 * this.viewportHeight
    );

    return index < 0 ? this.months.groups.length : index;
  });

  width = $derived.by(() => (this.#inputs.lanes().at(-1)?.position ?? 0) + LANE_WIDTH + 48);
  // Keep one screen mounted before and after the visible lanes.
  firstLane = $derived.by(() => {
    const lanes = this.#inputs.lanes();
    const index = lanes.findIndex(
      (lane) => lane.position + LANE_WIDTH >= this.scrollLeft - this.viewportWidth
    );

    return index < 0 ? lanes.length : index;
  });

  lastLane = $derived.by(() => {
    const lanes = this.#inputs.lanes();
    const index = lanes.findIndex(
      (lane) => lane.position > this.scrollLeft + 2 * this.viewportWidth
    );

    return index < 0 ? lanes.length : index;
  });

  visibleLanes = $derived.by(() =>
    this.#inputs.virtualScrolling()
      ? this.#inputs.lanes().slice(this.firstLane, this.lastLane)
      : this.#inputs.lanes()
  );

  todayPosition = $derived.by(() => timelinePosition(this.#inputs.lanes(), this.#inputs.now()));
  todayLane = $derived.by(() => nearestLane(this.#inputs.lanes(), this.#inputs.now()));
  showToday = $derived.by(() => {
    const lanes = this.#inputs.lanes(),
      now = this.#inputs.now();

    return Boolean(lanes.length && now >= lanes[0]!.date && now <= lanes.at(-1)!.date);
  });

  trackHeight = $derived.by(() =>
    estimatedTrackHeight(this.#inputs.lanes(), this.measuredLaneHeight)
  );

  rows = $derived.by(() =>
    buildTimelineFeed(
      this.#inputs.events(),
      this.#inputs.anniversaries(),
      this.#inputs.end(),
      this.#inputs.now()
    )
  );

  offsets = $derived(buildFeedOffsets(this.rows, this.measured));
  // Prepare the neighboring screen before it enters view; older rows stay unmounted.
  start = $derived.by(() =>
    this.#inputs.virtualScrolling()
      ? Math.max(
          0,
          indexAt(Math.max(0, this.pageY - this.feedTop - this.viewportHeight), this.offsets) - 1
        )
      : 0
  );

  finish = $derived.by(() =>
    this.#inputs.virtualScrolling()
      ? Math.min(
          this.rows.length,
          indexAt(Math.max(0, this.pageY - this.feedTop) + 2 * this.viewportHeight, this.offsets) +
            2
        )
      : this.rows.length
  );

  visibleRows = $derived(this.rows.slice(this.start, this.finish));

  verticalWindow(monthIndex: number) {
    const offsets = this.monthLaneOffsets[monthIndex]!;
    if (!this.#inputs.virtualScrolling()) return { first: 0, last: offsets.length - 1 };

    const top = this.scrollTop - this.monthOffsets[monthIndex]! - 56;
    const start = offsets.findIndex((offset) => offset > Math.max(0, top - this.viewportHeight));
    const first = start < 0 ? Math.max(0, offsets.length - 2) : Math.max(0, start - 1);
    const end = offsets.findIndex((offset) => offset > top + 2 * this.viewportHeight);
    const last = end < 0 ? offsets.length - 1 : end;
    return { first, last };
  }

  updateViewport = () => {
    if (!this.#inputs.active()) return;
    if (this.board) {
      this.scrollLeft = this.board.scrollLeft;
      this.scrollTop = this.board.scrollTop;
    }

    if (this.#inputs.mobile()) this.pageY = scrollY;
  };

  measureViewport = () => {
    if (!this.#inputs.active()) return;
    if (this.board) {
      this.viewportWidth = this.board.clientWidth;
      this.board.parentElement?.style.setProperty(
        '--timeline-viewport-top',
        `${this.board.getBoundingClientRect().top}px`
      );
    }

    this.viewportHeight = this.#inputs.mobile()
      ? innerHeight
      : (this.board?.clientHeight ?? innerHeight);
    if (this.feed) this.feedTop = this.feed.getBoundingClientRect().top + scrollY;
    this.updateViewport();
  };

  scheduleViewport = () => {
    if (this.#inputs.active() && !this.#frame)
      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.updateViewport();
      });
  };

  cancelScheduledViewport() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  cancelFrames() {
    cancelAnimationFrame(this.#frame);
    cancelAnimationFrame(this.#measurementFrame);
  }

  applyMeasurements(heights: Record<string, number>) {
    const board = this.board;
    if (
      !board ||
      this.#inputs.mobile() ||
      this.#inputs.view() !== 'vertical' ||
      !this.months.groups.length
    ) {
      this.measured = { ...this.measured, ...heights };

      return;
    }

    const top = board.scrollTop;
    const atEnd = top >= board.scrollHeight - board.clientHeight - 1;
    const month = indexAt(top + 56, this.monthOffsets);
    const lane = indexAt(top - this.monthOffsets[month]!, this.monthLaneOffsets[month]!);
    const before = this.monthOffsets[month]! + this.monthLaneOffsets[month]![lane]!;
    // Change spacers and the visible window together, preserving the row below the sticky header.
    flushSync(() => {
      this.measured = { ...this.measured, ...heights };

      this.scrollTop = Math.max(
        0,
        top + this.monthOffsets[month]! + this.monthLaneOffsets[month]![lane]! - before
      );
    });

    board.scrollTo({ top: atEnd ? board.scrollHeight : this.scrollTop, behavior: 'instant' });
    this.updateViewport();
  }

  measureRow = (node: HTMLElement, key: string) => {
    const observer = new ResizeObserver(([entry]) => {
      if (!this.#inputs.active() || !entry) return;
      const height = Math.ceil(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
      if (height <= 0 || Math.abs((this.measured[key] ?? 0) - height) <= 2) return;
      this.#pendingHeights[key] = height;
      // All rows resize together when changing direction. Recalculate offsets once.
      if (!this.#measurementFrame)
        this.#measurementFrame = requestAnimationFrame(() => {
          this.#measurementFrame = 0;
          if (this.#inputs.active()) this.applyMeasurements(this.#pendingHeights);
          this.#pendingHeights = {};
        });
    });

    observer.observe(node);
    return {
      update: (next: string) => {
        delete this.#pendingHeights[key];
        key = next;
      },
      destroy: () => {
        observer.disconnect();
        delete this.#pendingHeights[key];
      }
    };
  };

  measureLane = (node: HTMLElement) => {
    let pending = 0;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? 0;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (this.#inputs.active())
          this.measuredLaneHeight = Math.max(this.measuredLaneHeight, Math.ceil(height));
      });
    });

    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
        cancelAnimationFrame(pending);
      }
    };
  };
}
