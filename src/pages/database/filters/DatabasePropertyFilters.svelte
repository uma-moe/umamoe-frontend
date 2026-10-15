<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '@/components/Icon.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import ScenarioMultiSelect from '@/components/pickers/ScenarioMultiSelect.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import ResourceStatus from '@/components/feedback/ResourceStatus.svelte';
  import { factorCatalogState } from '@/lib/catalog/factor-catalog';
  import type {
    InheritanceFilterMode,
    InheritanceSearchFilters
  } from '@/lib/inheritance/inheritance-search';
  import FactorFilterEditor from './factors/FactorFilterEditor.svelte';
  import DatabaseFilterGroup from './DatabaseFilterGroup.svelte';
  import DatabaseWhiteCategoryFilter, {
    type WhiteCategoryValues
  } from './DatabaseWhiteCategoryFilter.svelte';
  import DatabaseRaceScheduleFilter from './DatabaseRaceScheduleFilter.svelte';

  interface Props {
    filterMode: InheritanceFilterMode;
    filters: InheritanceSearchFilters;
    tourPanels: Record<string, boolean>;
    includeMaxFollowers: boolean;
    supportFilter: Snippet;
    onchange: () => void;
  }

  let {
    filterMode,
    filters = $bindable(),
    tourPanels = $bindable(),
    includeMaxFollowers = $bindable(),
    supportFilter,
    onchange
  }: Props = $props();

  const rankOptions = Array.from({ length: 20 }, (_, index) => ({
    value: String(index + 1),
    label: `Rank ${index + 1}`,
    image: `/assets/images/icon/ranks/utx_txt_rank_${String(index + 1).padStart(2, '0')}.webp`
  }));

  const lineageWhiteCategories = $derived<WhiteCategoryValues>({
    commonCount: filters.minCommonWhiteCount,
    commonStars: filters.minCommonWhiteStarsSum,
    scenarioCount: filters.minScenarioWhiteCount,
    scenarioStars: filters.minScenarioWhiteStarsSum,
    raceCount: filters.minRaceWhiteCount,
    raceStars: filters.minRaceWhiteStarsSum
  });
  const mainWhiteCategories = $derived<WhiteCategoryValues>({
    commonCount: filters.minMainCommonWhiteCount,
    commonStars: filters.minMainCommonWhiteStarsSum,
    scenarioCount: filters.minMainScenarioWhiteCount,
    scenarioStars: filters.minMainScenarioWhiteStarsSum,
    raceCount: filters.minMainRaceWhiteCount,
    raceStars: filters.minMainRaceWhiteStarsSum
  });

  function numberFrom(event: Event): number | undefined {
    const raw = (event.currentTarget as HTMLInputElement).value;
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  function setWhiteCategory(
    scope: 'lineage' | 'main',
    category: 'common' | 'scenario' | 'race',
    metric: 'count' | 'stars',
    value: number | undefined
  ): void {
    const keys =
      scope === 'main'
        ? {
            common: { count: 'minMainCommonWhiteCount', stars: 'minMainCommonWhiteStarsSum' },
            scenario: { count: 'minMainScenarioWhiteCount', stars: 'minMainScenarioWhiteStarsSum' },
            race: { count: 'minMainRaceWhiteCount', stars: 'minMainRaceWhiteStarsSum' }
          }
        : {
            common: { count: 'minCommonWhiteCount', stars: 'minCommonWhiteStarsSum' },
            scenario: { count: 'minScenarioWhiteCount', stars: 'minScenarioWhiteStarsSum' },
            race: { count: 'minRaceWhiteCount', stars: 'minRaceWhiteStarsSum' }
          };
    (filters as unknown as Record<string, unknown>)[keys[category][metric]] = value;
    onchange();
  }

  function setScalar(key: 'minWinCount' | 'minWhiteCount', value: number | undefined): void {
    filters[key] = value;
    onchange();
  }
</script>

<section
  class="property-filters"
  aria-labelledby="property-filter-title"
>
  <h3 id="property-filter-title">
    {filterMode === 'basic' ? 'Basic Criteria' : 'Property Filters'}
  </h3>
  <ResourceStatus {...$factorCatalogState} />
  <div
    class="property-grid"
    class:basic={filterMode === 'basic'}
  >
    <DatabaseFilterGroup
      id="inheritance"
      bind:open={tourPanels.inheritance}
      title={filterMode === 'basic' ? 'Spark Filters' : 'Inheritance Factors'}
      variant="factor"
    >
      <div class="spark-builder-help">
        <Icon
          name="info"
          size={14}
        />
        <span>
          Build factor rules below. Separate rows are required together; use <b>OR</b>
          to accept either adjacent requirement.
        </span>
      </div>
      <FactorFilterEditor
        id="blue-factors"
        label="Blue Factors (Stats)"
        category="stats"
        tone="blue"
        bind:requirements={filters.blue}
      />
      <FactorFilterEditor
        id="pink-factors"
        label="Pink Factors (Aptitude)"
        category="aptitude"
        tone="pink"
        bind:requirements={filters.pink}
      />
      <FactorFilterEditor
        id="green-factors"
        label="Green Factors (Unique)"
        category="unique"
        tone="green"
        bind:requirements={filters.green}
      />
      <FactorFilterEditor
        id="white-factors"
        label="White Factors - Required (Skills/Races)"
        category="skills-races"
        tone="white"
        bind:requirements={filters.white}
      />
      {#if filterMode === 'advanced'}
        <FactorFilterEditor
          id="optional-white"
          label="Preferred White Factors"
          category="skills-races"
          tone="white"
          priorityMode
          bind:requirements={filters.optionalWhite}
        />
        <FactorFilterEditor
          id="lineage-white"
          label="Lineage White Factors"
          category="skills-races"
          tone="white"
          priorityMode
          bind:requirements={filters.lineageWhite}
        />
      {/if}
    </DatabaseFilterGroup>

    {#if filterMode === 'advanced'}
      <DatabaseFilterGroup
        id="main"
        bind:open={tourPanels.main}
        title="Main Parent Factors"
        variant="factor"
      >
        <FactorFilterEditor
          id="main-blue"
          label="Blue Factors (Stats)"
          category="stats"
          tone="blue"
          maxStars={3}
          addLabelOverride="Add Blue Factor (Stats)"
          bind:requirements={filters.mainBlue}
        />
        <FactorFilterEditor
          id="main-pink"
          label="Pink Factors (Aptitude)"
          category="aptitude"
          tone="pink"
          maxStars={3}
          addLabelOverride="Add Pink Factor (Aptitude)"
          bind:requirements={filters.mainPink}
        />
        <FactorFilterEditor
          id="main-green"
          label="Green Factors (Unique)"
          category="unique"
          tone="green"
          maxStars={3}
          addLabelOverride="Add Green Factor (Unique)"
          bind:requirements={filters.mainGreen}
        />
        <FactorFilterEditor
          id="main-white"
          label="White Factors - Required (Skills/Races)"
          category="skills-races"
          tone="white"
          maxStars={3}
          addLabelOverride="Add White Factor (Skills/Races)"
          bind:requirements={filters.mainWhite}
        />
        <FactorFilterEditor
          id="optional-main-white"
          label="Preferred White Factors"
          category="skills-races"
          tone="white"
          maxStars={3}
          priorityMode
          bind:requirements={filters.optionalMainWhite}
        />
        <DatabaseWhiteCategoryFilter
          heading="Main Parent White Categories"
          values={mainWhiteCategories}
          onchange={(category, metric, value) => setWhiteCategory('main', category, metric, value)}
        />
      </DatabaseFilterGroup>
    {/if}

    <div class="criteria-stack">
      <DatabaseFilterGroup
        id="general"
        bind:open={tourPanels.general}
        title={filterMode === 'basic' ? 'Support Card & LB' : 'General Criteria'}
      >
        {#if filterMode === 'basic'}
          {@render supportFilter()}
        {:else}
          <div class="threshold-grid general-criteria-grid">
            <ScenarioMultiSelect
              id="training-scenario"
              label="Training Scenario"
              value={filters.scenarioIds}
              onchange={(value) => {
                filters.scenarioIds = value;
                onchange();
              }}
            /><TextField
              id="minimum-wins"
              label="Min Win Count"
              type="number"
              min={0}
              placeholder="0"
              value={String(filters.minWinCount ?? '')}
              oninput={(event) => setScalar('minWinCount', numberFrom(event))}
            /><TextField
              id="minimum-white"
              label="Min White Factor Count"
              type="number"
              min={0}
              placeholder="0"
              value={String(filters.minWhiteCount ?? '')}
              oninput={(event) => setScalar('minWhiteCount', numberFrom(event))}
            /><SelectField
              id="minimum-rank"
              label="Parent Rank"
              imageOnly
              value={String(filters.minParentRank ?? 1)}
              options={rankOptions}
              onchange={(value) => (filters.minParentRank = Number(value))}
            /><ToggleButton
              fieldLabel="Max Follower Accounts"
              pressed={includeMaxFollowers}
              icon="users"
              label="Max Followers"
              ariaLabel="Include max follower accounts in filters"
              onclick={() => {
                includeMaxFollowers = !includeMaxFollowers;
                filters.maxFollowerNum = includeMaxFollowers ? 1000 : 999;
              }}
            />
          </div>
        {/if}
      </DatabaseFilterGroup>
      <DatabaseFilterGroup
        id="total"
        bind:open={tourPanels.total}
        title="Total Star Count"
      >
        {#if filterMode === 'advanced'}
          <DatabaseWhiteCategoryFilter
            heading="White Factor Categories"
            values={lineageWhiteCategories}
            onchange={(category, metric, value) =>
              setWhiteCategory('lineage', category, metric, value)}
          />
        {/if}
        <p>Filter by the combined star count across all factors of each type.</p>
        <div class="threshold-grid star-count-grid">
          <TextField
            id="blue-star-sum"
            label="Total Blue ★"
            type="number"
            min={0}
            max={9}
            value={String(filters.minBlueStarsSum ?? '')}
            oninput={(event) => (filters.minBlueStarsSum = numberFrom(event))}
          /><TextField
            id="pink-star-sum"
            label="Total Pink ★"
            type="number"
            min={0}
            max={9}
            value={String(filters.minPinkStarsSum ?? '')}
            oninput={(event) => (filters.minPinkStarsSum = numberFrom(event))}
          /><TextField
            id="green-star-sum"
            label="Total Green ★"
            type="number"
            min={0}
            max={9}
            value={String(filters.minGreenStarsSum ?? '')}
            oninput={(event) => (filters.minGreenStarsSum = numberFrom(event))}
          /><TextField
            id="white-star-sum"
            label="Total White ★"
            type="number"
            min={0}
            value={String(filters.minWhiteStarsSum ?? '')}
            oninput={(event) => (filters.minWhiteStarsSum = numberFrom(event))}
          />
        </div>
      </DatabaseFilterGroup>
    </div>

    {#if filterMode === 'advanced'}
      <DatabaseFilterGroup
        id="races"
        bind:open={tourPanels.races}
        title="Race Schedule Filter"
        count={filters.mainWinSaddle.length + filters.raceSchedule.length}
        variant="full"
      >
        <DatabaseRaceScheduleFilter
          selection={filters.raceSchedule}
          onchange={(selection, saddleIds) => {
            filters.raceSchedule = selection;
            filters.mainWinSaddle = saddleIds;
            onchange();
          }}
        />
      </DatabaseFilterGroup>
    {/if}
  </div>
</section>

<style>
  .threshold-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 8px;
  }
  .property-filters {
    min-width: 0;
    margin-top: 8px;
  }
  .property-filters > h3 {
    margin: 0 0 6px;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }
  .property-grid {
    min-width: 0;
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 8px;
  }
  .property-grid.basic {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(390px, 0.85fr);
    align-items: start;
  }
  .property-grid :global(.database-filter-card p) {
    margin: -2px 0 8px;
    color: var(--text-secondary);
    font-size: 11px;
  }
  .criteria-stack {
    min-width: 280px;
    display: flex;
    flex: 1 1 300px;
    align-self: stretch;
    flex-direction: column;
    gap: 8px;
  }
  .criteria-stack :global(.database-filter-card) {
    flex: 0 0 auto;
  }
  .criteria-stack :global(.database-filter-card:last-child) {
    flex: 1 1 auto;
  }
  .star-count-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .star-count-grid :global(.field:nth-child(1) .field-label) {
    color: var(--accent-primary);
  }
  .star-count-grid :global(.field:nth-child(2) .field-label) {
    color: var(--color-pink);
  }
  .star-count-grid :global(.field:nth-child(3) .field-label) {
    color: var(--accent-secondary);
  }
  .star-count-grid :global(.field:nth-child(4) .field-label) {
    color: var(--text-primary);
  }
  .spark-builder-help {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 7px;
    box-sizing: border-box;
    margin-bottom: 5px;
    padding: 0 8px;
    border-left: 2px solid rgb(var(--accent-primary-rgb) / 0.6);
    background: rgb(var(--accent-primary-rgb) / 0.055);
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.25;
  }
  .spark-builder-help :global(svg) {
    flex: 0 0 auto;
    color: var(--accent-primary);
  }
  .spark-builder-help b {
    color: var(--text-primary);
  }
  .general-criteria-grid :global(.field:first-child) {
    grid-column: 1/-1;
  }
  @media (max-width: 1180px) {
    .property-grid.basic {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 900px) {
    .property-grid {
      flex-direction: column;
      flex-wrap: nowrap;
    }
    .criteria-stack {
      width: 100%;
      min-width: 0;
      flex: 0 1 auto;
    }
  }
  @media (max-width: 600px) {
    .spark-builder-help {
      height: auto;
      min-height: 32px;
      padding-block: 5px;
    }
  }
</style>
