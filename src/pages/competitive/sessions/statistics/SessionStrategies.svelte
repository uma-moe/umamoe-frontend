<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import { percent, rate, styleColors } from '../../analysis-view';
  import {
    metricHelp,
    sessionChart,
    styleCompositions,
    styleRepresentatives,
    type SessionTeam
  } from './session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    entryCount: number;
    teams: SessionTeam[];
    active: boolean;
    onfind: (card: string, style?: string) => void;
  }

  let { analysis, captures, entryCount, teams, active, onfind }: Props = $props();

  const ink = $derived($theme === 'dark' ? '#abb4c3' : '#566071');
  const styles = $derived(analysis.strategies.filter((r) => r.strategy > 0));
  const styleRows = $derived(
    styles.map((row) => ({
      id: row.strategy,
      name: runningStyleName(row.strategy),
      entries: row.races,
      field: rate(row.races, entryCount),
      wins: row.wins,
      share: rate(row.wins, captures.length),
      winrate: rate(row.wins, row.races)
    }))
  );
  const compositions = $derived(styleCompositions(teams));
  const compositionRows = $derived(
    compositions.slice(0, 12).map((row) => ({
      id: row.key,
      name: row.styles.map((id) => runningStyleName(id, true)).join(' / '),
      appearances: row.appearances,
      wins: row.wins,
      winrate: rate(row.wins, row.appearances)
    }))
  );
</script>

{#if active}
  <DataTable
    plain
    compact
    caption="Running style performance"
    columnHelp={metricHelp}
    rows={styleRows}
    columns={[
      { key: 'name', label: 'Running style' },
      { key: 'entries', label: 'Entries', numeric: true },
      { key: 'field', label: 'Field share', numeric: true },
      { key: 'wins', label: 'Wins', numeric: true },
      { key: 'share', label: 'Win share', numeric: true },
      { key: 'winrate', label: 'Win rate', numeric: true }
    ]}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'name'}
        <Button
          variant="ghost"
          size="sm"
          onclick={() => onfind('', String(row.id))}
        >
          <span
            class="style-dot"
            style:background={styleColors[Number(row.id)]}
          ></span>
          {row.name}
        </Button>
      {:else if ['field', 'share', 'winrate'].includes(column.key)}
        {Number(row[column.key]).toFixed(1)}%
      {:else}
        {row[column.key]}
      {/if}
    {/snippet}
  </DataTable>
  <div class="two-col">
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="style-breakdown"
      title="Strategy breakdown"
      description="Population compared with the winners."
      legend={[
        { label: 'Field share', color: '#69b7ee' },
        { label: 'Win share', color: '#7bc8a0' }
      ]}
    >
      <LazyEChartsSurface
        height={210}
        label="Strategy population and win share"
        option={sessionChart(
          ink,
          [
            {
              name: 'Field share',
              type: 'bar',
              data: styles.map((r) => +rate(r.races, entryCount).toFixed(1)),
              itemStyle: { color: '#69b7ee' }
            },
            {
              name: 'Win share',
              type: 'bar',
              data: styles.map((r) => +rate(r.wins, captures.length).toFixed(1)),
              itemStyle: { color: '#7bc8a0' }
            }
          ],
          { type: 'category', data: styles.map((r) => runningStyleName(r.strategy, true)) },
          { type: 'value', name: 'Share %' }
        )}
      />
    </ChartFrame><ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="style-saturation"
      title="Strategy saturation"
      description="Win rate as more runners use the same style."
      legend={styles.map((r) => ({
        label: runningStyleName(r.strategy, true),
        color: styleColors[r.strategy]!
      }))}
    >
      <LazyEChartsSurface
        height={210}
        label="Strategy saturation"
        option={sessionChart(
          ink,
          styles.map((r) => ({
            name: runningStyleName(r.strategy),
            type: 'line',
            symbolSize: 7,
            itemStyle: { color: styleColors[r.strategy] },
            data: r.saturation.map((b) => [b.count, +rate(b.wins, b.races).toFixed(1)])
          })),
          {
            type: 'value',
            min: 1,
            max: Math.max(9, ...captures.map((c) => c.runners.length)),
            minInterval: 1,
            name: 'In room'
          },
          { type: 'value', name: 'Win %' }
        )}
      />
    </ChartFrame>
  </div>
  <div class="two-col">
    <ChartFrame
      plain
      surface
      compact
      id="session-representatives"
      title="Style representatives"
      description="Select an Uma to find its captured teams."
    >
      <div class="representatives">
        {#each styles as row}
          <div>
            <h4 style:color={styleColors[row.strategy]}>
              {runningStyleName(row.strategy)}
            </h4>
            {#each styleRepresentatives(analysis, row.strategy) as r}
              <button
                class="uma-row"
                onclick={() => onfind(r.key, String(row.strategy))}
              >
                <RunnerReference
                  name={r.name}
                  cardId={r.cardId}
                  detail={r.entries.length + ' entries'}
                />
                <strong title="Individual win rate">
                  {percent(r.entries.filter((e) => e.finishOrder === 1).length, r.entries.length)}
                </strong>
              </button>
            {/each}
          </div>
        {/each}
      </div>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      id="session-compositions"
      title="Team compositions"
      description="Wins by any member of the team."
    >
      <DataTable
        plain
        compact
        caption="Session team compositions"
        columnHelp={metricHelp}
        rows={compositionRows}
        columns={[
          { key: 'name', label: 'Lineup' },
          { key: 'appearances', label: 'Races', numeric: true },
          { key: 'wins', label: 'Wins', numeric: true },
          { key: 'winrate', label: 'Win rate', numeric: true }
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'name'}
            <span class="lineup">
              {#each compositions.find((r) => r.key === row.id)?.styles ?? [] as id, i}
                {#if i}
                  <span class="slash">/</span>
                {/if}
                <span style:color={styleColors[id]}>
                  {runningStyleName(id, true)}
                </span>
              {/each}
            </span>
          {:else if column.key === 'winrate'}
            {Number(row.winrate).toFixed(1)}%
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    </ChartFrame>
  </div>
{/if}

<style>
  @import './session-lineup.css';
  h4 {
    margin: 0;
  }
  h4 {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  .style-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 6px;
    border-radius: 50%;
    vertical-align: middle;
  }
  .representatives {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
  }
  .uma-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 5px 0;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    background: none;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .uma-row > :global(.runner-reference) {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  .uma-row strong {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .uma-row:hover {
    color: var(--accent-primary);
  }
  .uma-row:last-child {
    border-bottom: 0;
  }
  @media (max-width: 760px) {
    .two-col {
      grid-template-columns: minmax(0, 1fr);
    }
    .representatives {
      gap: 10px;
    }
  }
</style>
