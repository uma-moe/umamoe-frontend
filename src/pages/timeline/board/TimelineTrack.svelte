<script lang="ts">
  import type { Snippet } from 'svelte';
  import { virtualScroll } from '@/lib/virtual-scroll';
  import { LANE_WIDTH } from '@/lib/timeline/board/timeline-layout';
  import type { TimelineRecord } from '../timeline-repository';
  import TimelineMarker from './TimelineMarker.svelte';
  import type { TimelineBoardViewport } from './timeline-board-viewport.svelte';

  interface Props {
    viewport: TimelineBoardViewport;
    imagesReady: boolean;
    active: boolean;
    card: Snippet<[TimelineRecord, boolean]>;
  }

  let { viewport, imagesReady, active, card }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
</script>

<div
  class="timeline-track"
  style:width={`${viewport.width}px`}
  style:min-height={`${viewport.trackHeight}px`}
>
  {#each viewport.months.spans as month (month.key)}
    <div
      class="month-span"
      style:left={`${month.position}px`}
      style:width={`${month.width}px`}
      aria-hidden="true"
    ></div>
  {/each}
  <div
    class="timeline-rail"
    aria-hidden="true"
  ></div>
  {#if viewport.showToday}
    <div
      class="timeline-today-marker"
      style:left={`${viewport.todayPosition + LANE_WIDTH / 2}px`}
    >
      <span>Today</span>
    </div>
  {/if}
  {#each viewport.visibleLanes as lane (lane.key)}
    <section
      class="date-lane"
      data-lane-key={lane.key}
      style:left={`${lane.position}px`}
      style:width={`${LANE_WIDTH}px`}
      use:viewport.measureLane
    >
      <header class="lane-header">
        <time
          datetime={lane.key}
          title={lane.label}
        >
          {dateFormatter.format(lane.date)}
        </time>
        <div class="lane-meta">
          {#if lane.events.length}
            <span>{lane.events.length} {lane.events.length === 1 ? 'event' : 'events'}</span>
          {/if}{#if lane.gapDays > 1}
            <span class="lane-gap">{lane.gapDays}d later</span>
          {/if}
        </div>
      </header>
      {#each lane.markers as marker}
        <TimelineMarker
          {marker}
          {imagesReady}
        />
      {/each}
      <div
        class="lane-events"
        use:virtualScroll={{
          items: lane.events,
          key: (event) => event.id,
          root: 'closest',
          active,
          estimate: 220,
          onrange: (range) => (viewport.laneRanges = { ...viewport.laneRanges, [lane.key]: range })
        }}
      >
        {#each lane.events.slice(viewport.laneRanges[lane.key]?.start ?? 0, viewport.laneRanges[lane.key]?.end ?? 3) as event, index (event.id)}
          <div data-virtual-index={(viewport.laneRanges[lane.key]?.start ?? 0) + index}>
            {@render card(event, imagesReady)}
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  @import './timeline-track.css';
</style>
