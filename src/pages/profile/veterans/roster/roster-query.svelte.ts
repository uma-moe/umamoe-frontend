import { loadUqlQueryCatalog } from '@/lib/catalog/uql-catalog';
import { UqlCompiler, type UqlQueryCatalog } from '@/lib/inheritance/uql/uql-compiler';
import { compileVeteranQuery } from '@/lib/profile/profile-veteran-query';
import { loadCatalog, type CatalogEntry } from '@/pages/database/catalog-repository';
import type { RosterFilters } from './filters/roster-filters.svelte';

type UqlEditorComponent = typeof import('@/pages/database/uql/DatabaseUqlEditor.svelte').default;

/** The lazily loaded UQL editor, its name catalogs and the last valid collection query. */
export class RosterQuery {
  #filters: RosterFilters;
  #live = true;

  catalog = $state.raw<UqlQueryCatalog | null>(null);
  characters = $state.raw<CatalogEntry[]>([]);
  supports = $state.raw<CatalogEntry[]>([]);
  loading = $state(false);
  error = $state('');
  editorError = $state('');
  Editor = $state<UqlEditorComponent>();

  compiler = $derived(new UqlCompiler(this.catalog ?? undefined));
  draft = $derived.by(() =>
    compileVeteranQuery(this.#filters.uql, this.#filters.uql.trim() ? this.compiler : undefined)
  );
  applied = $state.raw(compileVeteranQuery(''));

  constructor(filters: RosterFilters) {
    this.#filters = filters;
  }

  /** Applies the draft once it is empty, or valid with the name catalog loaded. */
  applyDraft(): void {
    if (
      this.draft.validation.state === 'empty' ||
      (this.catalog && this.draft.validation.state === 'valid')
    ) {
      this.#filters.appliedUql = this.draft.validation.state === 'empty' ? '' : this.#filters.uql;
      this.applied = this.draft;
    }
  }

  async loadNames() {
    if (this.loading || this.catalog) return;
    this.loading = true;
    this.error = '';
    try {
      const [catalog, chars, supports] = await Promise.all([
        loadUqlQueryCatalog(),
        loadCatalog('characters'),
        loadCatalog('supports')
      ]);
      if (this.#live) {
        this.catalog = catalog;
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
