<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, ordinalPlace } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import RunnerBuildDetails from '@/pages/competitive/runners/RunnerBuildDetails.svelte';
  import ReplayDiagnostics from '../../diagnostics/ReplayDiagnostics.svelte';
  import type { DetailedSimulation } from '../../detailed-simulation';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplaySimulationNotice from './ReplaySimulationNotice.svelte';
  import RunnerTrainingPreview from './RunnerTrainingPreview.svelte';
  import DiagnosticsOutcomeSummary from '../../diagnostics/DiagnosticsOutcomeSummary.svelte';
  import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';

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

  let cardWidth = $state(0);
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
  {#if horse}
    <DiagnosticsOutcomeSummary
      capture={replay.capture}
      index={runner.index}
      {horse}
    />
  {/if}
  <div class="report-actions">
    <Button
      variant="secondary"
      size="sm"
      icon="clipboard"
      onclick={onbuild}
    >
      Build details
    </Button>
  </div>
</header>
{#snippet runnerOverview()}
  <!-- A card wide enough keeps the results beside the runner's name instead of on a row of their own. -->
  <div
    class="runner-card"
    bind:clientWidth={cardWidth}
  >
    <RunnerBuildDetails
      {runner}
      {skillNames}
      framed
      content="summary"
      inlineMetrics={cardWidth >= 460}
      color={replay.teamColor(runner)}
      raceContext={{
        surface: course?.surface,
        distance: course?.distance ?? replay.capture.raceDistance
      }}
    >
      {#snippet metrics()}
        {#if runner.result}
          {@const won = runner.result.finishOrder === 1}
          {@const behind = runner.result.finishTime - winningTime}
          <dl class="runner-results">
            <div>
              <dt>Finish</dt>
              <dd>
                {ordinalPlace(runner.result.finishOrder)}
                <small>of {replay.capture.runners.length}</small>
              </dd>
            </div>
            <div>
              <dt>Finish time</dt>
              <dd>
                {formatRaceTime(runner.result.finishTime)}
                <small>{won ? 'Winner' : '+' + behind.toFixed(2) + ' s'}</small>
              </dd>
            </div>
          </dl>
        {/if}
      {/snippet}
    </RunnerBuildDetails>
  </div>
{/snippet}
{#snippet simulationNotice()}
  {#if simulation.status !== 'ready'}
    <ReplaySimulationNotice
      {simulation}
      {onretry}
    />
  {/if}
{/snippet}
<div class="runner-outcomes">
  <ReplayDiagnostics
    capture={replay.capture}
    index={runner.index}
    {skillNames}
    distance={replay.bounds.distanceMax}
    overview={runnerOverview}
    notice={simulation.status === 'ready' ? undefined : simulationNotice}
    {onseek}
    {onselect}
  >
    {#snippet buildPreview()}
      <RunnerTrainingPreview
        {runner}
        {onbuild}
      />
    {/snippet}
  </ReplayDiagnostics>
</div>

<style>
  @import '../../../runners/runner-results.css';
  @import './replay-runner-analysis.css';
</style>
