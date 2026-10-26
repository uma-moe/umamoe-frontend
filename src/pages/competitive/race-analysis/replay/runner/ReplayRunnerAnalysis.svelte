<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime, ordinalPlace } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RunnerBuildDetails from '@/pages/competitive/runners/RunnerBuildDetails.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import ReplayDiagnostics from '../../diagnostics/ReplayDiagnostics.svelte';
  import type { DetailedSimulation } from '../../detailed-simulation';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplaySimulationNotice from './ReplaySimulationNotice.svelte';

  type BlockingSpan = ReplayState['blockingSpans'][number];

  let {
    replay,
    runner,
    course,
    skillNames,
    simulation,
    onbuild,
    onpickrunner,
    onreview,
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
    onpickrunner: () => void;
    onreview: (event: BlockingSpan) => void;
    onretry?: () => void;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  let allBlocking = $state(false);

  const visibleBlocking = $derived(
    allBlocking
      ? replay.blockingSpans
      : replay.blockingSpans.filter((event) => event.horseIndex === runner?.index)
  );

  const winningTime = $derived(
    Math.min(
      ...replay.capture.runners.flatMap((entry) => (entry.result ? [entry.result.finishTime] : []))
    )
  );
</script>

<header class="report-heading">
  <h2>Runner analysis</h2>
  <Button
    variant="secondary"
    size="sm"
    icon="clipboard"
    onclick={onbuild}
  >
    Build details
  </Button>
</header>
{#snippet runnerOverview()}
  <div class="runner-card">
    <RunnerBuildDetails
      {runner}
      {skillNames}
      framed
      content="summary"
      color={replay.teamColor(runner)}
      raceContext={{
        surface: course?.surface,
        distance: course?.distance ?? replay.capture.raceDistance
      }}
    >
      {#snippet headerActions()}
        <Button
          variant="ghost"
          size="sm"
          ariaLabel="Choose runner"
          onclick={onpickrunner}
        >
          <span class="gate-label">
            Gate {runner.index + 1}<Icon
              name="chevron"
              size={14}
            />
          </span>
        </Button>
      {/snippet}
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
{#snippet blockingPanel()}
  <section
    class="events blocking-analysis"
    aria-label="Blocking incidents"
  >
    <header>
      <h3>
        Front blocking <small>
          {visibleBlocking.length}
          {visibleBlocking.length === 1 ? 'incident' : 'incidents'}
        </small>
      </h3>
      <Checkbox
        id="blocking-scope"
        label="All runners"
        bind:checked={allBlocking}
      />
    </header>
    <div class="event-list">
      {#each visibleBlocking as event}
        {@const blocked = replay.capture.runners.find((r) => r.index === event.horseIndex)}
        {@const blocker = replay.capture.runners.find((r) => r.index === event.blockerHorseIndex)}
        <button
          class:active={replay.time >= event.startTime &&
            replay.time < event.endTime &&
            runner.index === event.horseIndex}
          aria-label={'Review ' +
            blocked?.name +
            ' blocked by ' +
            blocker?.name +
            ' at ' +
            event.startTime.toFixed(2) +
            ' seconds'}
          onclick={() => onreview(event)}
        >
          <time>{formatRaceTime(event.startTime)}</time>
          <Artwork
            src={portrait(blocked?.cardId)}
            alt=""
            size="xs"
          />
          <span class="blocking-pair">
            <strong>{blocked?.name}</strong>
            <small>Blocked by {blocker?.name}</small>
          </span>
          <span>{(event.endTime - event.startTime).toFixed(2)} s ↗</span>
        </button>
      {:else}
        <p>
          No front blocking recorded {allBlocking ? 'in this race' : 'for ' + runner.name}.
        </p>
      {/each}
    </div>
  </section>
{/snippet}
<div class="runner-outcomes">
  <ReplayDiagnostics
    capture={replay.capture}
    index={runner.index}
    {skillNames}
    distance={replay.bounds.distanceMax}
    blocking={blockingPanel}
    overview={runnerOverview}
    notice={simulation.status === 'ready' ? undefined : simulationNotice}
    {onseek}
    {onselect}
  />
</div>

<style>
  @import '../../../runners/runner-results.css';
  @import './replay-runner-analysis.css';
</style>
