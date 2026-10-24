<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { formatRaceTime, runningStyleName } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import { histogram, percent, portrait, rate, score, styleColors } from '../../analysis-view';
  import {
    chartInk,
    sessionChart,
    sessionFeats,
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
    winners: SessionEntry[];
    compositions: SessionComposition[];
    onview: (view: SessionView) => void;
    onteams: (filter: TeamFilter) => void;
    onuma: (key: string) => void;
    oninspect: (members: RaceRunner[], title: string, race: number) => void;
  }

  let {
    analysis,
    captures,
    entries,
    winners,
    compositions,
    onview,
    onteams,
    onuma,
    oninspect
  }: Props = $props();

  const LISTED = 6;

  let scorePopulation = $state('all');

  const ink = $derived(chartInk($theme === 'dark'));
  const styles = $derived(analysis.strategies.filter((row) => row.strategy > 0));

  /** Field and win shares use one scale so a style's two bars compare directly. */
  const styleScale = $derived(
    Math.max(
      1,
      ...styles.flatMap((row) => [rate(row.races, entries.length), rate(row.wins, captures.length)])
    )
  );
  const styleMix = $derived(umaStyleMix(analysis));
  const popularUmas = $derived(
    [...analysis.characters].sort((a, b) => b.races - a.races).slice(0, LISTED)
  );

  const commonCompositions = $derived(
    [...compositions].sort((a, b) => b.appearances - a.appearances).slice(0, LISTED)
  );

  const times = $derived(histogram(winners.map((entry) => entry.runner.result!.finishTime)));
  const scores = $derived(
    histogram(
      (scorePopulation === 'winners' ? winners : entries)
        .map((entry) => score(entry.runner))
        .filter((value) => value > 0)
    )
  );

  const gateCount = $derived(Math.max(0, ...captures.map((capture) => capture.runners.length)));
  const gateWinRates = $derived(
    Array.from({ length: gateCount }, (_, gate) => {
      const starts = entries.filter((entry) => entry.runner.index === gate).length;
      const wins = winners.filter((entry) => entry.runner.index === gate).length;
      return +rate(wins, starts).toFixed(1);
    })
  );

  const feats = $derived(sessionFeats(winners));
</script>

{#snippet viewLink(label: string, target: SessionView)}
  <Button
    variant="ghost"
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
  <div class="glance">
    <ChartFrame
      plain
      surface
      id="session-overview-styles"
      title="Running styles"
      description="Share of runner entries and share of race wins."
    >
      {#snippet actions()}
        {@render viewLink('Strategy', 'strategy')}
      {/snippet}
      <div class="column-head styles">
        <span>Style · entries</span>
        <span>Field</span>
        <span>Wins</span>
      </div>
      {#each styles as row (row.strategy)}
        <button
          class="overview-row styles"
          aria-label={'Find ' + runningStyleName(row.strategy) + ' teams'}
          onclick={() => onteams({ style: String(row.strategy) })}
        >
          <span class="style-name">
            <span class="style-label">
              <i style:background={styleColors[row.strategy]}></i>
              {runningStyleName(row.strategy)}
            </span>
            <small>{row.races} entries · {percent(row.wins, row.races)} win rate</small>
          </span>
          <span>{percent(row.races, entries.length)}</span>
          <strong>{percent(row.wins, captures.length)}</strong>
          <span class="share-pair">
            <span class="share-track">
              <i
                class="field-share"
                style:width={(rate(row.races, entries.length) / styleScale) * 100 + '%'}
              ></i>
            </span>
            <span class="share-track">
              <i
                style:width={(rate(row.wins, captures.length) / styleScale) * 100 + '%'}
                style:background={styleColors[row.strategy]}
              ></i>
            </span>
          </span>
        </button>
      {/each}
      <p class="footnote">
        Grey bars are field share, coloured bars win share. Select a style to find its teams.
      </p>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      id="session-overview-umas"
      title="Most entered Umas"
      description="Ranked by share of runner entries."
    >
      {#snippet actions()}
        {@render viewLink('All Umas', 'umas')}
      {/snippet}
      <div class="column-head">
        <span>Uma · entries</span>
        <span>Field share</span>
      </div>
      {#each popularUmas as uma (uma.key)}
        <button
          class="overview-row uma"
          aria-label={'Inspect ' + uma.name}
          onclick={() => onuma(uma.key)}
        >
          <Artwork
            src={portrait(uma.cardId)}
            alt=""
            size="sm"
          />
          <span class="uma-name">
            <strong>{uma.name}</strong>
            <small>{uma.races} entries · {percent(uma.wins, uma.races)} win rate</small>
          </span>
          <strong>{percent(uma.races, entries.length)}</strong>
          <span class="share-track">
            {#each styleMix.get(uma.key) ?? [] as part (part.strategy)}
              <i
                style:width={(part.entries / uma.races) * 100 + '%'}
                style:background={styleColors[part.strategy]}
                title={runningStyleName(part.strategy) + ' · ' + part.entries + ' entries'}
              ></i>
            {/each}
          </span>
        </button>
      {/each}
      <p class="footnote">Bar colours show the running styles each Uma ran.</p>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      id="session-overview-teams"
      title="Common team compositions"
      description="Ranked by team appearances."
    >
      {#snippet actions()}
        {@render viewLink('All teams', 'teams')}
      {/snippet}
      <div class="column-head">
        <span>Composition</span>
        <span>Team wins</span>
      </div>
      {#each commonCompositions as composition (composition.key)}
        <button
          class="overview-row team"
          aria-label={'Find ' +
            composition.styles.map((id) => runningStyleName(id)).join(' / ') +
            ' teams'}
          onclick={() => onteams({ composition: composition.key })}
        >
          <span class="team-styles">
            {#each composition.styles as id, index (index)}
              <span>
                <i style:background={styleColors[id]}></i>
                {runningStyleName(id)}
              </span>
            {/each}
            <small>{composition.appearances} team races · {composition.wins} wins</small>
          </span>
          <strong>{percent(composition.wins, composition.appearances)}</strong>
        </button>
      {/each}
      <p class="footnote">Select a composition to see its captured teams.</p>
    </ChartFrame>
  </div>
  <div class="results">
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="winning-times"
      title="Winning times"
      description="Finish times of each race winner."
    >
      <LazyEChartsSurface
        height={170}
        label="Winning time distribution"
        option={sessionChart(
          ink,
          [
            {
              type: 'bar',
              data: times.counts,
              itemStyle: { color: '#69b7ee', borderRadius: [3, 3, 0, 0] }
            }
          ],
          { type: 'category', data: times.labels.map((value) => formatRaceTime(value, 2)) }
        )}
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="score-distribution"
      title="Training scores"
      description="Rated scores in the field."
      state={scores.counts.length ? 'ready' : 'empty'}
      emptyDetail="Training scores were not included in these captures."
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          options={[
            { value: 'all', label: 'All' },
            { value: 'winners', label: 'Winners' }
          ]}
          bind:value={scorePopulation}
          label="Score population"
        />
      {/snippet}
      <LazyEChartsSurface
        height={170}
        label="Training score distribution"
        option={sessionChart(
          ink,
          [
            {
              type: 'bar',
              data: scores.counts,
              itemStyle: { color: '#7bc8a0', borderRadius: [3, 3, 0, 0] }
            }
          ],
          { type: 'category', data: scores.labels.map((value) => (value / 1000).toFixed(1) + 'k') }
        )}
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="gate-results"
      title="Gate win rate"
      description="Wins from each starting gate."
    >
      <LazyEChartsSurface
        height={170}
        label="Win rate by gate"
        option={sessionChart(
          ink,
          [
            {
              type: 'bar',
              data: gateWinRates,
              itemStyle: { color: '#e8ad63', borderRadius: [3, 3, 0, 0] }
            }
          ],
          {
            type: 'category',
            data: gateWinRates.map((_, gate) => String(gate + 1))
          },
          { type: 'value', axisLabel: { fontSize: 10, color: ink, formatter: '{value}%' } }
        )}
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      id="session-highlights"
      title="Notable winners"
      description="Select a winner to inspect the build."
    >
      <div class="highlights">
        {#each feats as feat (feat.label)}
          <button
            class="highlight"
            aria-label={'Inspect ' + feat.entry.runner.name + ', ' + feat.label}
            onclick={() => oninspect([feat.entry.runner], feat.entry.runner.name, feat.entry.race)}
          >
            <span class="highlight-label">{feat.label}</span>
            <RunnerReference
              name={feat.entry.runner.name}
              cardId={feat.entry.runner.cardId}
              compact
            />
            <strong>{feat.value}</strong>
          </button>
        {/each}
      </div>
    </ChartFrame>
  </div>
</div>

<style>
  @import './session-overview.css';
</style>
