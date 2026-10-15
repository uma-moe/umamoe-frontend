<script lang="ts">
  import type { VirtualRange } from '@/lib/virtual-scroll';
  import { onMount, untrack } from 'svelte';
  import { watchFactorCatalog, factorCatalogState } from '@/lib/catalog/factor-catalog';
  import SparkFilterDialog from './SparkFilterDialog.svelte';
  import {
    accountParent,
    manualParent,
    filterParents,
    parentAffinityDetails,
    parentCharacter,
    parentPickerSessions,
    type ManualParent,
    type ParentPickerState,
    type ParentFactorFilter,
    type SelectableParent
  } from '@/lib/veterans/parent-picker';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, selectWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import { mergeVeterans } from '@/lib/veterans/veteran-profile';
  import { deviceParent } from '@/lib/veterans/parent-picker';
  import {
    draftScope,
    veteranDrafts,
    veteranLibraryRevision
  } from '@/pages/veterans/veteran-library';
  import VeteranCollection from '@/pages/veterans/VeteranCollection.svelte';
  import { ParentPickerSources } from './parent-picker-sources.svelte';
  import ParentPickerFilterbar from './sections/ParentPickerFilterbar.svelte';
  import ParentPickerPartnerLookup from './sections/ParentPickerPartnerLookup.svelte';
  import ParentPickerResults from './sections/ParentPickerResults.svelte';
  import ParentPickerSparkFilters from './sections/ParentPickerSparkFilters.svelte';
  import ManualParentEditor from './ManualParentEditor.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  interface Props {
    open?: boolean;
    targetId?: number;
    selectedAccountId?: string;
    sessionScope?: string;
    onselect: (parent: SelectableParent) => void;
  }

  let {
    open = $bindable(false),
    targetId,
    selectedAccountId = '',
    sessionScope,
    onselect
  }: Props = $props();
  const id = $props.id();

  const sources = new ParentPickerSources();

  let sparkView = $state('combined');
  let pickerState = $state<ParentPickerState>({
    tab: 'veterans',
    accountId: '',
    query: '',
    sort: 'total',
    factors: []
  });

  let factorDraft = $state<ParentFactorFilter>(),
    factorEditIndex = -1;

  function editFactor(index = -1) {
    factorEditIndex = index;
    factorDraft =
      index < 0
        ? { factorId: 0, scope: 'combined', minLevel: 1, maxLevel: 9 }
        : { ...pickerState.factors[index]! };
  }

  function applyFactor(filter: ParentFactorFilter) {
    pickerState.factors =
      factorEditIndex < 0
        ? [...pickerState.factors, filter]
        : pickerState.factors.map((entry, index) => (index === factorEditIndex ? filter : entry));
    factorDraft = undefined;
  }

  let editing = $state(false);
  let editedEntry = $state<ManualParent>();

  const scope = $derived(draftScope(pickerState.accountId, $authUser?.id));
  const collection = $derived(
    mergeVeterans(
      sources.veterans[pickerState.accountId] ?? [],
      ($veteranDrafts[scope] ?? []).map((record) => deviceParent(record, pickerState.accountId))
    ).map((veteran) => accountParent(veteran, pickerState.accountId))
  );
  const current = $derived(
    pickerState.tab === 'veterans'
      ? collection
      : pickerState.tab === 'bookmarks'
        ? sources.bookmarks
        : pickerState.tab === 'manual'
          ? sources.manuals.map(manualParent)
          : sources.partners
  );

  const name = (parent: SelectableParent) =>
    `${parentCharacter(parent, sources.characters).name} ${parent.name ?? ''}`;

  const affinities = $derived(
    new Map(
      current.map((parent) => [
        parent.pickerId,
        parentAffinityDetails(parent, targetId, sources.engine, sources.groups)
      ])
    )
  );
  const scores = $derived(
    new Map(
      [...affinities].map(([id, score]) => [
        id,
        score ? score.parentOne.total + score.race.p1Left + score.race.p1Right : 0
      ])
    )
  );
  const filtered = $derived(
    filterParents(current, pickerState, name, (parent) => scores.get(parent.pickerId) ?? 0)
  );
  const loadKey = $derived(
    pickerState.tab === 'veterans' ? `account:${pickerState.accountId}` : pickerState.tab
  );
  const loading = $derived(sources.busy[loadKey]);
  const error = $derived(sources.errors[loadKey]);
  const emptyCollection = $derived(
    pickerState.tab === 'veterans' &&
      !current.length &&
      !pickerState.query &&
      !pickerState.factors.length &&
      !loading &&
      !error
  );
  const tabs = $derived([
    { id: 'veterans', label: 'Veterans', icon: 'users' as const, badge: String(collection.length) },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: 'book' as const,
      badge: String(sources.bookmarks.length)
    },
    {
      id: 'saved',
      label: 'Partner',
      icon: 'connect' as const,
      badge: sources.busy.saved ? '...' : String(sources.partners.length)
    },
    { id: 'manual', label: 'Manual', icon: 'edit' as const, badge: String(sources.manuals.length) }
  ]);

  function choose(parent: SelectableParent): void {
    onselect(parent);
    open = false;
  }

  function clearSparkFilters(): void {
    pickerState.factors = [];
    pickerState.factorOperators = {};
  }

  function clearFilters(): void {
    pickerState.query = '';
    clearSparkFilters();
  }

  onMount(watchFactorCatalog);

  onMount(() => {
    const saved = sessionScope ? parentPickerSessions.get(sessionScope) : undefined;
    pickerState = saved
      ? structuredClone(saved)
      : {
          tab: 'veterans',
          accountId: selectedAccountId,
          query: '',
          sort: targetId ? 'affinity' : 'total',
          factors: []
        };
    if (!targetId && pickerState.sort === 'affinity') pickerState.sort = 'total';
    sources.readManuals();
    void sources.loadCatalogs();
    return () => sources.dispose();
  });

  $effect(() => {
    const user = $authUser;
    untrack(() => sources.resetForUser(user));
  });

  $effect(() => {
    pickerState.accountId = $authUser ? ($activeWorkspace.accountId ?? '') : '';
  });

  $effect(() => {
    const account = pickerState.accountId;
    const revision = $veteranLibraryRevision;
    if ($authReady && $authUser && account)
      untrack(() => void sources.loadAccount(account, revision > 0));
  });

  $effect(() => {
    JSON.stringify(pickerState);
    if (sessionScope)
      parentPickerSessions.set(
        sessionScope,
        JSON.parse(
          JSON.stringify({
            ...pickerState,
            factors: pickerState.factors.filter((factor) => factor.factorId)
          })
        )
      );
  });
</script>

<div class="parent-picker">
  <Dialog
    bind:open
    title="Select Parent"
    icon="veterans"
    maxWidth="1280px"
    height="var(--parent-picker-height)"
    maxHeight="var(--parent-picker-height)"
    mobileInset="16px"
    contentPadding="0"
    mobileContentPadding="0"
  >
    {#snippet headerActions()}
      {#if $authUser && $workspaces.length > 1}
        <SegmentedControl
          label="Linked account"
          options={$workspaces.map((workspace) => ({
            value: workspace.id,
            label: workspace.kind === 'local' ? 'This device' : workspace.label
          }))}
          value={$activeWorkspace.id}
          onchange={selectWorkspace}
        />
      {/if}
    {/snippet}
    <VeteranCollection
      compact
      showAccountSwitch={false}
      empty={emptyCollection}
      onnavigate={() => (open = false)}
      onimport={() => {
        pickerState.tab = 'veterans';
      }}
    >
      {#snippet children(dropZone, chooseFile)}
        <div class="picker-layout">
          <Tabs
            items={tabs}
            bind:value={pickerState.tab}
            label="Veteran picker sections"
            variant="underline"
          />
          <ParentPickerFilterbar
            {id}
            bind:pickerState
            {targetId}
            count={filtered.length}
            {editing}
            manualLocked={!!sources.manualReadError}
            onupload={chooseFile}
            onadd={() => {
              editedEntry = undefined;
              editing = true;
            }}
          />
          <div class="picker-body">
            <ParentPickerSparkFilters
              bind:pickerState
              bind:sparkView
              onedit={editFactor}
              onclear={clearSparkFilters}
            />
            <div class="picker-results">
              {#if sources.catalogError}
                <Banner
                  tone="warning"
                  title="Some resources are unavailable"
                >
                  <p>{sources.catalogError}</p>
                  <Button
                    variant="secondary"
                    onclick={() => sources.loadCatalogs()}
                  >
                    Retry resources
                  </Button>
                </Banner>
              {/if}
              {#if pickerState.tab === 'saved'}
                <ParentPickerPartnerLookup
                  {id}
                  {sources}
                />
              {/if}
              {#if pickerState.tab === 'manual'}
                {#if sources.manualReadError || sources.manualError}
                  <Banner
                    title="Manual entries unavailable"
                    tone="danger"
                  >
                    <p>{sources.manualReadError || sources.manualError}</p>
                  </Banner>
                {/if}
                {#if editing}
                  <ManualParentEditor
                    entry={editedEntry}
                    characters={sources.characters}
                    selectableCharacters={sources.selectableCharacters}
                    {targetId}
                    engine={sources.engine}
                    oncancel={() => (editing = false)}
                    onsave={(entry) => {
                      if (
                        sources.saveManual(
                          editedEntry
                            ? sources.manuals.map((item) => (item.id === entry.id ? entry : item))
                            : [entry, ...sources.manuals]
                        )
                      )
                        editing = false;
                    }}
                  />
                {/if}
              {/if}
              <ParentPickerResults
                {sources}
                {pickerState}
                {targetId}
                {current}
                {filtered}
                {affinities}
                {loading}
                {error}
                combined={sparkView === 'combined'}
                {editing}
                {dropZone}
                onchoose={choose}
                onedit={(entry) => {
                  editedEntry = entry;
                  editing = true;
                }}
                onclear={clearFilters}
                bind:virtualRange
              />
            </div>
          </div>
        </div>
      {/snippet}
    </VeteranCollection>
  </Dialog>
</div>
{#if factorDraft}
  <SparkFilterDialog
    filter={factorDraft}
    characters={sources.characters}
    {...$factorCatalogState}
    onapply={applyFactor}
    onclose={() => (factorDraft = undefined)}
  />
{/if}

<style>
  @import './parent-picker-dialog.css';
</style>
