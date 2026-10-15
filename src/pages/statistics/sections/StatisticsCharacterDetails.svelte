<script lang="ts">
  import {
    aggregateMetric,
    aggregateStatDistributions,
    characterScopes,
    characterUsage,
    compositionLabel,
    meanStats,
    statisticsDistanceId,
    supportTypeDistribution,
    type StatisticsFilters
  } from '@/lib/statistics/statistics';
  import { theme } from '@/stores/theme';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import StatisticsChartPanel from '../StatisticsChartPanel.svelte';
  import StatisticsDistributions from './StatisticsDistributions.svelte';
  import StatisticsRanking from '../StatisticsRanking.svelte';
  import { barChart, groupedChart, pieChart, statisticsChartStyle } from '../statistics-charts';
  import { classColors, distanceNames } from '../statistics-display';
  import {
    compact,
    statIds,
    statName,
    statStrip,
    supportName,
    supportRow,
    title
  } from '../statistics-format';
  import type { CharacterStatistics, StatisticsCatalogEntry } from '../statistics-repository';

  interface Props {
    characterId: string;
    character?: StatisticsCatalogEntry;
    characterStats?: CharacterStatistics;
    loading: boolean;
    error: string;
    filters: StatisticsFilters;
    averageStats: Record<string, number>;
    supportCatalog: Map<string, StatisticsCatalogEntry>;
    activeStat: string;
    histogramMode: string;
    onback: () => void;
    onretry: () => void;
  }

  let {
    characterId,
    character,
    characterStats,
    loading,
    error,
    filters,
    averageStats,
    supportCatalog,
    activeStat = $bindable(),
    histogramMode = $bindable(),
    onback,
    onretry
  }: Props = $props();

  const chartStyle = $derived(statisticsChartStyle($theme));
  const charScopes = $derived(characterStats ? characterScopes(characterStats, filters) : []);
  const charStats = $derived(
    aggregateStatDistributions(
      charScopes.flatMap((scope) => (scope.stat_averages ? [scope.stat_averages] : []))
    )
  );

  const charUsage = $derived(
    characterStats ? characterUsage(characterStats, filters) : { distances: [], classes: [] }
  );

  const charDistanceData = $derived(
    charUsage.distances.map((item) => ({
      ...item,
      name: distanceNames[statisticsDistanceId(item.id)] ?? title(item.id)
    }))
  );

  const charClassData = $derived(
    charUsage.classes.map((item) => ({
      name: `Class ${item.id}`,
      values: [item.value],
      color: classColors[item.id]
    }))
  );

  const charSupportData = $derived(
    aggregateMetric(
      charScopes.map((scope) => scope.common_support_cards ?? scope.support_cards ?? {}),
      (id, item) => supportName(supportCatalog, id, item)
    ).map((item) => supportRow(supportCatalog, item))
  );

  const charDecks = $derived(
    aggregateMetric(
      charScopes.flatMap((scope) =>
        scope.support_card_combinations ? [scope.support_card_combinations] : []
      ),
      (id, item) => compositionLabel(item, id)
    )
  );

  const charSupportTypes = $derived(
    supportTypeDistribution(
      charSupportData.length ? [] : charDecks,
      charSupportData,
      (id) => supportCatalog.get(id)?.tags[0]?.toLowerCase() ?? 'other'
    )
  );

  const charMeans = $derived(
    meanStats(charScopes.flatMap((scope) => (scope.stat_averages ? [scope.stat_averages] : [])))
  );

  const charSamples = $derived(charDistanceData.reduce((sum, item) => sum + item.value, 0));
  const comparisonSeries = $derived(
    charSamples
      ? [
          {
            name: character?.title ?? 'This Uma',
            values: statIds.map((id) => charMeans[id] ?? 0),
            color: '#64b5f6'
          },
          {
            name: 'All selected Umas',
            values: statIds.map((id) => averageStats[id] ?? 0),
            color: '#8b91a5'
          }
        ]
      : []
  );
</script>

<div class="character-details">
  <Button
    variant="ghost"
    size="sm"
    icon="arrow-left"
    ariaLabel="Back to character selection"
    onclick={onback}
  >
    All Umas
  </Button>
  <header class="character-heading">
    {#if character?.image}
      <img
        src={character.image}
        alt=""
        width="80"
        height="80"
      />
    {/if}
    <div>
      <span class="eyebrow">Character analysis</span>
      <h2>{character?.title ?? 'Uma ' + characterId}</h2>
      <p>
        {loading ? 'Loading samples…' : compact(charSamples) + ' matching samples'} · ID {characterId}
      </p>
    </div>
  </header>
  {#if loading}
    <div class="loading">
      <Spinner size={28} />
      <span>Loading character statistics…</span>
    </div>
  {:else if error}
    <Banner
      title="Character statistics unavailable"
      tone="danger"
    >
      <p>{error}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={onretry}
      >
        Try again
      </Button>
    </Banner>
  {:else if characterStats}
    <div class="stat-overview">
      <StatStrip
        items={statStrip(charMeans)}
        label="Character average stats"
      />
      <p class="fine-print">Average of selected class and scenario means for this Uma.</p>
    </div>
    <div class="two-columns">
      <StatisticsChartPanel
        title="Compared with the field"
        description="Character averages against all Umas under the same filters."
        option={groupedChart(chartStyle, statIds.map(statName), comparisonSeries)}
        height={230}
      /><StatisticsChartPanel
        title="Distance Preference"
        description="Recorded uses at each selected distance."
        option={barChart(chartStyle, charDistanceData)}
        height={230}
      />
    </div>
    <h3 class="subheading">Statistics for {character?.title}</h3>
    <StatisticsDistributions
      values={charStats}
      prefix="character"
      bind:activeStat
      bind:histogramMode
    />
    <div class="two-columns">
      <StatisticsRanking
        id="character-decks"
        title="Most Used Deck Compositions"
        description="Share of recorded decks for this Uma."
        items={charDecks}
        searchable
        searchLabel="Search deck types"
        limit={5}
      /><StatisticsRanking
        id="character-supports"
        title="Most Popular Support Cards"
        description="Share of recorded support card uses for this Uma."
        items={charSupportData}
        searchable
        searchLabel="Search support cards"
        limit={5}
      />
    </div>
    <Disclosure
      id="character-breakdown"
      title="Class and support breakdown"
      description="Where this Uma appears and which support types are used"
      icon="chart"
    >
      <div class="two-columns">
        <StatisticsChartPanel
          title="Team Stadium Class Distribution"
          description="Recorded uses in each selected class."
          option={groupedChart(chartStyle, [character?.title ?? 'Character'], charClassData)}
          height={280}
        /><StatisticsChartPanel
          title="Support Card Type Distribution"
          description="Share of support slots for this Uma."
          option={pieChart(chartStyle, charSupportTypes)}
          height={280}
        />
      </div>
    </Disclosure>
  {/if}
</div>

<style>
  @import './statistics-columns.css';
  @import '../statistics-panels.css';

  .subheading {
    font-size: 16px;
    margin: 18px 0 0;
  }
  .character-heading h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }
  .character-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 12px;
  }
  .character-heading > img {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    object-fit: cover;
  }
  .character-heading h2 {
    margin-top: 4px;
    font-size: 23px;
  }
  .character-heading p {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
