<script lang="ts">
  import type { Snippet } from 'svelte';
  import AdRegion from '@/layouts/ads/AdRegion.svelte';
  import { timelineDateKey } from '@/lib/timeline/board/timeline-layout';
  import type { TimelineRecord } from '../timeline-repository';
  import TimelineMarker from './TimelineMarker.svelte';
  import type { TimelineBoardViewport } from './timeline-board-viewport.svelte';

  interface Props {
    viewport: TimelineBoardViewport;
    imagesReady: boolean;
    card: Snippet<[TimelineRecord, boolean]>;
  }

  let { viewport, imagesReady, card }: Props = $props();
</script>

<section
  class="timeline-board mobile-feed"
  aria-label="Mobile event timeline"
  bind:this={viewport.feed}
>
  <div
    class="spine"
    aria-hidden="true"
  ></div>
  <div
    aria-hidden="true"
    style:height={`${viewport.offsets[viewport.start] ?? 0}px`}
  ></div>
  {#each viewport.visibleRows as row (row.key)}
    <div
      class="feed-row"
      use:viewport.measureRow={row.key}
    >
      <article
        class="feed-item"
        class:timeline-today-marker={row.marker?.type === 'today'}
        data-event-type={row.events[0]?.eventType}
        data-lane-key={row.marker ? undefined : timelineDateKey(row.date)}
      >
        <div
          class="dot"
          aria-hidden="true"
        ></div>
        <header class="feed-date">
          <time>{row.label}</time>
          {#if row.days !== 0}
            <span>{row.days > 0 ? '+' : ''}{row.days}d</span>
          {/if}{#if row.events.length > 1}
            <small>{row.events.length} events</small>
          {/if}
        </header>
        {#if row.marker}
          <TimelineMarker
            marker={row.marker}
            {imagesReady}
            mobile
          />
        {:else}
          <div class="feed-events">
            {#each row.events as event (event.id)}
              {@render card(event, imagesReady)}
            {/each}
          </div>
        {/if}
      </article>
      {#if row.adIndex}
        <div class="feed-ad">
          <AdRegion
            placement={`timeline_interscroller_${row.adIndex}`}
            kind="inline"
            sizes={['320x50', '300x50']}
            active
          />
        </div>
      {/if}
    </div>
  {/each}
  <div
    aria-hidden="true"
    style:height={`${Math.max(0, viewport.offsets.at(-1)! - (viewport.offsets[viewport.finish] ?? 0))}px`}
  ></div>
</section>

<style>
  @import './timeline-feed.css';
</style>
