<script lang="ts">
  import DataTable from '@/components/data/DataTable.svelte';
  import type { TeamRate } from '../hakuraku-types';
  import { pct, number, styleNames } from './cm-data';

  let {
    rows,
    colors,
    onselect
  }: { rows: TeamRate[]; colors: Record<number, string>; onselect: (row: TeamRate) => void } =
    $props();

  const entries = $derived(
    rows.map((row) => ({
      key: row.key,
      name: row.key
        .split('-')
        .map((id) => styleNames[Number(id)] ?? id)
        .join(' / '),
      rate: row.team,
      lower: row.teamCI[0],
      upper: row.teamCI[1],
      owners: row.owners
    }))
  );
</script>

<div class="composition-table">
  <DataTable
    plain
    compact
    caption="Team composition performance"
    sortKey="rate"
    sortDirection="descending"
    columns={[
      { key: 'name', label: 'Style composition' },
      { key: 'rate', label: 'Team wins', numeric: true },
      { key: 'lower', label: 'Estimated win range', numeric: true },
      { key: 'owners', label: 'Players', numeric: true }
    ]}
    rows={entries}
    emptyMessage="No compositions meet this player threshold."
  >
    {#snippet columnHeader(column)}
      {#if column.key === 'rate'}
        <div class="rate-scale">
          <span
            class="comparison-key"
            title="When three teams are equally matched, each wins one race in three."
          >
            33.3% is one win in three
          </span>
        </div>
      {/if}
    {/snippet}
    {#snippet cell(row, column)}
      {#if column.key === 'name'}
        <button
          class="composition"
          onclick={() => {
            const selected = rows.find((r) => r.key === row.key);
            if (selected) onselect(selected);
          }}
        >
          {#each String(row.key).split('-').map(Number) as id, index}
            {#if index}
              <span class="slash">/</span>
            {/if}
            <span>
              <i style:background={colors[id]}></i>
              {styleNames[id]}
            </span>
          {/each}
          <span class="arrow">↗</span>
        </button>
      {:else if column.key === 'rate'}
        <span class="win-rate">
          <strong>{pct(Number(row.rate))}</strong>
          <span
            class="rate-bar"
            role="img"
            aria-label={'Team win rate ' +
              pct(Number(row.rate)) +
              ', where 33.3% is one win in three'}
          >
            <i
              class="fill"
              style:width={Number(row.rate) * 100 + '%'}
            ></i>
            <i
              class="baseline"
              title="33.3%: one win in three when the three teams are equally matched."
            ></i>
          </span>
        </span>
      {:else if column.key === 'lower'}
        <span
          class="ci"
          title="95% confidence interval for the simulated team win rate. A narrower range means a more precise estimate."
        >
          {pct(Number(row.lower))}–{pct(Number(row.upper))}
        </span>
      {:else}
        {number(Number(row.owners))}
      {/if}
    {/snippet}
  </DataTable>
</div>

<style>
  .composition-table {
    min-width: 0;
  }
  .composition-table :global(table) {
    font-size: 12px;
    min-width: 680px;
  }
  .composition-table :global(th) {
    font-size: 10px;
  }
  .composition-table :global(th:nth-child(1)) {
    width: 44%;
  }
  .composition-table :global(th:nth-child(2)) {
    width: 30%;
  }
  .composition-table :global(th:nth-child(3)) {
    width: 18%;
  }
  .composition-table :global(th:nth-child(4)) {
    width: 8%;
  }
  .composition-table :global(td) {
    padding-block: 5px;
  }
  .composition {
    display: flex;
    gap: 7px;
    align-items: center;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    min-height: 26px;
  }
  .composition > span:not(.slash):not(.arrow) {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .composition i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .slash {
    color: var(--text-secondary);
    opacity: 0.5;
  }
  .arrow {
    margin-left: auto;
    color: var(--text-secondary);
    padding-left: 8px;
  }
  .composition:hover {
    color: var(--accent-primary);
  }
  .win-rate {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .win-rate strong {
    width: 48px;
    flex: none;
    font-size: 14px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .rate-bar {
    position: relative;
    display: block;
    flex: 1;
    height: 8px;
    background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }
  .rate-bar i {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .fill {
    left: 0;
    background: var(--accent-primary);
    opacity: 0.65;
  }
  .baseline {
    left: 33.333%;
    border-left: 2px solid var(--text-primary);
  }
  .ci {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 600px) {
    .composition-table :global(td) {
      padding-inline: 8px;
    }
    .composition {
      font-size: 10px;
    }
  }
  .rate-scale {
    position: relative;
    height: 18px;
    margin: 0 0 2px 60px;
    text-transform: none;
    letter-spacing: 0;
  }
  .comparison-key {
    position: absolute;
    left: 33.333%;
    top: 1px;
    transform: translateX(-50%);
    display: grid;
    justify-items: center;
    gap: 1px;
    font-size: 10px;
    line-height: 1.2;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .comparison-key::after {
    content: '';
    height: 5px;
    border-left: 2px solid var(--text-primary);
  }
  @container chart-frame (min-width:1000px) {
    .rate-scale {
      position: absolute;
      top: 4px;
      left: 8px;
      right: 8px;
      margin: 0 0 0 60px;
    }
  }
</style>
