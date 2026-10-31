<script lang="ts">
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import type { RosterFilters } from '../filters/roster-filters.svelte';
  import type { RosterQuery } from '../roster-query.svelte';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    filters: RosterFilters;
    query: RosterQuery;
    view: RosterView;
  }

  let { filters, query, view }: Props = $props();
</script>

<section
  class="collection-uql"
  id="veteran-uql-panel"
  aria-label="Collection query editor"
  hidden={!filters.expanded.uql}
  bind:this={view.queryPanel}
>
  {#if query.error || query.editorError}
    <Banner
      title={query.error || query.editorError}
      tone="danger"
    >
      <Button onclick={() => void view.focusQuery()}>Retry</Button>
    </Banner>
  {/if}
  {#if query.Editor}
    <query.Editor
      bind:value={filters.uql}
      validation={query.draft.validation}
      characters={query.characters}
      supports={query.supports}
      queryData={query.queryData}
      loading={query.loading}
      onclear={() => {
        filters.uql = '';
        filters.appliedUql = '';
      }}
      onpicklegacy={() => view.openFilter('parents')}
    />
  {:else if !query.editorError}
    <p>Loading query editor…</p>
  {/if}
  <p class="filter-help">
    Main is the veteran, and GP1 / GP2 are P1 / P2. Ranking functions and support limit-break rules
    are unavailable.
  </p>
  <div class="query-actions">
    <small>
      {query.draft.validation.state !== 'empty' && filters.uql !== filters.appliedUql
        ? query.loading
          ? 'Loading names before applying your query…'
          : filters.appliedUql
            ? 'Showing results for your last valid query.'
            : 'Finish a valid query to filter results.'
        : 'Results update as you type, alongside your other filters.'}
    </small>
    <Button
      variant="ghost"
      size="sm"
      onclick={() => view.hideQuery()}
    >
      Hide editor
    </Button>
  </div>
</section>

<style>
  .collection-uql {
    display: grid;
    gap: 10px;
    min-width: 0;
    scroll-margin-top: calc(var(--utility-height, 60px) + 112px);
  }
  .collection-uql[hidden] {
    display: none;
  }
  .query-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .query-actions small {
    color: var(--color-text-muted);
    font-size: 11px;
  }
  .collection-uql :global(.uql-mode-panel) {
    padding: 0;
    zoom: 1;
  }
  .collection-uql :global(.cm-editor) {
    font-size: 13px;
  }
  .collection-uql :global(.cm-scroller) {
    min-height: 180px;
  }
  .collection-uql :global(.uql-editor-header) {
    flex-direction: row;
    align-items: center;
  }
  .filter-help {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.6;
  }
</style>
