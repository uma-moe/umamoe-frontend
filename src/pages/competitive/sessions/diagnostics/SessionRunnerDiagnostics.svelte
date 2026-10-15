<script lang="ts">
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import { frontBlockingSpans } from '@/lib/race/race-diagnostics';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RunnerBuild from '../../runners/RunnerBuild.svelte';
  import ReplayDiagnostics from '@/pages/competitive/race-analysis/diagnostics/ReplayDiagnostics.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import type { DiagnosticEntry } from './session-diagnostics';

  interface Props {
    id: string;
    selected: DiagnosticEntry;
    skillNames: Map<number, string>;
    open: boolean;
    onreplay?: (race: number, runner?: number, time?: number) => void;
    onbuild?: (runner: RaceRunner, race: number) => void;
    onrunner: (key: string) => void;
  }

  let {
    id,
    selected,
    skillNames,
    open = $bindable(),
    onreplay,
    onbuild,
    onrunner
  }: Props = $props();
</script>

<Disclosure
  {id}
  title={'Race ' + (selected.race + 1) + ': ' + selected.runner.name}
  description={selected.capture.fileName}
  compact
  bind:open
>
  <div class="selected-runner">
    <span>Gate {selected.runner.index + 1}</span>
    <div>
      {#if onbuild}
        <Button
          size="sm"
          variant="secondary"
          icon="clipboard"
          onclick={() => onbuild?.(selected.runner, selected.race)}
        >
          Build details
        </Button>
      {/if}<Button
        size="sm"
        variant="secondary"
        icon="race"
        disabled={!onreplay}
        onclick={() => onreplay?.(selected.race, selected.runner.index)}
      >
        Watch in replay
      </Button>
    </div>
  </div>
  <ReplayDiagnostics
    capture={selected.capture}
    index={selected.runner.index}
    {skillNames}
    distance={selected.capture.raceDistance ??
      Math.max(0, ...(selected.capture.frames.at(-1)?.horses.map((h) => h.distance) ?? []))}
    onseek={(time) => onreplay?.(selected.race, selected.runner.index, time)}
    onselect={(index) => {
      onrunner(selected.race + ':' + index);
      open = true;
    }}
  >
    {#snippet overview()}
      <div class="selected-overview">
        <RunnerBuild
          runner={selected.runner}
          {skillNames}
          compact
          raceContext={{ distance: selected.capture.raceDistance }}
        />
      </div>
    {/snippet}
    {#snippet blocking()}
      <section class="session-blocking">
        <h4>Front blocking</h4>
        {#each frontBlockingSpans(selected.capture).filter((s) => s.horseIndex === selected.runner.index) as span}
          {@const blocker = selected.capture.runners.find(
            (r) => r.index === span.blockerHorseIndex
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!onreplay}
              onclick={() => onreplay?.(selected.race, selected.runner.index, span.startTime)}
            >
              {span.startTime.toFixed(3)} s ↗
            </Button>
            <span>Blocked by</span>
            {#if blocker}
              <RunnerReference
                name={blocker.name}
                cardId={blocker.cardId}
                compact
              />
            {/if}
            <strong>{(span.endTime - span.startTime).toFixed(2)} s</strong>
          </div>
        {:else}
          <p>No front blocking recorded.</p>
        {/each}
      </section>
    {/snippet}
  </ReplayDiagnostics>
</Disclosure>

<style>
  h4,
  p {
    margin: 0;
  }
  h4 {
    font-size: 13px;
  }
  p {
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  p {
    margin-top: 3px;
  }
  .selected-runner,
  .session-blocking > div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .session-blocking strong {
    margin-left: auto;
  }
  .selected-runner {
    justify-content: space-between;
    flex-wrap: wrap;
    margin: 4px 0 10px;
    color: var(--text-secondary);
  }
  .selected-runner > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .session-blocking h4 {
    margin-bottom: 4px;
  }
  .session-blocking strong {
    font-weight: 500;
  }
  .selected-overview {
    min-width: 0;
  }
  .selected-overview :global(.build) {
    display: grid;
    grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.8fr);
    align-items: center;
    gap: 20px;
  }
  .selected-overview :global(.build-identity) {
    padding: 0;
  }
  .selected-overview :global(.build-content) {
    padding: 0;
  }
  .selected-overview :global(.veteran-identity) {
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 10px;
  }
  .selected-overview :global(.portrait) {
    height: 52px;
  }
  .selected-overview :global(.identity h3) {
    font-size: 14px;
  }
  @media (max-width: 760px) {
    .selected-overview :global(.build) {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .selected-runner > div {
      margin-left: auto;
    }
  }
</style>
