<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import type { SparkOrder } from '@/lib/inheritance/inheritance-factors';
  import type { InheritanceSearchFilters } from '@/lib/inheritance/inheritance-search';
  import { SPARK_ORDER_OPTIONS } from '../database-preferences';

  interface Props {
    filters: InheritanceSearchFilters;
    total: number;
    loading: boolean;
    error: string;
    activeCount: number;
    displayOptionsOpen: boolean;
    defaultFocus: 'all' | 'main' | 'left' | 'right';
    splitSparks: boolean;
    sparkPortraits: boolean;
    sparkOrder: SparkOrder;
    hiddenSparkFactorIds: number[];
    includeMaxFollowers: boolean;
    listMode: 'infinite' | 'paginated';
    onhidesparks: () => void;
    onsparkorderchange: (value: string) => void;
    ontogglelistmode: () => void;
    onsortchange: (value: InheritanceSearchFilters['sortBy']) => void;
  }

  let {
    filters = $bindable(),
    total,
    loading,
    error,
    activeCount,
    displayOptionsOpen = $bindable(),
    defaultFocus = $bindable(),
    splitSparks = $bindable(),
    sparkPortraits = $bindable(),
    sparkOrder,
    hiddenSparkFactorIds,
    includeMaxFollowers = $bindable(),
    listMode,
    onhidesparks,
    onsparkorderchange,
    ontogglelistmode,
    onsortchange
  }: Props = $props();
</script>

<header class="results-header">
  <div class="results-info">
    <h2>Results</h2>
    {#if !loading && !error}
      <p>
        {total.toLocaleString()} records found{#if activeCount > 0}
          <span>(filtered)</span>
        {/if}
      </p>
    {/if}
  </div>
  <div
    class="display-controls"
    class:expanded={displayOptionsOpen}
  >
    <button
      class="display-toggle"
      type="button"
      aria-label="Display options"
      aria-expanded={displayOptionsOpen}
      aria-controls="database-display-options"
      onclick={() => (displayOptionsOpen = !displayOptionsOpen)}
    >
      <Icon
        name="tune"
        size={14}
      />Display<Icon
        name="chevron"
        size={12}
      />
    </button>
    <div
      class="results-controls"
      id="database-display-options"
    >
      <div class="focus-control">
        <span>Default Focus</span>
        <div class="focus-options">
          {#each [{ id: 'all', label: 'All' }, { id: 'main', label: 'Main Parent' }, { id: 'left', label: 'Great Parent 1' }, { id: 'right', label: 'Great Parent 2' }] as item}
            <button
              class:active={defaultFocus === item.id}
              aria-pressed={defaultFocus === item.id}
              onclick={() => (defaultFocus = item.id as typeof defaultFocus)}
            >
              {#if item.id === 'all'}
                <Icon
                  name="lineage"
                  size={14}
                />
              {:else if item.id === 'main'}
                <Icon
                  name="user"
                  size={14}
                />
              {:else}
                <b>{item.id === 'left' ? '1' : '2'}</b>
              {/if}{item.label}
            </button>
          {/each}
        </div>
      </div>
      <ToggleButton
        action
        pressed={hiddenSparkFactorIds.length > 0}
        icon="eye-off"
        label="Hide Sparks"
        badge={hiddenSparkFactorIds.length ? `${hiddenSparkFactorIds.length} hidden` : undefined}
        ariaLabel={hiddenSparkFactorIds.length
          ? `Hide sparks, ${hiddenSparkFactorIds.length} currently hidden`
          : 'Choose sparks to hide'}
        onclick={onhidesparks}
      />
      <SelectField
        id="spark-display"
        label="Spark display"
        prefixIcon="lineage"
        value={splitSparks ? (sparkPortraits ? 'portraits' : 'split') : 'combined'}
        options={[
          { value: 'combined', label: 'Combined sparks' },
          { value: 'split', label: 'Split sparks' },
          { value: 'portraits', label: 'Split + portraits' }
        ]}
        onchange={(value) => {
          splitSparks = value !== 'combined';
          sparkPortraits = value === 'portraits';
        }}
      />
      <SelectField
        id="spark-order"
        label="Spark order"
        value={sparkOrder}
        options={SPARK_ORDER_OPTIONS}
        onchange={onsparkorderchange}
      />
      <ToggleButton
        pressed={includeMaxFollowers}
        icon="users"
        label="Max Followers"
        ariaLabel="Include accounts at the maximum follower limit"
        onclick={() => {
          includeMaxFollowers = !includeMaxFollowers;
          filters.maxFollowerNum = includeMaxFollowers ? 1000 : 999;
        }}
      />
      <ToggleButton
        pressed={listMode === 'infinite'}
        icon="more"
        label={listMode === 'infinite' ? 'Infinite' : 'Pages'}
        onclick={ontogglelistmode}
      />
    </div>
  </div>
  <div class="sort-control">
    <span>Sort by</span>
    <SelectField
      id="database-sort"
      label="Sort by"
      hideLabel
      value={filters.sortBy}
      options={[
        { value: 'trending', label: 'Trending' },
        { value: 'affinity_score', label: 'Affinity' },
        { value: 'win_count', label: 'G1 Wins' },
        { value: 'white_count', label: 'White Skills Amount' },
        { value: 'blue_stars_sum', label: 'Total Blue Stars' },
        { value: 'pink_stars_sum', label: 'Total Red Stars' },
        { value: 'green_stars_sum', label: 'Total Green Stars' },
        { value: 'white_stars_sum', label: 'Total White Stars' },
        { value: 'parent_rank', label: 'Score' },
        { value: 'last_updated', label: 'Newest First' }
      ]}
      onchange={(value) => onsortchange(value as InheritanceSearchFilters['sortBy'])}
    />
  </div>
</header>

<style>
  @import './database-results-toolbar.css';
</style>
