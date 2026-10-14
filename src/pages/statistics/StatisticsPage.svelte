<script lang="ts">
  import ContentAd from '@/layouts/ContentAd.svelte';
  import { tick } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import { theme } from '@/stores/theme';
  import { scenarioName } from '@/lib/profile/profile-display';
  import {
    aggregateMetric,
    aggregateStatDistributions,
    characterScopes,
    characterUsage,
    meanStats,
    statisticsDistanceId,
    supportTypeDistribution,
    compositionLabel,
    histogram,
    metricMaps,
    type ChartDatum,
    type StatisticsFilters
  } from '@/lib/statistics/statistics';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import StatStrip, { type StatStripItem } from '@/components/game/StatStrip.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import MetricBar from '@/components/data/MetricBar.svelte';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import StatisticsFilterControls from './StatisticsFilterControls.svelte';
  import { classColors, distanceColors, distanceNames } from './statistics-display';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import StatisticsRanking from './StatisticsRanking.svelte';
  import StatisticsDeckMatrix from './StatisticsDeckMatrix.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import StatisticsChartPanel from './StatisticsChartPanel.svelte';
  import {
    statisticsRepository,
    type StatisticsCatalogEntry,
    type CharacterStatistics,
    type DistributionItem,
    type GlobalStatistics,
    type StatDistribution,
    type StatisticsDataset
  } from './statistics-repository';

  const scenarioNames = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((id) => [String(id), scenarioName(id)])
  );
  const statNames: Record<string, string> = {
    speed: 'Speed',
    stamina: 'Stamina',
    power: 'Power',
    guts: 'Guts',
    wiz: 'Wit',
    wisdom: 'Wit',
    rank_score: 'Rank Score'
  };
  const statColors: Record<string, string> = {
    speed: '#098cdb',
    stamina: '#da4b38',
    power: '#db7602',
    guts: '#db447e',
    wiz: '#009e5e',
    wisdom: '#009e5e',
    wit: '#009e5e',
    friend: '#ffb441',
    group: '#21ce3e'
  };

  const chartText = $derived({
    color: $theme === 'light' ? '#4b5563' : '#bdbdbd',
    fontFamily: 'Arial, sans-serif'
  });
  const chartGrid = $derived($theme === 'light' ? '#e5e7eb' : '#363636');

  let datasets = $state.raw<StatisticsDataset[]>([]);
  let datasetId = $state('');
  let stats = $state.raw<GlobalStatistics>();
  let loading = $state(true);
  let error = $state('');
  let selectedDistances = $state<string[]>([]);
  let selectedClasses = $state<string[]>([]);
  let selectedScenarios = $state<string[]>([]);
  let filtersOpen = $state(false);
  let activeSection = $state('overview');
  let activeStat = $state('speed');
  let histogramMode = $state('count');

  const statIds = ['speed', 'stamina', 'power', 'guts', 'wiz'];
  const statOptions = statIds.map((value) => ({ value, label: statNames[value]! }));

  let supportType = $state('all');

  const sections: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'supports', label: 'Supports', icon: 'cards' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'stats', label: 'Stats', icon: 'chart' },
    { id: 'characters', label: 'Characters', icon: 'community' }
  ];

  let characterQuery = $state('');
  let characters = $state.raw<StatisticsCatalogEntry[]>([]);
  let supportCatalog = $state(new Map<string, StatisticsCatalogEntry>());
  let skillCatalog = $state(new Map<string, StatisticsCatalogEntry>());
  let selectedCharacterId = $state('');
  let characterStats = $state.raw<CharacterStatistics>();
  let characterLoading = $state(false);
  let characterError = $state('');

  let datasetRequest = 0;
  let characterRequest = 0;

  const dataset = $derived(datasets.find((item) => item.id === datasetId));
  const datasetOptions = $derived(
    datasets.map((item) => ({
      value: item.id,
      label: `${item.name ?? item.id}${item.date ? ` (${new Date(item.date).toLocaleDateString()})` : ''}`
    }))
  );
  const allDistances = $derived(dataset?.index.distances ?? Object.keys(stats?.by_distance ?? {}));
  const distanceOptions = $derived([
    { value: 'all', label: 'All distances' },
    ...allDistances.map((id) => ({
      value: id,
      label: distanceNames[statisticsDistanceId(id)] ?? title(id)
    }))
  ]);
  const distanceFocus = $derived(
    selectedDistances.length === allDistances.length
      ? 'all'
      : selectedDistances.length === 1
        ? selectedDistances[0]
        : 'custom'
  );

  const allClasses = ['1', '2', '3', '4', '5', '6'];

  const allScenarios = $derived(
    Object.keys(stats?.scenario_distribution ?? {}).filter((key) => /^\d+$/.test(key))
  );
  const filters = $derived<StatisticsFilters>({
    classIds: selectedClasses,
    scenarioIds: selectedScenarios,
    distanceIds: selectedDistances,
    allScenarioIds: allScenarios,
    allDistanceIds: allDistances
  });
  const availableCharacters = $derived(
    characters.filter((entry) => dataset?.index.character_ids?.includes(entry.id))
  );
  const selectedCharacter = $derived(characters.find((entry) => entry.id === selectedCharacterId));
  const classData = $derived(stats ? classDistribution(stats, filters) : []);
  const selectedSamples = $derived(classData.reduce((total, item) => total + item.value, 0));
  const filtersChanged = $derived(
    selectedScenarios.length !== allScenarios.length ||
      selectedClasses.length !== allClasses.length ||
      selectedDistances.length !== allDistances.length
  );
  const selectionSummary = $derived(
    [
      selectedScenarios.length === allScenarios.length
        ? 'All scenarios'
        : selectedScenarios.map((id) => scenarioNames[id] ?? id).join(', ') || 'No scenarios',
      selectedClasses.length === allClasses.length
        ? 'All classes'
        : selectedClasses.length
          ? `Classes ${selectedClasses.join(', ')}`
          : 'No classes',
      selectedDistances.length === allDistances.length
        ? 'All distances'
        : selectedDistances.map((id) => distanceNames[id] ?? id).join(', ') || 'No distances'
    ].join(' · ')
  );
  const classAverages = $derived(
    stats ? statAveragesByClass(stats, filters) : { categories: [], series: [] }
  );
  const umaData = $derived(
    stats
      ? aggregateMetric(metricMaps(stats, 'uma_distribution', filters), characterName).map(
          (item) => ({
            ...item,
            image: characters.find((entry) => entry.id === item.id)?.image,
            detail: characters.find((entry) => entry.id === item.id)?.detail
          })
        )
      : []
  );
  const distanceBreakdown = $derived(
    stats
      ? selectedDistances.map((id) => {
          const scope = { ...filters, distanceIds: [id] };
          const value = classDistribution(stats!, scope).reduce((sum, item) => sum + item.value, 0);
          const leader = aggregateMetric(
            metricMaps(stats!, 'uma_distribution', scope),
            characterName
          )[0];
          return {
            id,
            name: distanceNames[statisticsDistanceId(id)] ?? title(id),
            value,
            percentage: selectedSamples ? (value / selectedSamples) * 100 : 0,
            leader,
            image: characters.find((entry) => entry.id === leader?.id)?.image,
            means: meanStats(
              metricMaps(stats!, 'stat_averages', scope) as Array<Record<string, StatDistribution>>
            )
          };
        })
      : []
  );
  const distanceAverages = $derived(
    distanceBreakdown.filter((item) => Object.keys(item.means).length)
  );
  const characterRows = $derived.by(() => {
    const usage = new Map(umaData.map((item) => [item.id, item]));
    return availableCharacters
      .map((entry) => ({
        id: entry.id,
        name: entry.title,
        detail: entry.detail,
        image: entry.image,
        value: usage.get(entry.id)?.value ?? 0,
        percentage: usage.get(entry.id)?.percentage ?? 0
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  });
  const allDeckData = $derived(
    stats
      ? aggregateMetric(metricMaps(stats, 'support_card_combinations', filters), (id, item) =>
          compositionLabel(item, id)
        )
      : []
  );
  const deckData = $derived(allDeckData);
  const allSupportData = $derived(
    stats ? aggregateMetric(metricMaps(stats, 'support_cards', filters), supportName) : []
  );
  const supportData = $derived(allSupportData.map(supportRow));
  const supportTypes = $derived(
    [...new Set(supportData.flatMap((item) => supportCatalog.get(item.id)?.tags[0] ?? []))].sort()
  );
  const filteredSupports = $derived(
    supportData.filter(
      (item) => supportType === 'all' || supportCatalog.get(item.id)?.tags[0] === supportType
    )
  );
  const supportTypeData = $derived(
    stats
      ? supportTypeDistribution(
          allDeckData,
          allSupportData,
          (id) => supportCatalog.get(id)?.tags[0]?.toLowerCase() ?? 'other'
        )
      : []
  );
  const skillData = $derived(
    stats
      ? aggregateMetric(metricMaps(stats, 'skills', filters), skillName).map((item) => ({
          ...item,
          image: skillCatalog.get(item.id)?.image
        }))
      : []
  );
  const statData = $derived(
    stats
      ? aggregateStatDistributions(
          metricMaps(stats, 'stat_averages', filters) as Array<Record<string, StatDistribution>>
        )
      : {}
  );
  const averageStats = $derived(
    stats
      ? meanStats(
          metricMaps(stats, 'stat_averages', filters) as Array<Record<string, StatDistribution>>
        )
      : {}
  );
  const sampleTotal = $derived(stats?.metadata?.total_entries ?? dataset?.index.total_entries ?? 0);
  const commonClass = $derived(
    [...classData].sort((a, b) => b.value - a.value).find((item) => item.value > 0)
  );
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
      supportName
    ).map(supportRow)
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
            name: selectedCharacter?.title ?? 'This Uma',
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

  function title(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function statName(value: string): string {
    return statNames[value] ?? title(value);
  }

  function compact(value?: number): string {
    return value == null
      ? '-'
      : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
          value
        );
  }

  function characterName(id: string, item?: DistributionItem): string {
    return (
      characters.find((entry) => entry.id === (item?.id ?? id))?.title ??
      item?.name ??
      `Uma ${item?.id ?? id}`
    );
  }

  function supportName(id: string, item?: DistributionItem): string {
    return (
      supportCatalog.get(String(item?.id ?? id))?.title ?? item?.name ?? `Support ${item?.id ?? id}`
    );
  }

  function skillName(id: string, item?: DistributionItem): string {
    return (
      skillCatalog.get(String(item?.id ?? id))?.title ?? item?.name ?? `Skill ${item?.id ?? id}`
    );
  }

  function supportRow(item: ChartDatum): ChartDatum & { detail: string } {
    const card = supportCatalog.get(item.id);
    return {
      ...item,
      image: card?.image,
      detail: [...(card?.tags ?? []), '#' + item.id].join(' · ')
    };
  }

  function statStrip(values: Record<string, number>): StatStripItem[] {
    return statIds.map((id) => ({
      id,
      label: statName(id),
      value: values[id] ?? '-',
      tone: (id === 'wiz' ? 'wit' : id) as StatStripItem['tone'],
      icon: '/assets/images/icon/stats/' + (id === 'wiz' ? 'wit' : id) + '.webp'
    }));
  }

  function showSection(id: string): void {
    activeSection = id;
    void changeSection();
  }

  function exploreCharacter(id: string): void {
    activeSection = 'characters';
    void selectCharacter(id);
    void changeSection();
  }

  function openFilters(event: MouseEvent): void {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
    filtersOpen = true;
  }

  function resetFilters(): void {
    selectedDistances = [...allDistances];
    selectedClasses = [...allClasses];
    selectedScenarios = [...allScenarios];
  }

  async function changeSection(): Promise<void> {
    await tick();
    document.getElementById('statistics-panel')?.scrollIntoView({ block: 'start' });
  }

  function baseChart(): EChartsCoreOption {
    return {
      animationDuration: 250,
      aria: { enabled: true },
      textStyle: chartText,
      tooltip: {
        trigger: 'axis',
        backgroundColor: $theme === 'light' ? '#fff' : '#1e1e1e',
        borderColor: chartGrid,
        textStyle: chartText
      }
    };
  }

  function barChart(items: ChartDatum[], color = '#64b5f6'): EChartsCoreOption {
    return {
      ...baseChart(),
      grid: { left: 48, right: 18, top: 32, bottom: 52 },
      xAxis: {
        type: 'category',
        data: items.map((item) => item.name),
        axisLine: { lineStyle: { color: chartGrid } },
        axisLabel: {
          ...chartText,
          rotate: items.length > 7 ? 35 : 0,
          hideOverlap: true
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...chartText, formatter: (value: number) => compact(value) },
        splitLine: { lineStyle: { color: chartGrid } }
      },
      series: [
        {
          type: 'bar',
          data: items.map((item) => ({
            value: item.value,
            itemStyle: { color: statColors[item.id] ?? color }
          })),
          barMaxWidth: 40
        }
      ]
    };
  }

  function pieChart(items: ChartDatum[], colors = statColors): EChartsCoreOption {
    const values = items.filter((item) => item.value > 0);
    const total = values.reduce((sum, item) => sum + item.value, 0);
    return {
      ...baseChart(),
      tooltip: { ...(baseChart().tooltip as object), trigger: 'item' },
      legend: {
        bottom: 0,
        left: 'center',
        icon: 'circle',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: chartText
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '43%'],
          labelLine: { show: false },
          data: values.map((item, index) => ({
            name: item.name,
            value: item.value,
            itemStyle: { color: colors[item.id] ?? '#64b5f6' },
            label: {
              show: index === 0,
              position: 'center',
              formatter: compact(total),
              fontSize: 32,
              fontWeight: 700,
              color: chartText.color
            }
          })),
          emphasis: { scale: false },
          itemStyle: { borderWidth: 0 }
        }
      ]
    };
  }

  function histogramChart(value: StatDistribution | undefined, stat: string): EChartsCoreOption {
    const items = histogram(value);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const percentage = histogramMode === 'percent';
    const option = barChart(
      percentage
        ? items.map((item) => ({
            ...item,
            value: total ? Number(((item.value / total) * 100).toFixed(2)) : 0
          }))
        : items,
      statColors[stat] ?? '#64b5f6'
    );
    return {
      ...option,
      yAxis: {
        type: 'value',
        name: percentage ? 'Share (%)' : 'Samples',
        nameTextStyle: chartText,
        axisLabel: {
          ...chartText,
          formatter: (value: number) => (percentage ? value + '%' : compact(value))
        },
        splitLine: { lineStyle: { color: chartGrid } }
      }
    };
  }

  function groupedChart(
    categories: string[],
    chartSeries: Array<{ name: string; values: number[]; color?: string }>
  ): EChartsCoreOption {
    return {
      ...baseChart(),
      legend: { top: 0, textStyle: chartText },
      grid: { left: 48, right: 18, top: 48, bottom: 24 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { ...chartText, fontSize: 10, interval: 0 }
      },
      yAxis: {
        type: 'value',
        axisLabel: chartText,
        splitLine: { lineStyle: { color: chartGrid } }
      },
      series: chartSeries.map((entry) => ({
        name: entry.name,
        type: 'bar',
        data: entry.values,
        itemStyle: { color: entry.color },
        barMaxWidth: 26
      }))
    };
  }

  function classDistribution(data: GlobalStatistics, state: StatisticsFilters): ChartDatum[] {
    if (state.allDistanceIds.length && !state.distanceIds.length) return [];
    const values = state.classIds.map((classId) => {
      let value = 0;
      for (const distanceId of state.distanceIds) {
        const key = Object.keys(data.by_distance ?? {}).find(
          (id) => statisticsDistanceId(id) === statisticsDistanceId(distanceId)
        );
        const entry = key ? data.by_distance?.[key]?.by_team_class?.[classId] : undefined;
        if (!entry) continue;
        const overall = entry.overall ?? (!entry.by_scenario ? entry : undefined);
        if (state.scenarioIds.length >= state.allScenarioIds.length && overall)
          value += overall.total_entries ?? overall.total_trained_umas ?? 0;
        else
          for (const scenarioId of state.scenarioIds)
            value +=
              entry.by_scenario?.[scenarioId]?.total_entries ??
              entry.by_scenario?.[scenarioId]?.total_trained_umas ??
              0;
      }
      if (!state.distanceIds.length) {
        const entry = data.team_class_distribution?.[classId];
        value =
          typeof entry === 'number'
            ? entry
            : Number((entry as DistributionItem | undefined)?.count ?? 0);
      }
      return { id: classId, name: `Class ${classId}`, value };
    });
    const total = values.reduce((sum, item) => sum + item.value, 0);
    return values
      .map((item) => ({ ...item, percentage: total ? (item.value / total) * 100 : 0 }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }

  function classStatMap(
    data: GlobalStatistics,
    classId: string,
    state: StatisticsFilters
  ): Record<string, number> {
    return meanStats(
      metricMaps(data, 'stat_averages', { ...state, classIds: [classId] }) as Array<
        Record<string, StatDistribution>
      >
    );
  }

  function statAveragesByClass(
    data: GlobalStatistics,
    state: StatisticsFilters
  ): { categories: string[]; series: Array<{ name: string; values: number[]; color?: string }> } {
    const categories = state.classIds.map((id) => `Class ${id}`);
    const maps = state.classIds.map((id) => classStatMap(data, id, state));
    if (!maps.some((map) => Object.keys(map).length)) return { categories: [], series: [] };
    return {
      categories,
      series: ['speed', 'stamina', 'power', 'guts', 'wiz'].map((stat) => ({
        name: statNames[stat] ?? title(stat),
        values: maps.map((map) => map[stat] ?? 0),
        color: statColors[stat]
      }))
    };
  }

  async function selectCharacter(id: string): Promise<void> {
    if (!dataset) return;
    const request = ++characterRequest;
    const selectedDataset = dataset;
    selectedCharacterId = id;
    characterLoading = true;
    characterError = '';
    characterStats = undefined;
    try {
      const result = await statisticsRepository.character(selectedDataset, id);
      if (request === characterRequest) characterStats = result;
    } catch (reason) {
      if (request === characterRequest)
        characterError =
          reason instanceof Error ? reason.message : 'Character statistics could not be loaded.';
    } finally {
      if (request === characterRequest) characterLoading = false;
    }
  }

  function backToCharacters(): void {
    characterRequest += 1;
    selectedCharacterId = '';
    characterStats = undefined;
    characterError = '';
    characterLoading = false;
  }

  async function loadDataset(refresh = false): Promise<void> {
    if (!dataset) return;
    const request = ++datasetRequest;
    const selectedDataset = dataset;
    loading = true;
    error = '';
    stats = undefined;
    supportType = 'all';
    backToCharacters();
    try {
      const result = await statisticsRepository.global(selectedDataset, refresh);
      if (request !== datasetRequest) return;
      stats = result;
      selectedDistances = [
        ...(selectedDataset.index.distances ?? Object.keys(result.by_distance ?? {}))
      ];
      selectedClasses = [...allClasses];
      selectedScenarios = Object.keys(stats.scenario_distribution ?? {}).filter((key) =>
        /^\d+$/.test(key)
      );
    } catch (reason) {
      if (request === datasetRequest)
        error = reason instanceof Error ? reason.message : 'Statistics data could not be loaded.';
    } finally {
      if (request === datasetRequest) loading = false;
    }
  }

  async function initialize(): Promise<void> {
    loading = true;
    error = '';
    try {
      const [nextDatasets, catalog] = await Promise.all([
        statisticsRepository.datasets().then(async (entries) => {
          // Fill the existing cache while independent label catalogs are loading.
          if (entries[0]) await statisticsRepository.global(entries[0]);
          return entries;
        }),
        statisticsRepository.catalog()
      ]);
      datasets = nextDatasets;
      characters = catalog.characters;
      supportCatalog = new Map(catalog.supports.map((item) => [item.id, item]));
      skillCatalog = new Map(catalog.skills.map((item) => [item.id, item]));
      datasetId = datasets[0]?.id ?? '';
      if (!datasetId) throw new Error('No statistics datasets are available.');
      await loadDataset();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Statistics datasets could not be loaded.';
      loading = false;
    }
  }

  $effect(() => {
    void initialize();
  });
</script>

<svelte:head>
  <title>Team Stadium Statistics · uma.moe</title>
  <meta
    name="description"
    content="Explore the Umas, support decks, skills, and training stats used by the Team Stadium community."
  />
</svelte:head>

{#snippet distributions(values: Record<string, StatDistribution>, prefix: string)}
  <div class="distribution-controls">
    <SegmentedControl
      label="Stat to explore"
      options={statOptions}
      bind:value={activeStat}
    />
    <SegmentedControl
      label="Distribution scale"
      options={[
        { value: 'count', label: 'Count' },
        { value: 'percent', label: 'Percent' }
      ]}
      bind:value={histogramMode}
    />
  </div>
  <StatisticsChartPanel
    id={prefix + '-distribution'}
    title={statName(activeStat) + ' Stat Distribution'}
    description={histogramMode === 'count'
      ? 'Training samples in each stat range. Hover or tap a bar for the exact count.'
      : 'Share of recorded samples in each stat range. Each distribution totals 100%.'}
    option={histogramChart(values[activeStat], activeStat)}
    height={260}
  />
{/snippet}

<AppPage
  routeId="statistics"
  title="Team Stadium"
  description="Community statistics"
  width="wide"
>
  {#snippet actions()}
    {#if datasets.length}
      <div class="dataset-select">
        <SelectField
          id="statistics-dataset"
          label="Statistics Version"
          options={datasetOptions}
          bind:value={datasetId}
          onchange={() => loadDataset()}
        />{#if stats?.metadata?.generated_at}
          <small>
            Snapshot &middot; {new Date(stats.metadata.generated_at).toLocaleDateString()}
          </small>
        {/if}
      </div>
    {/if}
  {/snippet}
  <div class="statistics-content">
    {#if error}
      <Banner
        title="Statistics unavailable"
        tone="danger"
      >
        <p>{error}</p>
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onclick={initialize}
        >
          Try again
        </Button>
      </Banner>
    {/if}
    {#if loading}
      <div class="loading">
        <Spinner size={28} />
        <span>Loading community statistics…</span>
      </div>
    {:else if stats}
      <section
        class="dataset-summary"
        aria-label="Dataset summary"
      >
        <div class="sample-summary">
          <span class="summary-label">In your selection</span>
          <strong data-testid="selected-samples">{compact(selectedSamples)}</strong>
          <span>of {sampleTotal.toLocaleString()} training samples</span>
        </div>
        <div>
          <span class="summary-label">Umas represented</span>
          <strong>
            {umaData.length}
            <small>/ {availableCharacters.length}</small>
          </strong>
          <span>in the selected data</span>
        </div>
        <div>
          <span class="summary-label">Most represented</span>
          <strong>{commonClass?.name ?? '-'}</strong>
          <span>
            {commonClass
              ? (commonClass.percentage ?? 0).toFixed(1) + '% of selected samples'
              : 'No samples selected'}
          </span>
        </div>
      </section>

      <div class="workspace-navigation">
        <Tabs
          variant="pills"
          id="statistics-tabs"
          label="Statistics sections"
          items={sections}
          bind:value={activeSection}
          controls="statistics-panel"
        />
        <div class="scope-bar">
          <div class="scope-controls">
            <Button
              variant={filtersChanged ? 'primary' : 'secondary'}
              size="sm"
              icon="tune"
              onclick={openFilters}
            >
              Filters
            </Button>
            <span
              class="scope-copy"
              title={selectionSummary}
            >
              {selectionSummary}
            </span>
          </div>
          {#if filtersChanged}
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              onclick={resetFilters}
            >
              Reset filters
            </Button>
          {/if}
        </div>
      </div>

      <div
        id="statistics-panel"
        class="content-area"
        role="tabpanel"
        aria-labelledby={'statistics-tabs-' + activeSection}
        tabindex="-1"
      >
        {#if allDistances.length > 1}
          <div class="distance-focus">
            <span>Explore by distance</span>
            <SegmentedControl
              label="Distance focus"
              options={distanceOptions}
              value={distanceFocus}
              onchange={(value) =>
                (selectedDistances = value === 'all' ? [...allDistances] : [value])}
            />
          </div>
        {/if}
        {#if activeSection === 'overview'}
          <section id="statistics-overview">
            <header class="section-heading">
              <div><h2>The field at a glance</h2></div>
              <span class="context-label">
                {supportData.length} support cards · {skillData.length} skills · {deckData.length} deck
                builds
              </span>
            </header>
            <div class="overview-grid">
              <StatisticsRanking
                id="popular-umas"
                title="Most Popular Uma Musume"
                description="Share of recorded Uma uses. Select a Uma to explore its build."
                items={umaData}
                limit={8}
                onselect={exploreCharacter}
                onmore={() => showSection('characters')}
                moreLabel="All Umas"
              />
              <div class="training-profile">
                <div class="profile-heading">
                  <h3>Training profile</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={() => showSection('stats')}
                  >
                    <span class="panel-action">
                      Stat distributions<Icon
                        name="arrow-right"
                        size={13}
                      />
                    </span>
                  </Button>
                </div>
                <StatStrip
                  items={statStrip(averageStats)}
                  label="Average training stats"
                  compact
                />
                <StatisticsChartPanel
                  id="distance-averages"
                  title="Average stats by distance"
                  description="Average of selected class and scenario means. Select a stat in the legend to isolate it."
                  option={groupedChart(
                    distanceAverages.map((item) => item.name),
                    statIds.map((stat) => ({
                      name: statName(stat),
                      values: distanceAverages.map((item) => item.means[stat] ?? 0),
                      color: statColors[stat]
                    }))
                  )}
                  height={260}
                />
              </div>
              <div class="distance-breakdown">
                <ChartFrame
                  id="distance-breakdown"
                  title="Distance breakdown"
                  description="Sample share and most used Uma in each distance."
                >
                  <div class="distance-rows">
                    {#each distanceBreakdown as item}
                      <div
                        class="distance-row"
                        style:--distance-color={distanceColors[statisticsDistanceId(item.id)]}
                      >
                        <div class="distance-metric">
                          <strong>
                            <i></i>
                            {item.name}
                          </strong>
                          <span>{item.value.toLocaleString()}</span>
                          <MetricBar
                            value={Number(item.percentage.toFixed(1))}
                            compact
                          />
                        </div>
                        {#if item.leader}
                          <button
                            class="distance-leader"
                            aria-label={'Analyze ' + item.leader.name + ' for ' + item.name}
                            onclick={() => {
                              selectedDistances = [item.id];
                              exploreCharacter(item.leader!.id);
                            }}
                          >
                            {#if item.image}
                              <img
                                src={item.image}
                                alt=""
                                width="24"
                                height="24"
                                loading="lazy"
                              />
                            {/if}
                            <span>{item.leader.name}</span>
                            <strong>{(item.leader.percentage ?? 0).toFixed(1)}%</strong>
                            <Icon
                              name="arrow-right"
                              size={12}
                            />
                          </button>
                        {/if}
                      </div>
                    {:else}
                      <p class="fine-print">No samples selected</p>
                    {/each}
                  </div>
                </ChartFrame>
              </div>
              <StatisticsDeckMatrix
                id="overview-decks"
                items={deckData}
                onmore={() => showSection('supports')}
              />
              <StatisticsRanking
                id="overview-supports"
                title="Popular support cards"
                description="Share of all recorded support card uses. A deck contributes multiple cards."
                items={supportData}
                limit={8}
                onmore={() => showSection('supports')}
                moreLabel="All supports"
              />
              <StatisticsRanking
                id="overview-skills"
                title="Common skills"
                description="Share of all recorded skill acquisitions. A Uma can contribute multiple skills."
                items={skillData}
                limit={8}
                onmore={() => showSection('skills')}
                moreLabel="All skills"
              />
            </div>
            <div class="class-mix">
              <div class="mix-heading">
                <strong>Team class mix</strong>
                <span>Share of selected samples</span>
              </div>
              <div
                class="mix-track"
                aria-hidden="true"
              >
                {#each classData.filter((item) => item.value > 0) as item}
                  <span
                    style:width={(item.percentage ?? 0) + '%'}
                    style:background={classColors[item.id]}
                  ></span>
                {/each}
              </div>
              <div class="mix-legend">
                {#each classData.filter((item) => item.value > 0) as item}
                  <span>
                    <i style:background={classColors[item.id]}></i>
                    {item.name}
                    <strong>{(item.percentage ?? 0).toFixed(1)}%</strong>
                  </span>
                {/each}{#if !selectedSamples}
                  <span>No samples selected</span>
                {/if}
              </div>
            </div>
            <Disclosure
              id="class-breakdown"
              title="Team class breakdown"
              description="Sample distribution and average stats"
              icon="chart"
            >
              <div class="two-columns">
                <StatisticsChartPanel
                  title="Team Class Distribution"
                  description="Share of selected training samples in each class."
                  option={pieChart(classData, classColors)}
                  height={280}
                /><StatisticsChartPanel
                  title="Average Stats by Team Stadium Class"
                  description="Compare the five core stats across your selected classes."
                  option={groupedChart(classAverages.categories, classAverages.series)}
                  height={280}
                />
              </div>
            </Disclosure>
          </section>
        {:else if activeSection === 'supports'}
          <section id="support-cards">
            <header class="section-heading">
              <div>
                <h2>Build your support deck</h2>
                <p>See which cards are used, and how support types fit together.</p>
              </div>
              <span class="context-label">
                {supportData.length} cards · {deckData.length} builds
              </span>
            </header>
            <div
              class="type-filters"
              aria-label="Support type"
            >
              <FilterChip
                label="All types"
                selected={supportType === 'all'}
                onclick={() => (supportType = 'all')}
              />{#each supportTypes as type}
                <FilterChip
                  label={type}
                  selected={supportType === type}
                  onclick={() => (supportType = type)}
                />
              {/each}
            </div>
            <div class="support-grid">
              <div class="stack">
                <StatisticsRanking
                  id="support-ranking"
                  title="Most Popular Support Cards"
                  description="Share of all recorded card uses; a deck contributes multiple cards."
                  items={filteredSupports}
                  searchable
                  searchLabel="Search support cards"
                />
              </div>
              <div class="stack">
                <StatisticsRanking
                  id="deck-ranking"
                  title="Most Used Deck Compositions"
                  description="Share of recorded decks. Icons show each of the six support slots."
                  items={deckData}
                  searchable
                  searchLabel="Search deck types"
                  limit={5}
                />
                <ChartFrame
                  id="support-types"
                  title="Support type mix"
                  description="Share of support slots in the selected decks."
                >
                  <div class="type-metrics">
                    {#each supportTypeData as item}
                      <div>
                        <span>{item.name}</span>
                        <MetricBar value={Number((item.percentage ?? 0).toFixed(1))} />
                      </div>
                    {/each}{#if !supportTypeData.length}
                      <p>No data available</p>
                    {/if}
                  </div>
                </ChartFrame>
              </div>
            </div>
          </section>
        {:else if activeSection === 'skills'}
          <section id="skills">
            <header class="section-heading">
              <div>
                <h2>Explore the skill pool</h2>
                <p>Find familiar picks and discover what else trainers are taking.</p>
              </div>
              <span class="context-label">{skillData.length} recorded skills</span>
            </header>
            <div class="explanation">
              <Icon
                name="info"
                size={16}
              />
              <p>
                Share measures a skill's portion of all recorded skill acquisitions. Each Uma can
                contribute multiple skills.
              </p>
            </div>
            <StatisticsRanking
              id="skill-ranking"
              title="Most Used Skills"
              description="Ranked by the number of recorded acquisitions in your selection."
              items={skillData}
              searchable
              searchLabel="Search skills"
            />
          </section>
        {:else if activeSection === 'stats'}
          <section id="distributions">
            <header class="section-heading">
              <div>
                <h2>Look beyond the averages</h2>
                <p>Explore the full spread of training stats, one stat at a time.</p>
              </div>
            </header>
            <div class="stat-overview">
              <StatStrip
                items={statStrip(averageStats)}
                label="Average training stats"
              />
              <p class="fine-print">
                Average of selected class and scenario means. The charts show the combined sample
                distributions.
              </p>
            </div>
            {@render distributions(statData, 'global')}
            <div class="section-gap">
              <StatisticsChartPanel
                title="Average Stats by Team Stadium Class"
                description="The same stat across classes. Use the legend to isolate a series."
                option={groupedChart(classAverages.categories, classAverages.series)}
                height={250}
              />
            </div>
          </section>
        {:else if activeSection === 'characters'}
          <section id="characters">
            {#if !selectedCharacterId}
              <header class="section-heading">
                <div>
                  <h2>Find your Uma</h2>
                  <p>
                    Choose a character to explore its training stats, distances, and support decks.
                  </p>
                </div>
                <span class="context-label">{availableCharacters.length} Umas in this dataset</span>
              </header>
              <StatisticsRanking
                id="character-ranking"
                title="Character Analysis"
                description="Usage in your current selection. Characters without matching samples remain available to inspect."
                items={characterRows}
                searchable
                bind:query={characterQuery}
                searchLabel="Search Umas by name or ID"
                onselect={exploreCharacter}
              />
            {:else}
              <div class="character-details">
                <Button
                  variant="ghost"
                  size="sm"
                  icon="arrow-left"
                  ariaLabel="Back to character selection"
                  onclick={backToCharacters}
                >
                  All Umas
                </Button>
                <header class="character-heading">
                  {#if selectedCharacter?.image}
                    <img
                      src={selectedCharacter.image}
                      alt=""
                      width="80"
                      height="80"
                    />
                  {/if}
                  <div>
                    <span class="eyebrow">Character analysis</span>
                    <h2>{selectedCharacter?.title ?? 'Uma ' + selectedCharacterId}</h2>
                    <p>
                      {characterLoading
                        ? 'Loading samples…'
                        : compact(charSamples) + ' matching samples'} · ID {selectedCharacterId}
                    </p>
                  </div>
                </header>
                {#if characterLoading}
                  <div class="loading">
                    <Spinner size={28} />
                    <span>Loading character statistics…</span>
                  </div>
                {:else if characterError}
                  <Banner
                    title="Character statistics unavailable"
                    tone="danger"
                  >
                    <p>{characterError}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onclick={() => selectCharacter(selectedCharacterId)}
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
                    <p class="fine-print">
                      Average of selected class and scenario means for this Uma.
                    </p>
                  </div>
                  <div class="two-columns">
                    <StatisticsChartPanel
                      title="Compared with the field"
                      description="Character averages against all Umas under the same filters."
                      option={groupedChart(statIds.map(statName), comparisonSeries)}
                      height={230}
                    /><StatisticsChartPanel
                      title="Distance Preference"
                      description="Recorded uses at each selected distance."
                      option={barChart(charDistanceData)}
                      height={230}
                    />
                  </div>
                  <h3 class="subheading">Statistics for {selectedCharacter?.title}</h3>
                  {@render distributions(charStats, 'character')}
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
                        option={groupedChart(
                          [selectedCharacter?.title ?? 'Character'],
                          charClassData
                        )}
                        height={280}
                      /><StatisticsChartPanel
                        title="Support Card Type Distribution"
                        description="Share of support slots for this Uma."
                        option={pieChart(charSupportTypes)}
                        height={280}
                      />
                    </div>
                  </Disclosure>
                {/if}
              </div>
            {/if}
          </section>
        {/if}
      </div>

      <ContentAd routeId="statistics" />
      <footer>
        <Icon
          name="info"
          size={15}
        />
        <p>
          Community data, anonymized and aggregated. Usage describes popularity; it does not measure
          race results.
        </p>
      </footer>
      <Dialog
        bind:open={filtersOpen}
        title="Statistics filters"
        icon="tune"
        maxWidth="540px"
      >
        <StatisticsFilterControls
          {allScenarios}
          {allClasses}
          {allDistances}
          bind:selectedScenarios
          bind:selectedClasses
          bind:selectedDistances
          {selectedSamples}
        />
        {#snippet actions()}
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            disabled={!filtersChanged}
            onclick={resetFilters}
          >
            Reset filters
          </Button><Button
            size="sm"
            onclick={() => (filtersOpen = false)}
          >
            Show results
          </Button>
        {/snippet}
      </Dialog>
    {/if}
  </div>
</AppPage>

<style>
  @import './statistics-page.css';
</style>
