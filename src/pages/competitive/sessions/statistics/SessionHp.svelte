<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { hpRemainingColor } from '@/lib/race/replay/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import { percent } from '../../analysis-view';
  import { metricHelp } from './session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    active: boolean;
    onuma: (key: string) => void;
  }

  let { analysis, active, onuma }: Props = $props();
</script>

{#if active}
  <DataTable
    plain
    compact
    caption="HP & Last Spurt"
    columnHelp={metricHelp}
    maxHeight={420}
    columns={[
      { key: 'name', label: 'Your Uma' },
      { key: 'finish', label: 'Avg. finish HP', numeric: true },
      { key: 'delay', label: 'Avg. spurt delay', numeric: true },
      { key: 'speed', label: 'Avg. spurt speed', numeric: true },
      { key: 'entries', label: 'Races', numeric: true },
      { key: 'winrate', label: 'Win rate', numeric: true },
      { key: 'start', label: 'Avg. start HP', numeric: true },
      { key: 'survival', label: 'Finished with HP', numeric: true }
    ]}
    rows={analysis.hp.map((r) => ({
      id: r.key,
      name: r.name,
      cardId: r.cardId ?? '—',
      entries: r.races,
      finishPercent: r.finishHpPercentEntries
        ? r.finishHpPercentTotal / r.finishHpPercentEntries
        : '—',
      winrate: percent(r.wins, r.races),
      start: r.startHpEntries ? r.startHpTotal / r.startHpEntries : '—',
      finish: r.finishHpEntries ? r.finishHpTotal / r.finishHpEntries : '—',
      survival: r.finishHpEntries ? percent(r.survived, r.finishHpEntries) : '—',
      delay: r.spurtDelayEntries ? r.spurtDelayTotal / r.spurtDelayEntries : '—',
      speed: r.spurtSpeedEntries ? r.spurtSpeedTotal / r.spurtSpeedEntries : '—'
    }))}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'name'}
        <button
          class="character-select"
          onclick={() => onuma(String(row.id))}
          aria-label={'Show ' + row.name + ' analysis'}
        >
          <RunnerReference
            name={String(row.name)}
            cardId={typeof row.cardId === 'number' ? row.cardId : undefined}
          />
        </button>
      {:else if column.key === 'delay'}
        <span class:warning={typeof row.delay === 'number' && row.delay > 0.05}>
          {typeof row.delay === 'number' ? row.delay.toFixed(1) + ' m' : '—'}
        </span>
      {:else if column.key === 'speed'}
        {typeof row.speed === 'number' ? row.speed.toFixed(2) + ' m/s' : '—'}
      {:else if column.key === 'finish'}
        <span
          class="finish-hp"
          style:color={hpRemainingColor(
            typeof row.finishPercent === 'number' ? row.finishPercent : undefined,
            $theme === 'dark'
          )}
        >
          {typeof row.finish === 'number'
            ? Math.round(row.finish).toLocaleString()
            : '—'}{#if typeof row.finishPercent === 'number'}
            <span>
              ({row.finishPercent.toFixed(1)}%)
            </span>
          {/if}
        </span>
      {:else if column.key === 'start'}
        {typeof row[column.key] === 'number'
          ? Math.round(Number(row[column.key])).toLocaleString()
          : '—'}
      {:else}
        {row[column.key]}
      {/if}
    {/snippet}
  </DataTable>
  {#if !analysis.hp.length}
    <p>No player runners were identified in these captures.</p>
  {/if}
{/if}

<style>
  @import './character-select.css';
  p {
    margin: 0;
  }
  p {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .warning {
    color: var(--accent-warning);
  }
  .finish-hp {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    white-space: nowrap;
  }
  .finish-hp > span {
    font-size: 10px;
  }
</style>
