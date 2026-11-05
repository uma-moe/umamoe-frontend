<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RunnerBuildDetails from '../../runners/RunnerBuildDetails.svelte';
  import ReplayDiagnostics from '@/pages/competitive/race-analysis/diagnostics/ReplayDiagnostics.svelte';
  import { styleColors } from '../../analysis-view';
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
  title={selected.runner.name + ' in race ' + (selected.race + 1)}
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
      <RunnerBuildDetails
        runner={selected.runner}
        {skillNames}
        framed
        content="summary"
        color={styleColors[selected.runner.result?.runningStyle ?? 0]}
        raceContext={{ distance: selected.capture.raceDistance }}
      />
    {/snippet}
  </ReplayDiagnostics>
</Disclosure>

<style>
  .selected-runner {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
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
  @media (max-width: 760px) {
    .selected-runner > div {
      margin-left: auto;
    }
  }
</style>
