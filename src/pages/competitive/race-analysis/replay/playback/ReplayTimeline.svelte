<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { replayProgress, type ReplayBounds } from '@/lib/race/race-replay';
  import { courseSegments, type Course } from '../replay-course';
  import { replayTimeTicks, timedSection } from '../replay-timeline';
  import ReplayPlaybackControls from './ReplayPlaybackControls.svelte';
  import ReplayCourseTracks from './ReplayCourseTracks.svelte';

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
    minimal = false,
    onplay,
    onseek,
    children,
    telemetry,
    actions
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
    /** Play and the time slider only: no restart, step or finish buttons. */
    minimal?: boolean;
    onplay: () => void;
    onseek: (time: number) => void;
    children?: Snippet<[number[]]>;
    telemetry?: Snippet;
    actions?: Snippet;
  } = $props();

  let width = $state(0),
    labelWidth = $state(0),
    plotWidth = $state(0),
    scrollArea = $state<HTMLDivElement>(),
    tracks = $state<HTMLDivElement>();

  const displayBounds = $derived({
    ...bounds,
    endTime: timelineEnd ?? bounds.endTime,
    duration: (timelineEnd ?? bounds.endTime) - bounds.startTime
  });

  const percent = (value: number) => replayProgress(value, displayBounds) * 100;

  const progress = $derived(percent(time));

  $effect(() => {
    progress;
    width;
    labelWidth;
    if (!scrollArea || !tracks || scrollArea.scrollWidth <= scrollArea.clientWidth) return;
    const cursor = tracks.offsetLeft + (tracks.clientWidth * progress) / 100;
    if (
      cursor < scrollArea.scrollLeft + labelWidth + 10 ||
      cursor > scrollArea.scrollLeft + scrollArea.clientWidth - 12
    )
      scrollArea.scrollLeft = cursor - labelWidth - (scrollArea.clientWidth - labelWidth) / 2;
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
  const slope = $derived(
    course?.slopes.find((s) => leader >= s.start && leader < s.start + s.length)?.slope ?? 0
  );
</script>

<section
  bind:clientWidth={width}
  class="playback"
  style:--timeline-visible-width={width + 'px'}
  aria-label="Race playback"
  style:--replay-position={progress + '%'}
>
  <ReplayPlaybackControls
    {bounds}
    endTime={displayBounds.endTime}
    {time}
    bind:speed
    {playing}
    disabled={!frames.length}
    {phase}
    {currentSegment}
    {slope}
    {leader}
    {minimal}
    {onplay}
    {onseek}
    {actions}
  />
  <small class="scroll-hint">Scroll sideways to see the full course and skill timeline</small>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The shared horizontal timeline must be reachable with the keyboard.) -->
  <div
    bind:this={scrollArea}
    class="timeline-scroll"
    role="region"
    aria-label="Course and skills"
    tabindex="0"
  >
    <div class="timeline-content">
      <div class="time-scrubber">
        <div class="time-label timeline-label">
          Time <span>m:ss</span>
        </div>
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
