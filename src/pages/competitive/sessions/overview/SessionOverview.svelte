<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { formatRaceTime, ordinalPlace, runningStyleName } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import FindingSentence, { type FindingPart } from '../FindingSentence.svelte';
  import SessionKpis from '../SessionKpis.svelte';
  import { portrait, rate, styleColors } from '../../analysis-view';
  import {
    compositionKpi,
    playerKpi,
    rateClass,
    styleKpi,
    umaKpi,
    type SessionKpi
  } from '../session-kpis';
  import {
    formatRate,
    gateRecords,
    isSmallSample,
    playerRecord,
    raceSummaries,
    scoreSummary,
    sessionBaseline,
    SMALL_SAMPLE,
    standoutComposition,
    standoutUma,
    styleShares,
    styleStandouts
  } from '../session-insights';
  import {
    chartColors,
    metricHelp,
    sessionChart,
    umaStyleMix,
    type SessionComposition,
    type SessionEntry,
    type SessionView,
    type TeamFilter
  } from '../session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    entries: SessionEntry[];
    compositions: SessionComposition[];
    onview: (view: SessionView) => void;
    onteams: (filter: TeamFilter) => void;
    onuma: (key: string) => void;
    oninspect: (members: RaceRunner[], title: string, race: number) => void;
    onreplay?: (race: number, runner?: number) => void;
  }

  let {
    analysis,
    captures,
    entries,
    compositions,
    onview,
    onteams,
    onuma,
    oninspect,
    onreplay
  }: Props = $props();

  const LISTED = 6;

  const colors = $derived(chartColors($theme === 'dark'));
  const baseline = $derived(sessionBaseline(analysis));
  const player = $derived(playerRecord(captures));
  const shares = $derived(styleShares(analysis));
  const standouts = $derived(styleStandouts(shares));
  const topUma = $derived(standoutUma(analysis));
  const topComposition = $derived(standoutComposition(compositions));

  const kpis = $derived.by(() => {
    const list: SessionKpi[] = [];
    const strongest = standouts.strongest,
      uma = topUma,
      composition = topComposition;

    if (player)
      list.push(
        playerKpi(player, baseline, {
          label: 'Your teams',
          icon: 'filter',
          onselect: () => onteams({ own: true })
        })
      );

    if (strongest)
      list.push(
        styleKpi(strongest, 'Best running style', {
          label: 'Strategy',
          icon: 'chart',
          onselect: () => onview('strategy')
        })
      );

    if (uma)
      list.push(
        umaKpi(uma, baseline, 'Top Uma', {
          label: 'Umas',
          icon: 'users',
          onselect: () => onuma(uma.key)
        })
      );

    if (composition)
      list.push(
        compositionKpi(composition, baseline, {
          label: 'Teams',
          icon: 'community',
          onselect: () => onteams({ composition: composition.key })
        })
      );

    return list;
  });

  /** Field and win shares use one scale, so a style's bar and its field-share tick compare directly. */
  const styleScale = $derived(
    Math.max(1, ...shares.flatMap((row) => [row.fieldShare, row.winShare]))
  );
  const styleMix = $derived(umaStyleMix(analysis));
  const popularUmas = $derived(
    [...analysis.characters].sort((a, b) => b.races - a.races).slice(0, LISTED)
  );

  const commonCompositions = $derived(
    [...compositions].sort((a, b) => b.appearances - a.appearances).slice(0, LISTED)
  );

  const races = $derived(raceSummaries(captures));
  const raceRows = $derived(
    races.map((summary) => ({
      id: summary.race,
      race: summary.race + 1,
      winner: summary.winner.name,
      time: summary.time,
      margin: summary.margin ?? '—',
      best: summary.playerBest ?? '—',
      replay: ''
    }))
  );

  const scores = $derived(scoreSummary(entries));
  const scoreTakeaway = $derived.by((): FindingPart[] => {
    if (!scores) return [];

    const gap = Math.round(scores.winnerAverage - scores.fieldAverage);
    return [
      'Winners averaged ',
      { text: Math.round(scores.winnerAverage).toLocaleString() },
      ', ',
      { text: Math.abs(gap).toLocaleString() },
      (gap >= 0 ? ' above' : ' below') + ' the field’s ',
      { text: Math.round(scores.fieldAverage).toLocaleString() },
      '.'
    ];
  });

  const gates = $derived(gateRecords(entries));
  const bestGate = $derived(
    [...gates].sort((a, b) => b.wins - a.wins || a.gate - b.gate).find((gate) => gate.wins > 0)
  );

  const gateTakeaway = $derived.by((): FindingPart[] => {
    if (!bestGate) return [];

    return [
      'Gate ',
      { text: String(bestGate.gate) },
      ' won most often: ',
      { text: bestGate.wins + ' of ' + bestGate.starts },
      ' starts. Blue bars beat the neutral ',
      { text: formatRate(baseline.uma) },
      ' (dashed).'
    ];
  });
</script>

{#snippet viewLink(label: string, target: SessionView)}
  <Button
    variant="secondary"
    size="sm"
    onclick={() => onview(target)}
  >
    <span class="view-link">
      {label}<Icon
        name="arrow-right"
        size={13}
      />
    </span>
  </Button>
{/snippet}

<div class="overview">
  <SessionKpis
    label="Session at a glance"
    {kpis}
  />
  <div class="glance">
    <ChartFrame
      plain
      surface
      id="session-overview-styles"
      title="Running styles"
      description="A style’s win share exceeding its popularity means its win rate is above average."
    >
      {#snippet actions()}
        {@render viewLink('Strategy', 'strategy')}
      {/snippet}
      <div class="column-head styles">
        <span>Style</span>
        <span>Bar: wins · tick: field</span>
        <span>Field</span>
        <span>Wins</span>
      </div>
      {#each shares as row (row.style)}
        <button
          class="overview-row styles"
          aria-label={'Find ' + runningStyleName(row.style) + ' teams'}
          title={row.entries + ' entries · ' + row.wins + ' wins'}
          onclick={() => onteams({ style: String(row.style) })}
        >
          <span
            class="style-label"
            style:color={styleColors[row.style]}
          >
            <i style:background={styleColors[row.style]}></i>
            {runningStyleName(row.style)}
          </span>
          <span class="share-track win-share">
            <i
              style:width={(row.winShare / styleScale) * 100 + '%'}
              style:background={styleColors[row.style]}
            ></i>
            <b
              class="field-mark"
              style:left={(row.fieldShare / styleScale) * 100 + '%'}
            ></b>
          </span>
          <span class="number">{formatRate(row.fieldShare)}</span>
          <strong class="number">{formatRate(row.winShare)}</strong>
        </button>
      {/each}
      <p class="footnote">A bar past its tick: the style won more than its share of the field.</p>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      id="session-overview-umas"
      title="Most entered Umas"
    >
      {#snippet actions()}
        {@render viewLink('All Umas', 'umas')}
      {/snippet}
      <div class="column-head umas">
        <span>Uma</span>
        <span>Styles run</span>
        <span>Wins</span>
        <span>Field</span>
      </div>
      {#each popularUmas as uma (uma.key)}
        <button
          class="overview-row umas"
          aria-label={'Inspect ' + uma.name}
          onclick={() => onuma(uma.key)}
        >
          <span class="uma-name">
            <Artwork
              src={portrait(uma.cardId)}
              alt=""
              size="xs"
            />
            {uma.name}
          </span>
          <span class="share-track">
            {#each styleMix.get(uma.key) ?? [] as part (part.strategy)}
              <i
                style:width={(part.entries / uma.races) * 100 + '%'}
                style:background={styleColors[part.strategy]}
                title={runningStyleName(part.strategy) + ' · ' + part.entries + ' entries'}
              ></i>
            {/each}
          </span>
          <span
            class="number"
            class:few={isSmallSample(uma.races)}
          >
            {uma.wins}/{uma.races}
          </span>
          <strong class="number">{formatRate(rate(uma.races, entries.length))}</strong>
        </button>
      {/each}
    </ChartFrame>
    <ChartFrame
      plain
      surface
      id="session-overview-teams"
      title="Common team styles"
    >
      {#snippet actions()}
        {@render viewLink('All teams', 'teams')}
      {/snippet}
      <div class="column-head teams">
        <span>Lineup</span>
        <span>Wins</span>
        <span>Rate</span>
      </div>
      {#each commonCompositions as composition (composition.key)}
        <button
          class="overview-row teams"
          aria-label={'Find ' +
            composition.styles.map((id) => runningStyleName(id)).join(' / ') +
            ' teams'}
          onclick={() => onteams({ composition: composition.key })}
        >
          <span class="team-styles">
            {#each composition.styles as id, index (index)}
              <span style:color={styleColors[id]}>
                <i style:background={styleColors[id]}></i>
                {runningStyleName(id, true)}
              </span>
            {/each}
          </span>
          <span class="number">{composition.wins}/{composition.appearances}</span>
          <strong
            class={[
              'number',
              rateClass(
                rate(composition.wins, composition.appearances),
                composition.appearances,
                baseline.team
              )
            ]}
          >
            {formatRate(rate(composition.wins, composition.appearances))}
          </strong>
        </button>
      {/each}
      <p class="footnote">Muted: fewer than {SMALL_SAMPLE} races.</p>
    </ChartFrame>
  </div>
  <div class="results">
    <ChartFrame
      plain
      surface
      compact
      id="session-races"
      title="Race by race"
    >
      <DataTable
        plain
        compact
        caption="Session race winners"
        columnHelp={metricHelp}
        maxHeight={312}
        rows={raceRows}
        sortKey="race"
        sortDirection="ascending"
        columns={[
          { key: 'race', label: 'Race', numeric: true },
          { key: 'winner', label: 'Winner' },
          ...(player ? [{ key: 'best', label: 'Your best', numeric: true }] : []),
          { key: 'time', label: 'Winning time', numeric: true },
          { key: 'margin', label: 'Margin', numeric: true },
          ...(onreplay ? [{ key: 'replay', label: 'Replay', sortable: false }] : [])
        ]}
      >
        {#snippet cell(row, column)}
          {@const summary = races.find((item) => item.race === row.id)}
          {#if !summary}
            {row[column.key]}
          {:else if column.key === 'winner'}
            <button
              class="winner"
              aria-label={'Inspect ' + summary.winner.name + ', race ' + row.race + ' winner'}
              onclick={() => oninspect([summary.winner], summary.winner.name, summary.race)}
            >
              <RunnerReference
                name={summary.winner.name}
                cardId={summary.winner.cardId}
                detail={runningStyleName(summary.winner.result?.runningStyle)}
                detailColor={styleColors[summary.winner.result?.runningStyle ?? 0]}
                compact
              />
            </button>
          {:else if column.key === 'time'}
            {formatRaceTime(summary.time)}
          {:else if column.key === 'margin'}
            {summary.margin === undefined ? '—' : '+' + summary.margin.toFixed(2) + ' s'}
          {:else if column.key === 'best'}
            {#if summary.playerBest === undefined}
              —
            {:else}
              <span
                class="place"
                class:won={summary.playerBest === 1}
              >
                {ordinalPlace(summary.playerBest)}
              </span>
            {/if}
          {:else if column.key === 'replay' && onreplay}
            <Button
              variant="secondary"
              size="sm"
              icon="race"
              ariaLabel={'Watch race ' + row.race}
              onclick={() => onreplay(summary.race, summary.winner.index)}
            >
              Watch
            </Button>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    </ChartFrame>
    <div class="factors">
      <ChartFrame
        plain
        surface
        compact
        expandable
        maximize
        id="score-distribution"
        title="Training score"
        legend={[
          { label: 'Field', color: colors.muted },
          { label: 'Winners', color: colors.accent }
        ]}
        state={scores ? 'ready' : 'empty'}
        emptyDetail="Training scores were not included in these captures."
      >
        {#if scores}
          <p class="takeaway"><FindingSentence parts={scoreTakeaway} /></p>
          <LazyEChartsSurface
            zoomable
            height={118}
            label="Training score distribution of the field and the winners"
            option={sessionChart(
              colors.ink,
              [
                {
                  name: 'Field',
                  type: 'bar',
                  data: scores.field.map((value) => +value.toFixed(1)),
                  itemStyle: { color: colors.muted, borderRadius: [2, 2, 0, 0] }
                },
                {
                  name: 'Winners',
                  type: 'bar',
                  data: scores.winners.map((value) => +value.toFixed(1)),
                  itemStyle: { color: colors.accent, borderRadius: [2, 2, 0, 0] }
                }
              ],
              {
                type: 'category',
                data: scores.bins.map((value) => (value / 1000).toFixed(1) + 'k')
              },
              {
                type: 'value',
                axisLabel: { fontSize: 10, color: colors.ink, formatter: '{value}%' }
              },
              { tooltip: { trigger: 'axis', valueFormatter: (value: number) => value + '%' } }
            )}
          />
        {/if}
      </ChartFrame>
      <ChartFrame
        plain
        surface
        compact
        expandable
        maximize
        id="gate-results"
        title="Starting gate"
      >
        {#if bestGate}
          <p class="takeaway"><FindingSentence parts={gateTakeaway} /></p>
        {/if}
        <LazyEChartsSurface
          zoomable
          height={118}
          label="Win rate by starting gate"
          option={sessionChart(
            colors.ink,
            [
              {
                name: 'Win rate',
                type: 'bar',
                data: gates.map((gate) => {
                  const winRate = rate(gate.wins, gate.starts);
                  return {
                    value: +winRate.toFixed(1),
                    itemStyle: {
                      color: winRate > baseline.uma ? colors.accent : colors.muted,
                      borderRadius: [2, 2, 0, 0]
                    }
                  };
                }),
                markLine: {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { type: 'dashed', color: colors.ink, opacity: 0.7 },
                  label: { show: false },
                  data: [{ yAxis: +baseline.uma.toFixed(1) }]
                }
              }
            ],
            { type: 'category', data: gates.map((gate) => String(gate.gate)), name: 'Gate' },
            {
              type: 'value',
              axisLabel: { fontSize: 10, color: colors.ink, formatter: '{value}%' }
            },
            {
              tooltip: {
                trigger: 'axis',
                formatter: (items: { dataIndex: number }[]) => {
                  const gate = gates[items[0]?.dataIndex ?? -1];
                  if (!gate) return '';

                  return (
                    'Gate ' +
                    gate.gate +
                    '<br>' +
                    gate.wins +
                    ' wins from ' +
                    gate.starts +
                    ' starts (' +
                    formatRate(rate(gate.wins, gate.starts)) +
                    ')'
                  );
                }
              }
            }
          )}
        />
      </ChartFrame>
    </div>
  </div>
</div>

<style>
  @import './session-overview.css';
</style>
