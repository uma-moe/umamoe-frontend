<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { raceTimeAtDistance, replayProgress, type ReplayBounds } from '@/lib/race/race-replay';
  import { courseSegments, type Course } from './replay-course';
  import { courseTerrain, replayTimeTicks } from './replay-timeline';

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

  function timedSection<T extends { start: number; end: number }>(section: T) {
    const start = raceTimeAtDistance(frames, section.start),
      end =
        section.end >= bounds.distanceMax
          ? displayBounds.endTime
          : (raceTimeAtDistance(frames, section.end) ?? displayBounds.endTime);
    return start === undefined
      ? []
      : [
          {
            ...section,
            time: start,
            left: percent(start),
            width: Math.max(0, percent(end) - percent(start))
          }
        ];
  }

  const segments = $derived(courseSegments(course).flatMap(timedSection));
  const phases = $derived([
    { label: 'Early race', action: 'Start', color: '#8d96a5', time: bounds.startTime },
    {
      label: 'Mid race',
      action: 'Mid race',
      color: '#69b7ee',
      time: raceTimeAtDistance(frames, bounds.distanceMax / 6)
    },
    {
      label: 'Late race',
      action: 'Late race',
      color: '#dfba72',
      time: raceTimeAtDistance(frames, (bounds.distanceMax * 2) / 3)
    },
    {
      label: 'Final leg',
      action: 'Final leg',
      color: '#bd91d1',
      time: raceTimeAtDistance(frames, (bounds.distanceMax * 5) / 6)
    }
  ]);
  const terrain = $derived(course ? courseTerrain(course) : undefined);
  const slopes = $derived(terrain?.slopes.flatMap(timedSection) ?? []);
  const minHeight = $derived(
    Math.min(0, ...(terrain?.elevation.map((point) => point.height) ?? []))
  );
  const maxHeight = $derived(
    Math.max(0, ...(terrain?.elevation.map((point) => point.height) ?? []))
  );
  const elevation = $derived(
    terrain?.elevation.map((point) => ({
      distance: point.distance,
      x: percent(raceTimeAtDistance(frames, point.distance) ?? displayBounds.endTime) * 10,
      y:
        maxHeight > minHeight
          ? 44 - ((point.height - minHeight) / (maxHeight - minHeight)) * 36
          : 36
    })) ?? []
  );
  const hillPaths = $derived(
    (course?.slopes ?? []).map((s) => {
      const a = elevation.find((p) => p.distance === s.start),
        b = elevation.find((p) => p.distance === Math.min(bounds.distanceMax, s.start + s.length));
      return { slope: s.slope, path: a && b ? 'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y : '' };
    })
  );
  const currentSegment = $derived(segments.find((s) => leader >= s.start && leader < s.end)?.label);
  const slope = $derived(
    course?.slopes.find((s) => leader >= s.start && leader < s.start + s.length)?.slope ?? 0
  );

  const slopeLabel = (value: number) =>
    value === 0
      ? 'Level'
      : (value > 0 ? 'Uphill +' : 'Downhill ') + (value / 10000).toFixed(1) + '%';
</script>

<section
  bind:clientWidth={width}
  class="playback"
  style:--timeline-visible-width={width + 'px'}
  aria-label="Race playback"
  style:--replay-position={progress + '%'}
>
  <div
    class="playback-controls"
    role="toolbar"
    aria-label="Playback and telemetry controls"
  >
    <Button
      size="sm"
      onclick={onplay}
      disabled={!frames.length}
    >
      {playing ? 'Pause' : 'Play'}
    </Button>
    {#if !minimal}
      <Button
        variant="secondary"
        size="sm"
        onclick={() => onseek(bounds.startTime)}
      >
        Restart
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => onseek(time - 1)}
      >
        −1s
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => onseek(time + 1)}
      >
        +1s
      </Button>
    {/if}
    <div class="playback-state">
      <span>
        <strong class="race-phase">{phase}</strong>
        {#if currentSegment}
          <span>{currentSegment}</span>
        {/if}{#if slope}
          <span>
            {slopeLabel(slope)}
          </span>
        {/if}
      </span>
      <span>
        Leader {Math.round(Math.min(leader, bounds.distanceMax)).toLocaleString()} / {Math.round(
          bounds.distanceMax
        ).toLocaleString()} m
        <span class="remaining">
          {Math.round(Math.max(0, bounds.distanceMax - leader)).toLocaleString()} m remaining
        </span>
      </span>
    </div>
    {#if actions}
      <div class="playback-actions">{@render actions()}</div>
    {/if}
    <span class="playback-clock">
      <strong>{formatRaceTime(time, 2)}</strong>
      <span class="clock-total">
        / {formatRaceTime(bounds.endTime, 2)}
      </span>
    </span>
    {#if !minimal}
      <Button
        variant="secondary"
        size="sm"
        ariaLabel="Finish"
        onclick={() => onseek(displayBounds.endTime)}
      >
        Finish ▦
      </Button>
    {/if}
    <SelectField
      id="playback-speed"
      label="Playback speed"
      hideLabel
      options={['0.5', '1', '2', '4', '8'].map((value) => ({ value, label: value + '×' }))}
      bind:value={speed}
    />
    <InspectPopover
      label="How to read the replay timeline"
      align="end"
    >
      {#snippet trigger()}
        <span class="timeline-help">
          <Icon
            name="info"
            size={16}
          />
        </span>
      {/snippet}
      <h3>Course and skill timeline</h3>
      <p>
        The telemetry graph, course lanes and skill icons use the same replay time axis. Course
        boundaries mark when the race leader reaches each section; elevation is relative to the
        start.
      </p>
      <p>
        Select a course section or race phase to jump to its start. Drag the blue handle to scrub,
        or focus it and use the arrow keys.
      </p>
      <p>
        The skills below belong to the selected runner. Select an activation to replay it. Skill
        icons show activation times and highlight while active. Numbered icons group nearby
        activations. Open Skill activity details for names, exact durations and activation rolls.
      </p>
    </InspectPopover>
  </div>
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
      <div
        class="race-timeline"
        title="Drag the blue handle to scrub through the replay"
      >
        <div
          bind:clientWidth={labelWidth}
          class="timeline-labels"
          aria-hidden="true"
        >
          <span
            class="timeline-label"
            title="Elevation relative to the race start"
          >
            Elevation (m)
          </span>
          <span class="timeline-label">Slope</span>
          <span class="timeline-label">Course</span>
          <span class="timeline-label">Race phase</span>
        </div>
        <div
          bind:this={tracks}
          class="course-tracks"
        >
          <div class="terrain">
            {#if course}
              <svg
                viewBox="0 0 1000 52"
                preserveAspectRatio="none"
                role="img"
                aria-label="Course elevation profile; uphill in pink and downhill in blue"
              >
                <path
                  class="terrain-fill"
                  d={'M0 52 ' +
                    elevation.map((p) => 'L' + p.x + ' ' + p.y).join(' ') +
                    ' L1000 ' +
                    (elevation.at(-1)?.y ?? 36) +
                    ' L1000 52Z'}
                />
                <polyline
                  class="terrain-line"
                  points={elevation.map((p) => p.x + ',' + p.y).join(' ')}
                />
                {#each hillPaths as hill}
                  <path
                    class="hill"
                    d={hill.path}
                    stroke={hill.slope > 0 ? '#bd7581' : '#719bdd'}
                  />
                {/each}
              </svg>
            {:else}
              <span class="unknown-course">
                Select a course in Display options to see its terrain and sections.
              </span>
            {/if}
          </div>
          <div
            class="slope-bands"
            aria-label="Course slopes"
          >
            {#each slopes as section}
              <button
                style:left={section.left + '%'}
                style:width={section.width + '%'}
                style:--segment-color={section.slope > 0
                  ? '#bd7581'
                  : section.slope < 0
                    ? '#719bdd'
                    : '#737d89'}
                class:narrow={section.width < 5}
                class:active={leader >= section.start && leader < section.end}
                title={slopeLabel(section.slope) +
                  ', ' +
                  Math.round(section.start) +
                  '–' +
                  Math.round(section.end) +
                  ' m'}
                aria-label={'Seek to ' +
                  slopeLabel(section.slope) +
                  ' at ' +
                  Math.round(section.start) +
                  ' metres'}
                onclick={() => onseek(section.time)}
              >
                <span class="slope-name">{slopeLabel(section.slope)}</span>
                <span
                  class="slope-symbol"
                  aria-hidden="true"
                >
                  {section.slope > 0 ? '↗' : section.slope < 0 ? '↘' : '–'}
                </span>
              </button>
            {/each}
          </div>
          <div
            class="course-bands"
            aria-label="Course sections"
          >
            {#each segments as segment}
              <button
                style:left={segment.left + '%'}
                style:width={segment.width + '%'}
                style:--segment-color={segment.color}
                class:active={leader >= segment.start && leader < segment.end}
                title={segment.label +
                  ', ' +
                  Math.round(segment.start) +
                  '–' +
                  Math.round(segment.end) +
                  ' m'}
                aria-label={'Seek to ' +
                  segment.label +
                  ' at ' +
                  Math.round(segment.start) +
                  ' metres'}
                onclick={() => onseek(segment.time)}
              >
                {segment.label}
              </button>
            {/each}
          </div>
          <div
            class="phase-navigation"
            aria-label="Race phases"
          >
            {#each phases as item, index}
              {#if item.time !== undefined}
                {@const end = phases[index + 1]?.time ?? displayBounds.endTime}
                <button
                  style:left={percent(item.time) + '%'}
                  style:width={Math.max(0, percent(end) - percent(item.time)) + '%'}
                  style:--segment-color={item.color}
                  class:active={time >= item.time && time < end}
                  aria-label={item.action}
                  title={item.label + ' at ' + item.time.toFixed(2) + ' s'}
                  onclick={() => onseek(item.time!)}
                >
                  {item.label}
                </button>
              {/if}
            {/each}
          </div>
          <div
            class="timeline-cursor"
            aria-hidden="true"
          ></div>
        </div>
        <div class="timeline-values">
          <span class="elevation-range">
            {#if course}
              <span>{maxHeight.toFixed(1)} m</span>
              <span>{minHeight.toFixed(1)} m</span>
            {/if}
          </span>
          <span></span>
          <span></span>
          <span class="finish">Finish ▦</span>
        </div>
      </div>
      {#if children}
        <div class="timeline-skills">{@render children(ticks)}</div>
      {/if}
    </div>
  </div>
</section>

<style>
  @import './replay-timeline.css';
</style>
