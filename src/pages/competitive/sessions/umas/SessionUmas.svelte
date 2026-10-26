<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { MultiRaceAnalysis, MultiRaceCharacterStats } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import SessionUmaPlot from './SessionUmaPlot.svelte';
  import SessionKpis from '../SessionKpis.svelte';
  import { percent, portrait, rate, styleColors } from '../../analysis-view';
  import { opponentScoreKpi, rateClass, umaKpi, type SessionKpi } from '../session-kpis';
  import {
    bestPlacingOpponents,
    formatRate,
    isSmallSample,
    scoreAverages,
    sessionBaseline,
    SMALL_SAMPLE,
    standoutUma,
    timesNeutral
  } from '../session-insights';
  import {
    metricHelp,
    umaStyleMix,
    type SessionEntry,
    type TeamFilter
  } from '../session-statistics';

  interface Props {
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    entries: SessionEntry[];
    selected: string;
    onteams: (filter: TeamFilter) => void;
  }

  let { analysis, captures, entries, selected = $bindable(), onteams }: Props = $props();

  /** Opponents listed; the rest each finished best only once or twice. */
  const LISTED_OPPONENTS = 8;

  let ranking = $state('winrate'),
    minimum = $state('0');

  const baseline = $derived(sessionBaseline(analysis));
  const topUma = $derived(standoutUma(analysis));
  const opponents = $derived(bestPlacingOpponents(captures));
  const scores = $derived(scoreAverages(captures));

  const kpis = $derived.by(() => {
    const list: SessionKpi[] = [];
    const uma = topUma,
      popular = [...analysis.characters].sort((a, b) => b.races - a.races)[0],
      rival = opponents.rows[0];

    if (uma)
      list.push(
        umaKpi(uma, baseline, 'Top Uma', {
          label: 'Teams',
          onselect: () => onteams({ uma: uma.key })
        })
      );

    if (popular)
      list.push({
        id: 'popular',
        label: 'Most entered',
        value: percent(popular.races, entries.length),
        subjects: [{ text: popular.name, cardId: popular.cardId }],
        detail: popular.races + ' of ' + entries.length + ' entries',
        action: { label: 'Inspect', onselect: () => (selected = popular.key) }
      });

    if (rival)
      list.push({
        id: 'rival',
        label: 'Most often your toughest rival',
        value: rival.races + ' of ' + opponents.races,
        subjects: [{ text: rival.name, cardId: rival.cardId }],
        detail: 'races as the best-placed opponent · won ' + rival.wins,
        action: { label: 'Inspect', onselect: () => (selected = rival.key) }
      });

    const scoreTile = opponentScoreKpi(scores);
    if (scoreTile) list.push(scoreTile);

    return list;
  });

  const styleMix = $derived(umaStyleMix(analysis));
  const characters = $derived(
    analysis.characters
      .filter((uma) => rate(uma.races, entries.length) >= Number(minimum))
      .sort((a, b) => (ranking === 'entries' ? b.races - a.races : byWinRate(a, b)))
  );

  const mostEntries = $derived(Math.max(1, ...characters.map((uma) => uma.races)));
  const inspected = $derived(
    analysis.characters.find((uma) => uma.key === selected) ?? characters[0]
  );

  const partners = $derived(
    analysis.teams
      .filter((team) => team.members.some((member) => member.key === inspected?.key))
      .sort((a, b) => b.wins - a.wins || b.appearances - a.appearances)
      .slice(0, 6)
  );

  const stylesRun = (key: string) =>
    (styleMix.get(key) ?? []).map((part) => runningStyleName(part.strategy, true)).join(' / ');

  /** Win rate order that keeps Umas with too few entries below the measured ones, where one lucky win cannot lead. */
  function byWinRate(a: MultiRaceCharacterStats, b: MultiRaceCharacterStats) {
    const measured = Number(isSmallSample(a.races)) - Number(isSmallSample(b.races));
    return measured || rate(b.wins, b.races) - rate(a.wins, a.races) || b.races - a.races;
  }
</script>

<div class="umas">
  <SessionKpis
    label="Umas at a glance"
    {kpis}
  />
  <div class="panels">
    <ChartFrame
      plain
      surface
      id="session-umas"
      title="Uma breakdown"
      description={'Neutral is ' + formatRate(baseline.uma) + ' · select an Uma to inspect it'}
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          label="Rank Umas by"
          options={[
            { value: 'winrate', label: 'Win rate' },
            { value: 'entries', label: 'Most entered' }
          ]}
          bind:value={ranking}
        />
        <div class="minimum">
          <SelectField
            id="uma-minimum"
            label="Minimum field share"
            hideLabel
            options={[
              { value: '0', label: 'All Umas' },
              { value: '3', label: '≥3% field' },
              { value: '5', label: '≥5% field' }
            ]}
            bind:value={minimum}
          />
        </div>
      {/snippet}
      <div class="column-head">
        <span>Uma</span>
        <span>Entries · styles</span>
        <span>Wins</span>
        <span>Win rate</span>
      </div>
      <ol
        class="uma-list"
        aria-label="Umas in this session"
      >
        {#each characters as uma (uma.key)}
          <li>
            <button
              class="uma-row"
              class:selected={uma.key === inspected?.key}
              aria-pressed={uma.key === inspected?.key}
              title={stylesRun(uma.key)}
              onclick={() => (selected = uma.key)}
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
                <span style:width={(uma.races / mostEntries) * 100 + '%'}>
                  {#each styleMix.get(uma.key) ?? [] as part (part.strategy)}
                    <i
                      style:width={(part.entries / uma.races) * 100 + '%'}
                      style:background={styleColors[part.strategy]}
                    ></i>
                  {/each}
                </span>
              </span>
              <span class="record">{uma.wins}/{uma.races}</span>
              <strong class={rateClass(rate(uma.wins, uma.races), uma.races, baseline.uma)}>
                {percent(uma.wins, uma.races)}
              </strong>
            </button>
          </li>
        {:else}
          <li class="empty">No Umas reach this field share.</li>
        {/each}
      </ol>
      <p class="footnote">
        {ranking === 'entries'
          ? 'Ranked by entries.'
          : 'Ranked by win rate; under ' + SMALL_SAMPLE + ' entries follow, muted.'}
        Bars: entries, coloured by running style.
      </p>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      expandable
      maximize
      id="uma-popularity"
      title="Popularity vs. performance"
      description="Entries against wins · above the dashed line won more than an even share"
    >
      <SessionUmaPlot
        {characters}
        entries={entries.length}
        neutral={baseline.uma}
        selected={inspected?.key}
        onselect={(key) => (selected = key)}
      />
      {#if inspected}
        <div class="inspection">
          <RunnerReference
            name={inspected.name}
            cardId={inspected.cardId}
            detail={stylesRun(inspected.key)}
          />
          <dl>
            <div>
              <dt>Win rate</dt>
              <dd>{percent(inspected.wins, inspected.races)}</dd>
            </div>
            <div>
              <dt>Field share</dt>
              <dd>{percent(inspected.races, entries.length)}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>{inspected.wins} of {inspected.races}</dd>
            </div>
            {#if !isSmallSample(inspected.races)}
              {@const times = timesNeutral(rate(inspected.wins, inspected.races), baseline.uma)}
              {#if times !== undefined}
                <div>
                  <dt>vs. neutral {formatRate(baseline.uma)}</dt>
                  <dd>{times.toFixed(1)}×</dd>
                </div>
              {/if}
            {/if}
          </dl>
          <Button
            size="sm"
            variant="secondary"
            icon="community"
            onclick={() => onteams({ uma: inspected.key })}
          >
            Find teams
          </Button>
        </div>
      {/if}
    </ChartFrame>
  </div>
  <div class="panels">
    {#if opponents.rows.length}
      <ChartFrame
        plain
        surface
        id="session-opponents"
        title="Best-placed opponents"
        description="The opponent that finished first among the rest, in races with your runners"
      >
        <div class="column-head opponents">
          <span>Opponent</span>
          <span></span>
          <span>Best-placed</span>
          <span>Won</span>
          <span>Avg. finish</span>
        </div>
        <ol
          class="uma-list opponents"
          aria-label="Best-placed opponents"
        >
          {#each opponents.rows.slice(0, LISTED_OPPONENTS) as rival (rival.key)}
            <li>
              <button
                class="uma-row opponents"
                class:selected={rival.key === inspected?.key}
                onclick={() => (selected = rival.key)}
              >
                <span class="uma-name">
                  <Artwork
                    src={portrait(rival.cardId)}
                    alt=""
                    size="xs"
                  />
                  {rival.name}
                </span>
                <span class="share-track">
                  <span
                    class="rival-share"
                    style:width={(rival.races / Math.max(1, opponents.rows[0]?.races ?? 1)) * 100 +
                      '%'}
                  ></span>
                </span>
                <span class="record">
                  {rival.races}
                  <small>{percent(rival.races, opponents.races)}</small>
                </span>
                <span class="record">{rival.wins}</span>
                <strong>{(rival.finishTotal / rival.races).toFixed(1)}</strong>
              </button>
            </li>
          {/each}
        </ol>
        <p class="footnote">
          {opponents.races} races with your runners. Won: races the opponent won outright.
        </p>
      </ChartFrame>
    {/if}
    {#if inspected}
      <ChartFrame
        plain
        surface
        compact
        id="session-partners"
        title={'Teams with ' + inspected.name}
        description={'Its teammates, by team wins · under ' + SMALL_SAMPLE + ' races muted'}
      >
        <DataTable
          plain
          compact
          caption={'Teams with ' + inspected.name}
          columnHelp={metricHelp}
          emptyMessage="This Uma did not race in a captured team."
          rows={partners.map((team) => {
            const strategy =
              team.members.find((member) => member.key === inspected.key)?.strategy ?? 0;

            return {
              id: team.key,
              style: runningStyleName(strategy, true),
              strategy,
              appearances: team.appearances,
              wins: team.wins,
              winrate: rate(team.wins, team.appearances)
            };
          })}
          columns={[
            { key: 'lineup', label: 'Teammates', sortable: false },
            { key: 'style', label: 'Ran as' },
            { key: 'winrate', label: 'Win rate', numeric: true },
            { key: 'appearances', label: 'Races', numeric: true },
            { key: 'wins', label: 'Wins', numeric: true }
          ]}
        >
          {#snippet cell(row, column)}
            {#if column.key === 'lineup'}
              <div class="partner-lineup">
                {#each partners
                  .find((team) => team.key === row.id)
                  ?.members.filter((member) => member.key !== inspected.key) ?? [] as member (member.key)}
                  <button
                    aria-label={'Inspect ' + member.name}
                    title={member.name}
                    onclick={() => (selected = member.key)}
                  >
                    <RunnerReference
                      name={member.name}
                      cardId={member.cardId}
                      detail={runningStyleName(member.strategy, true)}
                      detailColor={styleColors[member.strategy]}
                      compact
                    />
                  </button>
                {/each}
              </div>
            {:else if column.key === 'style'}
              <span style:color={styleColors[Number(row.strategy)]}>{row.style}</span>
            {:else if column.key === 'winrate'}
              <span class={rateClass(Number(row.winrate), Number(row.appearances), baseline.team)}>
                {formatRate(Number(row.winrate))}
              </span>
            {:else}
              {row[column.key]}
            {/if}
          {/snippet}
        </DataTable>
      </ChartFrame>
    {/if}
  </div>
</div>

<style>
  @import './session-umas.css';
</style>
