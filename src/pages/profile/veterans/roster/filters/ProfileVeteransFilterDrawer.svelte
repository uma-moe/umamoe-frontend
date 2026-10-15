<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { sortOptions, type CollectionSortField } from '../roster-options';
  import type { RosterFilters } from './roster-filters.svelte';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    filters: RosterFilters;
    view: RosterView;
    count: number;
    chips: Snippet;
    facets: Snippet;
  }

  let { filters, view, count, chips, facets }: Props = $props();

  const sortDirectionOptions = $derived(
    filters.sortField === 'creation_time'
      ? [
          { value: 'desc', label: 'Newest first' },
          { value: 'asc', label: 'Oldest first' }
        ]
      : [
          { value: 'desc', label: 'Highest first' },
          { value: 'asc', label: 'Lowest first' }
        ]
  );
</script>

<div class="filter-drawer">
  <Dialog
    id="veteran-filters"
    bind:open={view.filterDrawerOpen}
    title={view.drawerView === 'filters' ? 'Filter veterans' : 'Sort veterans'}
    maxWidth="600px"
    maxHeight="calc(100dvh - 24px)"
    height="calc(100dvh - 24px)"
    contentPadding="0"
    mobileContentPadding="0"
  >
    {#if view.filterDrawerOpen}
      {#if view.drawerView === 'filters'}
        {#if filters.activeCount}
          <div class="drawer-selected">{@render chips()}</div>
        {/if}
        {@render facets()}
      {:else}
        <div class="sort-drawer">
          <SelectField
            id="mobile-sort-direction"
            label="Order"
            options={sortDirectionOptions}
            bind:value={filters.sortDirection}
          />
          <div
            class="sort-choices"
            role="group"
            aria-label="Sort by"
          >
            {#each sortOptions as option}
              <button
                class:selected={filters.sortField === option.value}
                aria-pressed={filters.sortField === option.value}
                onclick={() => (filters.sortField = option.value as CollectionSortField)}
              >
                <span>{option.label}</span>
                {#if filters.sortField === option.value}
                  <Icon
                    name="check"
                    size={16}
                  />
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
    {#snippet actions()}
      <div class="drawer-actions">
        {#if view.drawerView === 'filters'}
          <Button
            variant="ghost"
            disabled={!filters.activeCount}
            onclick={() => filters.clearFilters()}
          >
            Reset all
          </Button>
        {/if}<Button onclick={() => view.showResults()}>
          Show {count.toLocaleString()} veteran{count === 1 ? '' : 's'}
        </Button>
      </div>
    {/snippet}
  </Dialog>
</div>

<style>
  .filter-drawer {
    display: contents;
  }
  .filter-drawer > :global(dialog > .dialog-panel) {
    overflow: hidden;
  }
  .filter-drawer > :global(dialog > .dialog-panel > .content) {
    scrollbar-gutter: stable;
  }
  .filter-drawer > :global(dialog > .dialog-panel > footer) {
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
  }
  .drawer-actions {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  .drawer-actions > :global(.ui-button:last-child) {
    flex: 1;
    min-height: 44px;
  }
  .drawer-selected {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .drawer-selected :global(.wrap) {
    font-size: 11px;
  }
  .sort-drawer {
    min-width: 0;
    display: grid;
    gap: 16px;
    padding: 16px;
  }
  .sort-choices {
    display: grid;
  }
  .sort-choices button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    padding: 10px 12px;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--color-text-muted);
    text-align: left;
    font-size: 13px;
    cursor: pointer;
  }
  .sort-choices button.selected {
    color: var(--accent-primary);
    background: var(--color-accent-soft);
  }
  @media (min-width: 768px) {
    .filter-drawer > :global(dialog) {
      margin: 12px 12px 12px auto;
    }
    .filter-drawer > :global(dialog > .dialog-panel) {
      border-radius: 12px;
    }
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  @media (max-width: 767px) {
    .filter-drawer > :global(dialog > .dialog-panel > header) {
      padding: 10px 12px;
    }
  }
</style>
