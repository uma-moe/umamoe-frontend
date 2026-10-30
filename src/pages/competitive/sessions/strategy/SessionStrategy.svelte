<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import CmSaturationChart from '../../champions-meeting/strategy/CmSaturationChart.svelte';
  import SessionKpis from '../SessionKpis.svelte';
  import { portrait, rate, styleColors } from '../../analysis-view';
  import { compositionKpi, rateClass, styleKpi, type SessionKpi } from '../session-kpis';
  import {
    averageRoom,
    formatRate,
    isSmallSample,
    leaderlessRooms,
    roomCompositions,
    saturationBuckets,
    SATURATION_MIN_RACES,
    sessionBaseline,
    SMALL_SAMPLE,
    standoutComposition,
    styleShares,
    styleStandouts,
    timesNeutral
  } from '../session-insights';
  import {
    metricHelp,
    styleRepresentatives,
    type SessionComposition,
    type TeamFilter
  } from '../session-statistics';

  interface Props {
    analysis: MultiRaceAnalysis;
    captures: ParsedRaceCapture[];
    compositions: SessionComposition[];
    onteams: (filter: TeamFilter) => void;
  }

  let { analysis, captures, compositions, onteams }: Props = $props();

  /** A style counts as winning above or below its numbers once it is a tenth away from an even result. */
  const EVEN_RANGE = 0.1;

  /** Room mixes listed below the average room; the rest are rarer than any reader would compare. */
  const LISTED_ROOMS = 8;

  const baseline = $derived(sessionBaseline(analysis));
  const shares = $derived(styleShares(analysis));
  const standouts = $derived(styleStandouts(shares));
  const topComposition = $derived(standoutComposition(compositions));

  const styles = $derived(shares.map((row) => row.style));
  const rooms = $derived(roomCompositions(captures, styles));
  const listedRooms = $derived(rooms.slice(0, LISTED_ROOMS));
  const average = $derived(averageRoom(rooms, styles));
  const roomMax = $derived(Math.max(1, ...rooms.flatMap((room) => room.counts)));
  const leaderless = $derived(leaderlessRooms(captures));

  const kpis = $derived.by(() => {
    const list: SessionKpi[] = [];
    const composition = topComposition;

    if (standouts.strongest) list.push(styleKpi(standouts.strongest, 'Best running style'));
    if (standouts.weakest) list.push(styleKpi(standouts.weakest, 'Weakest running style'));
    if (composition)
      list.push(
        compositionKpi(composition, baseline, {
          label: 'Teams',
          icon: 'community',
          onselect: () => onteams({ composition: composition.key })
        })
      );

    list.push({
      id: 'leaderless',
      label: 'Rooms without a Front Runner',
      value: formatRate(rate(leaderless, captures.length)),
      detail: leaderless + ' of ' + captures.length + ' races · a Pace Chaser leads'
    });

    return list;
  });

  // Both tracks share one scale, so a style winning more than its field share reads at a glance.
  const trackMax = $derived(
    Math.max(1, ...shares.flatMap((row) => [row.fieldShare, row.winShare]))
  );

  const saturation = $derived(
    analysis.strategies
      .filter((row) => row.strategy > 0)
      .map((row) => ({
        name: runningStyleName(row.strategy),
        color: styleColors[row.strategy] ?? 'currentColor',
        buckets: saturationBuckets(row)
      }))
  );

  const compositionRows = $derived(
    compositions.map((row) => ({
      id: row.key,
      appearances: row.appearances,
      wins: row.wins,
      winrate: rate(row.wins, row.appearances)
    }))
  );

  function againstField(winShare: number, fieldShare: number) {
    const times = timesNeutral(winShare, fieldShare);
    if (times === undefined) return { label: '—', tone: 'even' };

    const tone = times >= 1 + EVEN_RANGE ? 'over' : times <= 1 - EVEN_RANGE ? 'under' : 'even';
    return { label: times.toFixed(1) + '×', tone };
  }

  /** A count's cell takes its style's colour, stronger the more runners of that style shared the room. */
  function roomCell(count: number, style: number) {
    if (count <= 0) return undefined;

    const strength = Math.round(14 + (count / roomMax) * 56);
    return `color-mix(in srgb, ${styleColors[style] ?? 'currentColor'} ${strength}%, transparent)`;
  }

  function winnersLabel(wins: number[]) {
    return styles
      .map((style, index) => ({ style, wins: wins[index] ?? 0 }))
      .filter((item) => item.wins > 0)
      .map((item) => runningStyleName(item.style) + ' ' + item.wins)
      .join(', ');
  }
</script>

<div class="strategy">
  <SessionKpis
    label="Strategy at a glance"
    {kpis}
  />
  <div class="panels upper">
    <ChartFrame
      plain
      surface
      id="session-style-breakdown"
      title="Style breakdown"
      description="A style’s win share exceeding its popularity means its win rate is above average."
    >
      <div class="breakdown">
        <div class="breakdown-key">
          <span>Running style</span>
          <span class="track-key">
            <i></i>
            Field
            <i class="win-key"></i>
            Wins
          </span>
          <span>Wins</span>
          <span>vs. field</span>
        </div>
        {#each shares as row (row.style)}
          {@const comparison = againstField(row.winShare, row.fieldShare)}
          <div class="style-row">
            <button
              class="style-link"
              onclick={() => onteams({ style: String(row.style) })}
            >
              <i style:background={styleColors[row.style]}></i>
              <span style:color={styleColors[row.style]}>{runningStyleName(row.style)}</span>
              <small>{row.entries}</small>
            </button>
            <div
              class="tracks"
              role="img"
              aria-label={runningStyleName(row.style) +
                ': ' +
                formatRate(row.fieldShare) +
                ' of the field, ' +
                formatRate(row.winShare) +
                ' of wins'}
            >
              <span class="track">
                <i style:width={(row.fieldShare / trackMax) * 100 + '%'}></i>
              </span>
              <span class="track">
                <i
                  style:width={(row.winShare / trackMax) * 100 + '%'}
                  style:background={styleColors[row.style]}
                ></i>
              </span>
            </div>
            <span class="readout">
              <strong>{formatRate(row.winShare)}</strong>
              <small>{formatRate(row.fieldShare)}</small>
            </span>
            <strong
              class="ratio {comparison.tone}"
              class:few={isSmallSample(row.entries)}
              title={row.wins + ' wins from ' + row.entries + ' entries'}
            >
              {comparison.label}
            </strong>
          </div>
        {/each}
        <p class="footnote">
          vs. field = win share ÷ field share: 1.0× is even, 1.5× won half again its numbers.
        </p>
      </div>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      id="session-rooms"
      title="Room compositions"
    >
      <div
        class="rooms"
        style:--styles={styles.length}
      >
        <div class="room-head">
          {#each styles as style (style)}
            <span style:color={styleColors[style]}>{runningStyleName(style, true)}</span>
          {/each}
          <span>Races</span>
          <span>Won by</span>
        </div>
        <div class="room-row average">
          {#each average as value, index (index)}
            <span class="count">{value.toFixed(1)}</span>
          {/each}
          <span class="races">average</span>
          <span></span>
        </div>
        {#each listedRooms as room (room.key)}
          <div class="room-row">
            {#each room.counts as count, index (index)}
              <span
                class="count"
                class:none={count === 0}
                style:background={roomCell(count, styles[index] ?? 0)}
              >
                {count || '–'}
              </span>
            {/each}
            <span class="races">
              {room.races}
              <small>{formatRate(rate(room.races, captures.length))}</small>
            </span>
            <span
              class="winners"
              role="img"
              aria-label={'Won by ' + (winnersLabel(room.wins) || 'no recorded style')}
              title={winnersLabel(room.wins)}
            >
              {#each room.wins as wins, index (index)}
                {#if wins}
                  <i
                    style:flex-grow={wins}
                    style:background={styleColors[styles[index] ?? 0]}
                  ></i>
                {/if}
              {/each}
            </span>
          </div>
        {/each}
      </div>
      <p class="footnote">
        {leaderless} of {captures.length} races had no Front Runner, so a Pace Chaser led.
        {#if rooms.length > LISTED_ROOMS}
          {rooms.length - LISTED_ROOMS} rarer mixes are not listed.
        {/if}
      </p>
    </ChartFrame>
  </div>
  <div class="panels lower">
    <ChartFrame
      plain
      surface
      expandable
      maximize
      id="style-saturation"
      title="Style saturation"
      description={'Per-uma win rate by how many of that style appear in a race. Buckets only appear when they account for at least ' +
        SATURATION_MIN_RACES +
        ' races.'}
    >
      <CmSaturationChart
        series={saturation}
        totalRaces={analysis.races}
        neutral={baseline.uma / 100}
        countPicker={false}
        label="Per-Uma win rate versus number of the same style in the room"
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      id="session-compositions"
      title="Team compositions"
      description="Win rate of 3-uma teams grouped by running style trio."
    >
      <DataTable
        plain
        compact
        caption="Session team compositions"
        columnHelp={metricHelp}
        maxHeight={330}
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
                <span style:color={styleColors[id]}>
                  <i style:background={styleColors[id]}></i>
                  {runningStyleName(id, true)}
                </span>
              {/each}
            </button>
          {:else if column.key === 'winrate'}
            <span class="team-rate">
              <strong
                class={rateClass(Number(row.winrate), Number(row.appearances), baseline.team)}
              >
                {formatRate(Number(row.winrate))}
              </strong>
              {#if baseline.team !== undefined}
                <span
                  class="rate-bar"
                  role="img"
                  aria-label={'Team win rate ' +
                    formatRate(Number(row.winrate)) +
                    ' against a neutral ' +
                    formatRate(baseline.team)}
                >
                  <i
                    class="fill"
                    style:width={row.winrate + '%'}
                  ></i>
                  <i
                    class="baseline"
                    style:left={baseline.team + '%'}
                  ></i>
                </span>
              {/if}
            </span>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
      <p class="footnote">Muted: fewer than {SMALL_SAMPLE} races.</p>
    </ChartFrame>
  </div>
  <ChartFrame
    plain
    surface
    id="session-representatives"
    title="Style representatives"
  >
    <div class="representatives">
      {#each shares as row (row.style)}
        <section>
          <h4>
            <i style:background={styleColors[row.style]}></i>
            {runningStyleName(row.style)}
          </h4>
          {#each styleRepresentatives(analysis, row.style) as uma (uma.key)}
            {@const wins = uma.entries.filter((entry) => entry.finishOrder === 1).length}
            <button
              class="representative"
              aria-label={'Find ' + uma.name + ' ' + runningStyleName(row.style) + ' teams'}
              onclick={() => onteams({ uma: uma.key, style: String(row.style) })}
            >
              <Artwork
                src={portrait(uma.cardId)}
                alt=""
                size="xs"
              />
              <span class="representative-name">{uma.name}</span>
              <small>{wins}/{uma.entries.length}</small>
              <strong
                class={rateClass(rate(wins, uma.entries.length), uma.entries.length, baseline.uma)}
              >
                {formatRate(rate(wins, uma.entries.length))}
              </strong>
            </button>
          {:else}
            <p class="empty">No entries</p>
          {/each}
        </section>
      {/each}
    </div>
  </ChartFrame>
</div>

<style>
  @import './session-strategy.css';
</style>
