<script lang="ts">
  import RunnerReference from '@/pages/competitive/runners/RunnerReference.svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { raceDistanceSpread, type RaceTrajectory } from '@/lib/race/replay/race-ensemble';
  import type { Course } from '../replay-course';
  import ReplayOutcomeTrack from './ReplayOutcomeTrack.svelte';
  import ReplayOutcomeProfile from './ReplayOutcomeProfile.svelte';

  let {
    trajectories,
    time,
    course,
    courseId,
    distance,
    runner,
    color
  }: {
    trajectories: RaceTrajectory[];
    time: number;
    course?: Course;
    courseId: number;
    distance: number;
    runner: RaceRunner;
    color: string;
  } = $props();

  const uid = $props.id();

  const spread = $derived(raceDistanceSpread(trajectories, time, runner.index));
  const width = $derived(
    Math.min(
      distance,
      Math.max(120, (spread.p90 - spread.p10) * 2, Math.abs(spread.mean - spread.median) * 4)
    )
  );

  const low = $derived(Math.max(0, Math.min(distance - width, spread.median - width / 2))),
    high = $derived(low + width);
</script>

<section
  class="course-outcomes"
  aria-label="Track and course distributions"
  data-mean-distance={spread.mean}
  style:--runner-color={color}
>
  <header>
    <RunnerReference
      name={runner.name}
      cardId={runner.cardId}
      compact
    />
    <div class="readings">
      <span>
        Mean <strong>{spread.mean.toFixed(1)} m</strong>
      </span>
      <span>
        Middle 80% <strong>{spread.p10.toFixed(0)}–{spread.p90.toFixed(0)} m</strong>
      </span>
      <span>{spread.finished} / {trajectories.length} finished</span>
    </div>
  </header>
  <div class="course-grid">
    <ReplayOutcomeTrack
      {uid}
      {spread}
      {low}
      {high}
      {course}
      {courseId}
      {distance}
      {runner}
    />
    <ReplayOutcomeProfile
      {spread}
      {low}
      {high}
      {width}
      {distance}
      {time}
      sampleCount={trajectories.length}
      {course}
      runnerName={runner.name}
    />
  </div>
  <footer>
    <span class="legend">
      <i class="dot"></i>
      Mean
      <i class="outer-key"></i>
      Middle 80%
      <i class="inner-key"></i>
      Middle 50%
    </span>
    <span>
      One Uma across {trajectories.length} races at the same time. Bands show distance spread, not occupied
      lanes. Finishers stay at the line.{#if spread.values.some((value) => value < low || value > high)}
        Tails outside the inspected window are clipped.
      {/if}
    </span>
  </footer>
</section>

<style>
  @import './replay-outcome-course.css';
</style>
