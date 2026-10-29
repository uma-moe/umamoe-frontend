<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import type { RaceTrajectory } from '@/lib/race/replay/race-ensemble';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayFieldSpread from './ReplayFieldSpread.svelte';
  import ReplayOutcomeCourse from './ReplayOutcomeCourse.svelte';

  let {
    replay,
    ensemble,
    course,
    courseId,
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    ensemble: RaceTrajectory[];
    course?: Course;
    courseId: number;
    selected?: string;
  } = $props();

  let ensembleView = $state('field');
</script>

<div class="ensemble-views">
  <SegmentedControl
    compact
    label="Progression display"
    bind:value={ensembleView}
    options={[
      { value: 'field', label: 'Field spread' },
      { value: 'course', label: 'Track & course' }
    ]}
  />
  <span>Distributions at the same elapsed time</span>
</div>
{#if ensembleView === 'field'}
  <ReplayFieldSpread
    trajectories={ensemble}
    time={replay.time}
    runners={replay.capture.runners}
    bind:selected
    teamColor={replay.teamColor}
  />
{:else if replay.runner}
  <ReplayOutcomeCourse
    trajectories={ensemble}
    time={replay.time}
    {course}
    {courseId}
    distance={replay.bounds.distanceMax}
    runner={replay.runner}
    color={replay.teamColor(replay.runner)}
  />
{/if}

<style>
  .ensemble-views {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .ensemble-views > span {
    font-size: 10px;
    color: var(--text-secondary);
  }
</style>
