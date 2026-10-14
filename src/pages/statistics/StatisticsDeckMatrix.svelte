<script lang="ts">
  import type { ChartDatum } from '@/lib/statistics/statistics';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';

  let { id, items, onmore }: { id: string; items: ChartDatum[]; onmore?: () => void } = $props();

  const types = [
    { key: 'speed', label: 'Spd', color: 'var(--stat-speed)' },
    { key: 'stamina', label: 'Sta', color: 'var(--stat-stamina)' },
    { key: 'power', label: 'Pwr', color: 'var(--stat-power)' },
    { key: 'guts', label: 'Guts', color: 'var(--stat-guts)' },
    { key: 'wit', label: 'Wit', color: 'var(--stat-wit)' },
    { key: 'friend', label: 'Fri', color: 'var(--accent-warning)' },
    { key: 'group', label: 'Grp', color: 'var(--accent-secondary)' }
  ];
  const normalize = (type: string) =>
    ['wiz', 'wisdom', 'intelligence', 'int'].includes(type) ? 'wit' : type;

  const activeTypes = $derived(
    types.filter((type) =>
      items.some((item) =>
        Object.entries(item.composition ?? {}).some(
          ([key, count]) => normalize(key) === type.key && count > 0
        )
      )
    )
  );
  const columns = $derived<TableColumn[]>([
    ...(!activeTypes.length
      ? [{ key: 'name', label: 'Build' }]
      : activeTypes.map((type) => ({ key: type.key, label: type.label, numeric: true }))),
    { key: 'share', label: 'Share', numeric: true }
  ]);
  const rows = $derived(
    items.slice(0, 8).map((item) => ({
      ...Object.fromEntries(
        Object.entries(item.composition ?? {}).map(([key, count]) => [normalize(key), count])
      ),
      name: item.name,
      uses: item.value,
      share: (item.percentage ?? 0).toFixed(1) + '%'
    }))
  );
</script>

<div class="deck-matrix">
  <ChartFrame
    {id}
    title="Deck composition"
    description="Support slots per deck · most used combinations"
  >
    {#snippet actions()}
      {#if onmore}
        <Button
          variant="secondary"
          size="sm"
          onclick={onmore}
        >
          <span class="panel-action">
            All builds<Icon
              name="arrow-right"
              size={13}
            />
          </span>
        </Button>
      {/if}
    {/snippet}
    <DataTable
      caption="Support deck composition counts and shares"
      {columns}
      {rows}
      emptyMessage="No deck data for this selection"
    >
      {#snippet cell(row, column)}
        {#if column.key === 'name'}
          <span class="build-name">{row.name}</span>
        {:else if column.key === 'share'}
          <span
            class="share"
            title={Number(row.uses).toLocaleString() + ' recorded decks · ' + row.name}
          >
            {row.share}
          </span>
        {:else}
          <span
            class="slot"
            class:filled={Number(row[column.key]) > 0}
            style:--slot-color={types.find((type) => type.key === column.key)?.color}
            aria-label={column.key + ': ' + (row[column.key] || 0)}
          >
            {row[column.key] || '–'}
          </span>
        {/if}
      {/snippet}
    </DataTable>
    <div class="type-key">
      {#each activeTypes as type}
        <span>
          <i style:background={type.color}></i>
          {type.key === 'wit' ? 'Wit' : type.key.charAt(0).toUpperCase() + type.key.slice(1)}
        </span>
      {/each}
    </div>
  </ChartFrame>
</div>

<style>
  .panel-action {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .build-name {
    display: block;
    white-space: normal;
    text-align: left;
    font-size: 11px;
  }
  .deck-matrix :global(.chart-tools) {
    flex: none;
  }
  .deck-matrix :global(.chart-actions > button) {
    font-size: 11px;
    min-height: 32px;
    padding: 0 9px;
    font-weight: 600;
    white-space: nowrap;
  }
  .deck-matrix {
    min-width: 0;
  }
  .deck-matrix :global(.chart-frame) {
    padding: 12px;
    border-radius: var(--radius-md);
    gap: 10px;
  }
  .deck-matrix :global(figcaption) {
    align-items: center;
    border-bottom: 1px solid var(--border-primary);
    padding-bottom: 8px;
  }
  .deck-matrix :global(figcaption h3) {
    font-size: 13px;
  }
  .deck-matrix :global(figcaption p) {
    font-size: 10px;
  }
  .deck-matrix :global(.plot) {
    min-height: 0;
    overflow: visible;
    gap: 10px;
  }
  .deck-matrix :global(.table-wrap) {
    border: 0;
    border-radius: 0;
    flex: 1;
  }
  .deck-matrix :global(table) {
    table-layout: fixed;
    background: transparent;
    height: 100%;
  }
  .deck-matrix :global(th) {
    position: static;
    padding: 3px 1px 7px;
    text-align: center;
    font-size: 9px;
    background: transparent;
    border-bottom: 1px solid var(--border-primary);
  }
  .deck-matrix :global(td) {
    padding: 3px 2px;
    border: 0;
    text-align: center;
    font-size: 12px;
  }
  .deck-matrix :global(th:last-child),
  .deck-matrix :global(td:last-child) {
    width: 48px;
    text-align: right;
  }
  .slot {
    display: block;
    padding: 5px 1px;
    border-radius: 3px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .slot.filled {
    background: color-mix(in srgb, var(--slot-color) 27%, var(--card-surface-bg));
    color: var(--text-primary);
    font-weight: 750;
    box-shadow: inset 0 -2px color-mix(in srgb, var(--slot-color) 70%, transparent);
  }
  .share {
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .type-key {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    color: var(--text-muted);
    font-size: 9px;
  }
  .type-key span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .type-key i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }
</style>
