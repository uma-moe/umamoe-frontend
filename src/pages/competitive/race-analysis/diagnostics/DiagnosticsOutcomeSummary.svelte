<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DiagnosticsMetricHelp from './DiagnosticsMetricHelp.svelte';
  import { number } from './diagnostics-format';

  let {
    capture,
    index,
    horse,
    notice
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics | undefined;
    notice?: Snippet;
  } = $props();

  const runner = $derived(capture.runners.find((r) => r.index === index));
  const lateStart = $derived(
    horse?.lostStartAccelerationFrame || (runner?.result?.startDelayTime ?? 0) >= 0.08
  );
</script>

{#if horse}
  <dl
    class="outcome-summary"
    aria-label="Runner outcome summary"
  >
    <div class="outcome">
      <dt>Course loss<DiagnosticsMetricHelp label="Course loss" /></dt>
      <dd>
        <strong>
          {number(horse.worldTransformDistanceLoss, 2)}
          <small>m</small>
        </strong>
      </dd>
    </div>
    <div
      class="outcome"
      class:caution={lateStart}
    >
      <dt>Start<DiagnosticsMetricHelp label="Start" /></dt>
      <dd>
        <strong>
          {lateStart
            ? 'Late'
            : horse.lostStartAccelerationFrame === undefined &&
                runner?.result?.startDelayTime === undefined
              ? 'Not recorded'
              : 'Normal'}
        </strong>
        <span class="outcome-detail">
          {#if runner?.result?.startDelayTime !== undefined}
            <span>
              {number(runner.result.startDelayTime * 1000, 1)} ms
            </span>
          {/if}{#if horse.lostStartAccelerationFrame}
            <span>Lost acceleration frame</span>
          {/if}
        </span>
      </dd>
    </div>
  </dl>
{:else if notice}
  {@render notice()}
{:else}
  <p class="fallback">
    Detailed simulation data is unavailable. Showing recorded skill activations and blocking events.
  </p>
{/if}

<style>
  @import './diagnostics-outcome-summary.css';
</style>
