<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import { count } from '../diagnostics-format';
  import { positionKeepDecisionRows } from './position-keep-decisions';

  let {
    id,
    capture,
    index,
    horse,
    skillNames,
    onseek,
    onselect
  }: {
    id: string;
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const decisions = $derived(positionKeepDecisionRows(capture, horse));
</script>

<section class="detail-panel report-card detail-table position-decisions">
  <Disclosure
    id={id + '-position-decisions'}
    title="Position keep decisions"
    description={count(horse.positionKeepDecisions?.length ?? 0, 'decision')}
    compact
    open
  >
    <DiagnosticsEventTable
      value={decisions}
      title="Position keep decisions"
      columns={[
        { key: 'time', label: 'Time (s)', numeric: true },
        { key: 'duration', label: 'Duration (s)', numeric: true },
        { key: 'attemptedMode', label: 'Mode' },
        { key: 'outcome', label: 'Result' },
        { key: 'pacemakerHorseIndex', label: 'Current pacemaker' }
      ]}
      {capture}
      {index}
      {skillNames}
      maxHeight={300}
      {onseek}
      {onselect}
    />
  </Disclosure>
</section>

<style>
  @import '../report-card.css';
  @import './detail-panel.css';
  @import './diagnostics-traces.css';
</style>
