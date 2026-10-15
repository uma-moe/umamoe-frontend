import { loadUqlQueryData } from '@/lib/inheritance/uql/query-data';
import { UqlCompiler, type UqlQueryData } from '@/lib/inheritance/uql/uql-compiler';
import { compileVeteranQuery } from '@/lib/profile/veterans/profile-veteran-query';
import { loadGameDataEntries, type GameDataEntry } from '@/lib/game-data/display-records';
import type { RosterFilters } from './filters/roster-filters.svelte';

type UqlEditorComponent = typeof import('@/pages/database/uql/DatabaseUqlEditor.svelte').default;

/** The lazily loaded UQL editor, query names, and the last valid collection query. */
export class RosterQuery {
  #filters: RosterFilters;
  #live = true;

  queryData = $state.raw<UqlQueryData | null>(null);
  characters = $state.raw<GameDataEntry[]>([]);
  supports = $state.raw<GameDataEntry[]>([]);
  loading = $state(false);
  error = $state('');
  editorError = $state('');
  Editor = $state<UqlEditorComponent>();

  compiler = $derived(new UqlCompiler(this.queryData ?? undefined));
  draft = $derived.by(() =>
    compileVeteranQuery(this.#filters.uql, this.#filters.uql.trim() ? this.compiler : undefined)
  );

  applied = $state.raw(compileVeteranQuery(''));

  constructor(filters: RosterFilters) {
    this.#filters = filters;
  }

  /** Applies the draft once it is empty, or valid with query names loaded. */
  applyDraft(): void {
    if (
      this.draft.validation.state === 'empty' ||
      (this.queryData && this.draft.validation.state === 'valid')
    ) {
      this.#filters.appliedUql = this.draft.validation.state === 'empty' ? '' : this.#filters.uql;
      this.applied = this.draft;
    }
  }

  async loadNames() {
    if (this.loading || this.queryData) return;
    this.loading = true;
    this.error = '';
    try {
      const [queryData, chars, supports] = await Promise.all([
        loadUqlQueryData(),
        loadGameDataEntries('characters'),
        loadGameDataEntries('supports')
      ]);

      if (this.#live) {
        this.queryData = queryData;
        this.characters = chars;
        this.supports = supports;
      }
    } catch {
      if (this.#live) this.error = 'Query names could not be loaded. Try again.';
    } finally {
      if (this.#live) this.loading = false;
    }
  }

  async loadEditor() {
    void this.loadNames();
    if (this.Editor) return;
    this.editorError = '';
    try {
      const editor = await import('@/pages/database/uql/DatabaseUqlEditor.svelte');
      if (this.#live) this.Editor = editor.default;
    } catch {
      if (this.#live) this.editorError = 'Query editor could not be loaded. Try again.';
    }
  }

  dispose() {
    this.#live = false;
  }
}
