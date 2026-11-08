<script lang="ts">
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import type { DiagnosticRow } from '@/lib/race/capture/race-diagnostics';
  import SeekTimeButton from '../SeekTimeButton.svelte';
  import { fixed, seekRow, signed } from '../diagnostics-format';
  import { calculationOutcome } from './hp-report';

  let {
    calculations,
    onseek
  }: {
    /** In time order: the check, then any recalculation an HP change forced. */
    calculations: DiagnosticRow[];
    onseek: (time: number) => void;
  } = $props();

  const columns: TableColumn[] = [
    { key: 'time', label: 'Time', numeric: true, sortable: false },
    { key: 'checkDistance', label: 'Distance', numeric: true, sortable: false },
    { key: 'checkHp', label: 'HP available', numeric: true, sortable: false },
    { key: 'fullSpurtNeedHp', label: 'HP needed', numeric: true, sortable: false },
    { key: 'balance', label: 'Balance', numeric: true, sortable: false },
    { key: 'selectedStartDistance', label: 'Start', numeric: true, sortable: false },
    { key: 'selectedTargetSpeed', label: 'Speed', numeric: true, sortable: false },
    { key: 'result', label: 'Result', sortable: false }
  ];

  // The table width a column needs before it shows; a narrow card keeps the balance and result instead of scrolling.
  const columnMinWidths: Partial<Record<string, number>> = {
    checkDistance: 580,
    selectedStartDistance: 580,
    checkHp: 440,
    fullSpurtNeedHp: 440,
    selectedTargetSpeed: 360
  };

  const units: Record<string, string> = {
    checkDistance: 'm',
    checkHp: 'HP',
    fullSpurtNeedHp: 'HP',
    selectedStartDistance: 'm',
    selectedTargetSpeed: 'm/s'
  };

  const reading = (value: unknown) => (typeof value === 'number' ? value : '—');

  let width = $state(0);

  const visibleColumns = $derived(
    columns.filter((column) => (columnMinWidths[column.key] ?? 0) <= width)
  );

  const rows = $derived(
    calculations.map((calculation) => {
      const { checkHp, fullSpurtNeedHp } = calculation;
      const outcome = calculationOutcome(calculation);
      const balance =
        typeof checkHp === 'number' && typeof fullSpurtNeedHp === 'number'
          ? checkHp - fullSpurtNeedHp
          : undefined;

      return {
        time: reading(calculation.time),
        checkDistance: reading(calculation.checkDistance),
        checkHp: reading(checkHp),
        fullSpurtNeedHp: reading(fullSpurtNeedHp),
        balance: reading(balance),
        selectedStartDistance: outcome.selected ? reading(calculation.selectedStartDistance) : '—',
        selectedTargetSpeed: outcome.selected ? reading(calculation.selectedTargetSpeed) : '—',
        result: outcome.label
      };
    })
  );
</script>

<div
  class="spurt-calculations"
  bind:clientWidth={width}
>
  <DataTable
    plain
    compact
    caption="Last-spurt calculations"
    {rows}
    columns={visibleColumns}
    onrowclick={(row) => seekRow(row, onseek)}
  >
    {#snippet cell(row, column)}
      {@const value = row[column.key]}
      {#if column.key === 'time' && typeof value === 'number'}
        <SeekTimeButton
          time={value}
          {onseek}
        />
      {:else if column.key === 'balance' && typeof value === 'number'}
        <span
          class:negative={value < 0}
          class:positive={value > 0}
        >
          {signed(value)} HP
        </span>
      {:else if typeof value === 'number'}
        {fixed(value, 2)} {units[column.key]}
      {:else}
        {value}
      {/if}
    {/snippet}
  </DataTable>
</div>

<style>
  @import './spurt-calculation.css';
</style>
