<script lang="ts">
  import DatabasePropertyFilters from './filters/DatabasePropertyFilters.svelte';
  import DatabaseActiveFilters from './filters/DatabaseActiveFilters.svelte';
  import seoPages from '@/config/seo-pages.json';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { inheritanceFactors } from '@/lib/inheritance/inheritance-factors';
  import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
  import { scenarios } from '@/lib/catalog/scenario-catalog';
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import PageHeading from '@/layouts/PageHeading.svelte';
  import { copyText } from '@/lib/clipboard';
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { tourStepId, completeTourInteraction } from '@/components/tours/tour-state';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import FilterPresetMenu, {
    type FilterPreset
  } from '@/components/filters/FilterPresetMenu.svelte';
  import FilterShell from '@/components/filters/FilterShell.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import SupportCardPicker from '@/components/pickers/SupportCardPicker.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import { authUser, authReady } from '@/services/auth/auth-state';
  import { HttpError } from '@/services/http/http-client';
  import { withPageRequest } from '@/services/http/page-request';
  import { DISCORD_SUPPORT_URL } from '@/services/site-links';
  import {
    loadFactorArtwork,
    watchFactorCatalog,
    factorCatalogState
  } from '@/lib/catalog/factor-catalog';
  import {
    characterImagePath,
    loadReleasedCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import {
    loadLiveSupportCards,
    readCachedSupportCards,
    supportCardImagePath,
    type SupportCardCatalogEntry
  } from '@/lib/catalog/support-card-catalog';
  import { resourceRepository } from '@/lib/catalog/resource-repository';
  import {
    releasedSupportCards,
    supportCardDisplay,
    supportTypeName
  } from '@/lib/supports/support-card';
  import type { SupportCardPickerOption } from '@/components/pickers/picker-types';
  import {
    accountParent,
    parentCharacter,
    parentAffinity,
    parentAffinityDetails,
    manualParent,
    parseManualParents,
    MANUAL_PARENTS_KEY,
    type SelectableParent
  } from '@/lib/veterans/parent-picker';
  import { normalizeVeteranRecord } from '@/lib/veterans/veteran-normalizer';
  import { authRepository } from '@/services/auth/auth-repository';
  import { profileRepository } from '@/pages/profile/profile-repository';
  import {
    activeInheritanceFilterCount,
    emptyInheritanceFilters,
    inheritanceRequestFilters,
    type InheritanceFilterMode,
    type InheritanceSearchFilters,
    type InheritanceSearchResult
  } from '@/lib/inheritance/inheritance-search';
  import { validateInheritanceUql, type UqlValidation } from '@/lib/inheritance/uql/uql';
  import { buildUqlSparkHighlight } from '@/lib/inheritance/uql/uql-spark-highlight';
  import type { SparkOrder } from '@/lib/inheritance/inheritance-factors';
  import { UqlCompiler, type UqlQueryCatalog } from '@/lib/inheritance/uql/uql-compiler';
  import {
    parseUqlContext,
    resolveUqlTarget,
    resolveUqlLegacy,
    uqlLegacyHints,
    setUqlLegacy,
    type UqlContextIssue
  } from '@/lib/inheritance/uql/uql-context';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import { deviceVeteranParents } from '@/pages/veterans/veteran-library';
  import { loadCatalog, type CatalogEntry } from './catalog-repository';
  import { inheritanceRepository } from './inheritance-repository';
  import { automaticInheritanceSort, filterAndSortBookmarks } from './database-local-results';
  import { borrowContext, queueBorrowView, trackBorrowCopy } from './borrow-interactions';
  import { veteranToUi } from '@/pages/veterans/veteran-adapter';
  import DatabaseAffinityFilter from './filters/DatabaseAffinityFilter.svelte';
  import DatabaseCharacterRules from './filters/DatabaseCharacterRules.svelte';
  import DatabaseFilterGroup from './filters/DatabaseFilterGroup.svelte';
  import InheritanceResultCard from './results/InheritanceResultCard.svelte';
  import HiddenSparksDialog from './results/HiddenSparksDialog.svelte';
  import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import { veteranAffinityRepository } from '@/lib/veterans/affinity-repository';
  import { loadG1SaddleGroups } from '@/lib/catalog/race-catalog';
  import {
    DATABASE_FILTER_PRESETS_KEY,
    DATABASE_HIDDEN_SPARKS_KEY,
    DATABASE_LIST_MODE_KEY,
    DATABASE_SPARK_ORDER_KEY,
    compactStateFromFilters,
    databasePresetFilterCount,
    decodeDatabaseFilterState,
    encodeDatabaseFilterState,
    exportDatabasePresets,
    filtersFromCompactState,
    importDatabasePresets,
    readDatabasePreferences,
    readDatabasePresets,
    writeDatabasePreferences,
    writeDatabasePresets,
    type CompactDatabaseFilterState,
    type SavedDatabaseFilterPreset,
    type SavedDatabaseFilterState
  } from './database-preferences';

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  function findRecordText(record: InheritanceRecord): string {
    const names = [record.mainParentId, record.leftParentId, record.rightParentId].map(
      (id) =>
        (
          characters.find((entry) => Number(entry.id) === id) ??
          characters.find(
            (entry) =>
              Math.floor(Number(entry.id) / 100) === id ||
              Math.floor(Number(entry.id) / 100) === Math.floor(id / 100)
          )
        )?.title
    );
    return [
      record.trainerName || 'Unknown Trainer',
      record.accountId,
      record.accountId.replace(/(\d{3})(?=\d)/g, '$1 '),
      ...names,
      supports.find((entry) => Number(entry.id) === record.supportCardId)?.title,
      scenarios.find((scenario) => scenario.id === record.scenarioId)?.label,
      record.rankScore,
      record.rankScore.toLocaleString(),
      ...inheritanceFactors(record).map((factor) => factor.name)
    ].join(' ');
  }

  const lowEndDevice =
    typeof navigator !== 'undefined' &&
    (((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4 ||
      navigator.hardwareConcurrency <= 4);
  const pageSize = lowEndDevice ? 8 : 12;

  let filterMode = $state<InheritanceFilterMode>('basic');
  let filterExpanded = $state(false);

  let filterStart: HTMLDivElement;
  let resultsStart: HTMLDivElement;

  let scrollShortcut = $state<'' | 'results' | 'top'>('');

  function trackScrollShortcut(node: HTMLElement) {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!resultsStart) return;
      scrollShortcut =
        filterExpanded && resultsStart.getBoundingClientRect().top > window.innerHeight
          ? 'results'
          : node.getBoundingClientRect().top < -200
            ? 'top'
            : '';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return {
      destroy() {
        observer.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
      }
    };
  }

  function useScrollShortcut(): void {
    (scrollShortcut === 'results' ? resultsStart : filterStart).scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  let displayOptionsOpen = $state(false);

  const compactFilters = new MediaQuery('(max-width:900px)');

  let tourPanels = $state<Record<string, boolean>>({
    inheritance: innerWidth > 600,
    main: innerWidth > 600,
    general: innerWidth > 600,
    total: innerWidth > 600,
    races: innerWidth > 600,
    characters: false,
    support: false,
    search: false
  });
  let affinityOpen = $state(true);

  let beforeTour:
    | {
        mode: InheritanceFilterMode;
        expanded: boolean;
        display: boolean;
        affinity: boolean;
        quick: boolean;
        panels: Record<string, boolean>;
      }
    | undefined;

  function prepareTour(step: string): void {
    if (!step) {
      if (beforeTour) {
        filterMode = beforeTour.mode;
        filterExpanded = beforeTour.expanded;
        displayOptionsOpen = beforeTour.display;
        affinityOpen = beforeTour.affinity;
        quickFiltersOpen = beforeTour.quick;
        tourPanels = beforeTour.panels;
        beforeTour = undefined;
      }
      return;
    }
    const displayStep = [
      'database-focus-controls',
      'database-hide-sparks',
      'database-split-sparks',
      'database-list-mode'
    ].includes(step);
    if (!step.startsWith('filter-') && !displayStep) return;
    beforeTour ??= {
      mode: filterMode,
      expanded: filterExpanded,
      display: displayOptionsOpen,
      affinity: affinityOpen,
      quick: quickFiltersOpen,
      panels: { ...tourPanels }
    };
    if (displayStep) {
      displayOptionsOpen = true;
      return;
    }
    filterExpanded = true;
    if (['filter-open', 'filter-modes', 'filter-presets'].includes(step)) return;
    filterMode = [
      'filter-include-exclude',
      'filter-trainer-search',
      'filter-main-parent-factors',
      'filter-preferred-white',
      'filter-lineage-white',
      'filter-race-schedule'
    ].includes(step)
      ? 'advanced'
      : 'basic';
    affinityOpen = true;
    if (step === 'filter-include-exclude' || step === 'filter-trainer-search')
      quickFiltersOpen = true;
    if (step === 'filter-include-exclude') tourPanels.characters = true;
    if (step === 'filter-trainer-search') tourPanels.search = true;
    const panel =
      step === 'filter-main-parent-factors'
        ? 'main'
        : step === 'filter-race-schedule'
          ? 'races'
          : step === 'filter-support-card' || step === 'filter-limit-break'
            ? 'general'
            : 'inheritance';
    tourPanels[panel] = true;
  }

  $effect(() => {
    const step = $tourStepId;
    untrack(() => prepareTour(step));
  });

  function changeLimitBreak(value: number): void {
    filters.minLimitBreak = value;
    completeTourInteraction('filter-limit-break');
  }

  let activeTab = $state<'database' | 'bookmarks'>('database');
  let pendingSearch = $state(false);

  let sortSelectionMode: 'auto' | 'manual' = 'auto';

  let defaultFocus = $state<'all' | 'main' | 'left' | 'right'>('all');
  let splitSparks = $state(false);
  let sparkPortraits = $state(false);
  let sparkOrder = $state<SparkOrder>('main');

  const sparkOrderOptions: { value: SparkOrder; label: string }[] = [
    { value: 'main', label: 'Main parent first' },
    { value: 'stars', label: 'Most stars' },
    { value: 'occurrences', label: 'Most occurrences' },
    { value: 'alphabetical', label: 'Alphabetical' }
  ];

  let includeMaxFollowers = $state(false);
  let listMode = $state<'infinite' | 'paginated'>(lowEndDevice ? 'paginated' : 'infinite');
  let hiddenSparksOpen = $state(false);
  let hiddenSparkFactorIds = $state<number[]>([]);
  let filters = $state<InheritanceSearchFilters>(emptyInheritanceFilters());
  let inheritance = $state.raw<InheritanceSearchResult>({
    records: [],
    total: 0,
    page: 0,
    pageSize,
    totalPages: 0
  });
  let inheritanceLoading = $state(false);
  let inheritanceError = $state('');
  let page = $state(1);

  const appendingResults = $derived(
    listMode === 'infinite' && page > 1 && inheritance.records.length > 0
  );

  let presets = $state<SavedDatabaseFilterPreset[]>([]);
  let savedState = $state<SavedDatabaseFilterState | null>(null);
  let compactState = $state<CompactDatabaseFilterState>({});
  let presetDraft = $state('');
  let presetMessage = $state('');
  let characters = $state.raw<CatalogEntry[]>([]);
  let selectableCharacters = $state.raw<CharacterCatalogEntry[]>([]);
  let charactersLoading = $state(false);
  let charactersError = $state('');
  let supports = $state.raw<CatalogEntry[]>([]);
  let selectableSupports = $state.raw<SupportCardCatalogEntry[]>([]);
  let supportsLoading = $state(false);
  let supportsLoaded = $state(false);
  let supportsCached = $state(false);
  let supportsError = $state('');

  let disposed = false;

  let uqlCatalog = $state.raw<UqlQueryCatalog | null>(null);
  let uqlCatalogLoading = $state(false);
  let uqlCatalogError = $state('');

  const uqlCompiler = $derived(uqlCatalog ? new UqlCompiler(uqlCatalog) : undefined);

  let searchController: AbortController | undefined;

  let cancelSearchTimer = $state<(() => void) | undefined>();

  let lastFilterSignature = '';

  let initialized = $state(false);

  const canLoadMore = $derived(
    initialized &&
      activeTab === 'database' &&
      listMode === 'infinite' &&
      !cancelSearchTimer &&
      !inheritanceLoading &&
      !inheritanceError &&
      page === inheritance.page + 1 &&
      page < inheritance.totalPages
  );

  function loadMoreResults(): void {
    if (canLoadMore) page += 1;
  }

  let submitOpen = $state(false);
  let trainerSubmission = $state('');
  let submissionBusy = $state(false);
  let submissionTouched = $state(false);
  let bookmarks = $state.raw<InheritanceSearchResult['records']>([]);
  let bookmarksLoading = $state(false);
  let bookmarksError = $state('');
  let bookmarkFilter = $state<'all' | 'unchanged' | 'modified'>('all');
  let bookmarkPage = $state(1);
  let bookmarkBusyIds = $state<string[]>([]);
  let clearBookmarksArmed = $state(false);
  let toasts = $state<Toast[]>([]);
  let selectedParent = $state.raw<SelectableParent>();

  const legacyRestoreKey = $derived(JSON.stringify(compactState.vet));

  let uqlParents = $state.raw<SelectableParent[]>([]);

  const uqlLegacyParents = $derived(
    selectedParent &&
      !uqlParents.some(
        (parent) => parent.pickerId === selectedParent?.pickerId && parent.id === selectedParent?.id
      )
      ? [
          selectedParent,
          ...uqlParents.filter((parent) => parent.pickerId !== selectedParent?.pickerId)
        ]
      : uqlParents
  );

  let uqlLegacyLoading = $state(false);
  let uqlLegacyError = $state('');
  let uqlLegacyScope = $state('');

  let uqlLegacyGeneration = 0;
  let uqlSession: string | undefined;

  let uqlLegacyPickerOpen = $state(false);

  let dismissedUqlPickerQuery = '';
  let appliedUqlTarget = false;
  let appliedUqlLegacy = false;

  const uqlQuery = $derived(parseUqlContext(filters.uql ?? ''));
  const uqlContext = $derived.by<{
    targetId?: number;
    legacy?: SelectableParent;
    pendingLegacy?: string;
    failedLegacy?: string;
    issue?: UqlContextIssue;
  }>(() => {
    if (uqlQuery.issue) return { issue: uqlQuery.issue };
    let targetId: number | undefined;
    let legacy: SelectableParent | undefined;
    for (const directive of uqlQuery.directives) {
      if (directive.kind === 'target') {
        const resolution = resolveUqlTarget(directive.value, uqlCatalog?.characters ?? []);
        if (!resolution.match)
          return {
            issue: {
              state: resolution.partial ? 'incomplete' : 'invalid',
              message: resolution.partial
                ? 'Choose a target from autocomplete'
                : `Unknown target: ${directive.value}`
            }
          };
        targetId = Number(resolution.match.id);
      } else {
        const resolution = resolveUqlLegacy(
          directive.value,
          [...(selectedParent ? [selectedParent] : []), ...uqlParents],
          uqlCatalog?.characters ?? []
        );
        if (!resolution.match) {
          if (uqlLegacyScope !== legacyScope(directive.value) || uqlLegacyLoading)
            return {
              pendingLegacy: directive.value,
              issue: { state: 'incomplete', message: 'Loading legacy…' }
            };
          if (uqlLegacyError)
            return {
              failedLegacy: directive.value,
              issue: { state: 'invalid', message: uqlLegacyError }
            };
          return {
            issue: {
              state: resolution.partial ? 'incomplete' : 'invalid',
              message: resolution.partial
                ? 'Choose a legacy from autocomplete'
                : `Unknown legacy: ${directive.value}`
            }
          };
        }
        legacy = resolution.match;
      }
    }
    return { targetId, legacy };
  });
  const selectedVeteranId = $derived(selectedParent?.pickerId ?? '');

  let sparkPerRun = $state(false);
  let showOccurrences = $state(false);
  let showP2Sparks = $state(false);
  let collapsedWhiteSections = $state<number[]>([]);
  let affinityEngine = $state<VeteranAffinityEngine>();
  let affinityError = $state('');
  let raceGroups = $state.raw(new Map<number, number>());

  const partner = $derived.by(() => {
    if (selectedParent) {
      const { cardId } = parentCharacter(
        selectedParent,
        new Map(selectableCharacters.map((character) => [Number(character.id), character]))
      );
      return cardId ? normalizeVeteranRecord({ ...selectedParent, card_id: cardId }) : undefined;
    }
    if (!filters.p2MainCharaId) return undefined;
    return normalizeVeteranRecord({
      card_id: filters.p2MainCharaId >= 10000 ? filters.p2MainCharaId : filters.p2MainCharaId * 100,
      win_saddle_id_array: filters.p2WinSaddle
    });
  });
  const sharedLegacyLabel = $derived(
    !selectedParent && (filters.p2MainCharaId || filters.p2WinSaddle.length)
      ? compactState.p2i != null
        ? `Shared legacy #${compactState.p2i}`
        : 'Shared legacy context'
      : undefined
  );
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

  let quickFiltersOpen = $state(typeof window === 'undefined' ? true : window.innerWidth > 600);

  const activeCount = $derived(activeInheritanceFilterCount(filters));
  const uqlValidation = $derived.by<UqlValidation>(() => {
    if (filterMode === 'uql' && !uqlCatalog)
      return {
        state: 'incomplete',
        message: uqlCatalogError || 'Loading query names…',
        compiled: '',
        explicitFollowerFilter: false
      };
    if (filterMode === 'uql' && uqlContext.issue)
      return { ...uqlContext.issue, compiled: '', explicitFollowerFilter: false };
    const validation = validateInheritanceUql(
      filterMode === 'uql' ? uqlQuery.predicate : (filters.uql ?? ''),
      uqlCompiler
    );
    return validation.state === 'empty' && uqlQuery.directives.length
      ? { ...validation, state: 'valid', message: 'Ready' }
      : validation;
  });
  const uqlHighlight = $derived(
    filterMode === 'uql' && uqlValidation.state === 'valid'
      ? buildUqlSparkHighlight(uqlValidation.compiled)
      : undefined
  );
  const characterOptions = $derived(
    selectableCharacters.map((entry) => ({
      id: entry.id,
      name: entry.name,
      subtitle: entry.subtitle,
      image: characterImagePath(Number(entry.id))
    }))
  );
  const aceOptions = $derived(
    selectedParent && affinityEngine
      ? characterOptions.map((option) => ({
          ...option,
          affinity: parentAffinity(selectedParent!, Number(option.id), affinityEngine, raceGroups)
        }))
      : characterOptions
  );
  const supportOptions = $derived<SupportCardPickerOption[]>(
    releasedSupportCards(selectableSupports).map((entry) => ({
      id: entry.id,
      ...supportCardDisplay(entry),
      image: supportCardImagePath(entry.id),
      type: supportTypeName(entry.type),
      rarity: entry.rarity === 3 ? 'SSR' : entry.rarity === 2 ? 'SR' : 'R'
    }))
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
  const presetViews = $derived<FilterPreset[]>(
    presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      mode: preset.mode,
      activeCount: databasePresetFilterCount(preset)
    }))
  );
  const bookmarkedIds = $derived(new Set(bookmarks.map((record) => record.accountId)));
  const modifiedBookmarkCount = $derived(bookmarks.filter((record) => record.isStale).length);
  const filteredBookmarks = $derived(
    filterAndSortBookmarks(bookmarks, filters, bookmarkFilter, includeMaxFollowers)
  );
  const bookmarkPages = $derived(Math.max(1, Math.ceil(filteredBookmarks.length / pageSize)));
  const visibleBookmarks = $derived(
    filteredBookmarks.slice((bookmarkPage - 1) * pageSize, bookmarkPage * pageSize)
  );
  const shortcutLoading = $derived(
    activeTab === 'database' ? inheritanceLoading && !appendingResults : bookmarksLoading
  );
  const shortcutError = $derived(activeTab === 'database' ? inheritanceError : bookmarksError);
  const shortcutCount = $derived(
    activeTab === 'database' ? inheritance.total : filteredBookmarks.length
  );
  const trainerDigits = $derived(trainerSubmission.replace(/\D/g, '').slice(0, 12));
  const veteranView = $derived.by(() => {
    $factorCatalogState;
    if (!selectedParent || !partner) return undefined;
    const view = veteranToUi(
      { ...partner, name: '' },
      selectedParent.trainer_id ?? '',
      new Map(characters.map((character) => [Number(character.id), { name: character.title }]))
    );
    const score = parentAffinityDetails(
      selectedParent,
      filters.playerCharaId,
      affinityEngine,
      raceGroups
    );
    view.detail = undefined;
    view.affinity = score ? score.parentOne.total + score.race.p1Left + score.race.p1Right : NaN;
    for (const parent of view.parents ?? [])
      parent.affinity = !score
        ? NaN
        : parent.position === 'P1'
          ? score.parentOne.left + score.race.p1Left
          : score.parentOne.right + score.race.p1Right;
    return view;
  });

  function selectTarget(value: string): void {
    filters.playerCharaId = singleNumber(value);
    if (filters.playerCharaId)
      filters.mainParentIds = filters.mainParentIds.filter(
        (id) => baseId(id) !== baseId(filters.playerCharaId)
      );
    page = 1;
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
    page = 1;
  }

  function supportType(
    entry: CatalogEntry
  ): 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend' {
    const type = entry.tags[0];
    return (
      ['Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend'].includes(type ?? '') ? type : 'Friend'
    ) as 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend';
  }

  function supportRarity(entry: CatalogEntry): 'R' | 'SR' | 'SSR' {
    return entry.tags.includes('SSR') ? 'SSR' : entry.tags.includes('SR') ? 'SR' : 'R';
  }

  function setScalar(
    key: 'minWinCount' | 'minWhiteCount' | 'minParentRank' | 'trainerId' | 'trainerName',
    value: number | string | undefined
  ): void {
    (filters as unknown as Record<string, unknown>)[key] = value;
    page = 1;
  }

  function selectedNumbers(values: string[]): number[] {
    return values.map(Number).filter(Number.isFinite);
  }

  function singleNumber(value: string): number | undefined {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : undefined;
  }

  function setFilterMode(value: string): void {
    if (value !== 'basic' && value !== 'advanced' && value !== 'uql') return;
    if (value === 'uql' && filters.uql === undefined) filters.uql = '';
    filterMode = value;
  }

  function selectVeteran(parent: SelectableParent | undefined): void {
    selectedParent = parent;
    const characterId = parent?.card_id ?? parent?.trained_chara_id;
    filters.p2MainCharaId = characterId
      ? characterId >= 10000
        ? Math.floor(characterId / 100)
        : characterId
      : undefined;
    filters.p2WinSaddle = parent?.win_saddle_id_array ?? [];
    delete compactState.vet;
    delete compactState.p2i;
    if (parent?.share_source === 'veteran') {
      if (typeof parent.id === 'string' && parent.id) compactState.vet = parent.id;
      else if (parent.trainer_id && parent.member_id != null)
        compactState.vet = [parent.trainer_id, parent.member_id];
    }
    if (parent?.share_source === 'manual' && parent.share_local_id)
      compactState.vet = `manual:${parent.share_local_id}`;
    if (parent?.share_source === 'bookmark') compactState.p2i = parent.share_inheritance_id;
    page = 1;
  }

  async function restoreParent(
    reference: NonNullable<CompactDatabaseFilterState['vet']>
  ): Promise<void> {
    const key = JSON.stringify(reference);
    const session = $authUser?.id;
    const current = () =>
      !disposed && $authUser?.id === session && JSON.stringify(compactState.vet) === key;
    try {
      let parent: SelectableParent | undefined;
      if (typeof reference === 'string') {
        if (reference.startsWith('device-'))
          parent = (await deviceVeteranParents()).find((parent) => parent.id === reference);
        else if (reference.startsWith('manual:')) {
          const entry = parseManualParents(localStorage.getItem(MANUAL_PARENTS_KEY)).find(
            (entry) => `manual:${entry.id}` === reference
          );
          if (entry) parent = manualParent(entry);
        } else {
          const veteran = await profileRepository.veteran(reference, true);
          if (veteran?.id === reference) parent = accountParent(veteran, veteran.trainer_id ?? '');
        }
      } else if (
        $authUser &&
        Array.isArray(reference) &&
        typeof reference[0] === 'string' &&
        Number.isSafeInteger(reference[1])
      ) {
        const [accountId, memberId] = reference;
        const accounts = await authRepository.linkedAccounts();
        if (
          accounts.some(
            (account) =>
              account.account_id === accountId && account.verification_status === 'verified'
          )
        ) {
          const veteran = (await profileRepository.load(accountId, true)).veterans?.find(
            (item) => item.member_id === memberId
          );
          if (veteran) parent = accountParent(veteran, accountId);
        }
      }
      if (current()) selectVeteran(parent);
    } catch {
      if (current()) {
        selectVeteran(undefined);
        notify('Saved legacy is unavailable. Select another veteran.', 'warning');
      }
    }
  }

  function legacyScope(value: string): string {
    const hint = uqlLegacyHints(value);
    return hint.uuid
      ? `uuid:${hint.uuid}`
      : hint.accountId
        ? `account:${hint.accountId}`
        : `accounts:${$authUser?.id ?? ''}`;
  }

  async function loadUqlLegacy(value: string, refresh = false): Promise<void> {
    const scope = legacyScope(value);
    if ((!refresh && scope === uqlLegacyScope) || !$authReady) return;
    const generation = ++uqlLegacyGeneration;
    uqlLegacyScope = scope;
    uqlLegacyLoading = true;
    uqlLegacyError = '';
    try {
      const hint = uqlLegacyHints(value);
      let parents: SelectableParent[];
      if (hint.uuid?.startsWith('device-')) {
        parents = await deviceVeteranParents();
        if (!parents.some((parent) => parent.id === hint.uuid))
          throw new Error(
            'This veteran is stored on another device. Import its JSON here to use it.'
          );
      } else if (hint.uuid) {
        const veteran = await profileRepository.veteran(hint.uuid, refresh);
        parents = [accountParent(veteran, veteran.trainer_id ?? '')];
      } else {
        const accountIds = hint.accountId
          ? [hint.accountId]
          : $authUser
            ? (await authRepository.linkedAccounts())
                .filter((account) => account.verification_status === 'verified')
                .map((account) => account.account_id)
            : [];
        parents = [
          ...(await deviceVeteranParents()),
          ...(
            await Promise.all(
              accountIds.map(
                async (accountId) =>
                  (await profileRepository.load(accountId, refresh)).veterans?.map((veteran) =>
                    accountParent(veteran, accountId)
                  ) ?? []
              )
            )
          ).flat()
        ];
      }
      if (generation === uqlLegacyGeneration)
        uqlParents = [
          ...new Map(
            [...uqlParents, ...parents].map((parent) => [
              JSON.stringify([parent.pickerId, parent.id]),
              parent
            ])
          ).values()
        ];
    } catch (reason) {
      if (generation === uqlLegacyGeneration)
        uqlLegacyError =
          `Legacy could not be loaded. Your query is preserved. ${reason instanceof Error ? reason.message : ''}`.trim();
    } finally {
      if (generation === uqlLegacyGeneration) {
        uqlLegacyLoading = false;
        scheduleSearch(true);
      }
    }
  }

  function chooseUqlLegacy(parent: SelectableParent): void {
    // Retain manual/bookmark context too; the existing picker supports every Angular source.
    uqlParents = [
      parent,
      ...uqlParents.filter((item) => item.pickerId !== parent.pickerId || item.id !== parent.id)
    ];
    selectVeteran(parent);
    appliedUqlLegacy = true;
    filters.uql = setUqlLegacy(filters.uql ?? '', parent, uqlCatalog?.characters ?? []);
  }

  function notify(title: string, tone: Toast['tone'] = 'info', message?: string): void {
    const id = `${Date.now()}-${Math.random()}`;
    toasts = [...toasts, { id, title, tone, message }].slice(-4);
  }

  function setActionBusy(accountId: string, busy: boolean): void {
    bookmarkBusyIds = busy
      ? [...new Set([...bookmarkBusyIds, accountId])]
      : bookmarkBusyIds.filter((id) => id !== accountId);
  }

  async function copyTrainer(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!record.accountId) return notify('No Trainer ID to copy', 'warning');
    if (!(await copyText(record.accountId))) return notify('Failed to copy Trainer ID', 'danger');
    notify(`Trainer ID copied: ${record.accountId}`, 'success');
    const pendingCount = trackBorrowCopy(record);
    if (!pendingCount) return;
    setBorrowCopies(record, record.borrowCopies + 1);
    setBorrowCopies(record, await pendingCount);
  }

  function setBorrowCopies(
    record: InheritanceSearchResult['records'][number],
    count: number
  ): void {
    inheritance = {
      ...inheritance,
      records: inheritance.records.map((item) =>
        item.id === record.id ? { ...item, borrowCopies: count } : item
      )
    };
    bookmarks = bookmarks.map((item) =>
      item.id === record.id ? { ...item, borrowCopies: count } : item
    );
  }

  async function shareRecord(record: InheritanceSearchResult['records'][number]): Promise<void> {
    const url = `${window.location.origin}/database?trainer_id=${encodeURIComponent(record.accountId)}`;
    const copied = await copyText(url);
    notify(
      copied ? 'Link copied to clipboard' : 'Failed to copy link',
      copied ? 'success' : 'danger'
    );
  }

  function openInPlanner(record: InheritanceSearchResult['records'][number]): void {
    const veteran = selectedParent;
    try {
      localStorage.setItem(
        'planner_transfer',
        JSON.stringify({
          record,
          targetCharaId: filters.playerCharaId ?? null,
          veteran: veteran ?? null,
          veteranPosition: 'p2'
        })
      );
    } catch {
      /* Preserve navigation when storage is unavailable. */
    }
    window.open('/tools/lineage-planner?from=db', '_blank', 'noopener');
  }

  async function reportRecord(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!record.accountId || bookmarkBusyIds.includes(record.accountId)) return;
    if (!window.confirm(`Report trainer ${record.accountId} as unavailable or friend list full?`))
      return;
    setActionBusy(record.accountId, true);
    try {
      await inheritanceRepository.reportUnavailable(record.accountId);
      notify('Trainer reported as unavailable', 'success');
      scheduleSearch(true);
    } catch {
      notify('Could not report this trainer. Please try again.', 'danger');
    } finally {
      setActionBusy(record.accountId, false);
    }
  }

  async function toggleBookmark(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!$authUser) return notify('Sign in to bookmark records', 'warning');
    const removing = bookmarkedIds.has(record.accountId);
    if (!removing && bookmarks.length >= 500)
      return notify('Bookmark limit reached (500)', 'warning');
    setActionBusy(record.accountId, true);
    try {
      if (removing) {
        await inheritanceRepository.removeBookmark(record.accountId);
        bookmarks = bookmarks.filter((item) => item.accountId !== record.accountId);
      } else {
        await inheritanceRepository.addBookmark(record.accountId, borrowContext(record));
        bookmarks = [record, ...bookmarks.filter((item) => item.accountId !== record.accountId)];
      }
      notify(removing ? 'Bookmark removed' : 'Bookmarked', 'success');
    } catch {
      notify(removing ? 'Failed to remove bookmark' : 'Failed to bookmark', 'danger');
    } finally {
      setActionBusy(record.accountId, false);
    }
  }

  async function loadBookmarks(): Promise<void> {
    if (!$authUser) {
      bookmarks = [];
      return;
    }
    bookmarksLoading = true;
    bookmarksError = '';
    try {
      bookmarks = await inheritanceRepository.bookmarks();
      bookmarkPage = 1;
    } catch (reason) {
      bookmarksError = reason instanceof Error ? reason.message : 'Bookmarks could not be loaded.';
    } finally {
      bookmarksLoading = false;
    }
  }

  async function switchTab(tab: 'database' | 'bookmarks'): Promise<void> {
    if (activeTab === tab) return;
    activeTab = tab;
    if (tab === 'bookmarks' && $authUser && !bookmarks.length) await loadBookmarks();
    if (tab === 'database' && pendingSearch) {
      pendingSearch = false;
      scheduleSearch(true);
    }
  }

  async function removeModifiedBookmarks(): Promise<void> {
    const ids = bookmarks.filter((record) => record.isStale).map((record) => record.accountId);
    if (!ids.length) return;
    try {
      const result = await inheritanceRepository.bulkDeleteBookmarks({ accountIds: ids });
      bookmarks = bookmarks.filter((record) => !ids.includes(record.accountId));
      notify(
        `Removed ${result.removed_count} modified bookmark${result.removed_count === 1 ? '' : 's'}`,
        'success'
      );
    } catch {
      notify('Failed to remove modified bookmarks', 'danger');
    }
  }

  async function clearAllBookmarks(): Promise<void> {
    if (!clearBookmarksArmed) {
      clearBookmarksArmed = true;
      window.setTimeout(() => (clearBookmarksArmed = false), 4_000);
      return;
    }
    clearBookmarksArmed = false;
    try {
      const result = await inheritanceRepository.bulkDeleteBookmarks({ all: true });
      bookmarks = [];
      notify(
        `Removed ${result.removed_count} bookmark${result.removed_count === 1 ? '' : 's'}`,
        'success'
      );
    } catch {
      notify('Failed to clear bookmarks', 'danger');
    }
  }

  async function submitTrainer(): Promise<void> {
    submissionTouched = true;
    if (trainerDigits.length !== 12 || submissionBusy) return;
    submissionBusy = true;
    try {
      await inheritanceRepository.submitTrainer(trainerDigits);
      notify('Trainer ID submitted successfully!', 'success');
      submitOpen = false;
      trainerSubmission = '';
      submissionTouched = false;
    } catch (reason) {
      const status = reason instanceof HttpError ? reason.status : 0;
      notify(
        status === 409
          ? 'This Trainer ID has already been submitted.'
          : status === 400
            ? 'Invalid Trainer ID format. Please check your input.'
            : 'Failed to submit Trainer ID. Please try again.',
        status === 409 ? 'warning' : 'danger'
      );
    } finally {
      submissionBusy = false;
    }
  }

  function restore(): void {
    const queryParameters = new URLSearchParams(window.location.search);
    const queryState = queryParameters.get('filters');
    if (queryState) {
      try {
        compactState = decodeDatabaseFilterState(queryState);
        filterMode = compactState.uql ? 'uql' : 'advanced';
        filters = filtersFromCompactState(compactState, filterMode);
      } catch {
        /* Ignore malformed shared filter URLs, matching Angular. */
      }
    } else {
      const restored = readDatabasePreferences(localStorage);
      filterMode = restored.mode;
      filters = restored.filters;
      compactState = restored.compact;
      savedState = restored.saved;
    }
    const linkedTrainerId = queryParameters.get('trainer_id')?.trim();
    if (linkedTrainerId) filters.trainerId = linkedTrainerId;
    presets = readDatabasePresets(localStorage);
    const storedListMode = localStorage.getItem(DATABASE_LIST_MODE_KEY);
    if (storedListMode === 'infinite' || storedListMode === 'paginated') listMode = storedListMode;
    try {
      const storedSparkOrder = localStorage.getItem(DATABASE_SPARK_ORDER_KEY);
      sparkOrder =
        sparkOrderOptions.find((option) => option.value === storedSparkOrder)?.value ?? 'main';
    } catch {
      sparkOrder = 'main';
    }
    const requestedPage = Number(queryParameters.get('page'));
    if (Number.isInteger(requestedPage) && requestedPage > 0) {
      page = requestedPage;
      listMode = 'paginated';
    }
    try {
      const storedHidden = JSON.parse(
        localStorage.getItem(DATABASE_HIDDEN_SPARKS_KEY) ?? '[]'
      ) as unknown;
      hiddenSparkFactorIds = Array.isArray(storedHidden)
        ? [...new Set(storedHidden.map(Number).filter((id) => Number.isFinite(id) && id > 0))].sort(
            (left, right) => left - right
          )
        : [];
    } catch {
      hiddenSparkFactorIds = [];
    }
    includeMaxFollowers = (filters.maxFollowerNum ?? 999) >= 1000;
  }

  function persist(): void {
    const result = writeDatabasePreferences(
      localStorage,
      filterMode,
      filters,
      savedState,
      compactState
    );
    savedState = result.saved;
    compactState = result.compact;
    const query = new URL(window.location.href);
    const encoded = encodeDatabaseFilterState(compactState);
    if (encoded) query.searchParams.set('filters', encoded);
    else query.searchParams.delete('filters');
    if (listMode === 'paginated' && page > 1) query.searchParams.set('page', String(page));
    else query.searchParams.delete('page');
    history.replaceState(history.state, '', `${query.pathname}${query.search}${query.hash}`);
  }

  function clearFilters(): void {
    selectedParent = undefined;
    filters = emptyInheritanceFilters();
    compactState = {};
    page = 1;
    presetMessage = 'Filters cleared.';
  }

  function savePreset(name: string): void {
    const now = Date.now();
    const existing = presets.find(
      (entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    const preset: SavedDatabaseFilterPreset = {
      version: 1,
      id: existing?.id ?? crypto.randomUUID(),
      name,
      mode: filterMode,
      state: encodeDatabaseFilterState(compactStateFromFilters(filters, compactState)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    presets = [preset, ...presets.filter((entry) => entry.id !== preset.id)].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
    writeDatabasePresets(localStorage, presets);
    presetDraft = name;
    presetMessage = existing ? 'Preset updated.' : 'Preset saved.';
  }

  function loadPreset(preset: FilterPreset): void {
    const stored = presets.find((entry) => entry.id === preset.id);
    if (!stored) return;
    try {
      const next = decodeDatabaseFilterState(stored.state);
      selectedParent = undefined;
      compactState = next;
      filterMode = stored.mode;
      filters = filtersFromCompactState(compactState, filterMode);
      page = 1;
      presetMessage = `Loaded “${stored.name}”.`;
    } catch {
      presetMessage = `Could not load “${stored.name}”.`;
    }
  }

  function deletePreset(preset: FilterPreset): void {
    presets = presets.filter((entry) => entry.id !== preset.id);
    writeDatabasePresets(localStorage, presets);
  }

  async function exportPresets(): Promise<void> {
    if (!presets.length) {
      presetMessage = 'No presets to export.';
      return;
    }
    const transfer = exportDatabasePresets(presets);
    if (await copyText(transfer)) presetMessage = 'Export copied.';
    else {
      window.prompt('Copy filter preset export string', transfer);
      presetMessage = 'Export string ready.';
    }
  }

  function importPresets(): void {
    const transfer = window.prompt('Paste filter preset export string')?.trim();
    if (!transfer) return;
    try {
      const imported = importDatabasePresets(transfer, presets);
      presets = imported.presets;
      writeDatabasePresets(localStorage, presets);
      presetMessage = imported.importedCount
        ? `Imported ${imported.importedCount} preset${imported.importedCount === 1 ? '' : 's'}.`
        : 'No presets found.';
    } catch {
      presetMessage = 'Invalid export string.';
    }
  }

  function saveHiddenSparks(factorIds: number[]): void {
    localStorage.setItem(DATABASE_HIDDEN_SPARKS_KEY, JSON.stringify(factorIds));
    hiddenSparkFactorIds = factorIds;
  }

  function toggleListMode(): void {
    listMode = listMode === 'infinite' ? 'paginated' : 'infinite';
    page = 1;
    localStorage.setItem(DATABASE_LIST_MODE_KEY, listMode);
  }

  function changeSparkOrder(value: string): void {
    sparkOrder = sparkOrderOptions.find((option) => option.value === value)?.value ?? 'main';
    try {
      localStorage.setItem(DATABASE_SPARK_ORDER_KEY, sparkOrder);
    } catch {
      /* Keep the selection for this session when storage is unavailable. */
    }
  }

  async function runInheritanceSearch(): Promise<void> {
    searchController?.abort();
    searchController = new AbortController();
    const controller = searchController;
    const requestedPage = page;
    inheritanceLoading = true;
    inheritanceError = '';
    try {
      const result = await inheritanceRepository.search(
        filters,
        requestedPage - 1,
        pageSize,
        controller.signal,
        filterMode,
        uqlValidation
      );
      if (controller.signal.aborted) return;
      const records =
        listMode === 'infinite' && requestedPage > 1
          ? [...inheritance.records, ...result.records]
          : result.records;
      inheritance = {
        ...result,
        records: [...new Map(records.map((record) => [record.id, record])).values()]
      };
    } catch (reason) {
      if (!controller.signal.aborted)
        inheritanceError =
          reason instanceof Error ? reason.message : 'Inheritance records could not be loaded.';
    } finally {
      if (!controller.signal.aborted) inheritanceLoading = false;
    }
  }

  function scheduleSearch(immediate = false): void {
    if (!initialized) return;
    cancelSearchTimer?.();
    // Tour examples stay local until the walkthrough ends; mode preparation must not persist a preset.
    if ($tourStepId) return;
    searchController?.abort();
    if (filterMode !== 'uql' && compactState.vet && !selectedParent) return;
    if (filterMode === 'uql' && !uqlCatalog) {
      inheritanceLoading = uqlCatalogLoading;
      persist();
      return;
    }
    if (filterMode === 'uql') {
      const placeholder = uqlQuery.directives.some(
        (directive) => directive.kind === 'legacy' && !directive.value
      );
      if (
        placeholder &&
        /\[\s*\]/.test(filters.uql ?? '') &&
        dismissedUqlPickerQuery !== filters.uql
      ) {
        dismissedUqlPickerQuery = filters.uql ?? '';
        uqlLegacyPickerOpen = true;
      }
      if (!placeholder) dismissedUqlPickerQuery = '';
      if (uqlContext.pendingLegacy) {
        void loadUqlLegacy(uqlContext.pendingLegacy);
        inheritanceLoading = uqlLegacyLoading;
        persist();
        return;
      }
      if (!uqlContext.issue) {
        if (uqlContext.targetId !== undefined || appliedUqlTarget)
          filters.playerCharaId = uqlContext.targetId;
        if (
          uqlContext.targetId !== undefined &&
          filters.mainParentIds.some(
            (id) =>
              (id >= 10000 ? Math.floor(id / 100) : id) === Math.floor(uqlContext.targetId! / 100)
          )
        )
          filters.mainParentIds = filters.mainParentIds.filter(
            (id) =>
              (id >= 10000 ? Math.floor(id / 100) : id) !== Math.floor(uqlContext.targetId! / 100)
          );
        if (
          uqlContext.legacy &&
          (selectedParent?.pickerId !== uqlContext.legacy.pickerId ||
            selectedParent?.id !== uqlContext.legacy.id)
        )
          selectVeteran(uqlContext.legacy);
        else if (!uqlContext.legacy && appliedUqlLegacy) selectVeteran(undefined);
        appliedUqlTarget = uqlContext.targetId !== undefined;
        appliedUqlLegacy = Boolean(uqlContext.legacy);
      }
    }
    if (filterMode === 'uql' && uqlValidation.state !== 'empty') {
      if (uqlValidation.state !== 'valid') {
        inheritanceLoading = false;
        persist();
        return;
      }
    }
    if (filterMode === 'uql' && uqlValidation.sortBy) {
      if (filters.sortBy !== uqlValidation.sortBy) filters.sortBy = uqlValidation.sortBy;
    } else if (sortSelectionMode === 'auto') {
      const automaticSort = automaticInheritanceSort(
        inheritanceRequestFilters(filters, filterMode)
      );
      if (filters.sortBy !== automaticSort) filters.sortBy = automaticSort;
    }
    const signature = JSON.stringify({ filterMode, filters });
    if (signature !== lastFilterSignature) {
      if (lastFilterSignature && page !== 1) page = 1;
      lastFilterSignature = signature;
    }
    if (activeTab === 'bookmarks') {
      inheritanceLoading = false;
      pendingSearch = true;
      persist();
      return;
    }
    // Keep the navigation guard active while the debounced search is queued too.
    let cancelled = false;
    void withPageRequest(async () => {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, immediate ? 0 : 150);
        cancelSearchTimer = () => {
          cancelled = true;
          clearTimeout(timer);
          resolve();
        };
      });
      if (cancelled) return;
      cancelSearchTimer = undefined;
      persist();
      await runInheritanceSearch();
    }).catch((reason) => {
      if (!disposed)
        inheritanceError =
          reason instanceof Error ? reason.message : 'Search could not be started.';
    });
  }

  async function loadAffinity(refresh = false): Promise<void> {
    affinityError = '';
    try {
      affinityEngine = new VeteranAffinityEngine(await veteranAffinityRepository.load(refresh));
    } catch {
      affinityError =
        'Local affinity calculations are unavailable. Records and filters still work; scores without a target use the stored record value.';
    }
  }

  async function loadUqlCatalog(): Promise<void> {
    if (uqlCatalogLoading || uqlCatalog) return;
    uqlCatalogLoading = true;
    uqlCatalogError = '';
    try {
      uqlCatalog = await (await import('@/lib/catalog/uql-catalog')).loadUqlQueryCatalog();
    } catch {
      uqlCatalogError = 'UQL names could not be loaded. Your query is preserved; reload to retry.';
    } finally {
      uqlCatalogLoading = false;
      scheduleSearch(true);
    }
  }

  function initialize(): void {
    restore();
    void loadCharacters();
    void loadG1SaddleGroups()
      .then((value) => (raceGroups = value))
      .catch(() => notify('Race affinity details could not be loaded.', 'warning'));
    void loadFactorArtwork().catch(() => notify('Factor artwork could not be loaded.', 'warning'));
    void loadAffinity();
    // Display catalogs must not hold up the first search and browser verification.
    void Promise.all([loadCatalog('characters'), loadCatalog('supports')])
      .then(([nextCharacters, nextSupports]) => {
        if (!disposed) {
          characters = nextCharacters;
          supports = nextSupports;
        }
      })
      .catch(() => {
        /* Search still works with numeric character fallbacks. */
      });
    initialized = true;
    scheduleSearch(true);
  }

  async function loadCharacters(): Promise<void> {
    if (charactersLoading) return;
    charactersLoading = true;
    charactersError = '';
    try {
      selectableCharacters = await loadReleasedCharacterCatalog();
    } catch (error) {
      charactersError =
        error instanceof Error ? error.message : 'Character data could not be loaded.';
    } finally {
      charactersLoading = false;
    }
  }

  async function loadSupports(refresh = false): Promise<void> {
    if (supportsLoading || (supportsLoaded && !refresh)) return;
    supportsLoading = true;
    supportsError = '';
    try {
      if (!supportsLoaded) {
        const cached = await readCachedSupportCards();
        if (disposed) return;
        if (cached) {
          selectableSupports = cached;
          supportsCached = true;
        }
      }
      const fresh = await loadLiveSupportCards(refresh);
      if (!disposed) {
        selectableSupports = fresh;
        supportsLoaded = true;
        supportsCached = false;
      }
    } catch (error) {
      if (!disposed)
        supportsError =
          error instanceof Error ? error.message : 'Support-card data could not be loaded.';
    } finally {
      if (!disposed) supportsLoading = false;
    }
  }

  onMount(watchFactorCatalog);

  onMount(() =>
    resourceRepository.onUpdate((name) => {
      if (name === 'support-cards-db') {
        supportsLoaded = false;
        void loadSupports();
      }
    })
  );

  onMount(() => {
    void initialize();
    return () => {
      disposed = true;
      uqlLegacyGeneration++;
      searchController?.abort();
      cancelSearchTimer?.();
    };
  });

  $effect(() => {
    if (filters.supportCardId) untrack(() => void loadSupports());
  });

  $effect(() => {
    JSON.stringify(filters);
    legacyRestoreKey;
    filterMode;
    page;
    listMode;
    activeTab;
    if (!initialized) return;
    untrack(() => scheduleSearch());
  });

  $effect(() => {
    if (initialized && filterMode === 'uql')
      untrack(() => {
        if (!uqlCatalog && !uqlCatalogError) void loadUqlCatalog();
      });
  });

  $effect(() => {
    if (initialized && filterMode === 'uql' && uqlCompiler) untrack(() => scheduleSearch());
  });

  $effect(() => {
    const session = String($authUser?.id ?? '');
    if (!initialized || !$authReady) return;
    untrack(() => {
      if (uqlSession !== session) {
        uqlLegacyGeneration++;
        uqlParents = [];
        uqlLegacyScope = '';
        uqlLegacyError = '';
        uqlLegacyLoading = false;
        if (
          uqlSession !== undefined &&
          ((selectedParent?.share_source === 'veteran' && selectedParent.trainer_id) ||
            (!selectedParent && compactState.vet))
        )
          selectVeteran(undefined);
        uqlSession = session;
      }
      if (filterMode === 'uql') scheduleSearch();
    });
  });

  $effect(() => {
    const key = legacyRestoreKey;
    if (!initialized || !$authReady) return;
    if (filterMode === 'uql') return;
    if (!key || selectedParent) return;
    untrack(() => void restoreParent(compactState.vet!));
  });
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
      cached={supportsCached || supportsLoaded}
      onopen={() => void loadSupports()}
      onretry={() => void loadSupports(true)}
      value={String(filters.supportCardId ?? '')}
      maxVisible={12}
      onselect={(value) => {
        filters.supportCardId = Number(value);
        page = 1;
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
      onretry={loadCharacters}
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
      use:trackScrollShortcut
    >
      <FilterShell
        title="Filters"
        {activeCount}
        modes={['Basic', 'Advanced', 'UQL']}
        mode={filterMode}
        onmodechange={setFilterMode}
        bind:expanded={filterExpanded}
        onclear={clearFilters}
      >
        {#snippet tools()}
          <FilterPresetMenu
            bind:draft={presetDraft}
            message={presetMessage}
            presets={presetViews}
            onsave={savePreset}
            onload={loadPreset}
            ondelete={deletePreset}
            onexport={() => void exportPresets()}
            onimport={importPresets}
          />
        {/snippet}
        {#if filterMode === 'uql'}
          {#await import('./uql/DatabaseUqlEditor.svelte')}
            <Spinner label="Loading UQL editor…" />
          {:then editor}
            <editor.default
              bind:value={() => filters.uql ?? '', (value) => (filters.uql = value)}
              validation={uqlValidation}
              {characters}
              {supports}
              catalog={uqlCatalog}
              loading={uqlCatalogLoading}
              legacyParents={uqlLegacyParents}
              onpicklegacy={() => (uqlLegacyPickerOpen = true)}
              onclear={clearFilters}
            />
          {:catch}
            <Banner
              tone="warning"
              title="UQL suggestions unavailable"
            >
              You can still edit and run your query below. <Button
                size="sm"
                variant="secondary"
                onclick={() => {
                  persist();
                  location.reload();
                }}
              >
                Retry editor
              </Button>
            </Banner>
            <div class="uql-fallback">
              <label for="uql-plain-query">UQL query</label>
              <textarea
                id="uql-plain-query"
                bind:value={filters.uql}
                rows="4"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                aria-describedby="uql-plain-status"
                aria-invalid={uqlValidation.state === 'invalid' ? 'true' : undefined}></textarea>
              <span
                id="uql-plain-status"
                role="status"
              >
                {uqlValidation.message}
              </span>
            </div>
          {/await}
        {:else}
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
                  count={[filters.playerCharaId, selectedVeteranId || sharedLegacyLabel].filter(
                    Boolean
                  ).length}
                >
                  <DatabaseAffinityFilter
                    characters={aceOptions}
                    loading={charactersLoading}
                    error={charactersError}
                    onretry={loadCharacters}
                    targetId={String(filters.playerCharaId ?? '')}
                    veteran={veteranView}
                    {sharedLegacyLabel}
                    selectedAccountId={selectedParent?.trainer_id}
                    ontargetchange={selectTarget}
                    onveteranchange={selectVeteran}
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
              onchange={() => (page = 1)}
            >
              {#snippet supportFilter()}
                {@render supportControls('basic-support-card', 'support-limit-break')}
              {/snippet}
            </DatabasePropertyFilters>
          </div>
        {/if}
      </FilterShell>

      <DatabaseActiveFilters
        bind:filters
        {filterMode}
        uqlState={uqlValidation.state}
        {characterOptions}
        {supportOptions}
        legacyName={selectedVeteranId ? (veteranView?.name ?? 'Veteran') : undefined}
        {sharedLegacyLabel}
        bind:includeMaxFollowers
        onclear={clearFilters}
        onclearlegacy={() => selectVeteran(undefined)}
        onchange={() => (page = 1)}
      />

      <div
        class="database-tabs"
        bind:this={resultsStart}
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
              badge: bookmarks.length ? String(bookmarks.length) : undefined
            }
          ]}
          value={activeTab}
          onchange={(value) => void switchTab(value as typeof activeTab)}
        />
        {#if activeTab === 'bookmarks' && $authUser}
          <span class="bookmark-limit">
            {bookmarks.length} / 500
          </span>
        {/if}
      </div>

      {#if activeTab === 'database'}
        <section class="inheritance-results">
          <header class="results-header">
            <div class="results-info">
              <h2>Results</h2>
              {#if !inheritanceLoading && !inheritanceError}
                <p>
                  {inheritance.total.toLocaleString()} records found{#if activeCount > 0}
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
                  badge={hiddenSparkFactorIds.length
                    ? `${hiddenSparkFactorIds.length} hidden`
                    : undefined}
                  ariaLabel={hiddenSparkFactorIds.length
                    ? `Hide sparks, ${hiddenSparkFactorIds.length} currently hidden`
                    : 'Choose sparks to hide'}
                  onclick={() => (hiddenSparksOpen = true)}
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
                  options={sparkOrderOptions}
                  onchange={changeSparkOrder}
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
                  onclick={toggleListMode}
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
                onchange={(value) => {
                  sortSelectionMode = 'manual';
                  filters.sortBy = value as InheritanceSearchFilters['sortBy'];
                  page = 1;
                }}
              />
            </div>
          </header>
          {#if filters.optionalWhite.length || filters.optionalMainWhite.length || filters.lineageWhite.length}
            <div class="sorting-notice">
              <Icon
                name="info"
                size={15}
              />
              <span>
                Results are sorted by preferred white priority groups first (P0, then P1…), then by
                the selected sort.
              </span>
            </div>
          {/if}
          {#if pendingSearch}
            <div class="loading pending">
              <Spinner size={24} />
              <span>Filters changed. Results will refresh when you return to Database.</span>
            </div>
          {/if}
          {#if filterMode === 'uql' && uqlCatalogError}
            <Banner
              title="UQL unavailable"
              tone="danger"
            >
              <p>{uqlCatalogError}</p>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => window.location.reload()}
              >
                Reload UQL
              </Button>
            </Banner>
          {/if}
          {#if filterMode === 'uql' && uqlContext.failedLegacy}
            <Banner
              title="Legacy unavailable"
              tone="danger"
            >
              <p>{uqlLegacyError}</p>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => {
                  if (uqlContext.failedLegacy) void loadUqlLegacy(uqlContext.failedLegacy, true);
                }}
              >
                Retry legacy
              </Button>
            </Banner>
          {/if}
          {#if affinityError && !inheritanceError}
            {@render affinityFailure()}
          {/if}
          {#if inheritanceLoading && !appendingResults}
            <div class="loading">
              <Spinner size={30} />
              <span>Searching inheritance records…</span>
            </div>
          {:else if inheritanceError && !appendingResults}
            <div
              class="result-error"
              role="alert"
            >
              <EmptyState
                icon="warning"
                title="Inheritance search unavailable"
                description={inheritanceError}
              >
                {#snippet actions()}
                  <div class="error-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onclick={() => scheduleSearch(true)}
                    >
                      Retry
                    </Button><Button
                      href={DISCORD_SUPPORT_URL}
                      target="_blank"
                      variant="secondary"
                      size="sm"
                      icon="discord"
                    >
                      Report on Discord
                    </Button>
                  </div>
                {/snippet}
              </EmptyState>
            </div>
          {:else if inheritance.records.length}
            <ContentAd
              routeId="database"
              top
            />
            <div
              class="inheritance-list"
              use:virtualScroll={{
                items: inheritance.records,
                searchText: findRecordText,
                key: (record) => record.id,
                estimate: 640,
                onrange: (range) => (virtualRange = range),
                onend: canLoadMore ? loadMoreResults : undefined
              }}
            >
              {#each inheritance.records.slice(virtualRange.start, virtualRange.end) as record, localIndex (record.id)}
                {@const index = virtualRange.start + localIndex}
                <div data-virtual-index={index}>
                  <InheritanceResultCard
                    {record}
                    {uqlHighlight}
                    activeFilters={filterMode === 'uql' ? undefined : filters}
                    {characters}
                    {supports}
                    {defaultFocus}
                    {splitSparks}
                    {sparkPortraits}
                    {sparkOrder}
                    {hiddenSparkFactorIds}
                    {affinityEngine}
                    {raceGroups}
                    {partner}
                    targetId={filters.playerCharaId}
                    bind:sparkPerRun
                    bind:showOccurrences
                    bind:showP2Sparks
                    bind:collapsedWhiteSections
                    partnerWinSaddles={filters.p2WinSaddle}
                    bookmarked={bookmarkedIds.has(record.accountId)}
                    actionBusy={bookmarkBusyIds.includes(record.accountId)}
                    oncopy={copyTrainer}
                    onshare={shareRecord}
                    onreport={reportRecord}
                    onbookmark={toggleBookmark}
                    onplanner={openInPlanner}
                    onvisible={queueBorrowView}
                  />{#if index % 6 === 5 && index < inheritance.records.length - 1 && index < 42}
                    <ContentAd
                      routeId="database"
                      index={2 + Math.floor(index / 6)}
                    />
                  {/if}
                </div>
              {/each}
            </div>
            {#if listMode === 'paginated' && inheritance.totalPages > 1}
              <Pagination
                bind:page
                pages={inheritance.totalPages}
                total={inheritance.total}
                pageSize={inheritance.pageSize}
                jump
                onchange={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              />
            {/if}
          {:else}
            <EmptyState
              icon="search"
              title="No records found"
              description="Try adjusting your search criteria or submit your Trainer ID to help the community."
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
            </EmptyState>
          {/if}
          {#if appendingResults && inheritanceLoading}
            <div
              class="loading"
              role="status"
            >
              <Spinner size={30} />
              <span>Loading more records…</span>
            </div>
          {:else if appendingResults && inheritanceError}
            <Banner
              title="More records could not be loaded"
              tone="danger"
            >
              <p>{inheritanceError}</p>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => scheduleSearch(true)}
              >
                Retry loading more
              </Button>
            </Banner>
          {/if}
        </section>
      {:else}
        <section class="bookmark-results">
          {#if !$authUser}
            <div class="bookmarks-empty">
              <Icon
                name="veterans"
                size={54}
              />
              <h2>Sign in to use bookmarks</h2>
              <p>Please sign in to bookmark and save records.</p>
              <Button
                href="/login"
                variant="primary"
              >
                Sign in
              </Button>
            </div>
          {:else if bookmarksLoading}
            <div class="loading">
              <Spinner size={30} />
              <span>Loading bookmarks…</span>
            </div>
          {:else if bookmarksError}
            <Banner
              title="Bookmarks unavailable"
              tone="danger"
            >
              <p>{bookmarksError}</p>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => void loadBookmarks()}
              >
                Retry
              </Button>
            </Banner>
          {:else if bookmarks.length}
            <header class="bookmark-toolbar">
              <div>
                <h2>Bookmarks</h2>
                <p>
                  {filteredBookmarks.length.toLocaleString()} bookmarked records{#if filteredBookmarks.length !== bookmarks.length}
                    <span>(filtered from {bookmarks.length})</span>
                  {/if}
                </p>
              </div>
              <div class="bookmark-filters">
                <SegmentedControl
                  label="Bookmark status filter"
                  value={bookmarkFilter}
                  options={[
                    { value: 'all', label: `All (${bookmarks.length})` },
                    {
                      value: 'unchanged',
                      label: `Unchanged (${bookmarks.length - modifiedBookmarkCount})`
                    },
                    { value: 'modified', label: `Modified (${modifiedBookmarkCount})` }
                  ]}
                  onchange={(value) => {
                    bookmarkFilter = value as typeof bookmarkFilter;
                    bookmarkPage = 1;
                  }}
                />
              </div>
              <div class="bookmark-actions">
                {#if modifiedBookmarkCount}
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={() => void removeModifiedBookmarks()}
                  >
                    Remove modified ({modifiedBookmarkCount})
                  </Button>
                {/if}<Button
                  variant="danger"
                  size="sm"
                  onclick={() => void clearAllBookmarks()}
                >
                  {clearBookmarksArmed ? 'Confirm clear all' : 'Clear all'}
                </Button>
              </div>
            </header>
            {#if affinityError}
              {@render affinityFailure()}
            {/if}
            <ContentAd
              routeId="database"
              top
            />
            <div class="inheritance-list">
              {#each visibleBookmarks as record (record.id)}
                <InheritanceResultCard
                  {record}
                  {uqlHighlight}
                  activeFilters={filterMode === 'uql' ? undefined : filters}
                  {characters}
                  {supports}
                  {defaultFocus}
                  {splitSparks}
                  {sparkPortraits}
                  {sparkOrder}
                  {hiddenSparkFactorIds}
                  {affinityEngine}
                  {raceGroups}
                  {partner}
                  targetId={filters.playerCharaId}
                  bind:sparkPerRun
                  bind:showOccurrences
                  bind:showP2Sparks
                  bind:collapsedWhiteSections
                  partnerWinSaddles={filters.p2WinSaddle}
                  bookmarked
                  actionBusy={bookmarkBusyIds.includes(record.accountId)}
                  oncopy={copyTrainer}
                  onshare={shareRecord}
                  onreport={reportRecord}
                  onbookmark={toggleBookmark}
                  onplanner={openInPlanner}
                  onvisible={queueBorrowView}
                />
              {/each}
            </div>
            {#if bookmarkPages > 1}
              <Pagination
                bind:page={bookmarkPage}
                pages={bookmarkPages}
                total={filteredBookmarks.length}
                {pageSize}
                jump
              />
            {/if}
          {:else}
            <EmptyState
              icon="veterans"
              title="No bookmarks yet"
              description="Save records from the Database tab and they will appear here."
            />
          {/if}
        </section>
      {/if}
    </div>
  </div>
  {#if hiddenSparksOpen}
    <HiddenSparksDialog
      bind:open={hiddenSparksOpen}
      selectedFactorIds={hiddenSparkFactorIds}
      onsave={saveHiddenSparks}
    />
  {/if}
  <Dialog
    id="trainer-submit"
    bind:open={submitOpen}
    title="Add Trainer ID"
    icon="id-card"
    maxWidth="440px"
    mobileInset="24px"
    onclose={() => {
      submissionTouched = false;
    }}
  >
    <form
      class="trainer-submit"
      onsubmit={(event) => {
        event.preventDefault();
        void submitTrainer();
      }}
    >
      <p>Add your inheritance team to the database.</p>
      <div class="submission-field">
        <span
          class="submission-count"
          class:complete={trainerDigits.length === 12}
          aria-hidden="true"
        >
          {trainerDigits.length} / 12
        </span>
        <TextField
          id="trainer-submission"
          label="Trainer ID"
          placeholder="123 456 789 012"
          value={trainerSubmission}
          inputmode="numeric"
          autocomplete="off"
          maxlength={15}
          help="Find your 12-digit ID in your in-game profile."
          error={submissionTouched && trainerDigits.length !== 12
            ? 'Please enter a valid 12-digit trainer ID'
            : undefined}
          oninput={(event) => {
            const digits = (event.currentTarget as HTMLInputElement).value
              .replace(/\D/g, '')
              .slice(0, 12);
            trainerSubmission = digits.match(/.{1,3}/g)?.join(' ') ?? '';
          }}
        />
      </div>
    </form>
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        disabled={submissionBusy}
        onclick={() => (submitOpen = false)}
      >
        Cancel
      </Button><Button
        variant="secondary"
        size="sm"
        icon="add"
        loading={submissionBusy}
        disabled={trainerDigits.length !== 12}
        onclick={() => void submitTrainer()}
      >
        Add trainer
      </Button>
    {/snippet}
  </Dialog>
  <ToastRegion
    {toasts}
    ondismiss={(id) => (toasts = toasts.filter((toast) => toast.id !== id))}
  />
</SourcePage>
{#if scrollShortcut}
  <button
    type="button"
    class="floating-scroll-btn"
    class:results-mode={scrollShortcut === 'results'}
    onclick={useScrollShortcut}
  >
    <span
      class="scroll-arrow"
      class:up={scrollShortcut === 'top'}
    >
      <Icon
        name="arrow-right"
        size={18}
      />
    </span>
    <span aria-live="polite">
      {#if scrollShortcut === 'top'}
        Back to Top
      {:else if shortcutLoading}
        Searching…
      {:else if shortcutError}
        Results unavailable
      {:else}
        Results ({shortcutCount.toLocaleString()})
      {/if}
    </span>
  </button>
{/if}
{#if uqlLegacyPickerOpen}
  <ParentPickerDialog
    bind:open={uqlLegacyPickerOpen}
    targetId={uqlContext.targetId ?? filters.playerCharaId}
    selectedAccountId={selectedParent?.trainer_id}
    sessionScope="database-uql"
    onselect={chooseUqlLegacy}
  />
{/if}

{#snippet affinityFailure()}
  <Banner
    title="Affinity details unavailable"
    tone="danger"
  >
    <p>{affinityError}</p>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => void loadAffinity(true)}
    >
      Retry affinity
    </Button>
  </Banner>
{/snippet}

<style>
  @import './database-page.css';
</style>
