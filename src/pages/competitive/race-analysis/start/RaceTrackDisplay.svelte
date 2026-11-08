<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import Button from '@/components/controls/Button.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import {
    raceFrameAtTime,
    raceTimeAtDistance,
    replayLaneMetres
  } from '@/lib/race/replay/race-replay';
  import { formatRaceTime, runningStyleName } from '@/lib/race/replay/race-display';
  import { portrait, styleColors } from '@/pages/competitive/analysis-view';
  import { makeDemoRaces } from '@/pages/competitive/demo-races';
  import ReplayBrandMark from '../replay/ReplayBrandMark.svelte';
  import ReplayTrackStatus from '../replay/map/ReplayTrackStatus.svelte';
  import {
    loadReplayGeometry,
    trackStatusAt,
    type CourseData,
    type CourseShape
  } from '../replay/replay-course';
  import { recordedFinishTime, replayTeamColors } from '../replay/replay-state.svelte';
  import { trackDisplayLayout } from './track-display-layout';

  let {
    courses,
    actions
  }: {
    courses?: CourseData;
    actions?: Snippet;
  } = $props();

  // Ten times real speed runs the whole race in about twelve seconds.
  const PLAYBACK_SPEED = 10;
  // Without motion the display rests on the final leg, where the field is still contesting.
  const RESTING_TIME = 105;
  const POLE_SPACING = 400;
  // Room around the course for the portrait markers, which are drawn at a fixed size.
  const MAP_MARGIN = 34;
  const LABELLED_MAP_WIDTH = 560;
  const DEFAULT_LANE_WIDTH = 11.25;

  const uid = $props.id();
  const sample = makeDemoRaces(1)[0]!;
  const duration = sample.frames.at(-1)!.time;
  const courseId = String(sample.courseId ?? '');

  let shapes = $state.raw<Record<string, CourseShape>>();
  let geometryFailed = $state(false);
  let mapWidth = $state(0);
  let mapHeight = $state(0);
  let display = $state<HTMLElement>();
  let time = $state(prefersReducedMotion.current ? RESTING_TIME : 0);
  let playing = $state(false);
  let playbackFrame: number | undefined;

  const course = $derived(courses?.courses[courseId]);
  const shape = $derived(shapes?.[courseId]);
  const courseName = $derived(
    course ? (courses?.names[course.raceTrackId] ?? 'Demo course') : 'Tokyo'
  );

  const dirt = $derived(course?.surface === 2);
  const raceDistance = $derived(course?.distance ?? sample.raceDistance ?? 2400);
  const laneWidth = $derived(
    course?.laneMax === undefined ? DEFAULT_LANE_WIDTH : course.laneMax / 1000
  );

  const layout = $derived(
    shape && course
      ? trackDisplayLayout({
          shape,
          course,
          laneWidth,
          width: mapWidth,
          height: mapHeight,
          margin: MAP_MARGIN
        })
      : undefined
  );

  const frame = $derived(raceFrameAtTime(sample.frames, time)!);
  const finishTimes = $derived(
    new Map(
      sample.runners.map((runner) => [
        runner.index,
        recordedFinishTime(runner) ?? raceTimeAtDistance(sample.frames, raceDistance, runner.index)
      ])
    )
  );

  const order = $derived(
    sample.runners
      .map((runner) => {
        const horse = frame.horses[runner.index]!;
        const finishTime = finishTimes.get(runner.index);
        const finished = finishTime !== undefined && time >= finishTime;
        // Demo frames hold finished runners on the line; let them coast on at their average speed.
        const distance = finished
          ? Math.max(horse.distance, raceDistance * (time / finishTime))
          : horse.distance;

        return {
          runner,
          distance,
          finishTime: finished ? finishTime : undefined,
          lane: replayLaneMetres(horse.lanePosition, laneWidth),
          // The demo field runs as three teams of three, in gate order.
          color: replayTeamColors[Math.floor(runner.index / 3) % replayTeamColors.length]!
        };
      })
      .sort(compareRunningOrder)
  );

  const leader = $derived(order[0]!);
  const status = $derived(
    trackStatusAt(course, raceDistance, Math.min(leader.distance, raceDistance))
  );
  const showLabels = $derived(mapWidth >= LABELLED_MAP_WIDTH);

  const poles = $derived.by(() => {
    if (!layout) return [];

    const distances: number[] = [];

    for (let distance = POLE_SPACING; distance < raceDistance; distance += POLE_SPACING) {
      distances.push(distance);
    }

    return distances.map((distance) => ({
      distance,
      rail: layout.place(distance, 0),
      edge: layout.place(distance, laneWidth)
    }));
  });

  const finish = $derived(layout?.place(raceDistance, laneWidth / 2));
  const packPath = $derived(
    layout && leader.distance > 0 ? layout.section(order.at(-1)!.distance, leader.distance) : ''
  );

  // Trailing runners are drawn first so the leaders stay on top of the pack.
  const markers = $derived(
    layout
      ? order
          .map((entry) => ({ ...entry, point: layout.place(entry.distance, entry.lane) }))
          .reverse()
      : []
  );

  function compareRunningOrder(
    a: { distance: number; finishTime?: number },
    b: { distance: number; finishTime?: number }
  ) {
    if (a.finishTime !== undefined && b.finishTime !== undefined)
      return a.finishTime - b.finishTime;
    if (a.finishTime !== undefined) return -1;
    if (b.finishTime !== undefined) return 1;

    return b.distance - a.distance;
  }

  function standingLabel(entry: { distance: number; finishTime?: number }) {
    if (entry.finishTime !== undefined) return formatRaceTime(entry.finishTime, 2);

    const gap = leader.distance - entry.distance;

    return gap < 0.05 ? 'Lead' : gap.toFixed(1) + ' m';
  }

  function runningStyle(runner: RaceRunner) {
    return runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
  }

  function play() {
    if (time >= duration) time = 0;

    let previous = performance.now();
    const advance = (now: number) => {
      time = Math.min(duration, time + ((now - previous) / 1000) * PLAYBACK_SPEED);
      previous = now;

      if (time >= duration) {
        pause();
        return;
      }

      playbackFrame = requestAnimationFrame(advance);
    };

    playing = true;
    playbackFrame = requestAnimationFrame(advance);
  }

  function pause() {
    if (playbackFrame !== undefined) cancelAnimationFrame(playbackFrame);

    playbackFrame = undefined;
    playing = false;
  }

  function togglePlayback() {
    if (playing) pause();
    else play();
  }

  onMount(() => {
    let active = true;

    void loadReplayGeometry()
      .then((value) => {
        if (active) shapes = value;
      })
      .catch(() => {
        if (active) geometryFailed = true;
      });

    return () => {
      active = false;
      pause();
    };
  });

  onMount(() => {
    if (!display || prefersReducedMotion.current) return;

    // Run the demo once, the first time the display is properly in view.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        observer.disconnect();
        play();
      },
      { threshold: 0.5 }
    );

    observer.observe(display);

    return () => observer.disconnect();
  });
</script>

<section
  class="track-display track-palette"
  data-surface={dirt ? 'dirt' : 'turf'}
  aria-labelledby="{uid}-title"
  bind:this={display}
>
  <header>
    <div class="display-title">
      <h2 id="{uid}-title">Demo race</h2>
      <span>{courseName}, {dirt ? 'Dirt' : 'Turf'} {raceDistance.toLocaleString()} m</span>
    </div>
    {#if actions}
      <div class="display-actions">{@render actions()}</div>
    {/if}
  </header>

  <div class="display-stage">
    <div
      class="course-map"
      bind:clientWidth={mapWidth}
      bind:clientHeight={mapHeight}
    >
      {#if layout}
        <svg
          viewBox="0 0 {mapWidth} {mapHeight}"
          role="img"
          aria-label="{courseName} course with the demo field at {formatRaceTime(time, 1)}."
        >
          <defs>
            <pattern
              id="{uid}-finish"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <rect
                width="6"
                height="6"
                fill="#f4f6f8"
              />
              <path
                d="M0 0h3v3H0zM3 3h3v3H3z"
                fill="#15181c"
              />
            </pattern>
          </defs>
          <polyline
            class="track-surface"
            points={layout.road}
            stroke-width={layout.roadWidth}
          />
          {#each layout.stripes as stripe}
            <polyline
              class="mowing-stripe"
              points={stripe}
              stroke-width={layout.roadWidth}
            />
          {/each}
          {#if packPath}
            <polyline
              class="pack-range"
              points={packPath}
              stroke-width={layout.roadWidth}
            />
          {/if}
          <polyline
            class="track-rail outer"
            points={layout.outerRail}
          />
          <polyline
            class="track-rail inner"
            points={layout.innerRail}
          />
          {#each poles as pole (pole.distance)}
            <line
              class="pole"
              x1={pole.rail.x}
              y1={pole.rail.y}
              x2={pole.edge.x}
              y2={pole.edge.y}
            />
            {#if showLabels}
              <text
                class="pole-label"
                x={pole.rail.x - pole.rail.nx * 14}
                y={pole.rail.y - pole.rail.ny * 14}
              >
                {pole.distance.toLocaleString()} m
              </text>
            {/if}
          {/each}
          {#if finish}
            <rect
              class="finish-line"
              x="-3"
              y={-layout.roadWidth / 2}
              width="6"
              height={layout.roadWidth}
              fill="url(#{uid}-finish)"
              transform="translate({finish.x} {finish.y}) rotate({finish.angle})"
            />
            {#if showLabels}
              <text
                class="course-label"
                x={finish.x + finish.nx * (layout.roadWidth / 2 + 16)}
                y={finish.y + finish.ny * (layout.roadWidth / 2 + 16)}
              >
                Finish
              </text>
            {/if}
          {/if}
        </svg>
        <div
          class="map-markers"
          aria-hidden="true"
        >
          {#each markers as marker (marker.runner.index)}
            <span
              class="map-marker"
              style:transform="translate3d({marker.point.x}px, {marker.point.y}px, 0)"
              style:--runner-color={marker.color}
            >
              <Artwork
                src={portrait(marker.runner.cardId)}
                alt=""
                size="sm"
                shape="circle"
                loading="eager"
              />
              <b>{marker.runner.index + 1}</b>
            </span>
          {/each}
        </div>
        <ReplayTrackStatus
          {status}
          showCourse
          showSlopes
        />
      {:else}
        <p
          class="map-status"
          role="status"
        >
          {geometryFailed ? 'The course map could not be loaded.' : 'Loading the course…'}
        </p>
      {/if}
      <ReplayBrandMark />
    </div>

    <section
      class="running-order"
      aria-label="Running order"
    >
      <ol>
        {#each order as entry, position (entry.runner.index)}
          <li
            class:finished={entry.finishTime !== undefined}
            style:--runner-color={entry.color}
          >
            <span
              class="place"
              class:podium={position < 3}
            >
              {position + 1}
            </span>
            <Artwork
              src={portrait(entry.runner.cardId)}
              alt=""
              size="xs"
              loading="eager"
            />
            <span class="runner-name">
              <strong>{entry.runner.name}</strong>
              <small>
                <span>Gate {entry.runner.index + 1}</span>
                <span style:color={styleColors[runningStyle(entry.runner)]}>
                  {runningStyleName(runningStyle(entry.runner))}
                </span>
              </small>
            </span>
            <span class="gap">{standingLabel(entry)}</span>
          </li>
        {/each}
      </ol>
    </section>
  </div>

  <div class="display-controls">
    <Button
      variant={playing ? 'secondary' : 'primary'}
      size="sm"
      icon={playing ? 'pause' : 'play'}
      onclick={togglePlayback}
    >
      {playing ? 'Pause' : time >= duration ? 'Replay' : 'Play'}
    </Button>
    <span class="clock">
      <b>{formatRaceTime(time, 2)}</b>
      / {formatRaceTime(duration, 2)}
    </span>
    <Slider
      id="demo-race-time"
      label="Race time"
      bind:value={time}
      min={0}
      max={duration}
      step={0.1}
      unit=" s"
      hideLabel
      showOutput={false}
      onchange={pause}
    />
  </div>
</section>

<style>
  @import '../replay/track-palette.css';
  @import './race-track-display.css';
</style>
