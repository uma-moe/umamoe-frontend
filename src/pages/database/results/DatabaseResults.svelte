<script lang="ts">
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
  import { authUser } from '@/services/auth/auth-state';
  import { queueBorrowView } from '../borrow-interactions';
  import type { DatabaseAffinity } from '../database-affinity.svelte';
  import type { DatabaseCatalogs } from '../database-catalogs.svelte';
  import type { DatabaseFilters } from '../search/database-filters.svelte';
  import type { DatabaseLayout } from '../search/database-layout.svelte';
  import type { DatabaseSearch } from '../search/database-search.svelte';
  import type { DatabaseUqlState } from '../uql/database-uql-state.svelte';
  import type { DatabaseDisplay } from './card/database-display.svelte';
  import type { DatabaseRecordActions } from './card/database-record-actions';
  import type { DatabaseBookmarks } from './database-bookmarks.svelte';
  import DatabaseBookmarkResults from './DatabaseBookmarkResults.svelte';
  import DatabaseInheritanceResults from './DatabaseInheritanceResults.svelte';
  import DatabaseResultsToolbar from './DatabaseResultsToolbar.svelte';
  import InheritanceResultCard from './InheritanceResultCard.svelte';

  interface Props {
    search: DatabaseSearch;
    filters: DatabaseFilters;
    display: DatabaseDisplay;
    layout: DatabaseLayout;
    catalogs: DatabaseCatalogs;
    affinity: DatabaseAffinity;
    uql: DatabaseUqlState;
    bookmarks: DatabaseBookmarks;
    actions: DatabaseRecordActions;
    filteredBookmarks: InheritanceRecord[];
    element?: HTMLDivElement;
    onaddtrainer: () => void;
  }

  let {
    search,
    filters,
    display,
    layout,
    catalogs,
    affinity,
    uql,
    bookmarks,
    actions,
    filteredBookmarks,
    element = $bindable(),
    onaddtrainer
  }: Props = $props();

  async function switchTab(tab: 'database' | 'bookmarks'): Promise<void> {
    if (search.activeTab === tab) return;
    search.activeTab = tab;
    if (tab === 'bookmarks' && $authUser && !bookmarks.records.length) await bookmarks.load();
    if (tab === 'database' && search.pendingSearch) {
      search.pendingSearch = false;
      search.schedule(true);
    }
  }
</script>

{#snippet resultCard(record: InheritanceRecord)}
  <InheritanceResultCard
    {record}
    uqlHighlight={uql.highlight}
    activeFilters={filters.mode === 'uql' ? undefined : filters.values}
    characters={catalogs.characters}
    supports={catalogs.supports}
    defaultFocus={display.defaultFocus}
    splitSparks={display.splitSparks}
    sparkPortraits={display.sparkPortraits}
    sparkOrder={display.sparkOrder}
    hiddenSparkFactorIds={display.hiddenSparkFactorIds}
    affinityEngine={affinity.engine}
    raceGroups={affinity.raceGroups}
    partner={affinity.partner}
    targetId={filters.values.playerCharaId}
    bind:sparkPerRun={display.sparkPerRun}
    bind:showOccurrences={display.showOccurrences}
    bind:showP2Sparks={display.showP2Sparks}
    bind:collapsedWhiteSections={display.collapsedWhiteSections}
    partnerWinSaddles={filters.values.p2WinSaddle}
    bookmarked={bookmarks.ids.has(record.accountId)}
    actionBusy={bookmarks.busyIds.includes(record.accountId)}
    oncopy={actions.copyTrainer}
    onshare={actions.share}
    onreport={actions.report}
    onbookmark={bookmarks.toggle}
    onplanner={actions.openInPlanner}
    onvisible={queueBorrowView}
  />
{/snippet}

{#snippet resultsToolbar()}
  <DatabaseResultsToolbar
    bind:filters={filters.values}
    total={search.inheritance.total}
    loading={search.loading}
    error={search.error}
    activeCount={filters.activeCount}
    bind:displayOptionsOpen={layout.displayOptionsOpen}
    bind:defaultFocus={display.defaultFocus}
    bind:splitSparks={display.splitSparks}
    bind:sparkPortraits={display.sparkPortraits}
    sparkOrder={display.sparkOrder}
    hiddenSparkFactorIds={display.hiddenSparkFactorIds}
    bind:includeMaxFollowers={filters.includeMaxFollowers}
    listMode={search.listMode}
    onhidesparks={() => (display.hiddenSparksOpen = true)}
    onsparkorderchange={display.changeSparkOrder}
    ontogglelistmode={search.toggleListMode}
    onsortchange={filters.changeSort}
  />
{/snippet}

{#snippet affinityFailure()}
  <Banner
    title="Affinity details unavailable"
    tone="danger"
  >
    <p>{affinity.error}</p>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => void affinity.load(true)}
    >
      Retry affinity
    </Button>
  </Banner>
{/snippet}

<div
  class="database-tabs"
  bind:this={element}
>
  <Tabs
    variant="pills"
    label="Database results"
    items={[
      { id: 'database', label: 'Database', icon: 'database' },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        icon: 'veterans',
        badge: bookmarks.records.length ? String(bookmarks.records.length) : undefined
      }
    ]}
    value={search.activeTab}
    onchange={(value) => void switchTab(value as typeof search.activeTab)}
  />
  {#if search.activeTab === 'bookmarks' && $authUser}
    <span class="bookmark-limit">
      {bookmarks.records.length} / 500
    </span>
  {/if}
</div>

{#if search.activeTab === 'database'}
  <DatabaseInheritanceResults
    inheritance={search.inheritance}
    loading={search.loading}
    error={search.error}
    appending={search.appending}
    bind:page={search.page}
    listMode={search.listMode}
    canLoadMore={search.canLoadMore}
    characters={catalogs.characters}
    supports={catalogs.supports}
    sortingNotice={Boolean(
      filters.values.optionalWhite.length ||
      filters.values.optionalMainWhite.length ||
      filters.values.lineageWhite.length
    )}
    pendingSearch={search.pendingSearch}
    uqlCatalogError={filters.mode === 'uql' ? uql.catalogError : ''}
    failedLegacy={filters.mode === 'uql' ? uql.context.failedLegacy : undefined}
    legacyError={uql.legacyError}
    affinityError={affinity.error}
    toolbar={resultsToolbar}
    card={resultCard}
    {affinityFailure}
    onloadmore={search.loadMore}
    onretry={() => search.schedule(true)}
    onretrylegacy={(value) => void uql.loadLegacy(value, true)}
    {onaddtrainer}
  />
{:else}
  <DatabaseBookmarkResults
    {bookmarks}
    {filteredBookmarks}
    pageSize={search.pageSize}
    affinityError={affinity.error}
    card={resultCard}
    {affinityFailure}
  />
{/if}

<style>
  .database-tabs {
    max-width: 100%;
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .bookmark-limit {
    margin-left: 8px;
    padding: 4px 10px;
    border-left: 1px solid var(--border-primary);
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  @media (max-width: 768px) {
    .database-tabs {
      width: 100%;
    }
    .database-tabs :global(.tabs) {
      width: 100%;
    }
    .database-tabs :global(.tab) {
      flex: 1;
    }
  }
  @media (max-width: 600px) {
    .database-tabs :global([role='tab']) {
      padding-inline: 8px;
    }
    .bookmark-limit {
      display: none;
    }
  }
</style>
