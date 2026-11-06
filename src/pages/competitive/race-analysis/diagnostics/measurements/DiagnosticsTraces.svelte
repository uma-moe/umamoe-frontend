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
</script>

<section
  class="report-block report-card detail-panel detail-table position-decisions"
  aria-label="Position keep decisions"
>
  <header class="section-heading">
    <h3>
      Position keep decisions <small>
        {count(horse.positionKeepDecisions?.length ?? 0, 'decision')}
      </small>
    </h3>
  </header>
  <DiagnosticsEventTable
    value={decisions}
    title="Position keep decisions"
    columns={[
      { key: 'time', label: 'Time', helpKey: 'Time (s)', numeric: true },
      { key: 'duration', label: 'Duration', helpKey: 'Duration (s)', numeric: true },
      { key: 'attemptedMode', label: 'Mode' },
      { key: 'outcome', label: 'Result' },
      { key: 'pacemakerHorseIndex', label: 'Current pacemaker' }
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
</style>
