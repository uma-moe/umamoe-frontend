<script lang="ts">
  import type { Snippet } from 'svelte';
  import { timelineDateKey } from '@/lib/timeline/board/timeline-layout';
  import type { TimelineRecord } from '../timeline-repository';
  import TimelineMarker from './TimelineMarker.svelte';
  import type { TimelineBoardViewport } from './timeline-board-viewport.svelte';

  interface Props {
    viewport: TimelineBoardViewport;
    imagesReady: boolean;
    now: Date;
    card: Snippet<[TimelineRecord, boolean]>;
  }

  let { viewport, imagesReady, now, card }: Props = $props();

  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    timeZone: 'UTC'
  });
</script>

<div class="vertical-timeline">
  <div
    aria-hidden="true"
    style:height={`${viewport.monthOffsets[viewport.firstMonth] ?? 0}px`}
  ></div>
  {#each viewport.months.groups.slice(viewport.firstMonth, viewport.lastMonth) as month, index (month.key)}
    {@const window = viewport.verticalWindow(viewport.firstMonth + index)}
    {@const offsets = viewport.monthLaneOffsets[viewport.firstMonth + index]!}
    <!-- Position rows from the same offsets as scrolling: mounting an unmeasured row must not push its neighbors. -->
    <section
      class="vertical-month"
      data-month-key={month.key}
      style:height={`${68 + offsets.at(-1)!}px`}
    >
      <header class="month-header">
        <h2>{month.label}</h2>
        {#if month.count}
          <span>{month.count} {month.count === 1 ? 'event' : 'events'}</span>
        {/if}
      </header>
      {#each month.lanes.slice(window.first, window.last) as lane, laneIndex (lane.key)}
        <section
          use:viewport.measureRow={`d:${viewport.viewportWidth}:${lane.key}`}
          style:top={`${56 + offsets[window.first + laneIndex]!}px`}
          class="vertical-date"
          class:is-today={lane.key === timelineDateKey(now)}
          data-lane-key={lane.key}
        >
          <header>
            <time
              datetime={lane.key}
              title={lane.label}
            >
              <strong>{lane.date.getUTCDate()}</strong>
              <span>{weekdayFormatter.format(lane.date)}</span>
            </time>
            {#if lane.events.length}
              <span>
                {lane.events.length}
                {lane.events.length === 1 ? 'event' : 'events'}
              </span>
            {/if}
          </header>
          <div class="vertical-events">
            {#each lane.markers as marker}
              <TimelineMarker
                {marker}
                {imagesReady}
              />
            {/each}{#each lane.events as event (event.id)}
              {@render card(event, imagesReady)}
            {/each}
          </div>
        </section>
      {/each}
    </section>
  {/each}
  <div
    aria-hidden="true"
    style:height={`${Math.max(0, viewport.monthOffsets.at(-1)! - (viewport.monthOffsets[viewport.lastMonth] ?? 0))}px`}
  ></div>
</div>

<style>
  @import './timeline-months.css';
</style>
