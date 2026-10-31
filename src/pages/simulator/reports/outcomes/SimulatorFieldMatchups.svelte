<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import {
    simulatorMatchups,
    simulatorResults,
    simulatorTeamResults
  } from '../../simulator-results';
  import { runnerColor } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /** Every runner against every other in the same races, plus team results when the field has teams. */
  let { result, umas }: { result: MonteCarloResult; umas: SimulatorUma[] } = $props();

  // Strongest first, so the top-left of the matrix reads as the field's pecking order.
  const order = $derived(simulatorResults(result, umas.length).map((row) => row.source));
  const pairs = $derived(simulatorMatchups(result, umas.length));
  const teams = $derived(simulatorTeamResults(result, umas));
  const name = (source: number) => umas[source]!.name;
  const percent = (value: number) => {
    if (value >= 99.5) {
      return '100';
    }

    if (value < 0.5) {
      return '0';
    }

    return Math.round(value).toString();
  };

  // Diverging around an even matchup: blue when the row runner usually finishes ahead, red when she usually finishes behind.
  const fill = (rate: number) =>
    'color-mix(in srgb, ' +
    (rate >= 50 ? 'var(--matchup-ahead)' : 'var(--matchup-behind)') +
    ' ' +
    Math.round((Math.abs(rate - 50) / 50) * 75) +
    '%, transparent)';
</script>

<ChartFrame
  id="simulation-head-to-head"
  title="Head-to-head"
  description={'How often the runner on the left finishes ahead of the runner at the top, in the same races. Blue means she usually beats her, red means she usually loses, and the stronger the colour the clearer the result. Pale cells are close to even. Runners are in win-rate order. Hover a cell for the 95% interval and the average finish-time difference.'}
>
  <div class="scroll">
    <table
      class="matrix"
      style:--count={order.length}
    >
      <thead>
        <tr>
          <th
            scope="col"
            class="corner"
          >
            <small>finishes ahead of →</small>
          </th>
          {#each order as opponent (opponent)}<th
              scope="col"
              class="opponent"
              title={name(opponent)}
            >
              <span style:--runner={runnerColor(opponent)}>
                <SimulatorRunnerFace
                  cardId={umas[opponent]!.cardId}
                  size={34}
                />
              </span>
            </th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each order as source (source)}
          <tr>
            <th
              scope="row"
              class="who"
              style:--runner={runnerColor(source)}
            >
              <span>
                <i
                  class="dot"
                  aria-hidden="true"
                ></i>
                <SimulatorRunnerFace
                  cardId={umas[source]!.cardId}
                  size={28}
                />
                <b>{name(source)}</b>
              </span>
            </th>
            {#each order as opponent (opponent)}
              {@const pair = pairs[source]?.[opponent]}
              {#if pair}<td
                  style:background={fill(pair.rate)}
                  title={name(source) +
                    ' finishes ahead of ' +
                    name(opponent) +
                    ' in ' +
                    pair.ahead +
                    ' of ' +
                    result.runs +
                    ' races (95% interval ' +
                    pair.interval[0].toFixed(0) +
                    '–' +
                    pair.interval[1].toFixed(0) +
                    '%), on average ' +
                    Math.abs(pair.gap).toFixed(2) +
                    ' s ' +
                    (pair.gap <= 0 ? 'earlier' : 'later')}
                >
                  {percent(pair.rate)}
                  <small>%</small>
                </td>
              {:else}<td
                  class="self"
                  aria-label="Same runner"
                ></td>{/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</ChartFrame>

{#if teams.length > 1}
  <div class="section-gap">
    <ChartFrame
      id="simulation-teams"
      title="Teams"
      description="How often each team wins the race, with any of its runners, and its best finishing place on average. The bar shows the win rate and the line its 95% interval."
    >
      {#each teams as team (team.id)}
        <div class="team">
          <span class="members">
            {#each team.sources as source (source)}<span
                class="member"
                style:--runner={runnerColor(source)}
                title={name(source)}
              >
                <SimulatorRunnerFace
                  cardId={umas[source]!.cardId}
                  size={22}
                />
              </span>{/each}
            <small>{team.sources.map(name).join(', ')}</small>
          </span>
          <span
            class="bar"
            role="img"
            aria-label={'Wins ' + team.winRate.toFixed(1) + '%'}
          >
            <i style:width={team.winRate + '%'}></i>
            <i
              class="range"
              style:left={team.interval[0] + '%'}
              style:width={Math.max(0.5, team.interval[1] - team.interval[0]) + '%'}
            ></i>
          </span>
          <b>{team.winRate.toFixed(1)}%</b>
          <small class="place">best place {team.place?.toFixed(2) ?? '—'}</small>
        </div>
      {/each}
    </ChartFrame>
  </div>
{/if}

<style>
  .scroll {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
    --matchup-ahead: #3987e5;
    --matchup-behind: #e66767;
  }
  :global(:root[data-theme='light']) .scroll {
    --matchup-ahead: #2a78d6;
    --matchup-behind: #e34948;
  }
  .matrix {
    width: 100%;
    min-width: calc(160px + var(--count) * 44px);
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 2px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .matrix th,
  .matrix td {
    padding: 0;
  }
  .corner {
    width: 200px;
    text-align: left;
    vertical-align: bottom;
    padding: 0 8px 4px 4px !important;
  }
  .corner small {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .opponent {
    height: 44px;
    vertical-align: bottom;
  }
  .opponent span {
    display: flex;
    justify-content: center;
    border-bottom: 2px solid var(--runner);
    padding-bottom: 2px;
  }
  .who {
    text-align: left;
    padding-right: 10px !important;
    white-space: nowrap;
  }
  .who span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .who b {
    font-weight: 600;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--runner);
  }
  td {
    height: 34px;
    text-align: center;
    border-radius: 4px;
    font-weight: 600;
  }
  td small {
    font-size: 9px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  td.self {
    background: repeating-linear-gradient(45deg, transparent 0 4px, var(--border-subtle) 4px 5px);
  }
  .section-gap {
    margin-top: 8px;
  }
  .team {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(120px, 2fr) 56px auto;
    gap: 12px;
    align-items: center;
    min-height: 34px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .team:first-of-type {
    border-top: 0;
  }
  .members {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .members small {
    margin-left: 6px;
    font-size: 10px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .member {
    display: inline-flex;
    border-bottom: 2px solid var(--runner);
  }
  .bar {
    position: relative;
    height: 10px;
    border-radius: 5px;
    background: var(--surface-3, var(--border-subtle));
    overflow: hidden;
  }
  .bar > i {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: 5px;
    background: var(--accent-primary);
  }
  .bar > i.range {
    top: 4px;
    bottom: 4px;
    background: var(--text-primary);
    opacity: 0.5;
    border-radius: 0;
  }
  .team b {
    text-align: right;
    font-weight: 650;
  }
  .place {
    font-size: 10px;
    color: var(--text-secondary);
  }
  @media (max-width: 600px) {
    .corner {
      width: 130px;
    }
    .who b {
      max-width: 78px;
    }
    .team {
      grid-template-columns: minmax(0, 1fr) 48px;
      gap: 4px 8px;
      padding-block: 4px;
    }
    .team .bar {
      grid-column: 1/-1;
      grid-row: 2;
    }
    .place {
      display: none;
    }
  }
</style>
