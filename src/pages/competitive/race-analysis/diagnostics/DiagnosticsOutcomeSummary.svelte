<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DiagnosticsMetricHelp from './DiagnosticsMetricHelp.svelte';
  import { number } from './diagnostics-format';
  import { startOutcome } from './start-outcome';

  let {
    capture,
    index,
    horse
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics | undefined;
  } = $props();

  const runner = $derived(capture.runners.find((r) => r.index === index));
  const start = $derived(horse ? startOutcome(horse, runner?.result) : undefined);
</script>

{#if horse && start}
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
      class:good={start.label === 'Normal'}
      class:bad={start.late}
    >
      <dt>Start<DiagnosticsMetricHelp label="Start" /></dt>
      <dd>
        <strong>{start.label}</strong>
        <span class="outcome-detail">
          {#if start.delayMs !== undefined}
            <span>{number(start.delayMs, 1)} ms</span>
          {/if}
          {#if start.lostAccelerationFrame}
            <span>Lost acceleration frame</span>
          {/if}
        </span>
      </dd>
    </div>
  </dl>
{:else}
  <p class="fallback">
    Detailed simulation data is unavailable. Showing recorded skill activations and blocking events.
  </p>
{/if}

<style>
  @import './diagnostics-outcome-summary.css';
</style>
