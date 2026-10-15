<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { lastSpurtResult, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DiagnosticsMetricHelp from './DiagnosticsMetricHelp.svelte';
  import { number } from './diagnostics-format';

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
  const spurtResult = $derived(lastSpurtResult(capture, index));
  const lateStart = $derived(
    horse?.lostStartAccelerationFrame || (runner?.result?.startDelayTime ?? 0) >= 0.08
  );
</script>

{#if horse}
  <dl
    class="outcome-summary"
    aria-label="Runner outcome summary"
  >
    <div
      class="outcome"
      class:danger={typeof horse.finalHp === 'number' && horse.finalHp <= 0}
    >
      <dt>HP at finish<DiagnosticsMetricHelp label="HP at finish" /></dt>
      <dd>
        <strong>
          {number(horse.finalHp)}
          <small>HP</small>
        </strong>
        <span class="outcome-detail">
          {#if typeof horse.hpExhaustedDistance === 'number'}
            Exhausted at {number(horse.hpExhaustedDistance)} m
          {:else if typeof horse.startHp === 'number'}
            Started with {number(horse.startHp)} HP
          {/if}
        </span>
      </dd>
    </div>
    <div
      class="outcome"
      class:caution={spurtResult.noSpurt || (spurtResult.delay ?? 0) >= 0.05}
    >
      <dt>Spurt delay<DiagnosticsMetricHelp label="Spurt delay" /></dt>
      <dd>
        <strong>
          {spurtResult.noSpurt
            ? 'No spurt'
            : spurtResult.delay === undefined
              ? 'Not recorded'
              : number(spurtResult.delay, 1)}{#if spurtResult.delay !== undefined}
            {' '}
            <small>m</small>
          {/if}
        </strong>
        <span
          class="outcome-detail"
          class:caution={spurtResult.speedPenalty}
        >
          {#if spurtResult.speed !== undefined}
            Speed {number(spurtResult.speed, 2)} m/s{#if (spurtResult.reduction ?? 0) >= 0.005}
              {' '}(−{number(spurtResult.reduction, 2)})
            {/if}
          {/if}
        </span>
      </dd>
    </div>
    <div class="outcome">
      <dt>Course loss<DiagnosticsMetricHelp label="Course loss" /></dt>
      <dd>
        <strong>
          {number(horse.worldTransformDistanceLoss, 2)}
          <small>m</small>
        </strong>
        <span class="outcome-detail">Extra distance travelled</span>
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
            ? 'Delayed'
            : horse.lostStartAccelerationFrame === undefined &&
                runner?.result?.startDelayTime === undefined
              ? 'Not recorded'
              : 'Clean'}
        </strong>
        <span class="outcome-detail">
          {#if runner?.result?.startDelayTime !== undefined}
            <span>
              {number(runner.result.startDelayTime * 1000, 1)} ms delay
            </span>
          {/if}{#if horse.lostStartAccelerationFrame}
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
