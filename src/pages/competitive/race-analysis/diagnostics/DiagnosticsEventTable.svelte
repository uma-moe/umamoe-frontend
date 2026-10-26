<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticLabel, raceMetricHelp } from '@/lib/race/capture/race-diagnostics';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import DiagnosticsRunnerReference from './DiagnosticsRunnerReference.svelte';
  import { number, rows, seekRow } from './diagnostics-format';

  let {
    value,
    title,
    columns,
    capture,
    index,
    skillNames,
    onseek,
    onselect
  }: {
    value: unknown;
    title: string;
    columns: TableColumn[];
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();
</script>

{#if Array.isArray(value) && !value.length}
  <p class="empty">No observations recorded for this runner.</p>
{:else}
  <DataTable
    columnHelp={raceMetricHelp}
    plain
    compact
    caption={title}
    rows={rows(value)}
    {columns}
    maxHeight={Array.isArray(value) && value.length > 12 ? 300 : undefined}
    onrowclick={(row) => seekRow(row, onseek)}
    emptyMessage="No observations recorded for this runner."
  >
    {#snippet cell(row, column)}
      {#if /^(time|startTime|endTime)$/.test(column.key) && typeof row[column.key] === 'number'}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => onseek(Number(row[column.key]))}
        >
          {Number(row[column.key]).toFixed(3)} s
        </Button>
      {:else if /^(horseIndex|.*HorseIndex)$/.test(column.key) && Number(row[column.key]) >= 0}
        <DiagnosticsRunnerReference
          {capture}
          {index}
          value={Number(row[column.key])}
          {onselect}
        />
      {:else if column.key === 'referenceHorseIndex'}
        <span class="muted">None</span>
      {:else if column.key === 'skillId'}
        <span class="skill-chip-cell">
          <RaceSkill
            id={Number(row[column.key])}
            name={skillNames.get(Number(row[column.key]))}
            fill
          />
        </span>
        {#if Number(row.detailIndex) > 0}
          <small class="effect-index">
            Effect {Number(row.detailIndex) + 1}
          </small>
        {/if}
      {:else if column.key === 'attemptedMode'}
        {['None', 'Speed up', 'Overtake', 'Pace up', 'Pace down', 'Pace up (extended)'][
          Number(row.attemptedMode)
        ] ?? row.attemptedMode}
      {:else if column.key === 'outcome'}
        <span
          class:activated={row.outcome === 'Started'}
          class:failed={row.outcome === 'Roll failed'}
        >
          {row.outcome}
        </span>
      {:else if column.key === 'mode'}
        {['None', 'Late Surger position', 'Pace Chaser position', 'Front Runner position', 'Boost'][
          Number(row.mode)
        ] ?? row.mode}
      {:else if column.key === 'duration'}
        {Number(row.duration).toFixed(2)}
      {:else if column.key === 'roll' && typeof row.roll === 'number' && typeof row.threshold === 'number'}
        <span
          class:activated={Number(row.roll) < Number(row.threshold)}
          class:failed={Number(row.roll) >= Number(row.threshold)}
        >
          {Number(row.roll).toFixed(2)}% {Number(row.roll) < Number(row.threshold) ? '<' : '≥'}
          {Number(row.threshold).toFixed(2)}%
        </span>
      {:else if /^(roll|threshold)$/.test(column.key)}
        {typeof row[column.key] === 'number' ? Number(row[column.key]).toFixed(2) + '%' : '—'}
      {:else if column.key === 'mask'}
        {Object.entries(capture.detailed?.annotations.flags ?? {})
          .filter(([, flag]) => (Number(row.mask) & flag) !== 0)
          .map(([name]) => diagnosticLabel(name))
          .join(', ') || 'None'}
      {:else}
        {typeof row[column.key] === 'number' ? number(row[column.key], 2) : row[column.key]}
      {/if}
    {/snippet}
  </DataTable>
{/if}

<style>
  @import '../../runners/skill-chip-cell.css';
  .skill-chip-cell {
    display: inline-flex;
    vertical-align: middle;
  }
  p {
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .muted {
    color: var(--text-secondary);
  }
  .effect-index {
    margin-left: 5px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  :global(.detail-table) .activated {
    color: var(--accent-secondary);
  }
  :global(.detail-table) .failed {
    color: var(--accent-error);
  }
  .empty {
    padding: 6px 0;
  }
</style>
