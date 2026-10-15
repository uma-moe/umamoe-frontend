import type { InheritanceFilterMode } from '@/lib/inheritance/search/inheritance-search';
import { validateInheritanceUql, type UqlValidation } from '@/lib/inheritance/uql/uql';
import { buildUqlSparkHighlight } from '@/lib/inheritance/uql/uql-spark-highlight';
import { UqlCompiler, type UqlQueryData } from '@/lib/inheritance/uql/uql-compiler';
import { parseUqlContext } from '@/lib/inheritance/uql/uql-context';
import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';
import { legacyScope, loadLegacyParents } from '../database-legacy';
import { resolveDatabaseUqlContext } from './database-uql-context';

export interface DatabaseUqlSource {
  query: () => string | undefined;
  mode: () => InheritanceFilterMode;
  selectedParent: () => SelectableParent | undefined;
  userId: () => string | number | undefined;
  signedIn: () => boolean;
  authReady: () => boolean;
  /** Runs after query data or a legacy request settles so the search can resume. */
  onsettled: () => void;
}

/** UQL query names, owned-legacy lookups, and the validation derived from the current query. */
export class DatabaseUqlState {
  queryData = $state.raw<UqlQueryData | null>(null);
  queryDataLoading = $state(false);
  queryDataError = $state('');
  parents = $state.raw<SelectableParent[]>([]);
  legacyLoading = $state(false);
  legacyError = $state('');
  legacyScope = $state('');
  pickerOpen = $state(false);

  #generation = 0;
  #dismissedPickerQuery = '';
  #source: DatabaseUqlSource;

  compiler = $derived(this.queryData ? new UqlCompiler(this.queryData) : undefined);
  legacyParents = $derived.by(() => {
    const selectedParent = this.#source.selectedParent();
    return selectedParent &&
      !this.parents.some(
        (parent) => parent.pickerId === selectedParent?.pickerId && parent.id === selectedParent?.id
      )
      ? [
          selectedParent,
          ...this.parents.filter((parent) => parent.pickerId !== selectedParent?.pickerId)
        ]
      : this.parents;
  });

  query = $derived.by(() => parseUqlContext(this.#source.query() ?? ''));
  context = $derived.by(() => {
    const selectedParent = this.#source.selectedParent();
    return resolveDatabaseUqlContext(this.query, this.queryData?.characters ?? [], {
      parents: [...(selectedParent ? [selectedParent] : []), ...this.parents],
      pending: (value) =>
        this.legacyScope !== legacyScope(value, this.#source.userId()) || this.legacyLoading,
      error: this.legacyError
    });
  });

  validation = $derived.by<UqlValidation>(() => {
    const mode = this.#source.mode();
    if (mode === 'uql' && !this.queryData)
      return {
        state: 'incomplete',
        message: this.queryDataError || 'Loading query names…',
        compiled: '',
        explicitFollowerFilter: false
      };

    if (mode === 'uql' && this.context.issue)
      return { ...this.context.issue, compiled: '', explicitFollowerFilter: false };

    const validation = validateInheritanceUql(
      mode === 'uql' ? this.query.predicate : (this.#source.query() ?? ''),
      this.compiler
    );

    return validation.state === 'empty' && this.query.directives.length
      ? { ...validation, state: 'valid', message: 'Ready' }
      : validation;
  });

  highlight = $derived.by(() =>
    this.#source.mode() === 'uql' && this.validation.state === 'valid'
      ? buildUqlSparkHighlight(this.validation.compiled)
      : undefined
  );

  constructor(source: DatabaseUqlSource) {
    this.#source = source;
  }

  loadQueryData = async (): Promise<void> => {
    if (this.queryDataLoading || this.queryData) return;
    this.queryDataLoading = true;
    this.queryDataError = '';
    try {
      this.queryData = await (await import('@/lib/inheritance/uql/query-data')).loadUqlQueryData();
    } catch {
      this.queryDataError =
        'UQL names could not be loaded. Your query is preserved; reload to retry.';
    } finally {
      this.queryDataLoading = false;
      this.#source.onsettled();
    }
  };

  loadLegacy = async (value: string, refresh = false): Promise<void> => {
    const scope = legacyScope(value, this.#source.userId());
    if ((!refresh && scope === this.legacyScope) || !this.#source.authReady()) return;
    const generation = ++this.#generation;
    this.legacyScope = scope;
    this.legacyLoading = true;
    this.legacyError = '';
    try {
      const parents = await loadLegacyParents(value, refresh, this.#source.signedIn());
      if (generation === this.#generation)
        this.parents = [
          ...new Map(
            [...this.parents, ...parents].map((parent) => [
              JSON.stringify([parent.pickerId, parent.id]),
              parent
            ])
          ).values()
        ];
    } catch (reason) {
      if (generation === this.#generation)
        this.legacyError =
          `Legacy could not be loaded. Your query is preserved. ${reason instanceof Error ? reason.message : ''}`.trim();
    } finally {
      if (generation === this.#generation) {
        this.legacyLoading = false;
        this.#source.onsettled();
      }
    }
  };

  /** Opens the legacy picker once for each query that has an empty legacy placeholder. */
  promptForLegacy(): void {
    const query = this.#source.query();
    const placeholder = this.query.directives.some(
      (directive) => directive.kind === 'legacy' && !directive.value
    );

    if (placeholder && /\[\s*\]/.test(query ?? '') && this.#dismissedPickerQuery !== query) {
      this.#dismissedPickerQuery = query ?? '';
      this.pickerOpen = true;
    }

    if (!placeholder) this.#dismissedPickerQuery = '';
  }

  rememberLegacy(parent: SelectableParent): void {
    // Retain manual/bookmark context too; the existing picker supports every Angular source.
    this.parents = [
      parent,
      ...this.parents.filter((item) => item.pickerId !== parent.pickerId || item.id !== parent.id)
    ];
  }

  resetLegacy(): void {
    this.#generation++;
    this.parents = [];
    this.legacyScope = '';
    this.legacyError = '';
    this.legacyLoading = false;
  }

  cancel(): void {
    this.#generation++;
  }
}
