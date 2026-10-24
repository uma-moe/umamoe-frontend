<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { percent, portrait, rate, styleColors } from '../../analysis-view';
  import {
    chartInk,
    metricHelp,
    sessionChart,
    styleRepresentatives,
    type SessionComposition,
    type TeamFilter
  } from '../session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    compositions: SessionComposition[];
    entryCount: number;
    onteams: (filter: TeamFilter) => void;
  }

  let { analysis, captures, compositions, entryCount, onteams }: Props = $props();

  /** Three equally matched teams each win one race in three. */
  const NEUTRAL_TEAM_RATE = 100 / 3;

  const ink = $derived(chartInk($theme === 'dark'));
  const styles = $derived(analysis.strategies.filter((row) => row.strategy > 0));
  const breakdown = $derived(
    styles.map((row) => ({
      style: row.strategy,
      entries: row.races,
      wins: row.wins,
      field: rate(row.races, entryCount),
      winShare: rate(row.wins, captures.length),
      winRate: rate(row.wins, row.races)
    }))
  );

  // Both tracks share one scale, so a style winning more than its field share reads at a glance.
  const trackMax = $derived(Math.max(1, ...breakdown.flatMap((row) => [row.field, row.winShare])));

  const mostRoom = $derived(Math.max(9, ...captures.map((capture) => capture.runners.length)));
  const compositionRows = $derived(
    compositions.map((row) => ({
      id: row.key,
      appearances: row.appearances,
      wins: row.wins,
      winrate: rate(row.wins, row.appearances)
    }))
  );
</script>

<div class="strategy">
  <div class="panels upper">
    <ChartFrame
      plain
      surface
      id="session-style-breakdown"
      title="Style breakdown"
      description="Field share and win share on one scale. Select a style to find its teams."
    >
      <div class="breakdown-key">
        <span>Running style</span>
        <span class="track-key">
          <i></i>
          Field
          <i class="win-key"></i>
          Wins
        </span>
        <span>Win share</span>
        <span>Win rate</span>
      </div>
      {#each breakdown as row (row.style)}
        <div class="style-row">
          <div class="style-name">
            <button
              class="style-link"
              onclick={() => onteams({ style: String(row.style) })}
            >
              <i style:background={styleColors[row.style]}></i>
              {runningStyleName(row.style)}
            </button>
            <small>{row.entries} entries</small>
          </div>
          <div
            class="tracks"
            role="img"
            aria-label={runningStyleName(row.style) +
              ': ' +
              row.field.toFixed(1) +
              '% of the field, ' +
              row.winShare.toFixed(1) +
              '% of wins'}
          >
            <span class="track"><i style:width={(row.field / trackMax) * 100 + '%'}></i></span>
            <span class="track">
              <i
                style:width={(row.winShare / trackMax) * 100 + '%'}
                style:background={styleColors[row.style]}
              ></i>
            </span>
          </div>
          <div class="readout">
            <strong>{row.winShare.toFixed(1)}%</strong>
            <small>{row.field.toFixed(1)}% field</small>
          </div>
          <div class="readout">
            <strong>{row.winRate.toFixed(1)}%</strong>
            <small>{row.wins} wins</small>
          </div>
        </div>
      {/each}
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="style-saturation"
      title="Style saturation"
      description="Win rate as more runners in the room share a style."
      legend={styles.map((row) => ({
        label: runningStyleName(row.strategy, true),
        color: styleColors[row.strategy]!
      }))}
    >
      <LazyEChartsSurface
        height={230}
        label="Win rate by number of runners with the same style"
        option={sessionChart(
          ink,
          styles.map((row) => ({
            name: runningStyleName(row.strategy),
            type: 'line',
            symbolSize: 7,
            itemStyle: { color: styleColors[row.strategy] },
            data: row.saturation.map((bucket) => [
              bucket.count,
              +rate(bucket.wins, bucket.races).toFixed(1)
            ])
          })),
          { type: 'value', min: 1, max: mostRoom, interval: 1, name: 'Runners with the style' },
          { type: 'value', axisLabel: { fontSize: 10, color: ink, formatter: '{value}%' } }
        )}
      />
    </ChartFrame>
  </div>
  <div class="panels lower">
    <ChartFrame
      plain
      surface
      id="session-representatives"
      title="Style representatives"
      description="The most entered Umas for each style. Select one to find its teams."
    >
      <div class="representatives">
        {#each styles as row (row.strategy)}
          <section>
            <h4>
              <i style:background={styleColors[row.strategy]}></i>
              {runningStyleName(row.strategy)}
            </h4>
            <div class="representative-head">
              <span>Uma</span>
              <span>Win%</span>
              <span>Entries</span>
            </div>
            {#each styleRepresentatives(analysis, row.strategy) as uma (uma.key)}
              <button
                class="representative"
                aria-label={'Find ' + uma.name + ' ' + runningStyleName(row.strategy) + ' teams'}
                onclick={() => onteams({ uma: uma.key, style: String(row.strategy) })}
              >
                <Artwork
                  src={portrait(uma.cardId)}
                  alt=""
                  size="xs"
                />
                <span class="representative-name">{uma.name}</span>
                <strong>
                  {percent(
                    uma.entries.filter((entry) => entry.finishOrder === 1).length,
                    uma.entries.length
                  )}
                </strong>
                <small>{uma.entries.length}</small>
              </button>
            {:else}
              <p class="empty">No entries</p>
            {/each}
          </section>
        {/each}
      </div>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      id="session-compositions"
      title="Team compositions"
      description="Races won by any member of a team with these styles."
    >
      <DataTable
        plain
        compact
        caption="Session team compositions"
        columnHelp={metricHelp}
        maxHeight={360}
        rows={compositionRows}
        sortKey="winrate"
        sortDirection="descending"
        columns={[
          { key: 'name', label: 'Composition', sortable: false },
          { key: 'winrate', label: 'Team wins', numeric: true },
          { key: 'appearances', label: 'Races', numeric: true },
          { key: 'wins', label: 'Wins', numeric: true }
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'name'}
            <button
              class="composition"
              onclick={() => onteams({ composition: String(row.id) })}
            >
              {#each String(row.id).split('-').map(Number) as id, index (index)}
                {#if index}
                  <span class="slash">/</span>
                {/if}
                <span>
                  <i style:background={styleColors[id]}></i>
                  {runningStyleName(id, true)}
                </span>
              {/each}
            </button>
          {:else if column.key === 'winrate'}
            <span class="team-rate">
              <strong>{Number(row.winrate).toFixed(1)}%</strong>
              <span
                class="rate-bar"
                role="img"
                aria-label={'Team win rate ' +
                  Number(row.winrate).toFixed(1) +
                  '% against a neutral 33.3%'}
              >
                <i
                  class="fill"
                  style:width={row.winrate + '%'}
                ></i>
                <i
                  class="baseline"
                  style:left={NEUTRAL_TEAM_RATE + '%'}
                ></i>
              </span>
            </span>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
      <p class="footnote">
        The mark on each bar is 33.3%: one win in three for equally matched teams.
      </p>
    </ChartFrame>
  </div>
</div>

<style>
  @import './session-strategy.css';
</style>
