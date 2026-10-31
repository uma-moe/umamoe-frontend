<svelte:options namespace="svg" />

<script lang="ts">
  import type { RaceEvent, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { crowdedCallouts, dotRadius, placeCaptions, type MapCallout } from './course-map-labels';
  import type { RunnerCallout } from '../replay-callouts';
  import ReplayRunnerCallouts from '../ReplayRunnerCallouts.svelte';

  let {
    callouts,
    places,
    helpId,
    labelSize,
    overlayHeight,
    mapWidth,
    mapHeight,
    blocking,
    blockerIndex,
    skillEvents,
    runnerLabels,
    timers,
    visibility,
    teamColor,
    showSpeed,
    showAcceleration,
    acceleration,
    selected = $bindable('0')
  }: {
    callouts: MapCallout[];
    places: Map<number, number>;
    helpId: string;
    labelSize: number;
    overlayHeight: number;
    mapWidth: number;
    mapHeight: number;
    blocking: { horseIndex: number; blockerHorseIndex: number }[];
    blockerIndex: number;
    skillEvents: RaceEvent[];
    runnerLabels: Map<number, RunnerCallout[]>;
    timers: boolean;
    visibility: Record<number, number>;
    teamColor: (runner: RaceRunner) => string;
    showSpeed: boolean;
    showAcceleration: boolean;
    acceleration?: (index: number) => number;
    selected?: string;
  } = $props();

  const captions = $derived(
    placeCaptions(
      callouts,
      labelSize,
      dotRadius,
      overlayHeight,
      (index) => blocking.some((b) => b.horseIndex === index) || index === blockerIndex,
      { width: mapWidth, height: mapHeight }
    )
  );

  const crowded = $derived(crowdedCallouts(callouts, labelSize, overlayHeight));

  const labelBoxHeight = 52;
  const labelBoxWidth = 160;
</script>

{#each callouts as marker (marker.runner.index)}
  {@const caption = captions.get(marker.runner.index)!}
  <g
    class="map-runner"
    data-distance={marker.horse.distance}
    data-runner-index={marker.runner.index}
    class:leading={places.get(marker.runner.index) === 1}
    class:crowded={crowded.has(marker.runner.index)}
    class:triggered={skillEvents.some((e) => e.params[0] === marker.runner.index)}
    class:selected={Number(selected) === marker.runner.index}
    class:blocker={marker.runner.index === blockerIndex}
    class:blocked-runner={blocking.some((b) => b.horseIndex === marker.runner.index)}
    class:dim={visibility[marker.runner.index] === 1}
    role="button"
    tabindex="0"
    aria-label={'Follow ' + marker.runner.name + ' on course'}
    aria-pressed={Number(selected) === marker.runner.index}
    style:--runner-color={teamColor(marker.runner)}
    onclick={() => (selected = String(marker.runner.index))}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selected = String(marker.runner.index);
      }
    }}
  >
    <title>
      {marker.runner.name}, {Math.round(marker.horse.distance)} m, lane {marker.lane.toFixed(2)} m,
      {(marker.horse.speed / 100).toFixed(2)} m/s
    </title>
    <polygon
      class="runner-leader"
      points={marker.connector}
    />
    <circle
      class="runner-hit"
      cx={marker.anchor.x}
      cy={marker.anchor.y}
      r="14"
    />
    <circle
      id={helpId + '-dot-' + marker.runner.index}
      class="runner-location"
      data-lane-metres={marker.lane}
      cx={marker.anchor.x}
      cy={marker.anchor.y}
      r={dotRadius}
    />
    {#if Number(selected) === marker.runner.index}
      <circle
        id={helpId + '-selection'}
        class="selection-ring"
        cx={marker.anchor.x}
        cy={marker.anchor.y}
        r={dotRadius + 3}
      />
    {/if}
    <foreignObject
      class="runner-callout"
      x={marker.x - labelSize / 2}
      y={marker.y - labelSize / 2}
      width={labelSize}
      height={labelSize}
    >
      <div class="runner-portrait">
        <Artwork
          src={portrait(marker.runner.cardId)}
          alt=""
          size="xs"
          shape="circle"
          loading="eager"
        />
        <b
          title={'Place ' + places.get(marker.runner.index) + ', gate ' + (marker.runner.index + 1)}
        >
          {places.get(marker.runner.index)}
        </b>
      </div>
    </foreignObject>
    <text
      class="runner-name"
      x={caption.name.x}
      y={caption.name.y + 10}
      text-anchor="middle"
    >
      {marker.runner.name}
    </text>
    {#if showSpeed}
      <text
        class="runner-telemetry runner-speed"
        x={caption.telemetry.x}
        y={caption.telemetry.y + 10}
        text-anchor="middle"
      >
        {(marker.horse.speed / 100).toFixed(2)}
        <tspan class="overlay-unit">m/s</tspan>
      </text>
    {/if}
    {#if showAcceleration}
      {@const value = acceleration?.(marker.runner.index) ?? 0}
      <text
        class="runner-telemetry runner-acceleration"
        x={caption.telemetry.x}
        y={caption.telemetry.y + 10 + (showSpeed ? 14 : 0)}
        text-anchor="middle"
      >
        {value > 0 ? '+' : ''}{value.toFixed(2)}
        <tspan class="overlay-unit">m/s²</tspan>
      </text>
    {/if}
    {#if blocking.some((b) => b.horseIndex === marker.runner.index)}
      <text
        class="blocked-caption"
        x={caption.telemetry.x}
        y={caption.telemetry.y + 10 + overlayHeight}
        text-anchor="middle"
      >
        BLOCKED
      </text>
    {/if}
    {#if marker.runner.index === blockerIndex}
      <text
        class="blocker-caption"
        x={caption.telemetry.x}
        y={caption.telemetry.y + 10 + overlayHeight}
        text-anchor="middle"
      >
        BLOCKER
      </text>
    {/if}
  </g>
{/each}
<!-- Keep exact positions visible while portraits move into a clearer arrangement. -->
<g
  class="position-overlay"
  aria-hidden="true"
>
  {#each callouts as marker (marker.runner.index)}
    <g
      class:leading={places.get(marker.runner.index) === 1}
      class:dim={visibility[marker.runner.index] === 1}
      style:--runner-color={teamColor(marker.runner)}
    >
      <use href={'#' + helpId + '-dot-' + marker.runner.index} />
      {#if Number(selected) === marker.runner.index}
        <use href={'#' + helpId + '-selection'} />
      {/if}
    </g>
  {/each}
</g>

<!-- Skill and mode labels sit above every portrait, so a runner drawn behind another keeps them readable. -->
<g
  class="label-layer"
  aria-hidden="true"
>
  {#each callouts as marker (marker.runner.index)}
    {@const labels = runnerLabels.get(marker.runner.index)}
    {#if labels}
      <foreignObject
        class="runner-labels"
        class:dim={visibility[marker.runner.index] === 1}
        x={marker.x - labelBoxWidth / 2}
        y={marker.y - labelSize / 2 - labelBoxHeight - 2}
        width={labelBoxWidth}
        height={labelBoxHeight}
      >
        <div class="runner-labels-stack">
          <ReplayRunnerCallouts
            callouts={labels}
            {timers}
            limit={crowded.has(marker.runner.index) && Number(selected) !== marker.runner.index
              ? 1
              : 3}
          />
        </div>
      </foreignObject>
    {/if}
  {/each}
</g>

<style>
  @import './replay-map-runners.css';
</style>
