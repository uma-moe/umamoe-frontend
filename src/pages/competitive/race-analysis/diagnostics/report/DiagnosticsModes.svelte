<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { raceMetricHelp, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { display, modeRows, seekRow } from '../diagnostics-format';

  let {
    capture,
    horse,
    onseek,
    expandedMode = $bindable()
  }: {
    capture: ParsedRaceCapture;
    horse: HorseDiagnostics;
    onseek: (time: number) => void;
    expandedMode?: string;
  } = $props();

  const rows = $derived(modeRows(capture, horse));
</script>

<section
  class="report-block report-card"
  aria-label="Runner race modes"
>
  <header class="section-heading">
    <h3>
      Race behaviour <small>{rows.length} active</small>
    </h3>
  </header>
  <DataTable
    columnHelp={raceMetricHelp}
    plain
    compact
    caption="Race modes"
    {rows}
    maxHeight={210}
    emptyMessage="No race modes recorded."
    columns={[
      { key: 'mode', label: 'Mode' },
      { key: 'duration', label: 'Active time (s)', numeric: true },
      { key: 'periods', label: 'Periods', numeric: true },
      { key: 'time', label: 'First (s)', numeric: true }
    ]}
    onrowclick={(row) => seekRow(row, onseek)}
    rowKey="id"
    expandedRow={expandedMode}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'time'}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => onseek(Number(row.time))}
        >
          {Number(row.time).toFixed(3)} s
        </Button>
      {:else if column.key === 'periods'}
        <button
          class="period-toggle"
          type="button"
          aria-label={'Show ' + row.mode + ' periods'}
          aria-expanded={expandedMode === row.id}
          onclick={() => (expandedMode = expandedMode === row.id ? undefined : String(row.id))}
        >
          {row.periods}
          <span class:opened={expandedMode === row.id}>
            <Icon
              name="chevron"
              size={12}
            />
          </span>
        </button>
      {:else if column.key === 'duration'}
        {Number(row.duration).toFixed(2)}
      {:else}
        {row[column.key]}
      {/if}
    {/snippet}
    {#snippet rowDetail(row)}
      <ol
        class="mode-periods"
        aria-label={row.mode + ' periods'}
      >
        {#each horse.spans.filter((span) => (span.mask & (capture.detailed?.annotations.flags[String(row.id)] ?? 0)) !== 0) as span}
          <li>
            <span>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => onseek(span.startTime)}
              >
                {span.startTime.toFixed(3)} s
              </Button>
              <span class="period-arrow">→</span>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => onseek(span.endTime)}
              >
                {span.endTime.toFixed(3)} s
              </Button>
            </span>
            <span>{display(span.phase, 'phase')}</span>
            <small>{(span.endTime - span.startTime).toFixed(2)} s</small>
          </li>
        {/each}
      </ol>
    {/snippet}
  </DataTable>
</section>

<style>
  @import '../diagnostics-section.css';
  @import '../report-card.css';
  @import './report-section.css';
  .period-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    min-width: 36px;
    min-height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-primary);
    font: inherit;
    cursor: pointer;
  }
  .period-toggle > span {
    display: flex;
  }
  .period-toggle .opened {
    transform: rotate(180deg);
  }
  .mode-periods {
    list-style: none;
    margin: 0;
    padding: 4px 8px;
    background: var(--surface-2);
  }
  .mode-periods > li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .mode-periods > li > span:first-child {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .mode-periods small {
    margin-left: auto;
    font-size: 10px;
  }
  @media (max-width: 700px) {
    .mode-periods > li {
      gap: 4px;
      flex-wrap: wrap;
    }
    .mode-periods > li > span:first-child {
      flex-basis: 100%;
    }
  }
</style>
