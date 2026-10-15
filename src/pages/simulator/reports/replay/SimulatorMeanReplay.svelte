<script lang="ts">
  import { onMount, untrack, type Component, type Snippet } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import {
    loadReplayCourses,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { RaceTrajectory } from '@/lib/race/replay/race-ensemble';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import { telemetryEnsemble } from './report-replay';
  import SimulatorSkillWindows from '../skills/SimulatorSkillWindows.svelte';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /**
   * The race replay itself in mean mode: every runner at her average position over the sampled races,
   * and every race drawn faintly in the replay's own telemetry. Built from the report, so it needs no extra requests.
   */
  let {
    result,
    umas,
    course,
    track = {},
    suspended = false,
    source = $bindable()
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    course?: RaceCourse;
    track?: ParsedRaceCapture['track'];
    suspended?: boolean;
    /** The runner the replay follows, as a report source index. */
    source?: number;
  } = $props();

  type ReplayProps = {
    capture: ParsedRaceCapture;
    ensemble?: RaceTrajectory[];
    selected?: string;
    suspended?: boolean;
    overviewOnly?: boolean;
    focus?: { runner: number; time?: number };
    ensembleTimeline?: Snippet<
      [
        {
          ticks: number[];
          time: number;
          startTime: number;
          endTime: number;
          runner: number;
          seek: (time: number) => void;
          course?: Course;
          timeAt: (distance: number) => number | undefined;
          distanceMax: number;
        }
      ]
    >;
  };

  let Replay = $state.raw<Component<ReplayProps, object, 'selected'>>(),
    laneWidth = $state<number>();

  onMount(() => {
    let alive = true;
    void import('@/pages/competitive/race-analysis/replay/RaceReplay.svelte').then((module) => {
      if (alive) Replay = module.default as unknown as Component<ReplayProps, object, 'selected'>;
    });

    // Lane positions are stored relative to the track width; the replay reads them back with the same course metadata.
    void loadReplayCourses()
      .then((data) => {
        if (alive)
          laneWidth = (course ? (data.courses[course.course_id]?.laneMax ?? 11250) : 11250) / 1000;
      })
      .catch(() => {
        if (alive) laneWidth = 11.25;
      });

    return () => {
      alive = false;
    };
  });

  const built = $derived.by(() => {
    if (!course || laneWidth === undefined || !result.report?.telemetry) return undefined;
    try {
      return { ensemble: telemetryEnsemble(result, umas, course, laneWidth, track) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'The mean race could not be built.'
      };
    }
  });

  const ensemble = $derived(built?.ensemble);
  const waiting = $derived(
    Boolean(course) && Boolean(result.report?.telemetry) && (laneWidth === undefined || !Replay)
  );

  // The replay follows a runner by index; in this replay that index is the report's source index.
  let selected = $state(String(untrack(() => source ?? 0)));

  $effect(() => {
    if (source !== undefined) selected = String(source);
  });

  $effect(() => {
    const value = Number(selected);
    if (Number.isInteger(value) && value !== untrack(() => source)) source = value;
  });

  // Open on the typical moment the winner crosses the line, where the field spread shows the final margins; Play runs the race from the start.
  const focus = $derived.by(() => {
    if (!ensemble) return undefined;
    const winners = ensemble.trajectories
      .map((trajectory) => Math.min(...trajectory.finishTimes))
      .sort((a, b) => a - b);

    return { runner: untrack(() => source ?? 0), time: winners[winners.length >> 1] };
  });

  const races = $derived(
    ensemble
      ? (ensemble.trajectories.length < ensemble.runs
          ? ensemble.trajectories.length.toLocaleString('en-US') +
            ' of ' +
            ensemble.runs.toLocaleString('en-US')
          : ensemble.runs.toLocaleString('en-US')) + ' races'
      : ''
  );
</script>

<section
  id="simulation-course"
  class="mean-replay"
  aria-label="Mean race replay"
>
  <ChartFrame
    id="simulation-mean-replay"
    title={'Mean race' + (races ? ' · ' + races : '')}
    slim
    state={ensemble && Replay ? 'ready' : waiting ? 'loading' : 'empty'}
    description="Every runner at her average position at the same race time, over the sampled races. Field spread shows how far behind each race’s leader she is; the graph draws every race faintly behind the average, and the skill rows share its clock. Select a runner in the field to follow her. Press Play to run the race from the start."
    emptyTitle={built?.error ? 'Mean race unavailable' : 'Race telemetry unavailable'}
    emptyDetail={built?.error ??
      (course
        ? 'This batch has no per-race telemetry. Run it again to watch the mean race.'
        : 'Pick a course to watch the mean race.')}
  >
    {#if ensemble && Replay}
      <Replay
        capture={ensemble.mean}
        ensemble={ensemble.trajectories}
        bind:selected
        overviewOnly
        {focus}
        {suspended}
      >
        {#snippet ensembleTimeline({
          ticks,
          time,
          startTime,
          endTime,
          runner,
          seek,
          course: profile,
          timeAt,
          distanceMax
        })}
          <SimulatorSkillWindows
            {result}
            {umas}
            {runner}
            {time}
            {startTime}
            {endTime}
            {ticks}
            course={profile}
            {timeAt}
            {distanceMax}
            onseek={seek}
          />
        {/snippet}
      </Replay>
    {/if}
  </ChartFrame>
</section>

<style>
  .mean-replay {
    min-width: 0;
    margin-bottom: 12px;
  }
</style>
