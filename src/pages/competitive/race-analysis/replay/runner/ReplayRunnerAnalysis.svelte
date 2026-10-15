<script lang="ts">
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RunnerBuild from '@/pages/competitive/runners/RunnerBuild.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import ReplayDiagnostics from '../../diagnostics/ReplayDiagnostics.svelte';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';

  type BlockingSpan = ReplayState['blockingSpans'][number];

  let {
    replay,
    runner,
    course,
    skillNames,
    onbuild,
    onpickrunner,
    onreview,
    onseek,
    onselect
  }: {
    replay: ReplayState;
    runner: RaceRunner;
    course?: Course;
    skillNames: Map<number, string>;
    onbuild: () => void;
    onpickrunner: () => void;
    onreview: (event: BlockingSpan) => void;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  let allBlocking = $state(false);

  const visibleBlocking = $derived(
    allBlocking
      ? replay.blockingSpans
      : replay.blockingSpans.filter((event) => event.horseIndex === runner?.index)
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
  <article
    class="runner-card"
    style:--runner-color={replay.teamColor(runner)}
  >
    <RunnerBuild
      {runner}
      {skillNames}
      compact
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
    </RunnerBuild>
  </article>
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
    {onseek}
    {onselect}
  />
</div>

<style>
  @import './replay-runner-analysis.css';
</style>
