<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { moodOptions, sortOptions } from '../roster-options';
  import type { RosterFilters } from '../filters/roster-filters.svelte';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    filters: RosterFilters;
    view: RosterView;
    count: number;
    total: number;
  }

  let { filters, view, count, total }: Props = $props();
</script>

<div
  class="results-toolbar"
  aria-label="Browse controls"
  bind:this={view.browseToolbar}
>
  <div
    class="result-count"
    aria-live="polite"
  >
    <strong>{count.toLocaleString()}</strong>
    <span>
      {filters.activeCount ? 'of ' + total.toLocaleString() : ''} veteran{total === 1 ? '' : 's'}
    </span>
    {#if filters.activeCount}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => filters.clearFilters()}
      >
        Reset
      </Button>
    {/if}
  </div>
  {#if !view.desktopFilters.current}
    <Button
      variant="secondary"
      size="sm"
      icon="filter"
      ariaLabel="Filters"
      ariaExpanded={view.filterDrawerOpen && view.drawerView === 'filters'}
      onclick={() => view.openDrawer('filters')}
    >
      Filters{#if filters.activeCount}
        <span class="active-count">{filters.activeCount}</span>
      {/if}
    </Button>
  {/if}
  <div class="desktop-sort sort">
    <SelectField
      id="veteran-sort"
      label="Sort"
      hideLabel
      prefixIcon="sort"
      options={sortOptions}
      bind:value={filters.sortField}
    /><Button
      variant="ghost"
      size="sm"
      ariaLabel={'Sort ' +
        (filters.sortField === 'creation_time'
          ? filters.sortDirection === 'desc'
            ? 'oldest first'
            : 'newest first'
          : filters.sortDirection === 'asc'
            ? 'descending'
            : 'ascending')}
      onclick={() => (filters.sortDirection = filters.sortDirection === 'asc' ? 'desc' : 'asc')}
    >
      {filters.sortDirection === 'asc' ? '↑' : '↓'}
    </Button>
  </div>
  <span class="mobile-sort">
    <Button
      variant="secondary"
      size="sm"
      icon="sort"
      ariaLabel="Sort veterans"
      onclick={() => view.openDrawer('sort')}
    >
      Sort
    </Button>
  </span>
  <Button
    variant="ghost"
    size="sm"
    icon="tune"
    ariaLabel="Display options"
    ariaExpanded={view.displayOptions}
    onclick={() => (view.displayOptions = !view.displayOptions)}
  >
    <span class="display-label">Display</span>
  </Button>
</div>
{#if view.displayOptions}
  <section
    class="display-options"
    aria-label="Card display options"
  >
    <SelectField
      id="veteran-view"
      label="View"
      options={[
        { value: 'grid', label: 'Cards' },
        { value: 'table', label: 'Table' },
        { value: 'inheritance', label: 'Family tree' }
      ]}
      value={view.displayTab === 'inheritance' ? 'inheritance' : view.viewMode}
      onchange={(value) => {
        view.displayTab = value === 'inheritance' ? 'inheritance' : 'cards';
        if (value !== 'inheritance') view.viewMode = value as 'grid' | 'table';
      }}
    />
    {#if view.cardGrid}
      <SelectField
        id="veteran-stat-view"
        label="Stats"
        options={[
          { value: 'displayed', label: 'Displayed' },
          { value: 'base', label: 'Base stats' }
        ]}
        bind:value={view.statView}
      />
      {#if view.statView === 'base'}
        <SelectField
          id="veteran-card-mood"
          label="Mood"
          options={moodOptions}
          bind:value={view.cardMood}
        />
      {/if}
      <SelectField
        id="veteran-columns"
        label="Per row"
        options={[4, 3, 2, 1].map((count) => ({
          value: String(count),
          label: String(count)
        }))}
        value={String(view.gridColumns)}
        onchange={(value) => (view.preferredColumns = Number(value))}
      />
    {/if}
  </section>
{/if}

<style>
  @import '../roster-active-count.css';
  @import './profile-veterans-toolbar.css';
</style>
