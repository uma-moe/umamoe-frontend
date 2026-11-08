<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import { count } from '../diagnostics-format';
  import { positionKeepDecisionRows } from './position-keep-decisions';

  let {
    capture,
    index,
    horse,
    skillNames,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const decisions = $derived(positionKeepDecisionRows(capture, horse));
  const started = $derived(
    (horse.positionKeepDecisions ?? []).filter((decision) => decision.outcome === 'Started').length
  );
</script>

<section
  class="report-block report-card detail-panel detail-table position-decisions"
  aria-label="Position keep decisions"
>
  <header class="section-heading">
    <h3>
      Position keep decisions
      {#if decisions.length}
        <small>{started} of {count(decisions.length, 'attempt')} started</small>
      {/if}
    </h3>
  </header>
  <DiagnosticsEventTable
    value={decisions}
    title="Position keep decisions"
    columns={[
      { key: 'time', label: 'Time', numeric: true, sortable: false },
      { key: 'attemptedMode', label: 'Mode', sortable: false },
      { key: 'outcome', label: 'Result', sortable: false },
      {
        key: 'duration',
        label: 'Duration',
        numeric: true,
        sortable: false,
        priority: 'secondary'
      },
      { key: 'pacemakerHorseIndex', label: 'Pacemaker', sortable: false }
    ]}
    {capture}
    {index}
    {skillNames}
    fill
    {onseek}
    {onselect}
  />
</section>

<style>
  @import '../report-card.css';
  @import '../report/report-section.css';
  @import './detail-panel.css';
  /* The table scrolls inside whatever height the analysis gives this card. */
  .position-decisions {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* The time column matches the report's other event tables, so their seek buttons line up. */
  .position-decisions :global(th:first-child) {
    width: 72px;
  }
  /* A phone drops the duration, which race behaviour also lists, and shortens the pacemaker's name to fit. */
  @media (max-width: 520px) {
    .position-decisions :global(table) {
      table-layout: fixed;
    }
    .position-decisions :global(th:nth-child(2)),
    .position-decisions :global(th:nth-child(3)) {
      width: 70px;
    }
    .position-decisions :global(th:last-child) {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
