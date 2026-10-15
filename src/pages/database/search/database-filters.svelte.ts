import type { Toast } from '@/components/feedback/ToastRegion.svelte';
import {
  activeInheritanceFilterCount,
  emptyInheritanceFilters,
  inheritanceRequestFilters,
  type InheritanceFilterMode,
  type InheritanceSearchFilters
} from '@/lib/inheritance/inheritance-search';
import { setUqlLegacy } from '@/lib/inheritance/uql/uql-context';
import type { UqlQueryCatalog } from '@/lib/inheritance/uql/uql-compiler';
import type { SelectableParent } from '@/lib/veterans/parent-picker';
import { restoreSavedParent } from '../database-legacy';
import { automaticInheritanceSort } from '../database-local-results';
import {
  decodeDatabaseFilterState,
  filtersFromCompactState,
  readDatabasePreferences,
  writeDatabasePreferences,
  type CompactDatabaseFilterState,
  type SavedDatabaseFilterState
} from '../database-preferences';
import type { DatabaseUqlState } from '../uql/database-uql-state.svelte';

export interface DatabaseFiltersSource {
  userId: () => string | number | undefined;
  signedIn: () => boolean;
  notify: (title: string, tone?: Toast['tone']) => void;
  /** Returns to the first result page after a change that replaces the results. */
  onreset: () => void;
}

/** Filter values and the selected legacy, with their stored and compact share state. */
export class DatabaseFilters {
  mode = $state<InheritanceFilterMode>('basic');
  values = $state<InheritanceSearchFilters>(emptyInheritanceFilters());
  selectedParent = $state.raw<SelectableParent>();
  includeMaxFollowers = $state(false);
  presetMessage = $state('');
  compact = $state<CompactDatabaseFilterState>({});
  saved = $state<SavedDatabaseFilterState | null>(null);

  #sortSelection: 'auto' | 'manual' = 'auto';
  #appliedUqlTarget = false;
  #appliedUqlLegacy = false;
  #disposed = false;
  #source: DatabaseFiltersSource;

  activeCount = $derived(activeInheritanceFilterCount(this.values));
  legacyRestoreKey = $derived(JSON.stringify(this.compact.vet));
  selectedVeteranId = $derived(this.selectedParent?.pickerId ?? '');
  sharedLegacyLabel = $derived(
    !this.selectedParent && (this.values.p2MainCharaId || this.values.p2WinSaddle.length)
      ? this.compact.p2i != null
        ? `Shared legacy #${this.compact.p2i}`
        : 'Shared legacy context'
      : undefined
  );

  constructor(source: DatabaseFiltersSource) {
    this.#source = source;
  }

  setMode = (value: string): void => {
    if (value !== 'basic' && value !== 'advanced' && value !== 'uql') return;
    if (value === 'uql' && this.values.uql === undefined) this.values.uql = '';
    this.mode = value;
  };

  selectVeteran = (parent: SelectableParent | undefined): void => {
    this.selectedParent = parent;
    const characterId = parent?.card_id ?? parent?.trained_chara_id;
    this.values.p2MainCharaId = characterId
      ? characterId >= 10000
        ? Math.floor(characterId / 100)
        : characterId
      : undefined;
    this.values.p2WinSaddle = parent?.win_saddle_id_array ?? [];
    delete this.compact.vet;
    delete this.compact.p2i;
    if (parent?.share_source === 'veteran') {
      if (typeof parent.id === 'string' && parent.id) this.compact.vet = parent.id;
      else if (parent.trainer_id && parent.member_id != null)
        this.compact.vet = [parent.trainer_id, parent.member_id];
    }
    if (parent?.share_source === 'manual' && parent.share_local_id)
      this.compact.vet = `manual:${parent.share_local_id}`;
    if (parent?.share_source === 'bookmark') this.compact.p2i = parent.share_inheritance_id;
    this.#source.onreset();
  };

  clear = (): void => {
    this.selectedParent = undefined;
    this.values = emptyInheritanceFilters();
    this.compact = {};
    this.#source.onreset();
    this.presetMessage = 'Filters cleared.';
  };

  applyPreset = (next: CompactDatabaseFilterState, mode: InheritanceFilterMode): void => {
    this.selectedParent = undefined;
    this.compact = next;
    this.mode = mode;
    this.values = filtersFromCompactState(this.compact, this.mode);
    this.#source.onreset();
  };

  changeSort = (value: InheritanceSearchFilters['sortBy']): void => {
    this.#sortSelection = 'manual';
    this.values.sortBy = value;
    this.#source.onreset();
  };

  /** Uses the query's sort when it has one, otherwise the automatic sort until the user picks one. */
  applySort(querySort: InheritanceSearchFilters['sortBy'] | undefined): void {
    if (querySort) {
      if (this.values.sortBy !== querySort) this.values.sortBy = querySort;
    } else if (this.#sortSelection === 'auto') {
      const automaticSort = automaticInheritanceSort(
        inheritanceRequestFilters(this.values, this.mode)
      );
      if (this.values.sortBy !== automaticSort) this.values.sortBy = automaticSort;
    }
  }

  chooseUqlLegacy(parent: SelectableParent, characters: UqlQueryCatalog['characters']): void {
    this.selectVeteran(parent);
    this.#appliedUqlLegacy = true;
    this.values.uql = setUqlLegacy(this.values.uql ?? '', parent, characters);
  }

  /** Mirrors a valid query's target and legacy into the filter values. */
  applyUqlContext(uql: DatabaseUqlState): void {
    // Read uql.context on every use: selecting the legacy re-resolves it.
    if (uql.context.targetId !== undefined || this.#appliedUqlTarget)
      this.values.playerCharaId = uql.context.targetId;
    if (
      uql.context.targetId !== undefined &&
      this.values.mainParentIds.some(
        (id) =>
          (id >= 10000 ? Math.floor(id / 100) : id) === Math.floor(uql.context.targetId! / 100)
      )
    )
      this.values.mainParentIds = this.values.mainParentIds.filter(
        (id) =>
          (id >= 10000 ? Math.floor(id / 100) : id) !== Math.floor(uql.context.targetId! / 100)
      );
    if (
      uql.context.legacy &&
      (this.selectedParent?.pickerId !== uql.context.legacy.pickerId ||
        this.selectedParent?.id !== uql.context.legacy.id)
    )
      this.selectVeteran(uql.context.legacy);
    else if (!uql.context.legacy && this.#appliedUqlLegacy) this.selectVeteran(undefined);
    this.#appliedUqlTarget = uql.context.targetId !== undefined;
    this.#appliedUqlLegacy = Boolean(uql.context.legacy);
  }

  /** Clears a legacy that belonged to the previously signed-in account. */
  dropAccountLegacy(): void {
    if (
      (this.selectedParent?.share_source === 'veteran' && this.selectedParent.trainer_id) ||
      (!this.selectedParent && this.compact.vet)
    )
      this.selectVeteran(undefined);
  }

  restoreParent = async (
    reference: NonNullable<CompactDatabaseFilterState['vet']>
  ): Promise<void> => {
    const key = JSON.stringify(reference);
    const session = this.#source.userId();
    const current = () =>
      !this.#disposed &&
      this.#source.userId() === session &&
      JSON.stringify(this.compact.vet) === key;
    try {
      const parent = await restoreSavedParent(reference, this.#source.signedIn());
      if (current()) this.selectVeteran(parent);
    } catch {
      if (current()) {
        this.selectVeteran(undefined);
        this.#source.notify('Saved legacy is unavailable. Select another veteran.', 'warning');
      }
    }
  };

  /** Restores the shared URL filters, or the stored ones, plus a linked Trainer ID. */
  restore(query: URLSearchParams): void {
    const queryState = query.get('filters');
    if (queryState) {
      try {
        this.compact = decodeDatabaseFilterState(queryState);
        this.mode = this.compact.uql ? 'uql' : 'advanced';
        this.values = filtersFromCompactState(this.compact, this.mode);
      } catch {
        /* Ignore malformed shared filter URLs, matching Angular. */
      }
    } else {
      const restored = readDatabasePreferences(localStorage);
      this.mode = restored.mode;
      this.values = restored.filters;
      this.compact = restored.compact;
      this.saved = restored.saved;
    }
    const linkedTrainerId = query.get('trainer_id')?.trim();
    if (linkedTrainerId) this.values.trainerId = linkedTrainerId;
  }

  save(): void {
    const result = writeDatabasePreferences(
      localStorage,
      this.mode,
      this.values,
      this.saved,
      this.compact
    );
    this.saved = result.saved;
    this.compact = result.compact;
  }

  dispose(): void {
    this.#disposed = true;
  }
}
