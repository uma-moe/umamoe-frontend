<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { raceTimeAtDistance, type ReplayBounds } from '@/lib/race/replay/race-replay';
  import type { Course, courseSegments } from '../replay-course';
  import { courseTerrain, slopeLabel, timedSection, type TimedSection } from '../replay-timeline';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  let {
    frames,
    bounds,
    endTime,
    course,
    segments,
    time,
    leader,
    percent,
    onseek,
    labelWidth = $bindable(0),
    tracks = $bindable()
  }: {
    frames: ParsedRaceCapture['frames'];
    bounds: ReplayBounds;
    endTime: number;
    course?: Course;
    segments: TimedSection<ReturnType<typeof courseSegments>[number]>[];
    time: number;
    leader: number;
    percent: (value: number) => number;
    onseek: (time: number) => void;
    labelWidth?: number;
    tracks?: HTMLDivElement;
  } = $props();

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
  const spurt = $derived(
    timedSection(
      finalSpurtSection(bounds.distanceMax),
      frames,
      bounds.distanceMax,
      endTime,
      percent
    )[0]
  );
  const slopes = $derived(
    terrain?.slopes.flatMap((section) =>
      timedSection(section, frames, bounds.distanceMax, endTime, percent)
    ) ?? []
  );

  const minHeight = $derived(
    Math.min(0, ...(terrain?.elevation.map((point) => point.height) ?? []))
  );

  const maxHeight = $derived(
    Math.max(0, ...(terrain?.elevation.map((point) => point.height) ?? []))
  );

  const elevation = $derived(
    terrain?.elevation.map((point) => ({
      distance: point.distance,
      x: percent(raceTimeAtDistance(frames, point.distance) ?? endTime) * 10,
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
</script>

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
    <span class="timeline-label">Final spurt</span>
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
          aria-label="Course elevation profile with uphill in pink and downhill in blue"
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
          aria-label={'Seek to ' + segment.label + ' at ' + Math.round(segment.start) + ' metres'}
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
          {@const end = phases[index + 1]?.time ?? endTime}
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
      class="phase-navigation"
      aria-label="Final spurt window"
    >
      {#if spurt}
        <button
          style:left={spurt.left + '%'}
          style:width={spurt.width + '%'}
          style:--segment-color={spurt.color}
          title={FINAL_SPURT_HELP}
          aria-label={'Seek to final spurt window at ' + Math.round(spurt.start) + ' metres'}
          onclick={() => onseek(spurt.time)}
        >
          Final spurt from {Math.round(spurt.start)} m
        </button>
      {/if}
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
    <span></span>
    <span class="finish">Finish ▦</span>
  </div>
</div>

<style>
  @import './replay-course-tracks.css';
</style>
