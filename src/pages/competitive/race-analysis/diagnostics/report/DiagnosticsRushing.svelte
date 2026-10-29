<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { DiagnosticRow, HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import DiagnosticsMetricHelp from '../DiagnosticsMetricHelp.svelte';
  import {
    count,
    percentPosition,
    rushingPeriods as rushingPeriodsOf
  } from '../diagnostics-format';

  let {
    capture,
    index,
    horse,
    rushingPeriods,
    skillNames,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    rushingPeriods: ReturnType<typeof rushingPeriodsOf>;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const rushing = $derived(horse.temptationDecision);
  const hasRoll = $derived(
    typeof rushing?.roll === 'number' && typeof rushing.threshold === 'number'
  );

  function rushingOutcome(decision: DiagnosticRow | null | undefined): string {
    if (!decision) return count(rushingPeriods.length, 'period');
    if (decision.enabled) return 'Rushed · check passed';
    if (decision.preventedByModifier) return 'Prevented by a modifier';

    return 'No rushing · check failed';
  }
</script>

<section
  class="report-block report-card rushing-report"
  aria-label="Rushing"
>
  <header class="section-heading">
    <h3>
      Rushing <small class:caution={rushing?.enabled}>{rushingOutcome(rushing)}</small>
    </h3>
  </header>
  {#if rushing}
    <dl class="report-facts">
      <div>
        <dt>Check / chance<DiagnosticsMetricHelp label="Rushing check" /></dt>
        <dd>
          {#if hasRoll}
            <span class="rushing-check">
              <span
                class="roll-meter"
                aria-hidden="true"
              >
                <span style:width={percentPosition(rushing.threshold) + '%'}></span>
                <i style:left={percentPosition(rushing.roll) + '%'}></i>
              </span>
              {Number(rushing.roll).toFixed(2)}% {Number(rushing.roll) < Number(rushing.threshold)
                ? '<'
                : '≥'}
              {Number(rushing.threshold).toFixed(2)}%
            </span>
          {:else}
            Not recorded
          {/if}
        </dd>
      </div>
      <div>
        <dt>Start section</dt>
        <dd>
          {typeof rushing.startSection === 'number' && rushing.startSection > 0
            ? 'Section ' + rushing.startSection
            : 'Not scheduled'}
        </dd>
      </div>
    </dl>
  {/if}
  {#if rushingPeriods.length}
    <div class="detail-table">
      <DiagnosticsEventTable
        value={rushingPeriods}
        title="Rushing periods"
        columns={[
          { key: 'startTime', label: 'Start (s)', numeric: true },
          { key: 'endTime', label: 'End (s)', numeric: true },
          { key: 'duration', label: 'Active (s)', numeric: true },
          { key: 'mode', label: 'Mode' }
        ]}
        {capture}
        {index}
        {skillNames}
        {onseek}
        {onselect}
      />
    </div>
  {/if}
</section>

<style>
  @import '../diagnostics-section.css';
  @import '../report-card.css';
  @import './report-section.css';
  @import './report-facts.css';
  @import './diagnostics-rushing.css';
</style>
