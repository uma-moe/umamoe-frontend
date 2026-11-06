<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
  import Button from '@/components/controls/Button.svelte';
  import ReplayDiagnostics from '../../diagnostics/ReplayDiagnostics.svelte';
  import type { DetailedSimulation } from '../../detailed-simulation';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayRunnerProfile from './ReplayRunnerProfile.svelte';
  import ReplaySimulationNotice from './ReplaySimulationNotice.svelte';

  let {
    replay,
    runner,
    course,
    skillNames,
    simulation,
    onbuild,
    navigation,
    onretry,
    onseek,
    onselect
  }: {
    replay: ReplayState;
    runner: RaceRunner;
    course?: Course;
    skillNames: Map<number, string>;
    simulation: DetailedSimulation;
    onbuild: () => void;
    navigation: Snippet;
    onretry?: () => void;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const horse = $derived(diagnosticHorse(replay.capture, runner.index));
  const winningTime = $derived(
    Math.min(
      ...replay.capture.runners.flatMap((entry) => (entry.result ? [entry.result.finishTime] : []))
    )
  );
</script>

<header class="report-heading">
  <h2>Runner analysis</h2>
  {@render navigation()}
  <Button
    variant="secondary"
    size="sm"
    icon="clipboard"
    onclick={onbuild}
  >
    Build details
  </Button>
</header>
<div class="runner-report">
  <ReplayRunnerProfile
    {runner}
    {horse}
    fieldSize={replay.capture.runners.length}
    {winningTime}
    raceContext={{
      surface: course?.surface,
      distance: course?.distance ?? replay.capture.raceDistance
    }}
    color={replay.teamColor(runner)}
  />
  {#if simulation.status !== 'ready'}
    <ReplaySimulationNotice
      {simulation}
      {onretry}
    />
  {/if}
  <ReplayDiagnostics
    capture={replay.capture}
    index={runner.index}
    {skillNames}
    distance={replay.bounds.distanceMax}
    outcomeSummary={false}
    {onseek}
    {onselect}
  />
</div>

<style>
  @import './replay-runner-analysis.css';
</style>
