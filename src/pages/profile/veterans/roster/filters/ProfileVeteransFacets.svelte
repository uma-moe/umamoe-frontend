<script lang="ts">
  import { characterImagePath, type CharacterData } from '@/lib/game-data/characters';
  import { factorLoadingState, factorOptions } from '@/lib/game-data/factors/factors';
  import AffinityPicker from '@/components/pickers/AffinityPicker.svelte';
  import ResourceLoadStatus from '@/components/feedback/ResourceLoadStatus.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Icon from '@/components/Icon.svelte';
  import ProfileVeteranSparkMatcher from '../../ProfileVeteranSparkMatcher.svelte';
  import ProfileVeteransFacetPanel from './ProfileVeteransFacetPanel.svelte';
  import {
    allDistances,
    allStyles,
    distanceOptions,
    filterTabs,
    scopeLabels,
    sparkCategories,
    styleOptions,
    toggleChoice
  } from '../roster-options';
  import type { RosterCharacters } from '../roster-characters.svelte';
  import type { RosterCollection } from '../roster-collection.svelte';
  import type { RosterFilters } from './roster-filters.svelte';
  import type { RosterQuery } from '../roster-query.svelte';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    filters: RosterFilters;
    view: RosterView;
    query: RosterQuery;
    picks: RosterCharacters;
    collection: RosterCollection;
    characters: Map<number, CharacterData>;
  }

  let { filters, view, query, picks, collection, characters }: Props = $props();

  function selectedInCategory(category: string): number {
    return filters.selectedFactors.filter((filter) => {
      const type = factorOptions().find((factor) => Number(factor.id) === filter.factorId)?.type;
      return category === 'white' ? ![0, 1, 5].includes(type ?? -1) : type === Number(category);
    }).length;
  }
</script>

<div class="filter-facets">
  {#if view.cardGrid}
    <section
      class="card-display"
      aria-label="Veteran card display"
    >
      <div>
        <h3>Expand on cards</h3>
        <SegmentedControl
          label="Expanded card section"
          options={[
            { value: 'skills', label: 'Skills' },
            { value: 'sparks', label: 'Sparks' },
            { value: 'compact', label: 'Neither' }
          ]}
          value={view.expandedSection}
          onchange={(value) => (view.expandedSection = value as typeof view.expandedSection)}
        />
      </div>
      <div>
        <h3>Spark source</h3>
        <SegmentedControl
          label="Spark source"
          options={[
            { value: 'family', label: 'Combined' },
            { value: 'parent', label: 'Own' },
            { value: 'p1', label: 'P1' },
            { value: 'p2', label: 'P2' }
          ]}
          value={view.sparkSource}
          onchange={(value) => (view.sparkSource = value as typeof view.sparkSource)}
        />
      </div>
    </section>
  {/if}
  <section
    class="affinity-target"
    aria-label="Affinity target"
  >
    <AffinityPicker
      targetOnly
      target={picks.target
        ? { ...picks.target, image: characterImagePath(Number(picks.target.id)) }
        : undefined}
      ontargetpick={() => picks.pickTarget()}
      ontargetclear={() => picks.selectTarget('')}
    />
    {#if picks.targetId && collection.metricError}
      <Banner
        title="Target affinity unavailable"
        tone="warning"
      >
        <Button
          variant="secondary"
          size="sm"
          onclick={() => collection.loadAffinity()}
        >
          Retry affinity
        </Button>
      </Banner>
    {/if}
  </section>
  <div class="primary-filters">
    <fieldset aria-label="Distance">
      <legend>
        <span>Distance</span>
        <button
          type="button"
          aria-label={filters.distance.length === allDistances.length
            ? 'Clear distances'
            : 'Select all distances'}
          onclick={() =>
            (filters.distance =
              filters.distance.length === allDistances.length ? [] : [...allDistances])}
        >
          {filters.distance.length === allDistances.length ? 'Clear' : 'All'}
        </button>
      </legend>
      <div class="filter-choices">
        {#each distanceOptions.filter((option) => option.value) as option}
          <button
            type="button"
            class:selected={filters.distance.includes(option.value)}
            aria-pressed={filters.distance.includes(option.value)}
            onclick={() => (filters.distance = toggleChoice(filters.distance, option.value))}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </fieldset>
    <fieldset aria-label="Running style">
      <legend>
        <span>Running style</span>
        <button
          type="button"
          aria-label={filters.style.length === allStyles.length
            ? 'Clear running styles'
            : 'Select all running styles'}
          onclick={() =>
            (filters.style = filters.style.length === allStyles.length ? [] : [...allStyles])}
        >
          {filters.style.length === allStyles.length ? 'Clear' : 'All'}
        </button>
      </legend>
      <div class="filter-choices">
        {#each styleOptions.filter((option) => option.value) as option}
          <button
            type="button"
            class:selected={filters.style.includes(option.value)}
            aria-pressed={filters.style.includes(option.value)}
            onclick={() => (filters.style = toggleChoice(filters.style, option.value))}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </fieldset>
  </div>
  <section
    class="spark-categories"
    aria-label="Inheritance sparks"
  >
    <header>
      <h3>Inheritance sparks</h3>
      {#if filters.selectedFactors.length}
        <button
          class="clear-facet"
          aria-label="Clear Sparks"
          onclick={() => filters.clearFacet('factors')}
        >
          Clear {filters.selectedFactors.length}
        </button>
      {/if}
    </header>
    <div class="spark-category-grid">
      {#each sparkCategories as category}
        {@const count = selectedInCategory(category.value)}
        <button
          class:selected={filters.factorCategory === category.value}
          aria-label={category.label}
          aria-expanded={filters.factorCategory === category.value}
          aria-controls="facet-factors"
          onclick={() => {
            const toggle = filters.factorCategory === category.value;
            filters.factorCategory = category.value;
            view.openFilter('factors', toggle);
          }}
        >
          <span
            class={'spark-category-star ' + category.tone}
            aria-hidden="true"
          >
            ★
          </span>
          {category.label}{#if count}
            <span class="category-count">{count}</span>
          {/if}
        </button>
      {/each}
    </div>
    {#if filters.selectedFactors.length || filters.factorCategory !== 'all'}
      <section
        class="inline-spark-filters"
        id="facet-factors"
        aria-label="Inheritance spark filters"
      >
        <ResourceLoadStatus {...$factorLoadingState} /><ProfileVeteranSparkMatcher
          bind:filters={filters.selectedFactors}
          bind:category={filters.factorCategory}
          {characters}
          {scopeLabels}
        />
      </section>
    {/if}
  </section>
  <h3 class="more-filters-heading">More filters</h3>
  {#each filterTabs as tab}
    <section
      class="filter-facet"
      class:expanded={!!filters.expanded[tab.id]}
    >
      <div class="facet-header">
        <button
          class="facet-heading"
          id={tab.id === 'uql' ? 'veteran-uql-trigger' : undefined}
          aria-label={tab.label}
          aria-expanded={!!filters.expanded[tab.id]}
          aria-controls={tab.id === 'uql' ? 'veteran-uql-panel' : 'facet-' + tab.id}
          onpointerenter={() => {
            if (tab.id === 'uql') void query.loadEditor();
          }}
          onfocus={() => {
            if (tab.id === 'uql') void query.loadEditor();
          }}
          onclick={() => view.openFilter(tab.id, true)}
        >
          <Icon
            name={tab.icon}
            size={16}
          />
          <strong>{tab.label}</strong>
          {#if filters.facetCount(tab.id)}
            <span class="active-count">{filters.facetCount(tab.id)}</span>
          {/if}<Icon
            name="chevron"
            size={16}
          />
        </button>
        {#if filters.facetCount(tab.id)}
          <button
            class="clear-facet"
            aria-label={'Clear ' + tab.label}
            onclick={() => filters.clearFacet(tab.id)}
          >
            Clear
          </button>
        {/if}
      </div>
      {#if filters.expanded[tab.id] && tab.id !== 'uql'}
        <ProfileVeteransFacetPanel
          {tab}
          {filters}
          {picks}
          {collection}
          {characters}
        />
      {/if}
    </section>
  {/each}
  <p class="card-filter-hint">
    <Icon
      name="info"
      size={15}
    />
    <span>Select a spark or skill on any card to add it as a filter.</span>
  </p>
</div>

<style>
  @import '../roster-active-count.css';
  @import './profile-veterans-facets.css';
</style>
