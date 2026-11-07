<script
  lang="ts"
  module
>
  type MarkerPoint = { index: number; x: number; y: number };

  /** Runners whose portraits overlap a neighbour hide their telemetry until selected or hovered. */
  export function crowdedRunners(points: MarkerPoint[]): Set<number> {
    const crowded = points.filter((a) =>
      points.some(
        (b) => a.index !== b.index && Math.abs(a.x - b.x) < 74 && Math.abs(a.y - b.y) < 58
      )
    );

    return new Set(crowded.map((point) => point.index));
  }
</script>

<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { hpRemainingColor } from '@/lib/race/replay/race-display';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from './replay-state.svelte';
  import { stagePixel, type ReplayToggles } from './replay-display';
  import type { RunnerCallout } from './replay-callouts';
  import ReplayRunnerCallouts from './ReplayRunnerCallouts.svelte';
  import ReplayPacemakerBadge from './ReplayPacemakerBadge.svelte';

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

  const horse = $derived(replay.readoutFrame?.horses[runner.index]);
  const selected = $derived(replay.runner?.index === runner.index);
  const blocked = $derived(
    toggles.blocked && replay.blockingNow.some((pair) => pair.horseIndex === runner.index)
  );

  const triggered = $derived(
    toggles.skills && replay.recentSkills.some((event) => event.params[0] === runner.index)
  );

  const hp = $derived(replay.fieldHp(runner.index, false));
  const acceleration = $derived(toggles.accel ? replay.acceleration(runner.index) : 0);
  const description = $derived(
    horse
      ? `${runner.name}, gate ${runner.index + 1}, ${(horse.speed / 100).toFixed(2)} m/s, ` +
          `${horse.distance.toFixed(1)} m, lane ${replay.laneMetres(horse.lanePosition)} m`
      : runner.name
  );
</script>

<button
  class="replay-marker"
  class:crowded
  class:dim
  class:triggered
  class:selected
  class:front-blocked={blocked}
  style:transform={'translate3d(' +
    stagePixel(x, replay.playing) +
    'px, ' +
    stagePixel(y, replay.playing) +
    'px, 0)'}
  style:--runner-color={replay.teamColor(runner)}
  data-runner-index={runner.index}
  aria-label={'Inspect ' + runner.name}
  aria-pressed={selected}
  title={description}
  onclick={onselect}
>
  {#if blocked}
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
    {#if toggles.positionKeep && replay.pacemaker === runner.index}
      <ReplayPacemakerBadge marker />
    {/if}
  </span>
  {#if toggles.hpBars}
    <span class="hp">
      <i
        style:width={(hp ?? 0) + '%'}
        style:background={hpRemainingColor(hp, $theme === 'dark')}
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
  {#if horse && (toggles.speed || toggles.accel)}
    <span class="marker-telemetry">
      {#if toggles.speed}
        <span title="Speed (m/s)">{(horse.speed / 100).toFixed(2)}</span>
      {/if}
      {#if toggles.accel}
        <span title="Acceleration (m/s²)">
          {acceleration > 0 ? '+' : ''}{acceleration.toFixed(2)}
        </span>
      {/if}
    </span>
  {/if}
</button>

<style>
  @import './replay-runner-marker.css';
</style>
