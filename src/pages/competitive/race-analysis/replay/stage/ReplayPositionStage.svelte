<script lang="ts">
  import { blockerAt } from '@/lib/race/capture/race-diagnostics';
  import { hpRemainingColor } from '@/lib/race/replay/race-display';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import { courseSegments, type Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import type { ReplayToggles } from '../replay-display';
  import type { CourseShape } from '../replay-course';
  import type { RunnerCallout } from '../replay-callouts';
  import ReplayRunnerCallouts from '../ReplayRunnerCallouts.svelte';
  import ReplayCourseMinimap from '../map/ReplayCourseMinimap.svelte';
  import { finalSpurtSection } from '@/lib/race/final-spurt';

  let {
    replay,
    course,
    toggles,
    callouts,
    shape,
    laneMax,
    laneTarget,
    positionViewport,
    visibility,
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    course?: Course;
    toggles: ReplayToggles;
    callouts: Map<number, RunnerCallout[]>;
    shape?: CourseShape;
    laneMax: number;
    laneTarget: number;
    positionViewport: { min: number; max: number };
    visibility: Record<number, number>;
    selected?: string;
  } = $props();

  let stageWidth = $state(1000),
    stageHeight = $state(300);

  const segments = $derived(courseSegments(course));

  const crowdedRunners = $derived.by(() => {
    const points = replay.capture.runners.flatMap((r) => {
      const h = replay.frame?.horses[r.index];
      return h && visibility[r.index] !== 2
        ? [
            {
              index: r.index,
              x: (x(h.distance) / 1000) * stageWidth,
              y: (h.lanePosition / laneMax) * stageHeight
            }
          ]
        : [];
    });

    return new Set(
      points
        .filter((a) =>
          points.some(
            (b) => a.index !== b.index && Math.abs(a.x - b.x) < 74 && Math.abs(a.y - b.y) < 58
          )
        )
        .map((p) => p.index)
    );
  });

  const x = (distance: number) =>
    ((distance - positionViewport.min) / (positionViewport.max - positionViewport.min)) * 1000;

  const hpColor = (value?: number) => hpRemainingColor(value, $theme === 'dark');
</script>

<div class="positions-target fullscreen-target">
  <div
    class="race-stage"
    data-lane-max={laneMax}
    data-lane-target={laneTarget}
    aria-label="Runner positions by distance and lane"
  >
    <div
      class="lane-axis"
      title="Lateral distance from the inside rail, in metres"
    >
      <small>Lane (m)</small>
      {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
        <span style:bottom={fraction * 100 + '%'}>
          {replay.laneMetres(laneMax * fraction)}
        </span>
      {/each}
    </div>
    <div
      class="track-plane"
      bind:clientWidth={stageWidth}
      bind:clientHeight={stageHeight}
    >
      <span class="rail-label">INSIDE RAIL</span>
      <svg
        class="course-background"
        viewBox="0 0 1000 410"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each [0.25, 0.5, 0.75, 1] as fraction}
          <line
            x1="0"
            x2="1000"
            y1={410 * (1 - fraction)}
            y2={410 * (1 - fraction)}
            class="lane-guide"
          />
        {/each}
        {#if toggles.course}
          {#each segments as segment}
            <rect
              x={x(segment.start)}
              y="0"
              width={((segment.end - segment.start) /
                (positionViewport.max - positionViewport.min)) *
                1000}
              height="410"
              fill={segment.color}
              fill-opacity=".07"
            />
            <line
              x1={x(segment.start)}
              x2={x(segment.start)}
              y1="0"
              y2="410"
              stroke={segment.color}
              stroke-dasharray="4 4"
            />
          {/each}
          {#each [{ distance: replay.bounds.distanceMax / 6, label: 'Mid race' }, { distance: (replay.bounds.distanceMax * 10) / 24, label: 'Position Keep ends' }, { distance: finalSpurtSection(replay.bounds.distanceMax).start, label: 'Final spurt window' }] as marker}
            <line
              x1={x(marker.distance)}
              x2={x(marker.distance)}
              y1="0"
              y2="410"
              class="phase-marker"
            />
          {/each}
        {/if}
        {#if toggles.slopes}
          {#each course?.slopes ?? [] as slope}
            <polygon
              points={slope.slope > 0
                ? x(slope.start) +
                  ',410 ' +
                  x(slope.start + slope.length) +
                  ',410 ' +
                  x(slope.start + slope.length) +
                  ',205'
                : x(slope.start) +
                  ',410 ' +
                  x(slope.start) +
                  ',205 ' +
                  x(slope.start + slope.length) +
                  ',410'}
              fill={slope.slope > 0 ? '#bd7581' : '#719bdd'}
              fill-opacity=".07"
            />
          {/each}
        {/if}
        {#if toggles.positionKeep && replay.leader < (replay.bounds.distanceMax * 10) / 24}
          {@const factor =
            1 +
            (replay.bounds.distanceMax - 1000) *
              0.0008}{#each [{ min: 3, max: 5 * factor, color: '#be91d4' }, { min: 6.5 * factor, max: 7 * factor, color: '#69b7ee' }, { min: 7.5 * factor, max: 8 * factor, color: '#7bc8a0' }] as zone}
            <rect
              x={x(replay.leader - zone.max)}
              width={((zone.max - zone.min) / (positionViewport.max - positionViewport.min)) * 1000}
              y="0"
              height="410"
              fill={zone.color}
              fill-opacity=".16"
            />
          {/each}
        {/if}
        {#each [0, replay.bounds.distanceMax] as distance}
          <line
            class="race-boundary"
            data-distance={distance}
            x1={x(distance)}
            x2={x(distance)}
            y1="0"
            y2="410"
          />
        {/each}
      </svg>
      {#each [{ distance: 0, label: 'Start' }, { distance: replay.bounds.distanceMax, label: 'Finish' }].filter((m) => m.distance >= positionViewport.min && m.distance <= positionViewport.max) as marker}
        <span
          class="course-label boundary-label"
          style:left={x(marker.distance) / 10 + '%'}
        >
          {marker.label}
        </span>
      {/each}
      {#if toggles.course}
        {#each segments.filter((s) => s.start > 0 && s.start >= positionViewport.min && s.start <= positionViewport.max) as segment}
          <span
            class="course-label"
            style:left={x(segment.start) / 10 + '%'}
          >
            {segment.label}
          </span>
        {/each}{#each [{ distance: replay.bounds.distanceMax / 6, label: 'Mid race' }, { distance: finalSpurtSection(replay.bounds.distanceMax).start, label: 'Final spurt window · Late race' }].filter((m) => m.distance >= positionViewport.min && m.distance <= positionViewport.max) as marker}
          <span
            class="course-label phase"
            style:left={x(marker.distance) / 10 + '%'}
          >
            {marker.label}
          </span>
        {/each}
      {/if}
      {#each replay.capture.runners as r}
        {@const runnerCallouts = callouts.get(r.index)}
        {@const horse =
          replay.frame?.horses[
            r.index
          ]}{#if horse && visibility[r.index] !== 2 && horse.distance >= positionViewport.min && horse.distance <= positionViewport.max && horse.lanePosition <= laneMax}
          <button
            class="replay-marker"
            class:crowded={crowdedRunners.has(r.index)}
            class:dim={visibility[r.index] === 1}
            class:triggered={toggles.skills &&
              replay.recentSkills.some((e) => e.params[0] === r.index)}
            class:selected={r.index === replay.runner?.index}
            class:front-blocked={toggles.blocked &&
              replay.blockingNow.some((b) => b.horseIndex === r.index)}
            style:left={x(horse.distance) / 10 + '%'}
            style:bottom={(horse.lanePosition / laneMax) * 100 + '%'}
            style:--runner-color={replay.teamColor(r)}
            aria-label={'Inspect ' + r.name}
            aria-pressed={r.index === replay.runner?.index}
            title={r.name +
              ', ' +
              (horse.speed / 100).toFixed(2) +
              ' m/s, HP ' +
              Math.round(horse.hp) +
              ', ' +
              horse.distance.toFixed(1) +
              'm, Lane ' +
              Math.round(horse.lanePosition)}
            onclick={() => (selected = String(r.index))}
          >
            {#if toggles.blocked && (blockerAt(replay.capture, r.index, replay.time, horse.blockFrontHorseIndex) ?? -1) >= 0}
              <span
                class="blocked"
                title="Blocked"
              >
                !
              </span>
            {/if}
            <span class="portrait">
              <Artwork
                src={portrait(r.cardId)}
                alt=""
                size="sm"
                shape="circle"
              />
              <b>{r.index + 1}</b>
            </span>
            <span class="hp">
              <i
                style:width={(replay.fieldHp(r.index, false) ?? 0) + '%'}
                style:background={hpColor(replay.fieldHp(r.index, false))}
              ></i>
            </span>
            {#if r.index === replay.runner?.index}
              <span class="marker-name">{r.name}</span>
            {/if}
            {#if runnerCallouts}
              <span class="marker-callouts">
                <ReplayRunnerCallouts
                  callouts={runnerCallouts}
                  timers={toggles.skillTimers}
                  limit={crowdedRunners.has(r.index) && r.index !== replay.runner?.index ? 1 : 3}
                />
              </span>
            {/if}
            {#if toggles.speed || toggles.accel}
              <span class="marker-telemetry">
                {#if toggles.speed}
                  <span title="Speed (m/s)">
                    {(horse.speed / 100).toFixed(2)}
                  </span>
                {/if}{#if toggles.accel}
                  <span title="Acceleration (m/s²)">
                    {replay.acceleration(r.index) > 0 ? '+' : ''}{replay
                      .acceleration(r.index)
                      .toFixed(2)}
                  </span>
                {/if}
              </span>
            {/if}
          </button>
        {/if}
      {/each}
      {#if toggles.minimap && shape}
        <ReplayCourseMinimap
          {shape}
          frame={replay.frame}
          runners={replay.capture.runners}
          viewport={positionViewport}
          selected={replay.runner?.index ?? -1}
          {visibility}
          teamColor={replay.teamColor}
        />
      {/if}
      <div class="distance-axis">
        {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
          <span style:left={fraction * 100 + '%'}>
            {Math.round(
              positionViewport.min + (positionViewport.max - positionViewport.min) * fraction
            )}m
          </span>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  @import './replay-position-stage.css';
</style>
