<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { inheritanceFactors } from '@/lib/inheritance/inheritance-factors';
  import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
  import { scenarios } from '@/lib/catalog/scenario-catalog';
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  function findRecordText(record: InheritanceRecord): string {
    const names = [record.mainParentId, record.leftParentId, record.rightParentId].map(id =>
      (characters.find(entry => Number(entry.id) === id) ?? characters.find(entry => Math.floor(Number(entry.id) / 100) === id || Math.floor(Number(entry.id) / 100) === Math.floor(id / 100)))?.title);
    return [record.trainerName || 'Unknown Trainer', record.accountId, record.accountId.replace(/(\d{3})(?=\d)/g, '$1 '),
      ...names, supports.find(entry => Number(entry.id) === record.supportCardId)?.title,
      scenarios.find(scenario => scenario.id === record.scenarioId)?.label, record.rankScore, record.rankScore.toLocaleString(),
      ...inheritanceFactors(record).map(factor => factor.name)].join(' ');
  }

  import ContentAd from '@/layouts/ContentAd.svelte';
  import PageHeading from '@/layouts/PageHeading.svelte';
  import { copyText } from '@/lib/clipboard';
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { tourStepId, completeTourInteraction } from '@/components/tours/tour-state';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import FilterPresetMenu, { type FilterPreset } from '@/components/FilterPresetMenu.svelte';
  import FilterShell from '@/components/FilterShell.svelte';
  import Pagination from '@/components/Pagination.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import ScenarioMultiSelect from '@/components/ScenarioMultiSelect.svelte';
  import Slider from '@/components/Slider.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import ToastRegion, { type Toast } from '@/components/ToastRegion.svelte';
  import SupportCardPicker from '@/components/SupportCardPicker.svelte';
  import TextField from '@/components/TextField.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import ToggleButton from '@/components/ToggleButton.svelte';
  import { authUser, authReady } from '@/services/auth/auth-state';
  import { HttpError } from '@/services/http/http-client';
  import { withPageRequest } from '@/services/http/page-request';
  import { DISCORD_SUPPORT_URL } from '@/services/site-links';
  import { factorOptions, loadFactorArtwork, watchFactorCatalog, factorCatalogState } from '@/lib/catalog/factor-catalog';
  import ResourceStatus from '@/components/ResourceStatus.svelte';
  import { characterImagePath, loadReleasedCharacterCatalog, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { loadLiveSupportCards, readCachedSupportCards, supportCardImagePath, type SupportCardCatalogEntry } from '@/lib/catalog/support-card-catalog';
  import { resourceRepository } from '@/lib/catalog/resource-repository';
  import { releasedSupportCards, supportCardDisplay, supportTypeName } from '@/lib/supports/support-card';
  import type { SupportCardPickerOption } from '@/components/picker-types';
  import { accountParent, parentCharacter, parentAffinity, parentAffinityDetails, manualParent, parseManualParents, MANUAL_PARENTS_KEY, type SelectableParent } from '@/lib/veterans/parent-picker';
  import { normalizeVeteranRecord } from '@/lib/veterans/veteran-normalizer';
  import { authRepository } from '@/services/auth/auth-repository';
  import { profileRepository } from '@/pages/profile/profile-repository';
  import { activeInheritanceFilterCount, emptyInheritanceFilters, inheritanceRequestFilters, type FactorRequirement, type InheritanceFilterMode, type InheritanceSearchFilters, type InheritanceSearchResult } from '@/lib/inheritance/inheritance-search';
  import { validateInheritanceUql, type UqlValidation } from '@/lib/inheritance/uql';
  import { buildUqlSparkHighlight } from '@/lib/inheritance/uql-spark-highlight';
  import type { SparkOrder } from '@/lib/inheritance/inheritance-factors';
  import { UqlCompiler, type UqlQueryCatalog } from '@/lib/inheritance/uql-compiler';
  import { parseUqlContext, resolveUqlTarget, resolveUqlLegacy, uqlLegacyHints, setUqlLegacy, type UqlContextIssue } from '@/lib/inheritance/uql-context';
  import ParentPickerDialog from '@/components/parent-picker/ParentPickerDialog.svelte';
  import { deviceVeteranParents } from '@/pages/veterans/veteran-library';
  import { loadCatalog, type CatalogEntry } from './catalog-repository';
  import { inheritanceRepository } from './inheritance-repository';
  import { automaticInheritanceSort, filterAndSortBookmarks } from './database-local-results';
  import { borrowContext, queueBorrowView, trackBorrowCopy } from './borrow-interactions';
  import { veteranToUi } from '@/pages/veterans/veteran-adapter';
  import FactorFilterEditor from './FactorFilterEditor.svelte';
  import DatabaseRaceScheduleFilter from './DatabaseRaceScheduleFilter.svelte';
  import DatabaseAffinityFilter from './DatabaseAffinityFilter.svelte';
  import DatabaseCharacterRules from './DatabaseCharacterRules.svelte';
  import DatabaseFilterGroup from './DatabaseFilterGroup.svelte';
  import DatabaseWhiteCategoryFilter, { type WhiteCategoryValues } from './DatabaseWhiteCategoryFilter.svelte';
  import InheritanceResultCard from './InheritanceResultCard.svelte';
  import HiddenSparksDialog from './HiddenSparksDialog.svelte';
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

  const lowEndDevice = typeof navigator !== 'undefined' && (((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || navigator.hardwareConcurrency <= 4);
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
      scrollShortcut = filterExpanded && resultsStart.getBoundingClientRect().top > window.innerHeight
        ? 'results' : node.getBoundingClientRect().top < -200 ? 'top' : '';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return { destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    } };
  }

  function useScrollShortcut(): void {
    (scrollShortcut === 'results' ? resultsStart : filterStart).scrollIntoView({
      block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  let displayOptionsOpen = $state(false);
  const compactFilters = new MediaQuery('(max-width:900px)');
  let tourPanels = $state<Record<string, boolean>>({ inheritance: innerWidth > 600, main: innerWidth > 600, general: innerWidth > 600, total: innerWidth > 600, races: innerWidth > 600, characters: false, support: false, search: false });
  let affinityOpen = $state(true);
  let beforeTour: { mode: InheritanceFilterMode; expanded: boolean; display: boolean; affinity: boolean; quick: boolean; panels: Record<string, boolean> } | undefined;
  function prepareTour(step: string): void {
    if (!step) {
      if (beforeTour) {
        filterMode = beforeTour.mode; filterExpanded = beforeTour.expanded; displayOptionsOpen = beforeTour.display;
        affinityOpen = beforeTour.affinity; quickFiltersOpen = beforeTour.quick; tourPanels = beforeTour.panels;
        beforeTour = undefined;
      }
      return;
    }
    const displayStep = ['database-focus-controls', 'database-hide-sparks', 'database-split-sparks', 'database-list-mode'].includes(step);
    if (!step.startsWith('filter-') && !displayStep) return;
    beforeTour ??= { mode:filterMode, expanded:filterExpanded, display:displayOptionsOpen, affinity:affinityOpen, quick:quickFiltersOpen, panels:{ ...tourPanels } };
    if (displayStep) { displayOptionsOpen = true; return; }
    filterExpanded = true;
    if (['filter-open', 'filter-modes', 'filter-presets'].includes(step)) return;
    filterMode = ['filter-include-exclude','filter-trainer-search','filter-main-parent-factors','filter-preferred-white','filter-lineage-white','filter-race-schedule'].includes(step) ? 'advanced' : 'basic';
    affinityOpen = true;
    if (step === 'filter-include-exclude' || step === 'filter-trainer-search') quickFiltersOpen = true;
    if (step === 'filter-include-exclude') tourPanels.characters = true;
    if (step === 'filter-trainer-search') tourPanels.search = true;
    const panel = step === 'filter-main-parent-factors' ? 'main' : step === 'filter-race-schedule' ? 'races' : step === 'filter-support-card' || step === 'filter-limit-break' ? 'general' : 'inheritance';
    tourPanels[panel] = true;
  }
  $effect(() => { const step = $tourStepId; untrack(() => prepareTour(step)); });
  function changeLimitBreak(value: number): void { filters.minLimitBreak = value; completeTourInteraction('filter-limit-break'); }
  let activeTab = $state<'database' | 'bookmarks'>('database');
  let pendingSearch = $state(false);
  let sortSelectionMode: 'auto' | 'manual' = 'auto';
  let defaultFocus = $state<'all' | 'main' | 'left' | 'right'>('all');
  let splitSparks = $state(false);
  let sparkPortraits = $state(false);
  let sparkOrder = $state<SparkOrder>('main');
  const sparkOrderOptions: { value: SparkOrder; label: string }[] = [
    { value: 'main', label: 'Main parent first' }, { value: 'stars', label: 'Most stars' },
    { value: 'occurrences', label: 'Most occurrences' }, { value: 'alphabetical', label: 'Alphabetical' }
  ];
  let includeMaxFollowers = $state(false);
  let listMode = $state<'infinite' | 'paginated'>(lowEndDevice ? 'paginated' : 'infinite');
  let hiddenSparksOpen = $state(false);
  let hiddenSparkFactorIds = $state<number[]>([]);
  let filters = $state<InheritanceSearchFilters>(emptyInheritanceFilters());
  let inheritance = $state.raw<InheritanceSearchResult>({ records: [], total: 0, page: 0, pageSize, totalPages: 0 });
  let inheritanceLoading = $state(false);
  let inheritanceError = $state('');
  let page = $state(1);
  const appendingResults = $derived(listMode === 'infinite' && page > 1 && inheritance.records.length > 0);
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
  const canLoadMore = $derived(initialized && activeTab === 'database' && listMode === 'infinite'
    && !cancelSearchTimer && !inheritanceLoading && !inheritanceError
    && page === inheritance.page + 1 && page < inheritance.totalPages);
  function loadMoreResults(): void { if (canLoadMore) page += 1; }
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
  const uqlLegacyParents = $derived(selectedParent && !uqlParents.some(parent => parent.pickerId === selectedParent?.pickerId && parent.id === selectedParent?.id)
    ? [selectedParent, ...uqlParents.filter(parent => parent.pickerId !== selectedParent?.pickerId)] : uqlParents);
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
  const uqlContext = $derived.by<{ targetId?: number; legacy?: SelectableParent; pendingLegacy?: string; failedLegacy?: string; issue?: UqlContextIssue }>(() => {
    if (uqlQuery.issue) return { issue: uqlQuery.issue };
    let targetId: number | undefined; let legacy: SelectableParent | undefined;
    for (const directive of uqlQuery.directives) {
      if (directive.kind === 'target') {
        const resolution = resolveUqlTarget(directive.value, uqlCatalog?.characters ?? []);
        if (!resolution.match) return { issue: { state: resolution.partial ? 'incomplete' : 'invalid', message: resolution.partial ? 'Choose a target from autocomplete' : `Unknown target: ${directive.value}` } };
        targetId = Number(resolution.match.id);
      } else {
        const resolution = resolveUqlLegacy(directive.value, [...(selectedParent ? [selectedParent] : []), ...uqlParents], uqlCatalog?.characters ?? []);
        if (!resolution.match) {
          if (uqlLegacyScope !== legacyScope(directive.value) || uqlLegacyLoading) return { pendingLegacy: directive.value, issue: { state: 'incomplete', message: 'Loading legacy…' } };
          if (uqlLegacyError) return { failedLegacy: directive.value, issue: { state: 'invalid', message: uqlLegacyError } };
          return { issue: { state: resolution.partial ? 'incomplete' : 'invalid', message: resolution.partial ? 'Choose a legacy from autocomplete' : `Unknown legacy: ${directive.value}` } };
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
      const { cardId } = parentCharacter(selectedParent, new Map(selectableCharacters.map(character => [Number(character.id), character])));
      return cardId ? normalizeVeteranRecord({ ...selectedParent, card_id: cardId }) : undefined;
    }
    if (!filters.p2MainCharaId) return undefined;
    return normalizeVeteranRecord({ card_id: filters.p2MainCharaId >= 10000 ? filters.p2MainCharaId : filters.p2MainCharaId * 100, win_saddle_id_array: filters.p2WinSaddle });
  });
  const sharedLegacyLabel = $derived(!selectedParent && (filters.p2MainCharaId || filters.p2WinSaddle.length) ? compactState.p2i != null ? `Shared legacy #${compactState.p2i}` : 'Shared legacy context' : undefined);
  const characterFilterCount = $derived(filters.mainParentIds.length + filters.includeParentIds.length + filters.excludeMainParentIds.length + filters.excludeParentIds.length);
  const supportFilterCount = $derived(Number(Boolean(filters.supportCardId)) + Number(Boolean(filters.minLimitBreak)));
  const trainerFilterCount = $derived(Number(Boolean(filters.trainerId)) + Number(Boolean(filters.trainerName)));
  let quickFiltersOpen = $state(typeof window === 'undefined' ? true : window.innerWidth > 600);

  const activeCount = $derived(activeInheritanceFilterCount(filters));
  const uqlValidation = $derived.by<UqlValidation>(() => {
    if (filterMode === 'uql' && !uqlCatalog) return { state: 'incomplete', message: uqlCatalogError || 'Loading query names…', compiled: '', explicitFollowerFilter: false };
    if (filterMode === 'uql' && uqlContext.issue) return { ...uqlContext.issue, compiled: '', explicitFollowerFilter: false };
    const validation = validateInheritanceUql(filterMode === 'uql' ? uqlQuery.predicate : filters.uql ?? '', uqlCompiler);
    return validation.state === 'empty' && uqlQuery.directives.length ? { ...validation, state: 'valid', message: 'Ready' } : validation;
  });
  const uqlHighlight = $derived(filterMode === 'uql' && uqlValidation.state === 'valid' ? buildUqlSparkHighlight(uqlValidation.compiled) : undefined);
  const characterOptions = $derived(selectableCharacters.map(entry => ({ id:entry.id, name:entry.name, subtitle:entry.subtitle, image:characterImagePath(Number(entry.id)) })));
  const aceOptions = $derived(selectedParent && affinityEngine ? characterOptions.map(option => ({ ...option, affinity:parentAffinity(selectedParent!, Number(option.id), affinityEngine, raceGroups) })) : characterOptions);
  const supportOptions = $derived<SupportCardPickerOption[]>(releasedSupportCards(selectableSupports).map(entry => ({ id:entry.id, ...supportCardDisplay(entry), image:supportCardImagePath(entry.id), type:supportTypeName(entry.type), rarity:entry.rarity === 3 ? 'SSR' : entry.rarity === 2 ? 'SR' : 'R' })));
  const selectedSupportOption = $derived.by<SupportCardPickerOption | undefined>(() => {
    const fullOption = supportOptions.find(entry => Number(entry.id) === filters.supportCardId);
    if (fullOption) return fullOption;
    const entry = supports.find(entry => Number(entry.id) === filters.supportCardId);
    return entry ? { id:entry.id, title:entry.title, image:supportCardImagePath(entry.id), type:supportType(entry), rarity:supportRarity(entry) } : undefined;
  });
  const presetViews = $derived<FilterPreset[]>(presets.map((preset) => ({ id: preset.id, name: preset.name, mode: preset.mode, activeCount: databasePresetFilterCount(preset) })));
  const rankOptions = Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: `Rank ${index + 1}`, image: `/assets/images/icon/ranks/utx_txt_rank_${String(index + 1).padStart(2, '0')}.webp` }));
  const lineageWhiteCategories = $derived<WhiteCategoryValues>({ commonCount:filters.minCommonWhiteCount,commonStars:filters.minCommonWhiteStarsSum,scenarioCount:filters.minScenarioWhiteCount,scenarioStars:filters.minScenarioWhiteStarsSum,raceCount:filters.minRaceWhiteCount,raceStars:filters.minRaceWhiteStarsSum });
  const mainWhiteCategories = $derived<WhiteCategoryValues>({ commonCount:filters.minMainCommonWhiteCount,commonStars:filters.minMainCommonWhiteStarsSum,scenarioCount:filters.minMainScenarioWhiteCount,scenarioStars:filters.minMainScenarioWhiteStarsSum,raceCount:filters.minMainRaceWhiteCount,raceStars:filters.minMainRaceWhiteStarsSum });
  const bookmarkedIds = $derived(new Set(bookmarks.map((record) => record.accountId)));
  const modifiedBookmarkCount = $derived(bookmarks.filter((record) => record.isStale).length);
  const filteredBookmarks = $derived(filterAndSortBookmarks(bookmarks, filters, bookmarkFilter, includeMaxFollowers));
  const bookmarkPages = $derived(Math.max(1, Math.ceil(filteredBookmarks.length / pageSize)));
  const visibleBookmarks = $derived(filteredBookmarks.slice((bookmarkPage - 1) * pageSize, bookmarkPage * pageSize));
  const shortcutLoading = $derived(activeTab === 'database' ? inheritanceLoading && !appendingResults : bookmarksLoading);
  const shortcutError = $derived(activeTab === 'database' ? inheritanceError : bookmarksError);
  const shortcutCount = $derived(activeTab === 'database' ? inheritance.total : filteredBookmarks.length);
  const trainerDigits = $derived(trainerSubmission.replace(/\D/g, '').slice(0, 12));
  const veteranView = $derived.by(() => {
    $factorCatalogState;
    if (!selectedParent || !partner) return undefined;
    const view = veteranToUi({ ...partner, name: '' }, selectedParent.trainer_id ?? '', new Map(characters.map(character => [Number(character.id), { name: character.title }])));
    const score = parentAffinityDetails(selectedParent, filters.playerCharaId, affinityEngine, raceGroups);
    view.detail = undefined;
    view.affinity = score ? score.parentOne.total + score.race.p1Left + score.race.p1Right : NaN;
    for (const parent of view.parents ?? []) parent.affinity = !score ? NaN : parent.position === 'P1' ? score.parentOne.left + score.race.p1Left : score.parentOne.right + score.race.p1Right;
    return view;
  });
  type ActiveChipTone = 'blue' | 'pink' | 'green' | 'white' | 'optional' | 'character' | 'exclude' | 'support' | 'default';
  interface ActiveFilterView { id: string; label: string; tone: ActiveChipTone; remove: () => void; }
  const factorLabels = $derived(new Map(factorOptions().map((factor) => [factor.id, factor.text])));
  const scenarioLabels = ['','URA Finals','Unity Cup','Grand Concert','Trackblazer','Grand Masters','Project L’Arc','U.A.F.','Great Food Festival','Run! Mecha','Twinkle Legends','Design Your Island','Yukoma Hot Springs','Beyond Dreams'];
  const activeFilterViews = $derived.by<ActiveFilterView[]>(() => {
    const views: ActiveFilterView[] = [];
    const add = (id: string, label: string, tone: ActiveChipTone, remove: () => void) => views.push({ id, label, tone, remove });
    if (filterMode === 'uql') {
      if (filters.uql?.trim()) add('uql', `UQL: ${uqlValidation.state === 'valid' ? 'Active' : 'Editing'}`, 'default', clearFilters);
      return views;
    }
    const characterName = (id: number) => characterOptions.find((option) => id >= 10000 ? Number(option.id) === id : Math.floor(Number(option.id) / 100) === id)?.name ?? `Character ${id}`;
    if (filters.playerCharaId) add('target', `Target: ${characterName(filters.playerCharaId)}`, 'character', () => { filters.playerCharaId = undefined; });
    if (selectedVeteranId) add('legacy', `Legacy: ${veteranView?.name ?? 'Veteran'}`, 'character', () => selectVeteran(undefined));
    else if (sharedLegacyLabel) add('legacy', sharedLegacyLabel, 'character', () => selectVeteran(undefined));
    if (filters.trainerId?.trim()) add('trainer-id', `Trainer ID: ${filters.trainerId.trim()}`, 'default', () => { filters.trainerId = undefined; });
    if (filters.trainerName?.trim()) add('trainer-name', `Username: ${filters.trainerName.trim()}`, 'default', () => { filters.trainerName = undefined; });
    const characterGroups: Array<[keyof InheritanceSearchFilters, string, ActiveChipTone]> = [
      ['mainParentIds','Allow main','character'], ['includeParentIds','Allow great','character'], ['excludeMainParentIds','Hide main','exclude'], ['excludeParentIds','Hide great','exclude']
    ];
    for (const [key, prefix, tone] of characterGroups) {
      const ids = filters[key] as number[];
      ids.forEach((id, index) => add(`${String(key)}-${id}-${index}`, `${prefix}: ${characterName(id)}`, tone, () => { (filters[key] as number[]) = ids.filter((_, itemIndex) => itemIndex !== index); }));
    }
    const factorGroups: Array<[keyof InheritanceSearchFilters, string, ActiveChipTone]> = [
      ['blue','Blue','blue'], ['pink','Pink','pink'], ['green','Green','green'], ['white','White','white'],
      ['mainBlue','Main blue','blue'], ['mainPink','Main pink','pink'], ['mainGreen','Main green','green'], ['mainWhite','Main white','white'],
      ['optionalWhite','Preferred','optional'], ['optionalMainWhite','Preferred main','optional'], ['lineageWhite','Lineage','optional']
    ];
    for (const [key, prefix, tone] of factorGroups) {
      const requirements = filters[key] as FactorRequirement[];
      requirements.forEach((requirement, index) => {
        if (!Number.isFinite(requirement.factorId) || requirement.factorId < 0 || requirement.factorId === 0 && tone === 'white') return;
        const starRange = requirement.maximumStars && requirement.maximumStars !== requirement.minimumStars ? `${requirement.minimumStars}–${requirement.maximumStars}★` : `${requirement.minimumStars}★`;
        const range = requirement.metric === 'occurrences' ? `${requirement.minimumOccurrences ?? 0}–${requirement.maximumOccurrences ?? 3}×` : starRange;
        add(`${String(key)}-${requirement.factorId}-${index}`, `${prefix}: ${requirement.factorId === 0 ? 'Any' : factorLabels.get(String(requirement.factorId)) ?? requirement.factorId} ${range}`, tone, () => { (filters[key] as FactorRequirement[]) = requirements.filter((_, itemIndex) => itemIndex !== index); });
      });
    }
    if (filters.supportCardId) add('support', `Support: ${supportOptions.find((option) => Number(option.id) === filters.supportCardId)?.title ?? filters.supportCardId}${filters.minLimitBreak ? ` · LB${filters.minLimitBreak}` : ''}`, 'support', () => { filters.supportCardId = undefined; filters.minLimitBreak = undefined; });
    filters.scenarioIds.forEach((id) => add(`scenario-${id}`, `Scenario: ${scenarioLabels[id] ?? id}`, 'default', () => { filters.scenarioIds = filters.scenarioIds.filter((value) => value !== id); }));
    const scalarGroups: Array<[keyof InheritanceSearchFilters, string, ActiveChipTone]> = [
      ['minWinCount','Wins ≥','default'], ['minWhiteCount','White factors ≥','white'],
      ['minBlueStarsSum','Blue stars ≥','blue'], ['minPinkStarsSum','Pink stars ≥','pink'], ['minGreenStarsSum','Green stars ≥','green'], ['minWhiteStarsSum','White stars ≥','white'],
      ['minCommonWhiteCount','Common factors ≥','white'], ['minCommonWhiteStarsSum','Common stars ≥','white'], ['minScenarioWhiteCount','Scenario factors ≥','white'], ['minScenarioWhiteStarsSum','Scenario stars ≥','white'], ['minRaceWhiteCount','Race factors ≥','white'], ['minRaceWhiteStarsSum','Race stars ≥','white'], ['minMainWhiteCount','Main white factors ≥','white']
    ];
    for (const [key, prefix, tone] of scalarGroups) { const value = filters[key]; if (typeof value === 'number' && value > 0) add(String(key), `${prefix} ${value}`, tone, () => { (filters as unknown as Record<string, unknown>)[key] = undefined; }); }
    if ((filters.minParentRank ?? 1) > 1) add('minParentRank', `Rank ≥ ${filters.minParentRank}`, 'default', () => { filters.minParentRank = 1; });
    if (includeMaxFollowers) add('max-followers', 'Max followers: Included', 'default', () => { includeMaxFollowers = false; filters.maxFollowerNum = 999; });
    if (filters.raceSchedule.length) add('races', `${filters.raceSchedule.length} required race${filters.raceSchedule.length === 1 ? '' : 's'}`, 'default', () => { filters.raceSchedule = []; filters.mainWinSaddle = []; });
    if (filters.uql?.trim()) add('uql', `UQL: ${filters.uql.trim()}`, 'default', () => { filters.uql = ''; });
    return views;
  });
  function selectTarget(value: string): void {
    filters.playerCharaId = singleNumber(value);
    if (filters.playerCharaId) filters.mainParentIds = filters.mainParentIds.filter(id => baseId(id) !== baseId(filters.playerCharaId));
    page = 1;
  }
  function baseId(id: number | undefined): number | undefined { return id && id >= 10000 ? Math.floor(id / 100) : id; }
  function selectCharacterRule(rule: 'allow-main' | 'hide-main' | 'allow-great' | 'hide-great', values: string[]): void {
    const keys = { 'allow-main':'mainParentIds', 'hide-main':'excludeMainParentIds', 'allow-great':'includeParentIds', 'hide-great':'excludeParentIds' } as const;
    const opposites = { 'allow-main':'excludeMainParentIds', 'hide-main':'mainParentIds', 'allow-great':'excludeParentIds', 'hide-great':'includeParentIds' } as const;
    const ids = selectedNumbers(values);
    const added = new Set(ids.filter(id => !filters[keys[rule]].includes(id)).map(baseId));
    filters[keys[rule]] = ids;
    filters[opposites[rule]] = filters[opposites[rule]].filter(id => !added.has(baseId(id)));
    if (rule === 'allow-main' && added.has(baseId(filters.playerCharaId))) filters.playerCharaId = undefined;
    if (rule === 'allow-great') {
      if (added.has(baseId(filters.parentLeftId))) filters.parentLeftId = undefined;
      if (added.has(baseId(filters.parentRightId))) filters.parentRightId = undefined;
    }
    page = 1;
  }
  function supportType(entry: CatalogEntry): 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend' {
    const type = entry.tags[0]; return (['Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend'].includes(type ?? '') ? type : 'Friend') as 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend';
  }
  function supportRarity(entry: CatalogEntry): 'R' | 'SR' | 'SSR' { return entry.tags.includes('SSR') ? 'SSR' : entry.tags.includes('SR') ? 'SR' : 'R'; }
  function numberFrom(event: Event): number | undefined { const raw = (event.currentTarget as HTMLInputElement).value; if (!raw) return undefined; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : undefined; }
  function setScalar(key: 'minWinCount' | 'minWhiteCount' | 'minParentRank' | 'trainerId' | 'trainerName', value: number | string | undefined): void { (filters as unknown as Record<string, unknown>)[key] = value; page = 1; }
  function selectedNumbers(values: string[]): number[] { return values.map(Number).filter(Number.isFinite); }
  function singleNumber(value: string): number | undefined { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : undefined; }
  function setWhiteCategory(scope:'lineage'|'main',category:'common'|'scenario'|'race',metric:'count'|'stars',value:number|undefined):void {
    const keys = scope === 'main'
      ? {common:{count:'minMainCommonWhiteCount',stars:'minMainCommonWhiteStarsSum'},scenario:{count:'minMainScenarioWhiteCount',stars:'minMainScenarioWhiteStarsSum'},race:{count:'minMainRaceWhiteCount',stars:'minMainRaceWhiteStarsSum'}}
      : {common:{count:'minCommonWhiteCount',stars:'minCommonWhiteStarsSum'},scenario:{count:'minScenarioWhiteCount',stars:'minScenarioWhiteStarsSum'},race:{count:'minRaceWhiteCount',stars:'minRaceWhiteStarsSum'}};
    (filters as unknown as Record<string,unknown>)[keys[category][metric]]=value; page=1;
  }
  function setFilterMode(value: string): void {
    if (value !== 'basic' && value !== 'advanced' && value !== 'uql') return;
    if (value === 'uql' && filters.uql === undefined) filters.uql = '';
    filterMode = value;
  }
  function selectVeteran(parent: SelectableParent | undefined): void {
    selectedParent = parent;
    const characterId = parent?.card_id ?? parent?.trained_chara_id;
    filters.p2MainCharaId = characterId ? characterId >= 10000 ? Math.floor(characterId / 100) : characterId : undefined;
    filters.p2WinSaddle = parent?.win_saddle_id_array ?? [];
    delete compactState.vet; delete compactState.p2i;
    if (parent?.share_source === 'veteran') {
      if (typeof parent.id === 'string' && parent.id) compactState.vet = parent.id;
      else if (parent.trainer_id && parent.member_id != null) compactState.vet = [parent.trainer_id, parent.member_id];
    }
    if (parent?.share_source === 'manual' && parent.share_local_id) compactState.vet = `manual:${parent.share_local_id}`;
    if (parent?.share_source === 'bookmark') compactState.p2i = parent.share_inheritance_id;
    page = 1;
  }
  async function restoreParent(reference: NonNullable<CompactDatabaseFilterState['vet']>): Promise<void> {
    const key = JSON.stringify(reference);
    const session = $authUser?.id;
    const current = () => !disposed && $authUser?.id === session && JSON.stringify(compactState.vet) === key;
    try {
      let parent: SelectableParent | undefined;
      if (typeof reference === 'string') {
        if (reference.startsWith('device-')) parent = (await deviceVeteranParents()).find(parent => parent.id === reference);
        else if (reference.startsWith('manual:')) {
          const entry = parseManualParents(localStorage.getItem(MANUAL_PARENTS_KEY)).find(entry => `manual:${entry.id}` === reference);
          if (entry) parent = manualParent(entry);
        } else {
          const veteran = await profileRepository.veteran(reference, true);
          if (veteran?.id === reference) parent = accountParent(veteran, veteran.trainer_id ?? '');
        }
      } else if ($authUser && Array.isArray(reference) && typeof reference[0] === 'string' && Number.isSafeInteger(reference[1])) {
        const [accountId, memberId] = reference;
        const accounts = await authRepository.linkedAccounts();
        if (accounts.some(account => account.account_id === accountId && account.verification_status === 'verified')) {
          const veteran = (await profileRepository.load(accountId, true)).veterans?.find(item => item.member_id === memberId);
          if (veteran) parent = accountParent(veteran, accountId);
        }
      }
      if (current()) selectVeteran(parent);
    } catch {
      if (current()) { selectVeteran(undefined); notify('Saved legacy is unavailable. Select another veteran.', 'warning'); }
    }
  }
  function legacyScope(value: string): string {
    const hint = uqlLegacyHints(value);
    return hint.uuid ? `uuid:${hint.uuid}` : hint.accountId ? `account:${hint.accountId}` : `accounts:${$authUser?.id ?? ''}`;
  }
  async function loadUqlLegacy(value: string, refresh = false): Promise<void> {
    const scope = legacyScope(value);
    if ((!refresh && scope === uqlLegacyScope) || !$authReady) return;
    const generation = ++uqlLegacyGeneration;
    uqlLegacyScope = scope; uqlLegacyLoading = true; uqlLegacyError = '';
    try {
      const hint = uqlLegacyHints(value);
      let parents: SelectableParent[];
      if (hint.uuid?.startsWith('device-')) {
        parents = await deviceVeteranParents();
        if (!parents.some(parent => parent.id === hint.uuid)) throw new Error('This veteran is stored on another device. Import its JSON here to use it.');
      } else if (hint.uuid) {
        const veteran = await profileRepository.veteran(hint.uuid, refresh);
        parents = [accountParent(veteran, veteran.trainer_id ?? '')];
      } else {
        const accountIds = hint.accountId ? [hint.accountId] : $authUser
          ? (await authRepository.linkedAccounts()).filter(account => account.verification_status === 'verified').map(account => account.account_id) : [];
        parents = [...await deviceVeteranParents(), ...(await Promise.all(accountIds.map(async accountId => (await profileRepository.load(accountId, refresh)).veterans?.map(veteran => accountParent(veteran, accountId)) ?? []))).flat()];
      }
      if (generation === uqlLegacyGeneration) uqlParents = [...new Map([...uqlParents, ...parents].map(parent => [JSON.stringify([parent.pickerId, parent.id]), parent])).values()];
    } catch (reason) {
      if (generation === uqlLegacyGeneration) uqlLegacyError = `Legacy could not be loaded. Your query is preserved. ${reason instanceof Error ? reason.message : ''}`.trim();
    } finally {
      if (generation === uqlLegacyGeneration) { uqlLegacyLoading = false; scheduleSearch(true); }
    }
  }
  function chooseUqlLegacy(parent: SelectableParent): void {
    // Retain manual/bookmark context too; the existing picker supports every Angular source.
    uqlParents = [parent, ...uqlParents.filter(item => item.pickerId !== parent.pickerId || item.id !== parent.id)];
    selectVeteran(parent);
    appliedUqlLegacy = true;
    filters.uql = setUqlLegacy(filters.uql ?? '', parent, uqlCatalog?.characters ?? []);
  }
  function notify(title: string, tone: Toast['tone'] = 'info', message?: string): void {
    const id = `${Date.now()}-${Math.random()}`;
    toasts = [...toasts, { id, title, tone, message }].slice(-4);
  }
  function setActionBusy(accountId: string, busy: boolean): void { bookmarkBusyIds = busy ? [...new Set([...bookmarkBusyIds, accountId])] : bookmarkBusyIds.filter((id) => id !== accountId); }
  async function copyTrainer(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!record.accountId) return notify('No Trainer ID to copy', 'warning');
    if (!await copyText(record.accountId)) return notify('Failed to copy Trainer ID', 'danger');
    notify(`Trainer ID copied: ${record.accountId}`, 'success');
    const pendingCount = trackBorrowCopy(record);
    if (!pendingCount) return;
    setBorrowCopies(record, record.borrowCopies + 1);
    setBorrowCopies(record, await pendingCount);
  }
  function setBorrowCopies(record: InheritanceSearchResult['records'][number], count: number): void {
    inheritance = { ...inheritance, records: inheritance.records.map((item) => item.id === record.id ? { ...item, borrowCopies: count } : item) };
    bookmarks = bookmarks.map((item) => item.id === record.id ? { ...item, borrowCopies: count } : item);
  }
  async function shareRecord(record: InheritanceSearchResult['records'][number]): Promise<void> {
    const url = `${window.location.origin}/database?trainer_id=${encodeURIComponent(record.accountId)}`;
    const copied = await copyText(url);
    notify(copied ? 'Link copied to clipboard' : 'Failed to copy link', copied ? 'success' : 'danger');
  }
  function openInPlanner(record: InheritanceSearchResult['records'][number]): void {
    const veteran = selectedParent;
    try { localStorage.setItem('planner_transfer', JSON.stringify({ record, targetCharaId: filters.playerCharaId ?? null, veteran: veteran ?? null, veteranPosition: 'p2' })); } catch { /* Preserve navigation when storage is unavailable. */ }
    window.open('/tools/lineage-planner?from=db', '_blank', 'noopener');
  }
  async function reportRecord(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!record.accountId || bookmarkBusyIds.includes(record.accountId)) return;
    if (!window.confirm(`Report trainer ${record.accountId} as unavailable or friend list full?`)) return;
    setActionBusy(record.accountId, true);
    try { await inheritanceRepository.reportUnavailable(record.accountId); notify('Trainer reported as unavailable', 'success'); scheduleSearch(true); }
    catch { notify('Could not report this trainer. Please try again.', 'danger'); }
    finally { setActionBusy(record.accountId, false); }
  }
  async function toggleBookmark(record: InheritanceSearchResult['records'][number]): Promise<void> {
    if (!$authUser) return notify('Sign in to bookmark records', 'warning');
    const removing = bookmarkedIds.has(record.accountId);
    if (!removing && bookmarks.length >= 500) return notify('Bookmark limit reached (500)', 'warning');
    setActionBusy(record.accountId, true);
    try {
      if (removing) { await inheritanceRepository.removeBookmark(record.accountId); bookmarks = bookmarks.filter((item) => item.accountId !== record.accountId); }
      else { await inheritanceRepository.addBookmark(record.accountId, borrowContext(record)); bookmarks = [record, ...bookmarks.filter((item) => item.accountId !== record.accountId)]; }
      notify(removing ? 'Bookmark removed' : 'Bookmarked', 'success');
    } catch { notify(removing ? 'Failed to remove bookmark' : 'Failed to bookmark', 'danger'); }
    finally { setActionBusy(record.accountId, false); }
  }
  async function loadBookmarks(): Promise<void> {
    if (!$authUser) { bookmarks = []; return; }
    bookmarksLoading = true; bookmarksError = '';
    try { bookmarks = await inheritanceRepository.bookmarks(); bookmarkPage = 1; }
    catch (reason) { bookmarksError = reason instanceof Error ? reason.message : 'Bookmarks could not be loaded.'; }
    finally { bookmarksLoading = false; }
  }
  async function switchTab(tab: 'database' | 'bookmarks'): Promise<void> {
    if (activeTab === tab) return;
    activeTab = tab;
    if (tab === 'bookmarks' && $authUser && !bookmarks.length) await loadBookmarks();
    if (tab === 'database' && pendingSearch) { pendingSearch = false; scheduleSearch(true); }
  }
  async function removeModifiedBookmarks(): Promise<void> {
    const ids = bookmarks.filter((record) => record.isStale).map((record) => record.accountId); if (!ids.length) return;
    try { const result = await inheritanceRepository.bulkDeleteBookmarks({ accountIds: ids }); bookmarks = bookmarks.filter((record) => !ids.includes(record.accountId)); notify(`Removed ${result.removed_count} modified bookmark${result.removed_count === 1 ? '' : 's'}`, 'success'); }
    catch { notify('Failed to remove modified bookmarks', 'danger'); }
  }
  async function clearAllBookmarks(): Promise<void> {
    if (!clearBookmarksArmed) { clearBookmarksArmed = true; window.setTimeout(() => clearBookmarksArmed = false, 4_000); return; }
    clearBookmarksArmed = false;
    try { const result = await inheritanceRepository.bulkDeleteBookmarks({ all: true }); bookmarks = []; notify(`Removed ${result.removed_count} bookmark${result.removed_count === 1 ? '' : 's'}`, 'success'); }
    catch { notify('Failed to clear bookmarks', 'danger'); }
  }
  async function submitTrainer(): Promise<void> {
    submissionTouched = true; if (trainerDigits.length !== 12 || submissionBusy) return;
    submissionBusy = true;
    try { await inheritanceRepository.submitTrainer(trainerDigits); notify('Trainer ID submitted successfully!', 'success'); submitOpen = false; trainerSubmission = ''; submissionTouched = false; }
    catch (reason) { const status = reason instanceof HttpError ? reason.status : 0; notify(status === 409 ? 'This Trainer ID has already been submitted.' : status === 400 ? 'Invalid Trainer ID format. Please check your input.' : 'Failed to submit Trainer ID. Please try again.', status === 409 ? 'warning' : 'danger'); }
    finally { submissionBusy = false; }
  }

  function restore(): void {
    const queryParameters = new URLSearchParams(window.location.search);
    const queryState = queryParameters.get('filters');
    if (queryState) {
      try {
        compactState = decodeDatabaseFilterState(queryState);
        filterMode = compactState.uql ? 'uql' : 'advanced';
        filters = filtersFromCompactState(compactState, filterMode);
      } catch { /* Ignore malformed shared filter URLs, matching Angular. */ }
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
      sparkOrder = sparkOrderOptions.find(option => option.value === storedSparkOrder)?.value ?? 'main';
    } catch { sparkOrder = 'main'; }
    const requestedPage = Number(queryParameters.get('page'));
    if (Number.isInteger(requestedPage) && requestedPage > 0) { page = requestedPage; listMode = 'paginated'; }
    try {
      const storedHidden = JSON.parse(localStorage.getItem(DATABASE_HIDDEN_SPARKS_KEY) ?? '[]') as unknown;
      hiddenSparkFactorIds = Array.isArray(storedHidden) ? [...new Set(storedHidden.map(Number).filter((id) => Number.isFinite(id) && id > 0))].sort((left, right) => left - right) : [];
    } catch { hiddenSparkFactorIds = []; }
    includeMaxFollowers = (filters.maxFollowerNum ?? 999) >= 1000;
  }
  function persist(): void {
    const result = writeDatabasePreferences(localStorage, filterMode, filters, savedState, compactState);
    savedState = result.saved;
    compactState = result.compact;
    const query = new URL(window.location.href);
    const encoded = encodeDatabaseFilterState(compactState);
    if (encoded) query.searchParams.set('filters', encoded); else query.searchParams.delete('filters');
    if (listMode === 'paginated' && page > 1) query.searchParams.set('page', String(page)); else query.searchParams.delete('page');
    history.replaceState(history.state, '', `${query.pathname}${query.search}${query.hash}`);
  }
  function clearFilters(): void { selectedParent = undefined; filters = emptyInheritanceFilters(); compactState = {}; page = 1; presetMessage = 'Filters cleared.'; }
  function savePreset(name: string): void {
    const now = Date.now();
    const existing = presets.find((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const preset: SavedDatabaseFilterPreset = { version: 1, id: existing?.id ?? crypto.randomUUID(), name, mode: filterMode, state: encodeDatabaseFilterState(compactStateFromFilters(filters, compactState)), createdAt: existing?.createdAt ?? now, updatedAt: now };
    presets = [preset, ...presets.filter((entry) => entry.id !== preset.id)].sort((left, right) => right.updatedAt - left.updatedAt); writeDatabasePresets(localStorage, presets); presetDraft = name; presetMessage = existing ? 'Preset updated.' : 'Preset saved.';
  }
  function loadPreset(preset: FilterPreset): void {
    const stored = presets.find((entry) => entry.id === preset.id); if (!stored) return;
    try { const next = decodeDatabaseFilterState(stored.state); selectedParent = undefined; compactState = next; filterMode = stored.mode; filters = filtersFromCompactState(compactState, filterMode); page = 1; presetMessage = `Loaded “${stored.name}”.`; }
    catch { presetMessage = `Could not load “${stored.name}”.`; }
  }
  function deletePreset(preset: FilterPreset): void { presets = presets.filter((entry) => entry.id !== preset.id); writeDatabasePresets(localStorage, presets); }
  async function exportPresets(): Promise<void> {
    if (!presets.length) { presetMessage = 'No presets to export.'; return; }
    const transfer = exportDatabasePresets(presets);
    if (await copyText(transfer)) presetMessage = 'Export copied.';
    else { window.prompt('Copy filter preset export string', transfer); presetMessage = 'Export string ready.'; }
  }
  function importPresets(): void {
    const transfer = window.prompt('Paste filter preset export string')?.trim(); if (!transfer) return;
    try { const imported = importDatabasePresets(transfer, presets); presets = imported.presets; writeDatabasePresets(localStorage, presets); presetMessage = imported.importedCount ? `Imported ${imported.importedCount} preset${imported.importedCount === 1 ? '' : 's'}.` : 'No presets found.'; }
    catch { presetMessage = 'Invalid export string.'; }
  }
  function saveHiddenSparks(factorIds: number[]): void {
    localStorage.setItem(DATABASE_HIDDEN_SPARKS_KEY, JSON.stringify(factorIds));
    hiddenSparkFactorIds = factorIds;
  }
  function toggleListMode(): void { listMode = listMode === 'infinite' ? 'paginated' : 'infinite'; page = 1; localStorage.setItem(DATABASE_LIST_MODE_KEY, listMode); }
  function changeSparkOrder(value: string): void {
    sparkOrder = sparkOrderOptions.find(option => option.value === value)?.value ?? 'main';
    try { localStorage.setItem(DATABASE_SPARK_ORDER_KEY, sparkOrder); } catch { /* Keep the selection for this session when storage is unavailable. */ }
  }

  async function runInheritanceSearch(): Promise<void> {
    searchController?.abort(); searchController = new AbortController();
    const controller = searchController;
    const requestedPage = page;
    inheritanceLoading = true; inheritanceError = '';
    try {
      const result = await inheritanceRepository.search(filters, requestedPage - 1, pageSize, controller.signal, filterMode, uqlValidation);
      if (controller.signal.aborted) return;
      const records = listMode === 'infinite' && requestedPage > 1 ? [...inheritance.records, ...result.records] : result.records;
      inheritance = { ...result, records: [...new Map(records.map((record) => [record.id, record])).values()] };
    }
    catch (reason) { if (!controller.signal.aborted) inheritanceError = reason instanceof Error ? reason.message : 'Inheritance records could not be loaded.'; }
    finally { if (!controller.signal.aborted) inheritanceLoading = false; }
  }
  function scheduleSearch(immediate = false): void {
    if (!initialized) return;
    cancelSearchTimer?.();
    // Tour examples stay local until the walkthrough ends; mode preparation must not persist a preset.
    if ($tourStepId) return;
    searchController?.abort();
    if (filterMode !== 'uql' && compactState.vet && !selectedParent) return;
    if (filterMode === 'uql' && !uqlCatalog) { inheritanceLoading = uqlCatalogLoading; persist(); return; }
    if (filterMode === 'uql') {
      const placeholder = uqlQuery.directives.some(directive => directive.kind === 'legacy' && !directive.value);
      if (placeholder && /\[\s*\]/.test(filters.uql ?? '') && dismissedUqlPickerQuery !== filters.uql) { dismissedUqlPickerQuery = filters.uql ?? ''; uqlLegacyPickerOpen = true; }
      if (!placeholder) dismissedUqlPickerQuery = '';
      if (uqlContext.pendingLegacy) { void loadUqlLegacy(uqlContext.pendingLegacy); inheritanceLoading = uqlLegacyLoading; persist(); return; }
      if (!uqlContext.issue) {
        if (uqlContext.targetId !== undefined || appliedUqlTarget) filters.playerCharaId = uqlContext.targetId;
        if (uqlContext.targetId !== undefined && filters.mainParentIds.some(id => (id >= 10000 ? Math.floor(id / 100) : id) === Math.floor(uqlContext.targetId! / 100))) filters.mainParentIds = filters.mainParentIds.filter(id => (id >= 10000 ? Math.floor(id / 100) : id) !== Math.floor(uqlContext.targetId! / 100));
        if (uqlContext.legacy && (selectedParent?.pickerId !== uqlContext.legacy.pickerId || selectedParent?.id !== uqlContext.legacy.id)) selectVeteran(uqlContext.legacy);
        else if (!uqlContext.legacy && appliedUqlLegacy) selectVeteran(undefined);
        appliedUqlTarget = uqlContext.targetId !== undefined;
        appliedUqlLegacy = Boolean(uqlContext.legacy);
      }
    }
    if (filterMode === 'uql' && uqlValidation.state !== 'empty') {
      if (uqlValidation.state !== 'valid') { inheritanceLoading = false; persist(); return; }
    }
    if (filterMode === 'uql' && uqlValidation.sortBy) {
      if (filters.sortBy !== uqlValidation.sortBy) filters.sortBy = uqlValidation.sortBy;
    } else if (sortSelectionMode === 'auto') {
      const automaticSort = automaticInheritanceSort(inheritanceRequestFilters(filters, filterMode));
      if (filters.sortBy !== automaticSort) filters.sortBy = automaticSort;
    }
    const signature = JSON.stringify({ filterMode, filters });
    if (signature !== lastFilterSignature) { if (lastFilterSignature && page !== 1) page = 1; lastFilterSignature = signature; }
    if (activeTab === 'bookmarks') { inheritanceLoading = false; pendingSearch = true; persist(); return; }
    // Keep the navigation guard active while the debounced search is queued too.
    let cancelled = false;
    void withPageRequest(async () => {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, immediate ? 0 : 150);
        cancelSearchTimer = () => { cancelled = true; clearTimeout(timer); resolve(); };
      });
      if (cancelled) return;
      cancelSearchTimer = undefined;
      persist();
      await runInheritanceSearch();
    }).catch(reason => { if (!disposed) inheritanceError = reason instanceof Error ? reason.message : 'Search could not be started.'; });
  }

  async function loadAffinity(refresh = false): Promise<void> {
    affinityError = '';
    try { affinityEngine = new VeteranAffinityEngine(await veteranAffinityRepository.load(refresh)); }
    catch { affinityError = 'Local affinity calculations are unavailable. Records and filters still work; scores without a target use the stored record value.'; }
  }

  async function loadUqlCatalog(): Promise<void> {
    if (uqlCatalogLoading || uqlCatalog) return;
    uqlCatalogLoading = true;
    uqlCatalogError = '';
    try { uqlCatalog = await (await import('@/lib/catalog/uql-catalog')).loadUqlQueryCatalog(); }
    catch { uqlCatalogError = 'UQL names could not be loaded. Your query is preserved; reload to retry.'; }
    finally { uqlCatalogLoading = false; scheduleSearch(true); }
  }

  function initialize(): void {
    restore();
    void loadCharacters();
    void loadG1SaddleGroups().then((value) => raceGroups = value).catch(() => notify('Race affinity details could not be loaded.', 'warning'));
    void loadFactorArtwork().catch(() => notify('Factor artwork could not be loaded.', 'warning'));
    void loadAffinity();
    // Display catalogs must not hold up the first search and browser verification.
    void Promise.all([loadCatalog('characters'), loadCatalog('supports')]).then(([nextCharacters, nextSupports]) => {
      if (!disposed) { characters = nextCharacters; supports = nextSupports; }
    }).catch(() => { /* Search still works with numeric character fallbacks. */ });
    initialized = true;
    scheduleSearch(true);
  }
  async function loadCharacters(): Promise<void> {
    if (charactersLoading) return;
    charactersLoading = true;
    charactersError = '';
    try { selectableCharacters = await loadReleasedCharacterCatalog(); }
    catch (error) { charactersError = error instanceof Error ? error.message : 'Character data could not be loaded.'; }
    finally { charactersLoading = false; }
  }
  async function loadSupports(refresh = false): Promise<void> {
    if (supportsLoading || supportsLoaded && !refresh) return;
    supportsLoading = true; supportsError = '';
    try {
      if (!supportsLoaded) {
        const cached = await readCachedSupportCards();
        if (disposed) return;
        if (cached) { selectableSupports = cached; supportsCached = true; }
      }
      const fresh = await loadLiveSupportCards(refresh);
      if (!disposed) { selectableSupports = fresh; supportsLoaded = true; supportsCached = false; }
    } catch (error) {
      if (!disposed) supportsError = error instanceof Error ? error.message : 'Support-card data could not be loaded.';
    } finally { if (!disposed) supportsLoading = false; }
  }
  onMount(watchFactorCatalog);
  onMount(() => resourceRepository.onUpdate(name => {
    if (name === 'support-cards-db') { supportsLoaded = false; void loadSupports(); }
  }));
  onMount(() => {
    void initialize();
    return () => { disposed = true; uqlLegacyGeneration++; searchController?.abort(); cancelSearchTimer?.(); };
  });
  $effect(() => { if (filters.supportCardId) untrack(() => void loadSupports()); });
  $effect(() => { JSON.stringify(filters); legacyRestoreKey; filterMode; page; listMode; activeTab; if (!initialized) return; untrack(() => scheduleSearch()); });
  $effect(() => { if (initialized && filterMode === 'uql') untrack(() => { if (!uqlCatalog && !uqlCatalogError) void loadUqlCatalog(); }); });
  $effect(() => { if (initialized && filterMode === 'uql' && uqlCompiler) untrack(() => scheduleSearch()); });
  $effect(() => {
    const session = String($authUser?.id ?? '');
    if (!initialized || !$authReady) return;
    untrack(() => {
      if (uqlSession !== session) {
        uqlLegacyGeneration++;
        uqlParents = []; uqlLegacyScope = ''; uqlLegacyError = ''; uqlLegacyLoading = false;
        if (uqlSession !== undefined && (selectedParent?.share_source === 'veteran' && selectedParent.trainer_id || !selectedParent && compactState.vet)) selectVeteran(undefined);
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

{#snippet supportSummary(option: SupportCardPickerOption)}
  <div class="selected-support-copy">
    <div class="support-identity">
      <img class="support-rarity" src={`/game-assets/support-rarity/${option.rarity.toLowerCase()}.png`} alt={option.rarity}/>
      <strong>{option.character || option.title}</strong>
    </div>
    <div class="support-subtitle">
      {#if option.type === 'Friend'}<span role="img" aria-label="Friend"><Icon name="users" size={22}/></span>{:else}<img src={`/assets/images/icon/stats/${option.type.toLowerCase()}.webp`} alt={option.type} title={option.type}/>{/if}
      <small>{option.character && option.title !== option.character ? option.title : option.type}</small>
    </div>
  </div>
{/snippet}


{#snippet characterFilters()}
  <section class="quick-section legacy-quick"><DatabaseCharacterRules options={characterOptions} loading={charactersLoading} error={charactersError} onretry={loadCharacters} allowMain={filters.mainParentIds.map(String)} hideMain={filters.excludeMainParentIds.map(String)} allowGreat={filters.includeParentIds.map(String)} hideGreat={filters.excludeParentIds.map(String)} onchange={selectCharacterRule}/></section>
{/snippet}

{#snippet supportFilters()}
  <section class="quick-section support-quick">{#if !compactFilters.current}<h3>Support Card &amp; LB</h3>{/if}<div class="support-lb-inline"><SupportCardPicker id="advanced-support-card" compact onclear={() => { filters.supportCardId = undefined; filters.minLimitBreak = undefined; }} label="Borrow support card" options={supportOptions} selectedOption={selectedSupportOption} loading={supportsLoading} error={supportsError} cached={supportsCached || supportsLoaded} onopen={() => void loadSupports()} onretry={() => void loadSupports(true)} value={String(filters.supportCardId ?? '')} maxVisible={12} onselect={(value) => { filters.supportCardId = Number(value); page = 1; }}/><div class="lb-control"><Slider id="support-limit-break-advanced" label="Min LB" min={0} max={4} value={filters.minLimitBreak ?? 0} showTicks showTickLabels tickLabels={['LB0','LB1','LB2','LB3','MLB']} onchange={changeLimitBreak}/>{#if selectedSupportOption}{@render supportSummary(selectedSupportOption)}{/if}</div></div></section>
{/snippet}

{#snippet trainerFilters()}
  <section class="quick-section search-quick">{#if !compactFilters.current}<h3>Search users</h3>{/if}<div class="field-grid"><TextField id="trainer-id" label="Trainer ID" placeholder="123 456 789" value={filters.trainerId ?? ''} oninput={(event) => setScalar('trainerId', (event.currentTarget as HTMLInputElement).value)}/><TextField id="trainer-name" label="Username" type="search" placeholder="Trainer Name" value={filters.trainerName ?? ''} oninput={(event) => setScalar('trainerName', (event.currentTarget as HTMLInputElement).value)}/></div></section>
{/snippet}

<svelte:head><title>Database · uma.moe</title><meta name="description" content="Search the uma.moe inheritance database and browse characters, support cards, skills, and factors."/></svelte:head>
<SourcePage routeId="database" title="Database" width="wide">
  <div class="inheritance-database"><PageHeading eyebrow="Inheritance" title="Database" description="Find optimal inheritance pairings and support cards for Uma Musume." flush>{#snippet actions()}<Button variant="secondary" size="sm" icon="add" onclick={() => submitOpen = true}>Add Trainer ID</Button>{/snippet}</PageHeading><div class="content-container" bind:this={filterStart} use:trackScrollShortcut>
    <FilterShell title="Filters" activeCount={activeCount} modes={['Basic', 'Advanced', 'UQL']} mode={filterMode} onmodechange={setFilterMode} bind:expanded={filterExpanded} onclear={clearFilters}>
      {#snippet tools()}<FilterPresetMenu bind:draft={presetDraft} message={presetMessage} presets={presetViews} onsave={savePreset} onload={loadPreset} ondelete={deletePreset} onexport={() => void exportPresets()} onimport={importPresets}/>{/snippet}
      {#if filterMode === 'uql'}
        {#await import('./DatabaseUqlEditor.svelte')}
          <Spinner label="Loading UQL editor…"/>
        {:then editor}
          <editor.default bind:value={() => filters.uql ?? '', value => filters.uql = value} validation={uqlValidation} {characters} {supports} catalog={uqlCatalog} loading={uqlCatalogLoading} legacyParents={uqlLegacyParents} onpicklegacy={() => uqlLegacyPickerOpen = true} onclear={clearFilters}/>
        {:catch}
          <Banner tone="warning" title="UQL suggestions unavailable">You can still edit and run your query below. <Button size="sm" variant="secondary" onclick={() => { persist(); location.reload(); }}>Retry editor</Button></Banner>
          <div class="uql-fallback">
            <label for="uql-plain-query">UQL query</label>
            <textarea id="uql-plain-query" bind:value={filters.uql} rows="4" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="uql-plain-status" aria-invalid={uqlValidation.state === 'invalid' ? 'true' : undefined}></textarea>
            <span id="uql-plain-status" role="status">{uqlValidation.message}</span>
          </div>
        {/await}
      {:else}
        <div class="filter-grid">
          <div class="context-filters" class:advanced={filterMode === 'advanced'}>
            <div class="affinity-context">
              <DatabaseFilterGroup id="affinity" bind:open={affinityOpen} title="Affinity" count={[filters.playerCharaId, selectedVeteranId || sharedLegacyLabel].filter(Boolean).length}>
                <DatabaseAffinityFilter characters={aceOptions} loading={charactersLoading} error={charactersError} onretry={loadCharacters} targetId={String(filters.playerCharaId ?? '')} veteran={veteranView} {sharedLegacyLabel} selectedAccountId={selectedParent?.trainer_id} ontargetchange={selectTarget} onveteranchange={selectVeteran}/>
              </DatabaseFilterGroup>
            </div>

            {#if filterMode === 'advanced'}
              <div class="quick-context">
                {#if compactFilters.current}
                  <DatabaseFilterGroup id="characters" title="Include / Exclude Umas" bind:open={tourPanels.characters} count={characterFilterCount}>
                    {@render characterFilters()}
                  </DatabaseFilterGroup>
                  <DatabaseFilterGroup id="support" title="Support Card & LB" bind:open={tourPanels.support} count={supportFilterCount}>
                    {@render supportFilters()}
                  </DatabaseFilterGroup>
                  <DatabaseFilterGroup id="search" title="Search Users" bind:open={tourPanels.search} count={trainerFilterCount}>
                    {@render trainerFilters()}
                  </DatabaseFilterGroup>
                {:else}
                  <DatabaseFilterGroup id="quick" title="Include / Exclude Umas - Support Cards - Search" bind:open={quickFiltersOpen} count={characterFilterCount + supportFilterCount + trainerFilterCount}>
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

          <section class="property-filters" aria-labelledby="property-filter-title">
            <h3 id="property-filter-title">{filterMode === 'basic' ? 'Basic Criteria' : 'Property Filters'}</h3>
            <ResourceStatus {...$factorCatalogState}/>
            <div class="property-grid" class:basic={filterMode === 'basic'}>
              <DatabaseFilterGroup id="inheritance" bind:open={tourPanels.inheritance} title={filterMode === 'basic' ? 'Spark Filters' : 'Inheritance Factors'} variant="factor">
                <div class="spark-builder-help"><Icon name="info" size={14}/><span>Build factor rules below. Separate rows are required together; use <b>OR</b> to accept either adjacent requirement.</span></div>
                <FactorFilterEditor id="blue-factors" label="Blue Factors (Stats)" category="stats" tone="blue" bind:requirements={filters.blue}/>
                <FactorFilterEditor id="pink-factors" label="Pink Factors (Aptitude)" category="aptitude" tone="pink" bind:requirements={filters.pink}/>
                <FactorFilterEditor id="green-factors" label="Green Factors (Unique)" category="unique" tone="green" bind:requirements={filters.green}/>
                <FactorFilterEditor id="white-factors" label="White Factors - Required (Skills/Races)" category="skills-races" tone="white" bind:requirements={filters.white}/>
                {#if filterMode === 'advanced'}
                  <FactorFilterEditor id="optional-white" label="Preferred White Factors" category="skills-races" tone="white" priorityMode bind:requirements={filters.optionalWhite}/>
                  <FactorFilterEditor id="lineage-white" label="Lineage White Factors" category="skills-races" tone="white" priorityMode bind:requirements={filters.lineageWhite}/>
                {/if}
              </DatabaseFilterGroup>

              {#if filterMode === 'advanced'}
                <DatabaseFilterGroup id="main" bind:open={tourPanels.main} title="Main Parent Factors" variant="factor">
                  <FactorFilterEditor id="main-blue" label="Blue Factors (Stats)" category="stats" tone="blue" maxStars={3} addLabelOverride="Add Blue Factor (Stats)" bind:requirements={filters.mainBlue}/>
                  <FactorFilterEditor id="main-pink" label="Pink Factors (Aptitude)" category="aptitude" tone="pink" maxStars={3} addLabelOverride="Add Pink Factor (Aptitude)" bind:requirements={filters.mainPink}/>
                  <FactorFilterEditor id="main-green" label="Green Factors (Unique)" category="unique" tone="green" maxStars={3} addLabelOverride="Add Green Factor (Unique)" bind:requirements={filters.mainGreen}/>
                  <FactorFilterEditor id="main-white" label="White Factors - Required (Skills/Races)" category="skills-races" tone="white" maxStars={3} addLabelOverride="Add White Factor (Skills/Races)" bind:requirements={filters.mainWhite}/>
                  <FactorFilterEditor id="optional-main-white" label="Preferred White Factors" category="skills-races" tone="white" maxStars={3} priorityMode bind:requirements={filters.optionalMainWhite}/>
                  <DatabaseWhiteCategoryFilter heading="Main Parent White Categories" values={mainWhiteCategories} onchange={(category,metric,value)=>setWhiteCategory('main',category,metric,value)}/>
                </DatabaseFilterGroup>
              {/if}

              <div class="criteria-stack">
                <DatabaseFilterGroup id="general" bind:open={tourPanels.general} title={filterMode === 'basic' ? 'Support Card & LB' : 'General Criteria'}>
                  {#if filterMode === 'basic'}
                    <div class="support-lb-inline"><SupportCardPicker id="basic-support-card" compact onclear={() => { filters.supportCardId = undefined; filters.minLimitBreak = undefined; }} label="Borrow support card" options={supportOptions} selectedOption={selectedSupportOption} loading={supportsLoading} error={supportsError} cached={supportsCached || supportsLoaded} onopen={() => void loadSupports()} onretry={() => void loadSupports(true)} value={String(filters.supportCardId ?? '')} maxVisible={12} onselect={(value) => { filters.supportCardId = Number(value); page = 1; }}/><div class="lb-control"><Slider id="support-limit-break" label="Min LB" min={0} max={4} value={filters.minLimitBreak ?? 0} showTicks showTickLabels tickLabels={['LB0','LB1','LB2','LB3','MLB']} onchange={changeLimitBreak}/>{#if selectedSupportOption}{@render supportSummary(selectedSupportOption)}{/if}</div></div>
                  {:else}
                    <div class="threshold-grid general-criteria-grid"><ScenarioMultiSelect id="training-scenario" label="Training Scenario" value={filters.scenarioIds} onchange={(value)=>{filters.scenarioIds=value;page=1;}}/><TextField id="minimum-wins" label="Min Win Count" type="number" min={0} placeholder="0" value={String(filters.minWinCount ?? '')} oninput={(event) => setScalar('minWinCount', numberFrom(event))}/><TextField id="minimum-white" label="Min White Factor Count" type="number" min={0} placeholder="0" value={String(filters.minWhiteCount ?? '')} oninput={(event) => setScalar('minWhiteCount', numberFrom(event))}/><SelectField id="minimum-rank" label="Parent Rank" imageOnly value={String(filters.minParentRank ?? 1)} options={rankOptions} onchange={(value) => filters.minParentRank = Number(value)}/><ToggleButton fieldLabel="Max Follower Accounts" pressed={includeMaxFollowers} icon="users" label="Max Followers" ariaLabel="Include max follower accounts in filters" onclick={()=>{includeMaxFollowers=!includeMaxFollowers;filters.maxFollowerNum=includeMaxFollowers?1000:999;}}/></div>
                  {/if}
                </DatabaseFilterGroup>
                <DatabaseFilterGroup id="total" bind:open={tourPanels.total} title="Total Star Count">
                  {#if filterMode === 'advanced'}<DatabaseWhiteCategoryFilter heading="White Factor Categories" values={lineageWhiteCategories} onchange={(category,metric,value)=>setWhiteCategory('lineage',category,metric,value)}/>{/if}
                  <p>Filter by the combined star count across all factors of each type.</p>
                  <div class="threshold-grid star-count-grid"><TextField id="blue-star-sum" label="Total Blue ★" type="number" min={0} max={9} value={String(filters.minBlueStarsSum ?? '')} oninput={(event) => filters.minBlueStarsSum = numberFrom(event)}/><TextField id="pink-star-sum" label="Total Pink ★" type="number" min={0} max={9} value={String(filters.minPinkStarsSum ?? '')} oninput={(event) => filters.minPinkStarsSum = numberFrom(event)}/><TextField id="green-star-sum" label="Total Green ★" type="number" min={0} max={9} value={String(filters.minGreenStarsSum ?? '')} oninput={(event) => filters.minGreenStarsSum = numberFrom(event)}/><TextField id="white-star-sum" label="Total White ★" type="number" min={0} value={String(filters.minWhiteStarsSum ?? '')} oninput={(event) => filters.minWhiteStarsSum = numberFrom(event)}/></div>
                </DatabaseFilterGroup>
              </div>

              {#if filterMode === 'advanced'}<DatabaseFilterGroup id="races" bind:open={tourPanels.races} title="Race Schedule Filter" count={filters.mainWinSaddle.length + filters.raceSchedule.length} variant="full"><DatabaseRaceScheduleFilter selection={filters.raceSchedule} onchange={(selection, saddleIds) => { filters.raceSchedule = selection; filters.mainWinSaddle = saddleIds; page = 1; }}/></DatabaseFilterGroup>{/if}
            </div>
          </section>

        </div>
      {/if}
    </FilterShell>

    {#if activeFilterViews.length}
      <section class="active-filters" aria-label="Active filters">
        <div class="active-filters-inner">
          <strong>Active Filters:</strong>
          <div class="active-filter-chips">{#each activeFilterViews as chip (chip.id)}<button type="button" data-tone={chip.tone} onclick={() => { chip.remove(); page = 1; }}><span>{chip.label}</span><Icon name="close" size={15}/></button>{/each}</div>
          <button class="clear-current" type="button" onclick={clearFilters}><Icon name="filter" size={15}/><span>Clear current</span></button>
        </div>
      </section>
    {/if}

    <div class="database-tabs" bind:this={resultsStart}>
      <Tabs variant="pills" label="Database results" items={[{ id: 'database', label: 'Database', icon: 'database' }, { id: 'bookmarks', label: 'Bookmarks', icon: 'veterans', badge: bookmarks.length ? String(bookmarks.length) : undefined }]} value={activeTab} onchange={(value) => void switchTab(value as typeof activeTab)}/>
      {#if activeTab === 'bookmarks' && $authUser}<span class="bookmark-limit">{bookmarks.length} / 500</span>{/if}
    </div>

    {#if activeTab === 'database'}
    <section class="inheritance-results">
      <header class="results-header">
        <div class="results-info"><h2>Results</h2>{#if !inheritanceLoading && !inheritanceError}<p>{inheritance.total.toLocaleString()} records found{#if activeCount > 0} <span>(filtered)</span>{/if}</p>{/if}</div>
        <div class="display-controls" class:expanded={displayOptionsOpen}>
          <button class="display-toggle" type="button" aria-label="Display options" aria-expanded={displayOptionsOpen} aria-controls="database-display-options" onclick={() => displayOptionsOpen = !displayOptionsOpen}><Icon name="tune" size={14}/>Display<Icon name="chevron" size={12}/></button>
          <div class="results-controls" id="database-display-options">
          <div class="focus-control"><span>Default Focus</span><div class="focus-options">
            {#each [{ id: 'all', label: 'All' }, { id: 'main', label: 'Main Parent' }, { id: 'left', label: 'Great Parent 1' }, { id: 'right', label: 'Great Parent 2' }] as item}
              <button class:active={defaultFocus === item.id} aria-pressed={defaultFocus === item.id} onclick={() => defaultFocus = item.id as typeof defaultFocus}>{#if item.id === 'all'}<Icon name="lineage" size={14}/>{:else if item.id === 'main'}<Icon name="user" size={14}/>{:else}<b>{item.id === 'left' ? '1' : '2'}</b>{/if}{item.label}</button>
            {/each}
          </div></div>
          <ToggleButton action pressed={hiddenSparkFactorIds.length > 0} icon="eye-off" label="Hide Sparks" badge={hiddenSparkFactorIds.length ? `${hiddenSparkFactorIds.length} hidden` : undefined} ariaLabel={hiddenSparkFactorIds.length ? `Hide sparks, ${hiddenSparkFactorIds.length} currently hidden` : 'Choose sparks to hide'} onclick={() => hiddenSparksOpen = true}/>
          <SelectField id="spark-display" label="Spark display" prefixIcon="lineage" value={splitSparks ? sparkPortraits ? 'portraits' : 'split' : 'combined'} options={[{value:'combined',label:'Combined sparks'},{value:'split',label:'Split sparks'},{value:'portraits',label:'Split + portraits'}]} onchange={(value)=>{splitSparks=value!=='combined';sparkPortraits=value==='portraits';}}/>
          <SelectField id="spark-order" label="Spark order" value={sparkOrder} options={sparkOrderOptions} onchange={changeSparkOrder}/>
          <ToggleButton pressed={includeMaxFollowers} icon="users" label="Max Followers" ariaLabel="Include accounts at the maximum follower limit" onclick={() => { includeMaxFollowers = !includeMaxFollowers; filters.maxFollowerNum = includeMaxFollowers ? 1000 : 999; }}/>
          <ToggleButton pressed={listMode === 'infinite'} icon="more" label={listMode === 'infinite' ? 'Infinite' : 'Pages'} onclick={toggleListMode}/>
          </div>
        </div>
        <div class="sort-control"><span>Sort by</span><SelectField id="database-sort" label="Sort by" hideLabel value={filters.sortBy} options={[{ value: 'trending', label: 'Trending' }, { value: 'affinity_score', label: 'Affinity' }, { value: 'win_count', label: 'G1 Wins' }, { value: 'white_count', label: 'White Skills Amount' }, { value: 'blue_stars_sum', label: 'Total Blue Stars' }, { value: 'pink_stars_sum', label: 'Total Red Stars' }, { value: 'green_stars_sum', label: 'Total Green Stars' }, { value: 'white_stars_sum', label: 'Total White Stars' }, { value: 'parent_rank', label: 'Score' }, { value: 'last_updated', label: 'Newest First' }]} onchange={(value) => { sortSelectionMode = 'manual'; filters.sortBy = value as InheritanceSearchFilters['sortBy']; page = 1; }}/></div>
      </header>
      {#if filters.optionalWhite.length || filters.optionalMainWhite.length || filters.lineageWhite.length}<div class="sorting-notice"><Icon name="info" size={15}/><span>Results are sorted by preferred white priority groups first (P0, then P1…), then by the selected sort.</span></div>{/if}
      {#if pendingSearch}<div class="loading pending"><Spinner size={24}/><span>Filters changed. Results will refresh when you return to Database.</span></div>{/if}
      {#if filterMode === 'uql' && uqlCatalogError}<Banner title="UQL unavailable" tone="danger"><p>{uqlCatalogError}</p><Button variant="secondary" size="sm" onclick={() => window.location.reload()}>Reload UQL</Button></Banner>{/if}
      {#if filterMode === 'uql' && uqlContext.failedLegacy}<Banner title="Legacy unavailable" tone="danger"><p>{uqlLegacyError}</p><Button variant="secondary" size="sm" onclick={() => { if (uqlContext.failedLegacy) void loadUqlLegacy(uqlContext.failedLegacy, true); }}>Retry legacy</Button></Banner>{/if}
      {#if affinityError && !inheritanceError}{@render affinityFailure()}{/if}
      {#if inheritanceLoading && !appendingResults}<div class="loading"><Spinner size={30}/><span>Searching inheritance records…</span></div>
      {:else if inheritanceError && !appendingResults}<div class="result-error" role="alert"><EmptyState icon="warning" title="Inheritance search unavailable" description={inheritanceError}>{#snippet actions()}<div class="error-actions"><Button variant="secondary" size="sm" onclick={() => scheduleSearch(true)}>Retry</Button><Button href={DISCORD_SUPPORT_URL} target="_blank" variant="secondary" size="sm" icon="discord">Report on Discord</Button></div>{/snippet}</EmptyState></div>
      {:else if inheritance.records.length}<ContentAd routeId="database" top/><div class="inheritance-list" use:virtualScroll={{ items: inheritance.records, searchText: findRecordText, key: record => record.id, estimate: 640, onrange: range => virtualRange = range, onend: canLoadMore ? loadMoreResults : undefined }}>{#each inheritance.records.slice(virtualRange.start, virtualRange.end) as record, localIndex (record.id)}{@const index = virtualRange.start + localIndex}<div data-virtual-index={index}><InheritanceResultCard {record} {uqlHighlight} activeFilters={filterMode === 'uql' ? undefined : filters} {characters} {supports} {defaultFocus} {splitSparks} {sparkPortraits} {sparkOrder} {hiddenSparkFactorIds} {affinityEngine} {raceGroups} {partner} targetId={filters.playerCharaId} bind:sparkPerRun bind:showOccurrences bind:showP2Sparks bind:collapsedWhiteSections partnerWinSaddles={filters.p2WinSaddle} bookmarked={bookmarkedIds.has(record.accountId)} actionBusy={bookmarkBusyIds.includes(record.accountId)} oncopy={copyTrainer} onshare={shareRecord} onreport={reportRecord} onbookmark={toggleBookmark} onplanner={openInPlanner} onvisible={queueBorrowView}/>{#if index % 6 === 5 && index < inheritance.records.length - 1 && index < 42}<ContentAd routeId="database" index={2 + Math.floor(index / 6)}/>{/if}</div>{/each}</div>{#if listMode === 'paginated' && inheritance.totalPages > 1}<Pagination bind:page pages={inheritance.totalPages} total={inheritance.total} pageSize={inheritance.pageSize} jump onchange={() => window.scrollTo({ top: 0, behavior: 'smooth' })}/>{/if}
      {:else}<EmptyState icon="search" title="No records found" description="Try adjusting your search criteria or submit your Trainer ID to help the community.">{#snippet actions()}<Button variant="secondary" size="sm" icon="add" onclick={() => submitOpen = true}>Add Trainer ID</Button>{/snippet}</EmptyState>{/if}
      {#if appendingResults && inheritanceLoading}<div class="loading" role="status"><Spinner size={30}/><span>Loading more records…</span></div>
      {:else if appendingResults && inheritanceError}<Banner title="More records could not be loaded" tone="danger"><p>{inheritanceError}</p><Button variant="secondary" size="sm" onclick={() => scheduleSearch(true)}>Retry loading more</Button></Banner>{/if}
    </section>
    {:else}<section class="bookmark-results">
      {#if !$authUser}<div class="bookmarks-empty"><Icon name="veterans" size={54}/><h2>Sign in to use bookmarks</h2><p>Please sign in to bookmark and save records.</p><Button href="/login" variant="primary">Sign in</Button></div>
      {:else if bookmarksLoading}<div class="loading"><Spinner size={30}/><span>Loading bookmarks…</span></div>
      {:else if bookmarksError}<Banner title="Bookmarks unavailable" tone="danger"><p>{bookmarksError}</p><Button variant="secondary" size="sm" onclick={() => void loadBookmarks()}>Retry</Button></Banner>
      {:else if bookmarks.length}
        <header class="bookmark-toolbar"><div><h2>Bookmarks</h2><p>{filteredBookmarks.length.toLocaleString()} bookmarked records{#if filteredBookmarks.length !== bookmarks.length} <span>(filtered from {bookmarks.length})</span>{/if}</p></div><div class="bookmark-filters"><SegmentedControl label="Bookmark status filter" value={bookmarkFilter} options={[{value:'all',label:`All (${bookmarks.length})`},{value:'unchanged',label:`Unchanged (${bookmarks.length - modifiedBookmarkCount})`},{value:'modified',label:`Modified (${modifiedBookmarkCount})`}]} onchange={value => { bookmarkFilter = value as typeof bookmarkFilter; bookmarkPage = 1; }}/></div><div class="bookmark-actions">{#if modifiedBookmarkCount}<Button variant="secondary" size="sm" onclick={() => void removeModifiedBookmarks()}>Remove modified ({modifiedBookmarkCount})</Button>{/if}<Button variant="danger" size="sm" onclick={() => void clearAllBookmarks()}>{clearBookmarksArmed ? 'Confirm clear all' : 'Clear all'}</Button></div></header>
        {#if affinityError}{@render affinityFailure()}{/if}
        <ContentAd routeId="database" top/><div class="inheritance-list">{#each visibleBookmarks as record (record.id)}<InheritanceResultCard {record} {uqlHighlight} activeFilters={filterMode === 'uql' ? undefined : filters} {characters} {supports} {defaultFocus} {splitSparks} {sparkPortraits} {sparkOrder} {hiddenSparkFactorIds} {affinityEngine} {raceGroups} {partner} targetId={filters.playerCharaId} bind:sparkPerRun bind:showOccurrences bind:showP2Sparks bind:collapsedWhiteSections partnerWinSaddles={filters.p2WinSaddle} bookmarked actionBusy={bookmarkBusyIds.includes(record.accountId)} oncopy={copyTrainer} onshare={shareRecord} onreport={reportRecord} onbookmark={toggleBookmark} onplanner={openInPlanner} onvisible={queueBorrowView}/>{/each}</div>
        {#if bookmarkPages > 1}<Pagination bind:page={bookmarkPage} pages={bookmarkPages} total={filteredBookmarks.length} {pageSize} jump/>{/if}
      {:else}<EmptyState icon="veterans" title="No bookmarks yet" description="Save records from the Database tab and they will appear here."/>{/if}
    </section>{/if}
  </div></div>
  {#if hiddenSparksOpen}<HiddenSparksDialog bind:open={hiddenSparksOpen} selectedFactorIds={hiddenSparkFactorIds} onsave={saveHiddenSparks}/>{/if}
  <Dialog id="trainer-submit" bind:open={submitOpen} title="Add Trainer ID" icon="id-card" maxWidth="440px" mobileInset="24px" onclose={() => { submissionTouched = false; }}>
    <form class="trainer-submit" onsubmit={(event) => { event.preventDefault(); void submitTrainer(); }}>
      <p>Add your inheritance team to the database.</p>
      <div class="submission-field">
        <span class="submission-count" class:complete={trainerDigits.length === 12} aria-hidden="true">{trainerDigits.length} / 12</span>
        <TextField id="trainer-submission" label="Trainer ID" placeholder="123 456 789 012" value={trainerSubmission} inputmode="numeric" autocomplete="off" maxlength={15} help="Find your 12-digit ID in your in-game profile." error={submissionTouched && trainerDigits.length !== 12 ? 'Please enter a valid 12-digit trainer ID' : undefined} oninput={(event) => { const digits = (event.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12); trainerSubmission = digits.match(/.{1,3}/g)?.join(' ') ?? ''; }}/>
      </div>
    </form>
    {#snippet actions()}<Button variant="secondary" size="sm" disabled={submissionBusy} onclick={() => submitOpen = false}>Cancel</Button><Button variant="secondary" size="sm" icon="add" loading={submissionBusy} disabled={trainerDigits.length !== 12} onclick={() => void submitTrainer()}>Add trainer</Button>{/snippet}
  </Dialog>
  <ToastRegion {toasts} ondismiss={(id) => toasts = toasts.filter((toast) => toast.id !== id)}/>
</SourcePage>
{#if scrollShortcut}
  <button type="button" class="floating-scroll-btn" class:results-mode={scrollShortcut === 'results'} onclick={useScrollShortcut}>
    <span class="scroll-arrow" class:up={scrollShortcut === 'top'}><Icon name="arrow-right" size={18}/></span>
    <span aria-live="polite">{#if scrollShortcut === 'top'}Back to Top{:else if shortcutLoading}Searching…{:else if shortcutError}Results unavailable{:else}Results ({shortcutCount.toLocaleString()}){/if}</span>
  </button>
{/if}
{#if uqlLegacyPickerOpen}<ParentPickerDialog bind:open={uqlLegacyPickerOpen} targetId={uqlContext.targetId ?? filters.playerCharaId} selectedAccountId={selectedParent?.trainer_id} sessionScope="database-uql" onselect={chooseUqlLegacy}/>{/if}

{#snippet affinityFailure()}
  <Banner title="Affinity details unavailable" tone="danger"><p>{affinityError}</p><Button variant="secondary" size="sm" onclick={() => void loadAffinity(true)}>Retry affinity</Button></Banner>
{/snippet}

<style>
  .floating-scroll-btn { position:fixed; right:max(16px,env(safe-area-inset-right)); bottom:calc(16px + env(safe-area-inset-bottom) + var(--footer-ad-height,0px)); z-index:var(--z-rail); display:flex; align-items:center; gap:6px; min-height:44px; padding:8px 16px; border:1px solid var(--border-secondary); border-radius:24px; background:var(--surface-2); color:var(--text-primary); box-shadow:var(--shadow-lg); font-size:12px; font-weight:700; cursor:pointer; }
  .floating-scroll-btn.results-mode { border-color:var(--accent-primary); color:var(--accent-primary); }
  .floating-scroll-btn:hover { background:var(--surface-3); }
  .scroll-arrow { transform:rotate(90deg); }.scroll-arrow.up { transform:rotate(-90deg); }
  .uql-fallback { display:grid; gap:8px; padding-block:12px; }
  .uql-fallback textarea { box-sizing:border-box; width:100%; min-height:100px; padding:12px; resize:vertical; border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--surface-1); color:var(--text-primary); font:16px/1.5 monospace; }
  .uql-fallback span { font-size:12px; color:var(--text-secondary); }


  .inheritance-database{min-height:calc(100dvh - var(--utility-height));background:var(--color-canvas);overflow-x:clip}.content-container{min-width:0;display:flex;flex-direction:column;gap:.75rem;padding:1rem var(--page-gutter-current)}
  .filter-grid{min-width:0;display:block}.context-filters,.affinity-context,.quick-context{min-width:0}.context-filters,.quick-context{display:grid;gap:8px}.field-grid,.threshold-grid{min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}
  .active-filters{margin-top:8px;padding:10px 14px;border:1.5px solid var(--border-primary);border-radius:var(--radius-sm);background:var(--surface-1)}.active-filters-inner{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:8px 10px}.active-filters-inner>strong{padding-top:5px;color:var(--text-secondary);font-size:13px;font-weight:500;white-space:nowrap}.active-filter-chips{min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:8px;overflow:hidden}.active-filter-chips button{max-width:100%;min-width:0;min-height:28px;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid transparent;border-radius:14px;background:rgb(158 158 158/.15);color:var(--text-secondary);cursor:pointer;font-size:13px;font-weight:500}.active-filter-chips button:hover{filter:brightness(1.15)}.active-filter-chips button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.active-filter-chips button :global(svg){flex:0 0 auto;opacity:.7}.active-filter-chips button[data-tone='blue']{border-color:rgb(33 150 243/.3);background:rgb(33 150 243/.15);color:var(--accent-primary)}.active-filter-chips button[data-tone='pink']{border-color:rgb(233 30 99/.3);background:rgb(233 30 99/.15);color:var(--color-pink)}.active-filter-chips button[data-tone='green']{border-color:rgb(76 175 80/.3);background:rgb(76 175 80/.15);color:var(--accent-secondary)}.active-filter-chips button[data-tone='white']{border-color:var(--border-secondary);background:var(--surface-3);color:var(--text-primary)}.active-filter-chips button[data-tone='optional']{border-color:var(--border-secondary);background:var(--surface-2);color:var(--text-secondary)}.active-filter-chips button[data-tone='character']{border-color:rgb(255 193 7/.3);background:rgb(255 193 7/.15);color:var(--accent-warning)}.active-filter-chips button[data-tone='exclude']{border-color:rgb(244 67 54/.3);background:rgb(244 67 54/.15);color:var(--accent-error)}.active-filter-chips button[data-tone='support']{border-color:rgb(156 39 176/.3);background:rgb(156 39 176/.15);color:var(--accent-purple)}.clear-current{height:28px;display:inline-flex;align-items:center;gap:5px;padding:0 9px;border:1px solid rgb(239 83 80/.28);border-radius:var(--radius-xs);background:rgb(244 67 54/.08);color:var(--accent-error);cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap}
  .advanced-quick-grid{min-width:0;display:flex;align-items:stretch;flex-wrap:wrap;column-gap:0;row-gap:0;padding:0}.quick-section{min-width:0;display:flex;align-items:stretch;flex-direction:column;gap:10px;padding:0 16px}.quick-section>h3{margin:0;color:var(--color-blue);font-size:11px;font-weight:700;letter-spacing:.8px;line-height:1;text-transform:uppercase}.legacy-quick{min-width:440px;flex:1 1 440px;padding-left:0}.support-quick{flex:0 1 380px;border-left:1.5px solid var(--border-primary)}.search-quick{min-width:280px;flex:0 1 320px;padding-right:0;border-left:1.5px solid var(--border-primary)}.search-quick>.field-grid{width:100%;grid-template-columns:1fr}
  .property-filters{min-width:0;margin-top:8px}.property-filters>h3{margin:0 0 6px;color:var(--text-primary);font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}.property-grid{min-width:0;display:flex;align-items:stretch;flex-wrap:wrap;gap:8px}.property-grid.basic{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(390px,.85fr);align-items:start}.property-grid :global(.database-filter-card p){margin:-2px 0 8px;color:var(--text-secondary);font-size:11px}.criteria-stack{min-width:280px;display:flex;flex:1 1 300px;align-self:stretch;flex-direction:column;gap:8px}.criteria-stack :global(.database-filter-card){flex:0 0 auto}.criteria-stack :global(.database-filter-card:last-child){flex:1 1 auto}.star-count-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.star-count-grid :global(.field:nth-child(1) .field-label){color:var(--accent-primary)}.star-count-grid :global(.field:nth-child(2) .field-label){color:var(--color-pink)}.star-count-grid :global(.field:nth-child(3) .field-label){color:var(--accent-secondary)}.star-count-grid :global(.field:nth-child(4) .field-label){color:var(--text-primary)}
  .spark-builder-help{height:32px;display:flex;align-items:center;gap:7px;box-sizing:border-box;margin-bottom:5px;padding:0 8px;border-left:2px solid rgb(var(--accent-primary-rgb)/.6);background:rgb(var(--accent-primary-rgb)/.055);color:var(--text-secondary);font-size:10px;line-height:1.25}.spark-builder-help :global(svg){flex:0 0 auto;color:var(--accent-primary)}.spark-builder-help b{color:var(--text-primary)}
  .general-criteria-grid :global(.field:first-child){grid-column:1/-1}
.support-lb-inline{min-width:0;flex:1;min-height:96px;display:grid;grid-template-columns:auto minmax(150px,1fr);align-items:stretch;gap:14px}.lb-control{align-self:center;min-width:0;display:grid;gap:6px}.lb-control :global(.ui-button){width:max-content}.inheritance-results{min-width:0;display:grid;gap:var(--space-3)}.inheritance-list{min-width:0;display:grid;gap:7px}.result-error{min-width:0}.result-error :global(.empty){border-color:rgb(var(--accent-error-rgb)/.35);background:rgb(var(--accent-error-rgb)/.06)}.result-error :global(.icon){color:var(--accent-error)}.result-error :global(p){color:var(--text-secondary)}.error-actions{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}.sorting-notice{min-height:36px;display:flex;align-items:center;gap:7px;padding:5px 9px;border-left:3px solid var(--accent-primary);background:rgb(var(--accent-primary-rgb)/.08);color:var(--text-secondary);font-size:10px}.sorting-notice :global(svg){color:var(--accent-primary)}
  .database-tabs{max-width:100%;width:fit-content;display:flex;align-items:center;gap:4px}.bookmark-limit{margin-left:8px;padding:4px 10px;border-left:1px solid var(--border-primary);color:var(--text-muted);font-size:.75rem;white-space:nowrap}
  .results-header{min-width:0;display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-primary)}.results-info{flex:0 0 auto;align-self:flex-start}.results-info h2{margin:0;font-size:1.35rem}.results-info p{margin:2px 0 0;color:var(--text-secondary);font-size:.82rem}.results-info p span{color:var(--accent-primary)}.results-controls{display:contents}.focus-control{display:grid;gap:3px;margin-left:auto}.focus-control>span,.sort-control>span{color:var(--text-secondary);font-size:.65rem;font-weight:700}.focus-options{min-height:36px;display:flex;align-items:stretch;box-sizing:border-box;padding:2px;border:1px solid var(--border-primary);border-radius:6px;background:var(--factor-field-bg)}.focus-options button{min-height:30px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 8px;border:0;border-radius:4px;background:transparent;color:var(--factor-field-text);cursor:pointer;font-size:.68rem;font-weight:700}.focus-options button :global(svg){flex:0 0 auto}.focus-options button b{min-width:13px;height:13px;display:grid;place-items:center;border-radius:2px;background:var(--surface-3);font-size:8px;line-height:1}.focus-options button.active{background:rgb(var(--accent-primary-rgb)/.18);color:var(--accent-primary)}.sort-control{width:172px;display:grid;gap:3px}.sort-control :global(.select-control){height:36px;border-radius:6px;font-size:.75rem}.bookmarks-empty{min-height:330px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-secondary);text-align:center}.bookmarks-empty h2{margin:7px 0 0;color:var(--text-primary)}.bookmarks-empty p{margin:0 0 10px}.loading { min-height:260px;display:flex;align-items:center;justify-content:center;gap:var(--space-3);color:var(--color-text-muted);}
  .bookmark-results{min-width:0;display:grid;gap:10px}.bookmark-toolbar{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:9px 0;border-bottom:1px solid var(--border-subtle)}.bookmark-toolbar h2,.bookmark-toolbar p{margin:0}.bookmark-toolbar h2{font-size:var(--font-lg)}.bookmark-toolbar p{margin-top:2px;color:var(--text-secondary);font-size:11px}.bookmark-toolbar p span{color:var(--accent-primary)}.bookmark-filters{min-width:0;max-width:100%}.bookmark-actions{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:6px;margin-left:auto}.trainer-submit{display:grid;gap:16px}.trainer-submit p{margin:0;color:var(--text-secondary);font-size:13px;line-height:1.4}.submission-field{position:relative}.submission-count{position:absolute;top:0;right:0;color:var(--text-secondary);font-size:11px;line-height:1.4;font-variant-numeric:tabular-nums}.submission-count.complete{color:var(--accent-success)}.trainer-submit :global(.field-label){padding-right:52px}.trainer-submit :global(input){font-size:16px;font-variant-numeric:tabular-nums;letter-spacing:.5px}.trainer-submit :global(.field-message){font-size:12px;color:var(--text-secondary)}.trainer-submit :global(.field-error){color:var(--color-danger)}
  @media (min-width:901px) and (max-width:1700px) { .legacy-quick{min-width:0;flex:1 1 100%;padding-right:0;padding-bottom:14px;margin-bottom:14px;border-bottom:1.5px solid var(--border-primary)}.support-quick{border-left:0;padding-left:0}.search-quick{flex:1 1 340px} }
  @media (max-width:1180px) { .property-grid.basic{grid-template-columns:minmax(0,1fr)}.results-header{align-items:stretch;flex-direction:column}.results-controls{min-width:0;display:flex;align-items:flex-end;gap:7px;flex-wrap:wrap}.focus-control{margin-left:0} }
  @media(max-width:768px){.database-tabs{width:100%}.database-tabs :global(.tabs){width:100%}.database-tabs :global(.tab){flex:1}}
  @media (max-width:940px){.bookmark-toolbar{align-items:flex-start}.bookmark-filters{order:1;flex-basis:100%}}
  @media (max-width:900px) { .support-quick{flex:1 1 100%;padding-right:0;padding-bottom:14px;margin-bottom:14px;border-bottom:1.5px solid var(--border-primary)}.search-quick{min-width:0;flex:1 1 100%;padding-left:0;border-left:0}.search-quick>.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.property-grid{flex-direction:column;flex-wrap:nowrap}.criteria-stack{width:100%;min-width:0;flex:0 1 auto}.support-lb-inline{grid-template-columns:auto minmax(0,1fr);gap:10px}.lb-control :global(.ui-button){width:100%} }
  @media (max-width:900px) { .quick-section{min-width:0;width:100%;flex:0 0 auto;gap:0;margin:0;padding:0;border:0} }
  @media (max-width:600px) { .content-container{padding:1rem 4px}.search-quick>.field-grid{grid-template-columns:1fr}.spark-builder-help{height:auto;min-height:32px;padding-block:5px}.active-filters{padding:10px}.active-filters-inner{grid-template-columns:minmax(0,1fr) auto;align-items:center}.active-filters-inner>strong{grid-column:1}.active-filter-chips{grid-column:1/-1}.clear-current{grid-column:2;grid-row:1}.active-filter-chips button{min-height:32px;padding-inline:8px;font-size:11px}.database-tabs :global([role='tab']){padding-inline:8px}.bookmark-limit{display:none}.results-controls{display:grid;grid-template-columns:1fr 1fr}.focus-control{grid-column:1/-1}.focus-options button{min-height:var(--touch-target);flex:1;padding-inline:3px;font-size:9px}.sort-control{width:auto;grid-column:1/-1}.bookmark-filters :global(.segments){width:100%}.bookmark-filters :global(button){min-width:0;flex:1;min-height:var(--touch-target);padding-inline:5px;font-size:12px}.bookmark-actions{display:grid;grid-template-columns:1fr 1fr;order:2;width:100%;margin-left:0}.bookmark-actions :global(.ui-button){width:100%;padding-inline:4px} }
  .legacy-quick{gap:0}
  .support-lb-inline{flex:0 0 auto}
  .selected-support-copy{margin-top:8px;padding-top:10px;border-top:1px solid var(--border-subtle);display:grid;gap:4px;overflow-wrap:anywhere;font-size:12px;line-height:1.4}
  .support-identity,.support-subtitle{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:6px;min-width:0}
  .support-identity img{width:20px;height:20px;object-fit:contain;justify-self:center}
  .support-subtitle img,.support-subtitle>span{width:22px;height:22px;object-fit:contain;justify-self:center}
  .selected-support-copy small{color:var(--text-secondary);font-size:11px}.lb-control{--slider-label-gap:0px}
  .display-controls { display:contents; }
  .display-toggle { display:flex; align-items:center; justify-content:center; gap:6px; height:36px; padding:0 12px; border:1px solid var(--factor-field-border); border-radius:6px; background:var(--factor-field-bg); color:var(--text-secondary); font-size:12px; cursor:pointer; }
  .display-toggle[aria-expanded='true'] { color:var(--accent-primary); border-color:var(--accent-primary); }
  .display-controls:not(.expanded) .results-controls { display:none; }
  .results-controls :global(label) { color:var(--text-secondary); font-size:.65rem; font-weight:700; }
  @media (min-width:768px) {
    .results-header { display:grid; grid-template-columns:minmax(0,1fr) 180px auto; align-items:end; gap:12px; }
    .results-info { grid-column:1; grid-row:1; }
    .sort-control { grid-column:2; grid-row:1; width:100%; margin:0; }
    .display-toggle { grid-column:3; grid-row:1; }
    .results-controls { grid-column:1/-1; grid-row:2; display:flex; flex-wrap:wrap; align-items:end; gap:10px 12px; padding:10px 12px; border:1px solid var(--border-primary); border-radius:8px; background:var(--surface-1); }
    .focus-control { margin:0; }
    .focus-options { width:max-content; max-width:100%; }
    .results-controls > :global(.field) { width:180px; }
  }
  @media (max-width:767px) {
    .content-container { padding:8px 4px; gap:8px; }
    .results-header { display:grid; grid-template-columns:minmax(0,1fr) 124px auto; grid-template-rows:20px 28px; align-items:center; gap:4px 6px; padding:6px 0; }
    .results-info { display:contents; }
    .results-info h2 { grid-column:1; grid-row:1; align-self:baseline; font-size:17px; line-height:20px; }
    .results-info p { grid-column:1; grid-row:2; margin:0; font-size:11px; line-height:14px; }
    .display-toggle { grid-column:3; grid-row:2; display:flex; align-items:center; justify-content:center; gap:4px; height:28px; min-height:28px; padding:4px 7px; border:1px solid var(--factor-field-border); border-radius:6px; background:var(--factor-field-bg); color:var(--text-secondary); font-size:11px; cursor:pointer; }
    .display-toggle[aria-expanded='true'] { color:var(--accent-primary); border-color:var(--accent-primary); }
    .results-controls { grid-column:1/-1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:end; gap:8px; padding:8px; border:1px solid var(--border-primary); border-radius:6px; background:var(--surface-1); }
    .display-controls:not(.expanded) .results-controls { display:none; }
    .focus-control { grid-column:1/-1; min-width:0; gap:2px; }
    .focus-control>span, .sort-control>span { font-size:10px; }
    .focus-options { width:100%; max-width:100%; min-height:28px; }
    .focus-options button { flex:1 1 auto; min-height:24px; padding-inline:8px; font-size:10px; }
    .results-controls :global(.ui-toggle) { width:100%; height:28px; min-height:28px; padding-inline:7px; font-size:11px; }
    .results-controls > :global(.field) { width:100%; }
    .results-controls :global(.select-control) { min-height:28px; height:28px; font-size:11px; }
    .sort-control { display:contents; }
    .sort-control > span { grid-column:2; grid-row:1; align-self:baseline; line-height:20px; }
    .sort-control > :global(.field) { grid-column:2; grid-row:2; }
    .sort-control :global(.select-control) { height:28px; min-height:28px; font-size:11px; }
  }
</style>
