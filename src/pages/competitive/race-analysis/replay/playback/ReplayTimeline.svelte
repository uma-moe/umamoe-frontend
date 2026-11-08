<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import { replayProgress, type ReplayBounds } from '@/lib/race/replay/race-replay';
  import { courseSegments, type Course } from '../replay-course';
  import { replayTimeTicks, timedSection } from '../replay-timeline';
  import ReplayPlaybackControls from './ReplayPlaybackControls.svelte';
  import ReplayChartTools from './ReplayChartTools.svelte';
  import ReplayCourseTracks from './ReplayCourseTracks.svelte';
  import ReplayClipBand from '../clip/ReplayClipBand.svelte';
  import type { ClipEdge, ClipRange } from '../clip/clip-plan';

  let {
    frames,
    bounds,
    timelineEnd,
    course,
    time = $bindable(0),
    speed = $bindable('1'),
    playing,
    phase,
    leader,
    frameIndex,
    minimal = false,
    onplay,
    onseek,
    onstepframe,
    children,
    telemetry,
    actions,
    menu,
    clipRange,
    clipLocked = false,
    ontrim,
    clipTools
  }: {
    frames: ParsedRaceCapture['frames'];
    bounds: ReplayBounds;
    timelineEnd?: number;
    course?: Course;
    time?: number;
    speed?: string;
    playing: boolean;
    phase: string;
    leader: number;
    frameIndex: number;
    /** Play and the time slider only: no restart, step or finish buttons. */
    minimal?: boolean;
    onplay: () => void;
    onseek: (time: number) => void;
    onstepframe: (direction: 1 | -1) => void;
    children?: Snippet<[number[]]>;
    telemetry?: Snippet;
    /** The chart's controls, shown in a desktop toolbar row. */
    actions?: Snippet;
    /** The same controls behind one button, for a narrower toolbar. */
    menu?: Snippet;
    /** The clip being cut, drawn as a band with trim handles over the timeline. */
    clipRange?: ClipRange;
    /** A clip is recording: the timeline stays as it is until it finishes. */
    clipLocked?: boolean;
    ontrim?: (edge: ClipEdge, time: number) => void;
    /** While cutting a clip, its in and out points and export take the chart tools' place. */
    clipTools?: Snippet;
  } = $props();

  let width = $state(0),
    labelWidth = $state(0),
    plotWidth = $state(0),
    scrollAreaWidth = $state(0),
    overflowing = $state(false),
    scrollArea = $state<HTMLDivElement>(),
    tracks = $state<HTMLDivElement>();

  let tracksLeft = 0,
    tracksWidth = 0,
    scrollLeft = 0;

  /** The width at which the toolbar becomes one row with room for the chart view, as in replay-playback-controls.css. */
  const TOOLBAR_ROW_WIDTH = 900;

  // A desktop toolbar shows the chart view beside playback. Narrower, it folds into a menu beside the speed, so the
  // chart starts right under the time slider.
  const chartToolsInRow = $derived(width >= TOOLBAR_ROW_WIDTH);

  const displayBounds = $derived({
    ...bounds,
    endTime: timelineEnd ?? bounds.endTime,
    duration: (timelineEnd ?? bounds.endTime) - bounds.startTime
  });

  const percent = (value: number) => replayProgress(value, displayBounds) * 100;

  const progress = $derived(percent(time));

  // Layout is measured only when sizes change: reading it on every playback frame forced a full
  // page layout per frame.
  $effect(() => {
    width;
    labelWidth;
    plotWidth;
    scrollAreaWidth;
    if (!scrollArea || !tracks) return;

    overflowing = scrollArea.scrollWidth > scrollArea.clientWidth;
    tracksLeft = tracks.offsetLeft;
    tracksWidth = tracks.clientWidth;
    scrollLeft = scrollArea.scrollLeft;
  });

  // A scrolled timeline keeps the playback cursor in view.
  $effect(() => {
    if (!scrollArea || !overflowing) return;

    const cursor = tracksLeft + (tracksWidth * progress) / 100;
    const inView =
      cursor >= scrollLeft + labelWidth + 10 && cursor <= scrollLeft + scrollAreaWidth - 12;

    if (inView) return;

    scrollLeft = cursor - labelWidth - (scrollAreaWidth - labelWidth) / 2;
    scrollArea.scrollLeft = scrollLeft;
  });

  const ticks = $derived(
    replayTimeTicks(
      bounds.startTime,
      displayBounds.endTime,
      Math.max(2, Math.floor(plotWidth / 140))
    )
  );

  const minorTicks = $derived.by(() => {
    const step =
      [1, 2, 5, 10, 15, 30, 60, 120, 300].find(
        (value) => displayBounds.duration / value <= plotWidth / 14
      ) ?? Math.max(1, Math.ceil(displayBounds.duration / 60));

    const start = Math.ceil(bounds.startTime / step) * step;
    return Array.from(
      { length: Math.max(0, Math.ceil((displayBounds.endTime - start) / step)) },
      (_, i) => start + i * step
    ).filter((value) => value > bounds.startTime && !ticks.includes(value));
  });

  function scrub(value: number) {
    // The final timestamp may fall between the slider's millisecond steps.
    onseek(value >= displayBounds.endTime - 0.001 ? displayBounds.endTime : value);
  }

  const tickLabel = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return rounded === 0 ? '0:00' : formatRaceTime(rounded, Number.isInteger(rounded) ? 0 : 1);
  };

  const segments = $derived(
    courseSegments(course).flatMap((section) =>
      timedSection(section, frames, bounds.distanceMax, displayBounds.endTime, percent)
    )
  );

  const currentSegment = $derived(segments.find((s) => leader >= s.start && leader < s.end)?.label);
</script>

{#snippet chartTools()}
  <ReplayChartTools tools={actions} />
{/snippet}

<section
  bind:clientWidth={width}
  class="playback"
  style:--timeline-visible-width={width + 'px'}
  aria-label="Race playback"
  style:--replay-position={progress + '%'}
>
  <ReplayPlaybackControls
    {bounds}
    {time}
    bind:speed
    {playing}
    disabled={!frames.length || clipLocked}
    {frameIndex}
    frameCount={frames.length}
    {minimal}
    {onplay}
    {onseek}
    {onstepframe}
    clipping={clipTools !== undefined}
    tools={clipTools ?? (chartToolsInRow ? chartTools : menu)}
  />
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The shared horizontal timeline must be reachable with the keyboard.) -->
  <div
    bind:this={scrollArea}
    bind:clientWidth={scrollAreaWidth}
    onscroll={(event) => (scrollLeft = event.currentTarget.scrollLeft)}
    class="timeline-scroll"
    role="region"
    aria-label="Course and skills"
    tabindex="0"
    inert={clipLocked}
  >
    <div class="timeline-content">
      {#if clipRange && ontrim}
        <ReplayClipBand
          range={clipRange}
          bounds={displayBounds}
          disabled={clipLocked}
          {ontrim}
        />
      {/if}
      <div class="time-scrubber">
        <div
          bind:clientWidth={plotWidth}
          class="time-axis"
          style:--progress={progress + '%'}
        >
          <div
            class="time-ticks"
            aria-label="Elapsed time in minutes and seconds"
          >
            {#each ticks as value}
              <span style:left={percent(value) + '%'}>
                {tickLabel(value)}
              </span>
            {/each}{#each minorTicks as value}
              <i
                style:left={percent(value) + '%'}
                aria-hidden="true"
              ></i>
            {/each}
          </div>
          <input
            class="time-slider"
            aria-label="Replay time"
            aria-valuetext={time.toFixed(2) +
              ' seconds, ' +
              phase +
              (currentSegment ? ', ' + currentSegment : '')}
            title="Drag to seek through the replay"
            type="range"
            min={bounds.startTime}
            max={displayBounds.endTime}
            step=".001"
            value={Math.min(time, displayBounds.endTime)}
            disabled={!frames.length}
            oninput={(event) => scrub(Number(event.currentTarget.value))}
          />
        </div>
      </div>
      {@render telemetry?.()}
      <ReplayCourseTracks
        {frames}
        {bounds}
        endTime={displayBounds.endTime}
        {course}
        {segments}
        {time}
        {leader}
        {percent}
        {onseek}
        bind:labelWidth
        bind:tracks
      />
      {#if children}
        <div class="timeline-skills">{@render children(ticks)}</div>
      {/if}
    </div>
  </div>
</section>

<style>
  @import './replay-timeline.css';
</style>
