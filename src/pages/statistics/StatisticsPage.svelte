<script lang="ts">
  import { tick } from 'svelte';
  import { theme } from '@/stores/theme';
  import { statisticsDistanceId, type StatisticsFilters } from '@/lib/statistics/statistics';
  import AppPage from '@/layouts/AppPage.svelte';
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import StatisticsFilterControls from './StatisticsFilterControls.svelte';
  import StatisticsRanking from './StatisticsRanking.svelte';
  import StatisticsChartPanel from './StatisticsChartPanel.svelte';
  import StatisticsSectionHeading from './sections/StatisticsSectionHeading.svelte';
  import StatisticsSummary from './sections/StatisticsSummary.svelte';
  import StatisticsNavigation from './sections/StatisticsNavigation.svelte';
  import StatisticsOverview from './sections/StatisticsOverview.svelte';
  import StatisticsSupports from './sections/StatisticsSupports.svelte';
  import StatisticsDistributions from './sections/StatisticsDistributions.svelte';
  import StatisticsCharacterDetails from './sections/StatisticsCharacterDetails.svelte';
  import { distanceNames } from './statistics-display';
  import { groupedChart, statisticsChartStyle } from './statistics-charts';
  import { allClasses, statStrip, title } from './statistics-format';
  import { StatisticsCharacterAnalysis } from './sections/statistics-character.svelte';
  import { StatisticsView } from './statistics-view.svelte';
  import {
    statisticsRepository,
    type StatisticsCatalogEntry,
    type GlobalStatistics,
    type StatisticsDataset
  } from './statistics-repository';

  const chartStyle = $derived(statisticsChartStyle($theme));

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

  let supportType = $state('all');

  let characterQuery = $state('');
  let characters = $state.raw<StatisticsCatalogEntry[]>([]);
  let supportCatalog = $state(new Map<string, StatisticsCatalogEntry>());
  let skillCatalog = $state(new Map<string, StatisticsCatalogEntry>());
  const character = new StatisticsCharacterAnalysis();

  let datasetRequest = 0;

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

  const selectedCharacter = $derived(characters.find((entry) => entry.id === character.id));
  const view = new StatisticsView({
    stats: () => stats,
    filters: () => filters,
    characters: () => characters,
    availableCharacters: () => availableCharacters,
    supportCatalog: () => supportCatalog,
    skillCatalog: () => skillCatalog
  });

  const filtersChanged = $derived(
    selectedScenarios.length !== allScenarios.length ||
      selectedClasses.length !== allClasses.length ||
      selectedDistances.length !== allDistances.length
  );

  const sampleTotal = $derived(stats?.metadata?.total_entries ?? dataset?.index.total_entries ?? 0);

  function showSection(id: string): void {
    activeSection = id;
    void changeSection();
  }

  function exploreCharacter(id: string): void {
    activeSection = 'characters';
    void character.select(dataset, id);
    void changeSection();
  }

  function exploreDistanceLeader(distanceId: string, characterId: string): void {
    selectedDistances = [distanceId];
    exploreCharacter(characterId);
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

  async function loadDataset(refresh = false): Promise<void> {
    if (!dataset) return;
    const request = ++datasetRequest;
    const selectedDataset = dataset;
    loading = true;
    error = '';
    stats = undefined;
    supportType = 'all';
    character.reset();
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
      <Spinner
        centered
        minHeight="300px"
        label="Loading community statistics…"
      />
    {:else if stats}
      <StatisticsSummary
        {view}
        {sampleTotal}
        characterCount={availableCharacters.length}
      />

      <StatisticsNavigation
        bind:activeSection
        {filters}
        {filtersChanged}
        onfilters={() => (filtersOpen = true)}
        onreset={resetFilters}
      />

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
          <StatisticsOverview
            {view}
            onexplore={exploreCharacter}
            onexploredistance={exploreDistanceLeader}
            onshow={showSection}
          />
        {:else if activeSection === 'supports'}
          <StatisticsSupports
            {view}
            bind:supportType
          />
        {:else if activeSection === 'skills'}
          <section id="skills">
            <StatisticsSectionHeading
              title="Explore the skill pool"
              context="{view.skillData.length} recorded skills"
            />
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
              items={view.skillData}
              searchable
              searchLabel="Search skills"
            />
          </section>
        {:else if activeSection === 'stats'}
          <section id="distributions">
            <StatisticsSectionHeading title="Look beyond the averages" />
            <div class="stat-overview">
              <StatStrip
                items={statStrip(view.averageStats)}
                label="Average training stats"
              />
              <p class="fine-print">
                Average of selected class and scenario means. The charts show the combined sample
                distributions.
              </p>
            </div>
            <StatisticsDistributions
              values={view.statData}
              prefix="global"
              bind:activeStat
              bind:histogramMode
            />
            <div class="section-gap">
              <StatisticsChartPanel
                title="Average Stats by Team Stadium Class"
                description="The same stat across classes. Use the legend to isolate a series."
                option={groupedChart(
                  chartStyle,
                  view.classAverages.categories,
                  view.classAverages.series
                )}
                height={250}
              />
            </div>
          </section>
        {:else if activeSection === 'characters'}
          <section id="characters">
            {#if !character.id}
              <StatisticsSectionHeading
                title="Find your Uma"
                context="{availableCharacters.length} Umas in this dataset"
              />
              <StatisticsRanking
                id="character-ranking"
                title="Character Analysis"
                description="Usage in your current selection. Characters without matching samples remain available to inspect."
                items={view.characterRows}
                searchable
                bind:query={characterQuery}
                searchLabel="Search Umas by name or ID"
                onselect={exploreCharacter}
              />
            {:else}
              <StatisticsCharacterDetails
                characterId={character.id}
                character={selectedCharacter}
                characterStats={character.stats}
                loading={character.loading}
                error={character.error}
                {filters}
                averageStats={view.averageStats}
                {supportCatalog}
                bind:activeStat
                bind:histogramMode
                onback={() => character.reset()}
                onretry={() => character.select(dataset, character.id)}
              />
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
          Community data, anonymized and aggregated. Usage describes popularity, not race results.
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
          selectedSamples={view.selectedSamples}
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
  @import './statistics-panels.css';
  @import './statistics-page.css';
</style>
