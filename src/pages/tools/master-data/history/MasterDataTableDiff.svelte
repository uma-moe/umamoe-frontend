<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import type { MasterCell, MasterTableDiff } from '@/services/resources/master-history';
  import { columnKey, columnPosition, timestampLabel } from '../master-data-results';
  import {
    diffEntries,
    diffTableRows,
    masterCellText,
    sameCell,
    type DiffEntry
  } from './master-diff-rows';

  interface Props {
    name: string;
    table: MasterTableDiff;
  }

  let { name, table }: Props = $props();

  const changeTones = { added: 'success', removed: 'danger', modified: 'warning' } as const;

  const entries = $derived(diffEntries(table));
  const rows = $derived(diffTableRows(entries));
  const columns = $derived<TableColumn[]>([
    { key: 'change', label: 'Change' },
    ...table.columns.map((label, position) => ({ key: columnKey(position), label }))
  ]);

  function entryOf(row: Record<string, string | number>): DiffEntry | undefined {
    return typeof row.entry === 'number' ? entries[row.entry] : undefined;
  }
</script>

{#snippet value(column: string, cell: MasterCell)}
  {@const timestamp = typeof cell === 'number' ? timestampLabel(column, cell) : undefined}
  {#if cell === null}
    <span class="null">NULL</span>
  {:else if timestamp}
    {cell}
    <small class="timestamp">{timestamp}</small>
  {:else if typeof cell === 'string'}
    <span class="text">{cell}</span>
  {:else}
    {masterCellText(cell)}
  {/if}
{/snippet}

<div class="table-diff">
  <DataTable
    plain
    compact
    caption="Changed rows in {name}"
    {columns}
    {rows}
    maxHeight={440}
  >
    {#snippet cell(row, column)}
      {@const entry = entryOf(row)}
      {#if entry}
        {@const position = columnPosition(column.key)}
        {#if column.key === 'change'}
          <Badge tone={changeTones[entry.change]}>{entry.change}</Badge>
        {:else if entry.change === 'modified'}
          {@const before = entry.before[position] ?? null}
          {@const after = entry.after[position] ?? null}
          {#if sameCell(before, after)}
            <span class="unchanged">{@render value(column.label, after)}</span>
          {:else}
            <span class="changed">
              <span class="before">{@render value(column.label, before)}</span>
              <span aria-hidden="true">→</span>
              <span class="sr-only">changed to</span>
              <span class="after">{@render value(column.label, after)}</span>
            </span>
          {/if}
        {:else}
          {@render value(column.label, entry.cells[position] ?? null)}
        {/if}
      {/if}
    {/snippet}
  </DataTable>
</div>

<style>
  @import '../master-data-cells.css';
  @import './master-data-table-diff.css';
</style>
