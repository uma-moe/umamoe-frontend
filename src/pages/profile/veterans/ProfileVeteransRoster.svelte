<script lang="ts">
  import type { VirtualRange } from '@/lib/virtual-scroll';
  import { onDestroy, onMount } from 'svelte';
  import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { watchFactorCatalog, loadFactorArtwork } from '@/lib/catalog/factor-catalog';
  import { loadSkillCatalog } from '@/lib/catalog/skill-catalog';
  import { veteranDisplay, type VeteranDisplayRecord } from '@/lib/profile/profile-veterans';
  import { router } from '@/routes/router';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import FilterSection from '@/components/filters/FilterSection.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import VeteranCollection from '@/pages/veterans/VeteranCollection.svelte';
  import type { ProfileResponse, ProfileVeteran } from '../profile-repository';
  import { profileRepository } from '../profile-repository';
  import ProfileVeteranDialog from './details/ProfileVeteranDialog.svelte';
  import ProfileVeteransActiveFilters from './roster/filters/ProfileVeteransActiveFilters.svelte';
  import ProfileVeteransCharacterDialogs from './roster/ProfileVeteransCharacterDialogs.svelte';
  import ProfileVeteransFacets from './roster/filters/ProfileVeteransFacets.svelte';
  import ProfileVeteransFilterDrawer from './roster/filters/ProfileVeteransFilterDrawer.svelte';
  import ProfileVeteransQueryPanel from './roster/results/ProfileVeteransQueryPanel.svelte';
  import ProfileVeteransResults from './roster/results/ProfileVeteransResults.svelte';
  import ProfileVeteransToolbar from './roster/results/ProfileVeteransToolbar.svelte';
  import { RosterCharacters } from './roster/roster-characters.svelte';
  import { RosterCollection } from './roster/roster-collection.svelte';
  import { RosterFilters } from './roster/filters/roster-filters.svelte';
  import { allDistances, distanceOptions, sortOptions } from './roster/roster-options';
  import { RosterQuery } from './roster/roster-query.svelte';
  import { veteranLineage, veteranSearchText, veteranSummary } from './roster/roster-records';
  import { RosterView } from './roster/roster-view.svelte';

  interface Props {
    accountId: string;
    profile: Pick<ProfileResponse, 'trainer' | 'veterans'>;
    characters: Map<number, CharacterCatalogEntry>;
    isOwner: boolean;
    compact?: boolean;
    imports?: boolean;
  }

  let {
    accountId,
    profile,
    characters,
    isOwner,
    compact = false,
    imports = true
  }: Props = $props();

  const filters = new RosterFilters();
  const query = new RosterQuery(filters);
  const picks = new RosterCharacters(() => characters);
  const collection = new RosterCollection({
    trainer: () => profile.trainer,
    characters: () => characters,
    filters,
    query,
    picks
  });
  const view = new RosterView(filters, query);

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let detail = $state.raw<ProfileVeteran>(),
    detailOpen = $state(false);
  let previewPage = $state(1);
  let initialized = $state('');
  let catalogError = $state('');
  let live = true;

  const previewPages = $derived(Math.max(1, Math.ceil(collection.filtered.length / 3)));
  const currentPreviewPage = $derived(Math.min(previewPage, previewPages));
  const displayed = $derived(
    collection.filtered
      .slice(
        compact ? (currentPreviewPage - 1) * 3 : virtualRange.start,
        compact ? currentPreviewPage * 3 : virtualRange.end
      )
      .map((veteran) => veteranDisplay(veteran, characters))
  );
  const queryMatches = $derived(
    new Map(
      displayed.map(({ veteran: v }) => [
        v,
        filters.appliedUql ? query.applied.explain(collection.databaseRows.get(v)!) : []
      ])
    )
  );
  const virtualList = $derived({
    items: collection.filtered,
    searchText: findVeteranText,
    key: (veteran: ProfileVeteran) => veteran.trained_chara_id ?? veteran.id,
    active: !compact,
    onrange: (range: VirtualRange) => (virtualRange = range)
  });

  function summaryContext(veteran: ProfileVeteran) {
    return {
      characters,
      affinity: collection.affinityByVeteran.get(veteran),
      targetId: picks.targetId,
      target: picks.target
    };
  }

  function summaryOf(item: VeteranDisplayRecord) {
    return veteranSummary(item, summaryContext(item.veteran));
  }

  function lineageOf(veteran: ProfileVeteran) {
    return veteranLineage(
      veteran,
      characters,
      collection.affinityByVeteran.get(veteran)?.main ?? undefined
    );
  }

  function findVeteranText(veteran: ProfileVeteran): string {
    return veteranSearchText(veteran, summaryContext(veteran), collection.skillCatalog);
  }

  function exportCollection() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(collection.filtered, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `veterans-${accountId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function showDetail(veteran: ProfileVeteran): void {
    detail = veteran;
    detailOpen = true;
  }

  async function refreshImports(): Promise<void> {
    const target = accountId;
    try {
      const refreshed = await profileRepository.load(target, true);
      if (live && accountId === target) {
        collection.veterans = refreshed.veterans ?? [];
        filters.resetBounds(collection.veterans);
      }
    } catch {
      if (live && accountId === target)
        catalogError = 'The collection could not be refreshed. Reload to try again.';
    }
  }

  onMount(watchFactorCatalog);

  onMount(() => picks.restoreTarget());

  onMount(() => {
    void collection.loadAffinity();
  });

  onDestroy(() => {
    live = false;
    query.dispose();
    collection.dispose();
  });

  $effect(() => {
    if (view.desktopFilters.current) view.filterDrawerOpen = false;
  });

  $effect(() => query.applyDraft());

  $effect(() => {
    const next = profile.veterans ?? [];
    collection.veterans = next;
    const key = `${accountId}:${next.length}`;
    if (initialized !== key) {
      filters.resetBounds(next);
      initialized = key;
    }
  });

  $effect(() => {
    void Promise.all([loadSkillCatalog(), loadFactorArtwork()])
      .then(([catalog]) => (collection.skillCatalog = catalog))
      .catch(
        () =>
          (catalogError = 'Skill and race data could not be loaded. Reload the page to try again.')
      );
  });

  $effect(() => {
    accountId;
    profile;
    picks.targetId;
    filters.trackResultInputs();
    previewPage = 1;
  });
</script>

<div
  class="veterans-page"
  class:compact-roster={compact}
>
  {#if catalogError}
    <Banner
      title={catalogError}
      tone="warning"
    />
  {/if}
  {#if isOwner && !compact && imports}
    <VeteranCollection
      preferredAccountId={accountId}
      onimport={refreshImports}
      onaccountchange={(id) => {
        void (id
          ? router.navigate('/veterans/:accountId', { params: { accountId: id } })
          : router.navigate('/veterans'));
      }}
    />
  {/if}
  {#if collection.veterans.length === 0}
    <EmptyState
      compact
      icon="veterans"
      title="No veterans found."
      description={isOwner
        ? compact
          ? 'Open the Veterans browser to import your collection.'
          : 'Upload your trained character JSON to get started.'
        : 'This trainer has no shared veterans yet.'}
    />
  {:else}
    {#if compact}
      <div class="light-filters">
        <TextField
          id="profile-veteran-search"
          label="Search veterans"
          placeholder="Find a runner…"
          type="search"
          bind:value={filters.query}
        />
        <SelectField
          id="profile-veteran-distance"
          label="Distance"
          options={distanceOptions}
          value={filters.distance.length === 1 ? filters.distance[0] : ''}
          onchange={(value) => (filters.distance = value ? [value] : [...allDistances])}
        />
        <SelectField
          id="profile-veteran-sort"
          label="Sort"
          options={sortOptions.filter((option) =>
            [
              'total',
              'rank_score',
              'affinity',
              'name',
              'creation_time',
              'white_count',
              'white_stars_sum',
              'win_count'
            ].includes(option.value)
          )}
          bind:value={filters.sortField}
        />
      </div>
    {/if}

    {#if !compact}
      <div class="collection-header">
        <div
          class="collection-toolbar"
          aria-label="Collection search"
        >
          <TextField
            id="veteran-search"
            label="Search"
            hideLabel
            prefixIcon="search"
            type="search"
            placeholder="Search your collection…"
            bind:value={filters.query}
          />
          <Button
            variant="ghost"
            icon="download"
            ariaLabel="Export veterans"
            disabled={!collection.filtered.length}
            onclick={exportCollection}
          />
        </div>
        {#if !view.filterDrawerOpen}
          {@render activeChips()}
        {/if}
      </div>
    {/if}
    <div
      class="collection-body"
      class:with-sidebar={!compact && view.desktopFilters.current}
    >
      {#if !compact && view.desktopFilters.current}
        <aside
          class="filter-sidebar"
          aria-label="Filter veterans"
        >
          <header class="sidebar-heading">
            <h2>
              Refine collection{#if filters.activeCount}
                <span class="active-count">{filters.activeCount}</span>
              {/if}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={!filters.activeCount}
              onclick={() => filters.clearFilters()}
            >
              Reset all
            </Button>
          </header>
          {@render filterFacets()}
        </aside>
      {/if}
      <div class="collection-results">
        {#if !compact}
          <ProfileVeteransToolbar
            {filters}
            {view}
            count={collection.filtered.length}
            total={collection.veterans.length}
          />
        {/if}

        {#if !compact && (filters.expanded.uql || query.Editor)}
          <ProfileVeteransQueryPanel
            {filters}
            {query}
            {view}
          />
        {/if}
        <ProfileVeteransResults
          {accountId}
          {compact}
          {filters}
          {view}
          {picks}
          {collection}
          {displayed}
          start={virtualRange.start}
          virtual={virtualList}
          {queryMatches}
          {summaryOf}
          {lineageOf}
          ondetails={showDetail}
        />
        {#if compact && collection.filtered.length > 3}
          <div class="preview-pagination">
            <span aria-live="polite">
              Showing <strong>
                {(currentPreviewPage - 1) * 3 + 1}–{Math.min(
                  currentPreviewPage * 3,
                  collection.filtered.length
                )}
              </strong>
              of {collection.filtered.length} veterans
            </span>
            <Pagination
              page={currentPreviewPage}
              pages={previewPages}
              label="Veterans preview pages"
              onchange={(page) => (previewPage = page)}
            />
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet filterFacets()}
  <ProfileVeteransFacets
    {filters}
    {view}
    {query}
    {picks}
    {collection}
    {characters}
  />
{/snippet}

{#snippet activeChips()}
  <ProfileVeteransActiveFilters
    {filters}
    {view}
    {characters}
    skillCatalog={collection.skillCatalog}
    targetId={picks.targetId}
  />
{/snippet}

{#if !compact && !view.desktopFilters.current}
  <ProfileVeteransFilterDrawer
    {filters}
    {view}
    count={collection.filtered.length}
    chips={activeChips}
    facets={filterFacets}
  />
{/if}

{#if detail}
  <ProfileVeteranDialog
    veteran={detail}
    {accountId}
    summary={summaryOf(veteranDisplay(detail, characters))}
    skillCatalog={collection.skillCatalog}
    family={lineageOf(detail)}
    bind:open={detailOpen}
  />
{/if}
<ProfileVeteransCharacterDialogs
  {picks}
  {filters}
/>

<style>
  @import './roster/roster-active-count.css';
  @import './profile-veterans-roster.css';
</style>
