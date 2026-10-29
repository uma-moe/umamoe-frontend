<script lang="ts">
  import DatabaseActiveFilters from './filters/DatabaseActiveFilters.svelte';
  import seoPages from '@/config/seo-pages.json';
  import PageHeading from '@/layouts/PageHeading.svelte';
  import { onMount, untrack } from 'svelte';
  import { tourStepId } from '@/components/tours/tour-state';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import FilterShell from '@/components/filters/FilterShell.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import { authUser, authReady } from '@/services/auth/auth-state';
  import {
    loadFactorArtwork,
    watchFactors,
    factorLoadingState
  } from '@/lib/game-data/factors/factors';
  import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import { DatabaseGameData } from './data/database-game-data.svelte';
  import { DatabaseAffinity } from './database-affinity.svelte';
  import { filterAndSortBookmarks } from './database-local-results';
  import { DatabaseFilters } from './search/database-filters.svelte';
  import { DatabaseLayout } from './search/database-layout.svelte';
  import { DatabaseSearch } from './search/database-search.svelte';
  import DatabaseFilterGrid from './filters/DatabaseFilterGrid.svelte';
  import DatabaseFilterPresets from './filters/DatabaseFilterPresets.svelte';
  import DatabaseUqlPanel from './uql/DatabaseUqlPanel.svelte';
  import { DatabaseUqlState } from './uql/database-uql-state.svelte';
  import HiddenSparksDialog from './results/HiddenSparksDialog.svelte';
  import DatabaseResults from './results/DatabaseResults.svelte';
  import { DatabaseBookmarks } from './results/database-bookmarks.svelte';
  import { DatabaseDisplay } from './results/card/database-display.svelte';
  import { DatabaseRecordActions } from './results/card/database-record-actions';
  import DatabaseTrainerSubmit from './DatabaseTrainerSubmit.svelte';
  import DatabaseScrollShortcut from './DatabaseScrollShortcut.svelte';

  let filterStart = $state<HTMLDivElement>();
  let resultsStart = $state<HTMLDivElement>();
  let submitOpen = $state(false);
  let toasts = $state<Toast[]>([]);

  const gameData = new DatabaseGameData();
  const display = new DatabaseDisplay();
  const filters = new DatabaseFilters({
    userId: () => $authUser?.id,
    signedIn: () => Boolean($authUser),
    notify,
    onreset: () => (search.page = 1)
  });

  const layout = new DatabaseLayout(filters);
  const uql = new DatabaseUqlState({
    query: () => filters.values.uql,
    mode: () => filters.mode,
    selectedParent: () => filters.selectedParent,
    userId: () => $authUser?.id,
    signedIn: () => Boolean($authUser),
    authReady: () => $authReady,
    onsettled: () => search.schedule(true)
  });

  const search = new DatabaseSearch({
    filters,
    display,
    uql,
    touring: () => Boolean($tourStepId)
  });

  const bookmarks = new DatabaseBookmarks(() => Boolean($authUser), notify);
  const affinity = new DatabaseAffinity({
    filters,
    gameData,
    factorLoadingState: () => $factorLoadingState,
    notify
  });

  const recordActions = new DatabaseRecordActions({ filters, search, bookmarks, notify });

  const filteredBookmarks = $derived(
    filterAndSortBookmarks(
      bookmarks.records,
      filters.values,
      bookmarks.filter,
      filters.includeMaxFollowers
    )
  );

  const shortcutLoading = $derived(
    search.activeTab === 'database' ? search.loading && !search.appending : bookmarks.loading
  );

  const shortcutError = $derived(search.activeTab === 'database' ? search.error : bookmarks.error);
  const shortcutCount = $derived(
    search.activeTab === 'database' ? search.inheritance.total : filteredBookmarks.length
  );

  function notify(title: string, tone: Toast['tone'] = 'info', message?: string): void {
    const id = `${Date.now()}-${Math.random()}`;
    toasts = [...toasts, { id, title, tone, message }].slice(-4);
  }

  function chooseUqlLegacy(parent: SelectableParent): void {
    uql.rememberLegacy(parent);
    filters.chooseUqlLegacy(parent, uql.queryData?.characters ?? []);
  }

  function initialize(): void {
    search.restore();
    void gameData.loadCharacters();
    affinity.loadRaceGroups();
    void loadFactorArtwork().catch(() => notify('Factor artwork could not be loaded.', 'warning'));
    void affinity.load();
    gameData.loadDisplayData();
    search.start();
  }

  // Effects and mount hooks run in declaration order: the tour layout applies before
  // initialization, and the search triggers below run after it.
  $effect(() => {
    const step = $tourStepId;
    untrack(() => layout.prepareTour(step));
  });

  onMount(watchFactors);

  onMount(() => gameData.watchSupportUpdates());

  onMount(() => {
    void initialize();
    return () => {
      filters.dispose();
      gameData.dispose();
      uql.cancel();
      search.dispose();
    };
  });

  $effect(() => {
    if (filters.values.supportCardId) untrack(() => void gameData.loadSupports());
  });

  $effect(() => {
    JSON.stringify(filters.values);
    filters.legacyRestoreKey;
    filters.mode;
    search.page;
    search.listMode;
    search.activeTab;
    if (!search.initialized) return;
    untrack(() => search.schedule());
  });

  $effect(() => {
    if (search.initialized && filters.mode === 'uql')
      untrack(() => {
        if (!uql.queryData && !uql.queryDataError) void uql.loadQueryData();
      });
  });

  $effect(() => {
    if (search.initialized && filters.mode === 'uql' && uql.compiler)
      untrack(() => search.schedule());
  });

  $effect(() => {
    const session = String($authUser?.id ?? '');
    if (!search.initialized || !$authReady) return;
    untrack(() => search.changeSession(session));
  });

  $effect(() => {
    const key = filters.legacyRestoreKey;
    if (!search.initialized || !$authReady) return;
    if (filters.mode === 'uql') return;
    if (!key || filters.selectedParent) return;
    untrack(() => void filters.restoreParent(filters.compact.vet!));
  });
</script>

<svelte:head><title>{seoPages['/database'].title}</title></svelte:head>
<SourcePage
  routeId="database"
  title="Database"
  width="wide"
>
  <div class="inheritance-database">
    <PageHeading
      eyebrow="Inheritance"
      title="Database"
      description="Find optimal inheritance pairings and support cards for Uma Musume."
      flush
    >
      {#snippet actions()}
        <Button
          variant="secondary"
          size="sm"
          icon="add"
          onclick={() => (submitOpen = true)}
        >
          Add Trainer ID
        </Button>
      {/snippet}
    </PageHeading>
    <div
      class="content-container"
      bind:this={filterStart}
    >
      <FilterShell
        title="Filters"
        activeCount={filters.activeCount}
        modes={['Basic', 'Advanced', 'UQL']}
        mode={filters.mode}
        onmodechange={filters.setMode}
        bind:expanded={layout.filterExpanded}
        onclear={filters.clear}
      >
        {#snippet tools()}
          <DatabaseFilterPresets
            filterMode={filters.mode}
            filters={filters.values}
            compactState={filters.compact}
            bind:message={filters.presetMessage}
            onload={filters.applyPreset}
          />
        {/snippet}
        {#if filters.mode === 'uql'}
          <DatabaseUqlPanel
            bind:value={filters.values.uql}
            validation={uql.validation}
            characters={gameData.characters}
            supports={gameData.supports}
            queryData={uql.queryData}
            loading={uql.queryDataLoading}
            legacyParents={uql.legacyParents}
            onpicklegacy={() => (uql.pickerOpen = true)}
            onclear={filters.clear}
            onreload={() => {
              search.persist();
              location.reload();
            }}
          />
        {:else}
          <DatabaseFilterGrid
            bind:filters={filters.values}
            filterMode={filters.mode}
            bind:tourPanels={layout.tourPanels}
            bind:affinityOpen={layout.affinityOpen}
            bind:quickFiltersOpen={layout.quickFiltersOpen}
            bind:includeMaxFollowers={filters.includeMaxFollowers}
            characterOptions={gameData.characterOptions}
            aceOptions={affinity.aceOptions}
            charactersLoading={gameData.charactersLoading}
            charactersError={gameData.charactersError}
            supports={gameData.supports}
            supportOptions={gameData.supportOptions}
            supportsLoading={gameData.supportsLoading}
            supportsError={gameData.supportsError}
            supportsCached={gameData.supportsCached || gameData.supportsLoaded}
            veteranView={affinity.veteranView}
            sharedLegacyLabel={filters.sharedLegacyLabel}
            selectedVeteranId={filters.selectedVeteranId}
            selectedAccountId={filters.selectedParent?.trainer_id}
            onretrycharacters={gameData.loadCharacters}
            onloadsupports={(refresh) => void gameData.loadSupports(refresh)}
            onveteranchange={filters.selectVeteran}
            onchange={() => (search.page = 1)}
          />
        {/if}
      </FilterShell>

      <DatabaseActiveFilters
        bind:filters={filters.values}
        filterMode={filters.mode}
        uqlState={uql.validation.state}
        characterOptions={gameData.characterOptions}
        supportOptions={gameData.supportOptions}
        legacyName={filters.selectedVeteranId
          ? (affinity.veteranView?.name ?? 'Veteran')
          : undefined}
        sharedLegacyLabel={filters.sharedLegacyLabel}
        bind:includeMaxFollowers={filters.includeMaxFollowers}
        onclear={filters.clear}
        onclearlegacy={() => filters.selectVeteran(undefined)}
        onchange={() => (search.page = 1)}
      />

      <DatabaseResults
        {search}
        {filters}
        {display}
        {layout}
        {gameData}
        {affinity}
        {uql}
        {bookmarks}
        actions={recordActions}
        {filteredBookmarks}
        bind:element={resultsStart}
        onaddtrainer={() => (submitOpen = true)}
      />
    </div>
  </div>
  {#if display.hiddenSparksOpen}
    <HiddenSparksDialog
      bind:open={display.hiddenSparksOpen}
      selectedFactorIds={display.hiddenSparkFactorIds}
      onsave={display.saveHiddenSparks}
    />
  {/if}
  <DatabaseTrainerSubmit
    bind:open={submitOpen}
    {notify}
  />
  <ToastRegion
    {toasts}
    ondismiss={(id) => (toasts = toasts.filter((toast) => toast.id !== id))}
  />
</SourcePage>
<DatabaseScrollShortcut
  container={filterStart}
  results={resultsStart}
  filterExpanded={layout.filterExpanded}
  loading={shortcutLoading}
  error={shortcutError}
  count={shortcutCount}
/>
{#if uql.pickerOpen}
  <ParentPickerDialog
    bind:open={uql.pickerOpen}
    targetId={uql.context.targetId ?? filters.values.playerCharaId}
    selectedAccountId={filters.selectedParent?.trainer_id}
    sessionScope="database-uql"
    onselect={chooseUqlLegacy}
  />
{/if}

<style>
  @import './database-page.css';
</style>
