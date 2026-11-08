<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from './replay-state.svelte';
  import { stagePixel, type ReplayToggles } from './replay-display';
  import type { RunnerCallout } from './replay-callouts';
  import ReplayRunnerCallouts from './ReplayRunnerCallouts.svelte';
  import ReplayPacemakerBadge from './ReplayPacemakerBadge.svelte';
  import { markerReadout } from './runner-marker-state';

  let {
    replay,
    runner,
    toggles,
    callouts,
    x,
    y,
    crowded,
    dim,
    onselect
  }: {
    replay: ReplayState;
    runner: RaceRunner;
    toggles: ReplayToggles;
    callouts?: RunnerCallout[];
    /** The runner's position inside the marker layer, in pixels. */
    x: number;
    y: number;
    crowded: boolean;
    dim: boolean;
    onselect: () => void;
  } = $props();

  const readout = $derived(markerReadout({ replay, runner, toggles, dark: $theme === 'dark' }));
</script>

<button
  class="replay-marker"
  class:crowded
  class:dim
  class:triggered={readout.triggered}
  class:selected={readout.selected}
  class:front-blocked={readout.blocked}
  style:transform={'translate3d(' +
    stagePixel(x, replay.moving) +
    'px, ' +
    stagePixel(y, replay.moving) +
    'px, 0)'}
  style:--runner-color={replay.teamColor(runner)}
  data-runner-index={runner.index}
  aria-label={'Inspect ' + runner.name}
  aria-pressed={readout.selected}
  title={readout.description}
  onclick={onselect}
>
  {#if readout.blocked}
    <span
      class="blocked"
      title="Blocked"
    >
      !
    </span>
  {/if}
  <span class="portrait">
    <Artwork
      src={portrait(runner.cardId)}
      alt=""
      size="sm"
      shape="circle"
      loading="eager"
    />
    <b title={'Gate ' + (runner.index + 1)}>{runner.index + 1}</b>
    {#if readout.pacemaker}
      <ReplayPacemakerBadge marker />
    {/if}
  </span>
  {#if readout.hp}
    <span class="hp">
      <i
        style:width={(readout.hp.percent ?? 0) + '%'}
        style:background={readout.hp.color}
      ></i>
    </span>
  {/if}
  <span class="marker-name">{runner.name}</span>
  {#if callouts}
    <span class="marker-callouts">
      <ReplayRunnerCallouts
        {callouts}
        timers={toggles.skillTimers}
      />
    </span>
  {/if}
  {#if readout.speed !== undefined || readout.acceleration !== undefined}
    <span class="marker-telemetry">
      {#if readout.speed !== undefined}
        <span title="Speed (m/s)">{readout.speed}</span>
      {/if}
      {#if readout.acceleration !== undefined}
        <span title="Acceleration (m/s²)">{readout.acceleration}</span>
      {/if}
    </span>
  {/if}
</button>

<style>
  @import './replay-runner-marker.css';
</style>
