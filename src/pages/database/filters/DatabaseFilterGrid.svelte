<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { completeTourInteraction } from '@/components/tours/tour-state';
  import Icon from '@/components/Icon.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import SupportCardPicker from '@/components/pickers/SupportCardPicker.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type {
    CharacterPickerOption,
    SupportCardPickerOption
  } from '@/components/pickers/picker-types';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import { supportCardImagePath } from '@/lib/game-data/support-cards/support-cards';
  import type {
    InheritanceFilterMode,
    InheritanceSearchFilters
  } from '@/lib/inheritance/search/inheritance-search';
  import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';
  import type { GameDataEntry } from '@/lib/game-data/display-records';
  import DatabaseAffinityFilter from './DatabaseAffinityFilter.svelte';
  import DatabaseCharacterRules from './DatabaseCharacterRules.svelte';
  import DatabaseFilterGroup from './DatabaseFilterGroup.svelte';
  import DatabasePropertyFilters from './DatabasePropertyFilters.svelte';

  interface Props {
    filters: InheritanceSearchFilters;
    filterMode: InheritanceFilterMode;
    tourPanels: Record<string, boolean>;
    affinityOpen: boolean;
    quickFiltersOpen: boolean;
    includeMaxFollowers: boolean;
    characterOptions: CharacterPickerOption[];
    aceOptions: CharacterPickerOption[];
    charactersLoading: boolean;
    charactersError: string;
    supports: GameDataEntry[];
    supportOptions: SupportCardPickerOption[];
    supportsLoading: boolean;
    supportsError: string;
    supportsCached: boolean;
    veteranView?: VeteranUiRecord;
    sharedLegacyLabel?: string;
    selectedVeteranId: string;
    selectedAccountId?: string;
    onretrycharacters: () => void;
    onloadsupports: (refresh?: boolean) => void;
    onveteranchange: (parent: SelectableParent | undefined) => void;
    onchange: () => void;
  }

  let {
    filters = $bindable(),
    filterMode,
    tourPanels = $bindable(),
    affinityOpen = $bindable(),
    quickFiltersOpen = $bindable(),
    includeMaxFollowers = $bindable(),
    characterOptions,
    aceOptions,
    charactersLoading,
    charactersError,
    supports,
    supportOptions,
    supportsLoading,
    supportsError,
    supportsCached,
    veteranView,
    sharedLegacyLabel,
    selectedVeteranId,
    selectedAccountId,
    onretrycharacters,
    onloadsupports,
    onveteranchange,
    onchange
  }: Props = $props();

  const compactFilters = new MediaQuery('(max-width:900px)');

  const characterFilterCount = $derived(
    filters.mainParentIds.length +
      filters.includeParentIds.length +
      filters.excludeMainParentIds.length +
      filters.excludeParentIds.length
  );

  const supportFilterCount = $derived(
    Number(Boolean(filters.supportCardId)) + Number(Boolean(filters.minLimitBreak))
  );

  const trainerFilterCount = $derived(
    Number(Boolean(filters.trainerId)) + Number(Boolean(filters.trainerName))
  );

  const selectedSupportOption = $derived.by<SupportCardPickerOption | undefined>(() => {
    const fullOption = supportOptions.find((entry) => Number(entry.id) === filters.supportCardId);
    if (fullOption) return fullOption;
    const entry = supports.find((entry) => Number(entry.id) === filters.supportCardId);
    return entry
      ? {
          id: entry.id,
          title: entry.title,
          image: supportCardImagePath(entry.id),
          type: supportType(entry),
          rarity: supportRarity(entry)
        }
      : undefined;
  });

  function selectTarget(value: string): void {
    filters.playerCharaId = singleNumber(value);
    if (filters.playerCharaId)
      filters.mainParentIds = filters.mainParentIds.filter(
        (id) => baseId(id) !== baseId(filters.playerCharaId)
      );
    onchange();
  }

  function baseId(id: number | undefined): number | undefined {
    return id && id >= 10000 ? Math.floor(id / 100) : id;
  }

  function selectCharacterRule(
    rule: 'allow-main' | 'hide-main' | 'allow-great' | 'hide-great',
    values: string[]
  ): void {
    const keys = {
      'allow-main': 'mainParentIds',
      'hide-main': 'excludeMainParentIds',
      'allow-great': 'includeParentIds',
      'hide-great': 'excludeParentIds'
    } as const;

    const opposites = {
      'allow-main': 'excludeMainParentIds',
      'hide-main': 'mainParentIds',
      'allow-great': 'excludeParentIds',
      'hide-great': 'includeParentIds'
    } as const;

    const ids = selectedNumbers(values);
    const added = new Set(ids.filter((id) => !filters[keys[rule]].includes(id)).map(baseId));
    filters[keys[rule]] = ids;
    filters[opposites[rule]] = filters[opposites[rule]].filter((id) => !added.has(baseId(id)));
    if (rule === 'allow-main' && added.has(baseId(filters.playerCharaId)))
      filters.playerCharaId = undefined;
    if (rule === 'allow-great') {
      if (added.has(baseId(filters.parentLeftId))) filters.parentLeftId = undefined;
      if (added.has(baseId(filters.parentRightId))) filters.parentRightId = undefined;
    }

    onchange();
  }

  function supportType(
    entry: GameDataEntry
  ): 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend' {
    const type = entry.tags[0];
    switch (type) {
      case 'Speed':
      case 'Stamina':
      case 'Power':
      case 'Guts':
      case 'Wit':
        return type;
      default:
        return 'Friend';
    }
  }

  function supportRarity(entry: GameDataEntry): 'R' | 'SR' | 'SSR' {
    if (entry.tags.includes('SSR')) return 'SSR';
    if (entry.tags.includes('SR')) return 'SR';
    return 'R';
  }

  function setScalar<Key extends 'trainerId' | 'trainerName'>(
    key: Key,
    value: InheritanceSearchFilters[Key]
  ): void {
    filters[key] = value;
    onchange();
  }

  function selectedNumbers(values: string[]): number[] {
    return values.map(Number).filter(Number.isFinite);
  }

  function singleNumber(value: string): number | undefined {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : undefined;
  }

  function changeLimitBreak(value: number): void {
    filters.minLimitBreak = value;
    completeTourInteraction('filter-limit-break');
  }
</script>

{#snippet supportControls(pickerId: string, limitBreakId: string)}
  <div class="support-lb-inline">
    <SupportCardPicker
      id={pickerId}
      compact
      onclear={() => {
        filters.supportCardId = undefined;
        filters.minLimitBreak = undefined;
      }}
      label="Borrow support card"
      options={supportOptions}
      selectedOption={selectedSupportOption}
      loading={supportsLoading}
      error={supportsError}
      cached={supportsCached}
      onopen={() => onloadsupports()}
      onretry={() => onloadsupports(true)}
      value={String(filters.supportCardId ?? '')}
      maxVisible={12}
      onselect={(value) => {
        filters.supportCardId = Number(value);
        onchange();
      }}
    />
    <div class="lb-control">
      <Slider
        id={limitBreakId}
        label="Min LB"
        min={0}
        max={4}
        value={filters.minLimitBreak ?? 0}
        showTicks
        showTickLabels
        tickLabels={['LB0', 'LB1', 'LB2', 'LB3', 'MLB']}
        onchange={changeLimitBreak}
      />{#if selectedSupportOption}
        {@render supportSummary(selectedSupportOption)}
      {/if}
    </div>
  </div>
{/snippet}

{#snippet supportSummary(option: SupportCardPickerOption)}
  <div class="selected-support-copy">
    <div class="support-identity">
      <img
        class="support-rarity"
        src={`/game-assets/support-rarity/${option.rarity.toLowerCase()}.png`}
        alt={option.rarity}
      />
      <strong>{option.character || option.title}</strong>
    </div>
    <div class="support-subtitle">
      {#if option.type === 'Friend'}
        <span
          role="img"
          aria-label="Friend"
        >
          <Icon
            name="users"
            size={22}
          />
        </span>
      {:else}
        <img
          src={`/assets/images/icon/stats/${option.type.toLowerCase()}.webp`}
          alt={option.type}
          title={option.type}
        />
      {/if}
      <small>
        {option.character && option.title !== option.character ? option.title : option.type}
      </small>
    </div>
  </div>
{/snippet}

{#snippet characterFilters()}
  <section class="quick-section legacy-quick">
    <DatabaseCharacterRules
      options={characterOptions}
      loading={charactersLoading}
      error={charactersError}
      onretry={onretrycharacters}
      allowMain={filters.mainParentIds.map(String)}
      hideMain={filters.excludeMainParentIds.map(String)}
      allowGreat={filters.includeParentIds.map(String)}
      hideGreat={filters.excludeParentIds.map(String)}
      onchange={selectCharacterRule}
    />
  </section>
{/snippet}

{#snippet supportFilters()}
  <section class="quick-section support-quick">
    {#if !compactFilters.current}
      <h3>Support Card &amp; LB</h3>
    {/if}
    {@render supportControls('advanced-support-card', 'support-limit-break-advanced')}
  </section>
{/snippet}

{#snippet trainerFilters()}
  <section class="quick-section search-quick">
    {#if !compactFilters.current}
      <h3>Search users</h3>
    {/if}
    <div class="field-grid">
      <TextField
        id="trainer-id"
        label="Trainer ID"
        placeholder="123 456 789"
        value={filters.trainerId ?? ''}
        oninput={(event) => setScalar('trainerId', (event.currentTarget as HTMLInputElement).value)}
      /><TextField
        id="trainer-name"
        label="Username"
        type="search"
        placeholder="Trainer Name"
        value={filters.trainerName ?? ''}
        oninput={(event) =>
          setScalar('trainerName', (event.currentTarget as HTMLInputElement).value)}
      />
    </div>
  </section>
{/snippet}

<div class="filter-grid">
  <div
    class="context-filters"
    class:advanced={filterMode === 'advanced'}
  >
    <div class="affinity-context">
      <DatabaseFilterGroup
        id="affinity"
        bind:open={affinityOpen}
        title="Affinity"
        count={[filters.playerCharaId, selectedVeteranId || sharedLegacyLabel].filter(Boolean)
          .length}
      >
        <DatabaseAffinityFilter
          characters={aceOptions}
          loading={charactersLoading}
          error={charactersError}
          onretry={onretrycharacters}
          targetId={String(filters.playerCharaId ?? '')}
          veteran={veteranView}
          {sharedLegacyLabel}
          {selectedAccountId}
          ontargetchange={selectTarget}
          {onveteranchange}
        />
      </DatabaseFilterGroup>
    </div>

    {#if filterMode === 'advanced'}
      <div class="quick-context">
        {#if compactFilters.current}
          <DatabaseFilterGroup
            id="characters"
            title="Include / Exclude Umas"
            bind:open={tourPanels.characters}
            count={characterFilterCount}
          >
            {@render characterFilters()}
          </DatabaseFilterGroup>
          <DatabaseFilterGroup
            id="support"
            title="Support Card & LB"
            bind:open={tourPanels.support}
            count={supportFilterCount}
          >
            {@render supportFilters()}
          </DatabaseFilterGroup>
          <DatabaseFilterGroup
            id="search"
            title="Search Users"
            bind:open={tourPanels.search}
            count={trainerFilterCount}
          >
            {@render trainerFilters()}
          </DatabaseFilterGroup>
        {:else}
          <DatabaseFilterGroup
            id="quick"
            title="Include / Exclude Umas - Support Cards - Search"
            bind:open={quickFiltersOpen}
            count={characterFilterCount + supportFilterCount + trainerFilterCount}
          >
            <div class="advanced-quick-grid">
              {@render characterFilters()}
              {@render supportFilters()}
              {@render trainerFilters()}
            </div>
          </DatabaseFilterGroup>
        {/if}
      </div>
    {/if}
  </div>

  <DatabasePropertyFilters
    {filterMode}
    bind:filters
    bind:tourPanels
    bind:includeMaxFollowers
    {onchange}
  >
    {#snippet supportFilter()}
      {@render supportControls('basic-support-card', 'support-limit-break')}
    {/snippet}
  </DatabasePropertyFilters>
</div>

<style>
  @import './database-filter-grid.css';
</style>
