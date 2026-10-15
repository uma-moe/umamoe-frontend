<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { hpRemainingColor } from '@/lib/race/replay/race-display';
  import { detailedSample } from '@/lib/race/capture/race-diagnostics';
  import { meanTrajectorySignal } from '@/lib/race/replay/race-ensemble';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayTelemetryActions from './ReplayTelemetryActions.svelte';
  import {
    telemetryBlocking,
    telemetryMarkers,
    telemetryOption,
    telemetryPhases,
    telemetrySignals
  } from './replay-telemetry';

  let {
    replay,
    skillNames,
    chartRunners,
    telemetryEnd,
    metric = $bindable('combined'),
    compare = $bindable(false),
    chartEvents = $bindable(true),
    expanded = $bindable(false)
  }: {
    replay: ReplayState;
    skillNames: Map<number, string>;
    chartRunners: RaceRunner[];
    telemetryEnd: number;
    metric?: string;
    compare?: boolean;
    chartEvents?: boolean;
    expanded?: boolean;
  } = $props();

  const selectedFinish = $derived(replay.finishTimes.get(replay.runner?.index ?? 0));
  const telemetryFrame = $derived(
    selectedFinish !== undefined && replay.time >= selectedFinish
      ? (replay.finishFrames.get(replay.runner?.index ?? 0) ?? replay.frame)
      : replay.frame
  );

  const chartSignals = $derived(
    telemetrySignals($theme === 'dark', Boolean(replay.ensemble)).filter((signal) =>
      metric === 'combined'
        ? ['speed', 'hp', 'gap'].includes(signal.value)
        : signal.value === metric
    )
  );

  const option = $derived(
    telemetryOption(
      {
        capture: replay.capture,
        ensemble: replay.ensemble,
        runner: replay.runner,
        chartRunners,
        signals: chartSignals,
        startTime: replay.bounds.startTime,
        endTime: replay.bounds.endTime,
        telemetryEnd,
        finishTimes: replay.finishTimes,
        selectedFinish,
        chartEvents,
        markers: telemetryMarkers(
          replay.activations,
          skillNames,
          replay.runner,
          replay.runnerTimeAtDistance
        ),
        phases: telemetryPhases(
          replay.capture,
          replay.bounds.distanceMax,
          telemetryEnd,
          $theme === 'dark'
        ),
        blocking: telemetryBlocking(replay.blockingSpans, replay.runner, replay.capture.runners),
        dark: $theme === 'dark'
      },
      expanded
    )
  );

  const hpColor = (value?: number) => hpRemainingColor(value, $theme === 'dark');

  function signalValue(signal: string) {
    const { capture, ensemble, diagnostic } = replay;
    const sample = telemetryFrame,
      horse = sample?.horses[replay.runner?.index ?? 0];

    if (!sample || !horse) return undefined;
    if (ensemble && (signal === 'hp' || signal === 'gap'))
      return meanTrajectorySignal(ensemble, replay.time, replay.runner?.index ?? 0, signal);
    if (signal === 'speed') return horse.speed / 100;
    if (signal === 'hp')
      return Math.min(
        100,
        Math.max(
          0,
          (horse.hp / Math.max(1, capture.frames[0]?.horses[replay.runner?.index ?? 0]?.hp ?? 1)) *
            100
        )
      );
    if (signal === 'gap')
      return Math.max(0, ...sample.horses.map((h) => h.distance)) - horse.distance;
    if (signal === 'target')
      return detailedSample(capture.detailed, diagnostic, sample.time, 'targetSpeeds');
    return (
      detailedSample(capture.detailed, diagnostic, sample.time, 'accelerationRates') ??
      replay.acceleration(replay.runner?.index ?? 0)
    );
  }
</script>

{#snippet telemetryHelp()}
  <InspectPopover label="How to read race telemetry">
    {#snippet trigger()}
      <span class="guide-trigger">
        <Icon
          name="info"
          size={15}
        />
      </span>
    {/snippet}
    <h3>Race telemetry</h3>
    {#if replay.ensemble}
      <p>
        Faint curves show every sampled race; the solid curve is their arithmetic mean at the same
        elapsed time. Select an Uma to follow its spread on the track and graph. Finishers stay at
        the line.
      </p>
      <p>
        Click the chart to seek, or use the Replay time slider. Compare runners adds each Uma’s mean
        curve.
      </p>
    {:else}
      <p>
        Combined overlays speed, remaining HP and distance behind the leader in one chart. Live
        values are shown on the left. The speed scale is on the left of the graph; HP and distance
        scales are on the right. The curves, course lanes and skill icons share one replay time
        axis. Click the chart to seek, or use the Replay time slider with the keyboard.
      </p>
      <p>
        Choose a single signal to focus on it, or enable Compare runners to add faint dotted traces
        for the rest of the field. Race events show skill activation lines and front blocking
        intervals. Expand the graph to zoom and pan.
      </p>
    {/if}
  </InspectPopover>
{/snippet}
<div class="telemetry">
  <ChartFrame
    plain
    compact
    expandable
    maximize
    id="runner-telemetry"
    title="Race telemetry"
    showHeader={false}
    legend={expanded
      ? chartSignals.map((signal) => ({
          label: signal.label + ' (' + signal.unit + ')',
          color: signal.color
        }))
      : []}
    bind:expanded
  >
    {#snippet titleActions()}
      {@render telemetryHelp()}
    {/snippet}
    {#snippet actions()}
      <ReplayTelemetryActions
        bind:metric
        bind:compare
        bind:chartEvents
        detailed={Boolean(replay.capture.detailed)}
        ensemble={Boolean(replay.ensemble)}
      />
    {/snippet}

    <div
      class="telemetry-columns"
      class:expanded
    >
      {#if !expanded}
        <div
          class="telemetry-reading"
          class:combined={metric === 'combined'}
          aria-label="Selected runner telemetry"
        >
          <div class="telemetry-heading">
            <h3 class="timeline-label">
              {replay.ensemble ? 'Mean telemetry' : 'Race telemetry'}
            </h3>
            {@render telemetryHelp()}
          </div>
          {#each chartSignals as signal}
            {@const value = signalValue(signal.value)}
            <div
              class="signal-reading"
              style:--signal-color={signal.color}
            >
              <span>{signal.label}</span>
              <strong style:color={signal.value === 'hp' ? hpColor(value) : undefined}>
                {value === undefined ? '—' : value.toFixed(signal.value === 'hp' ? 1 : 2)}
                <small>{signal.unit}</small>
              </strong>
            </div>
          {/each}
        </div>
      {/if}
      <div class="telemetry-track">
        <LazyEChartsSurface
          {option}
          label={replay.ensemble
            ? 'All sampled trajectories and their mean'
            : 'Runner telemetry over time'}
          height={220}
          zoomable={expanded}
          onaxisclick={replay.seek}
        />{#if !expanded}
          <span
            class="telemetry-cursor"
            aria-hidden="true"
          ></span>
        {/if}
      </div>
    </div>
  </ChartFrame>
</div>

<style>
  @import './replay-telemetry.css';
</style>
