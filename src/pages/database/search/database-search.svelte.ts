import type { InheritanceSearchResult } from '@/lib/inheritance/search/inheritance-search';
import { withPageRequest } from '@/services/http/page-request';
import { inheritanceRepository } from '../inheritance-repository';
import { DATABASE_LIST_MODE_KEY, encodeDatabaseFilterState } from '../database-preferences';
import type { DatabaseDisplay } from '../results/card/database-display.svelte';
import type { DatabaseUqlState } from '../uql/database-uql-state.svelte';
import type { DatabaseFilters } from './database-filters.svelte';

export interface DatabaseSearchSource {
  filters: DatabaseFilters;
  display: DatabaseDisplay;
  uql: DatabaseUqlState;
  touring: () => boolean;
}

const lowEndDevice =
  typeof navigator !== 'undefined' &&
  (((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4 ||
    navigator.hardwareConcurrency <= 4);

/** The debounced, abortable inheritance search with its paging, tab and share-URL state. */
export class DatabaseSearch {
  readonly pageSize = lowEndDevice ? 8 : 12;
  listMode = $state<'infinite' | 'paginated'>(lowEndDevice ? 'paginated' : 'infinite');
  page = $state(1);
  activeTab = $state<'database' | 'bookmarks'>('database');
  pendingSearch = $state(false);
  initialized = $state(false);

  inheritance = $state.raw<InheritanceSearchResult>({
    records: [],
    total: 0,
    page: 0,
    pageSize: this.pageSize,
    totalPages: 0
  });

  loading = $state(false);
  error = $state('');

  #controller: AbortController | undefined;
  #cancelTimer = $state<(() => void) | undefined>();
  #lastSignature = '';
  #session: string | undefined;
  #disposed = false;
  #source: DatabaseSearchSource;

  appending = $derived(
    this.listMode === 'infinite' && this.page > 1 && this.inheritance.records.length > 0
  );

  canLoadMore = $derived(
    this.initialized &&
      this.activeTab === 'database' &&
      this.listMode === 'infinite' &&
      !this.#cancelTimer &&
      !this.loading &&
      !this.error &&
      this.page === this.inheritance.page + 1 &&
      this.page < this.inheritance.totalPages
  );

  constructor(source: DatabaseSearchSource) {
    this.#source = source;
  }

  /** Restores filters, display preferences and the list position from the URL and storage. */
  restore(): void {
    const { filters, display } = this.#source;
    const query = new URLSearchParams(window.location.search);
    filters.restore(query);
    const storedListMode = localStorage.getItem(DATABASE_LIST_MODE_KEY);
    if (storedListMode === 'infinite' || storedListMode === 'paginated')
      this.listMode = storedListMode;
    display.restore();
    const requestedPage = Number(query.get('page'));
    if (Number.isInteger(requestedPage) && requestedPage > 0) {
      this.page = requestedPage;
      this.listMode = 'paginated';
    }

    filters.includeMaxFollowers = (filters.values.maxFollowerNum ?? 999) >= 1000;
  }

  persist = (): void => {
    const { filters } = this.#source;
    filters.save();
    const query = new URL(window.location.href);
    const encoded = encodeDatabaseFilterState(filters.compact);
    if (encoded) query.searchParams.set('filters', encoded);
    else query.searchParams.delete('filters');
    if (this.listMode === 'paginated' && this.page > 1)
      query.searchParams.set('page', String(this.page));
    else query.searchParams.delete('page');
    history.replaceState(history.state, '', `${query.pathname}${query.search}${query.hash}`);
  };

  start(): void {
    this.initialized = true;
    this.schedule(true);
  }

  schedule = (immediate = false): void => {
    const { filters, uql } = this.#source;
    if (!this.initialized) return;
    this.#cancelTimer?.();
    // Tour examples stay local until the walkthrough ends; mode preparation must not persist a preset.
    if (this.#source.touring()) return;
    this.#controller?.abort();
    if (filters.mode !== 'uql' && filters.compact.vet && !filters.selectedParent) return;
    if (filters.mode === 'uql' && !this.#applyUql()) return;
    filters.applySort(filters.mode === 'uql' ? uql.validation.sortBy : undefined);
    const signature = JSON.stringify({ filterMode: filters.mode, filters: filters.values });
    if (signature !== this.#lastSignature) {
      if (this.#lastSignature && this.page !== 1) this.page = 1;
      this.#lastSignature = signature;
    }

    if (this.activeTab === 'bookmarks') {
      this.loading = false;
      this.pendingSearch = true;
      this.persist();
      return;
    }

    this.#queue(immediate);
  };

  loadMore = (): void => {
    if (this.canLoadMore) this.page += 1;
  };

  toggleListMode = (): void => {
    this.listMode = this.listMode === 'infinite' ? 'paginated' : 'infinite';
    this.page = 1;
    localStorage.setItem(DATABASE_LIST_MODE_KEY, this.listMode);
  };

  /** Forgets account-bound legacies when the signed-in user changes. */
  changeSession(session: string): void {
    const { filters, uql } = this.#source;
    if (this.#session !== session) {
      uql.resetLegacy();
      if (this.#session !== undefined) filters.dropAccountLegacy();
      this.#session = session;
    }

    if (filters.mode === 'uql') this.schedule();
  }

  dispose(): void {
    this.#disposed = true;
    this.#controller?.abort();
    this.#cancelTimer?.();
  }

  /** Syncs the query's directives into the filters; false while the query cannot run yet. */
  #applyUql(): boolean {
    const { filters, uql } = this.#source;
    if (!uql.queryData) {
      this.loading = uql.queryDataLoading;
      this.persist();
      return false;
    }

    uql.promptForLegacy();
    if (uql.context.pendingLegacy) {
      void uql.loadLegacy(uql.context.pendingLegacy);
      this.loading = uql.legacyLoading;
      this.persist();
      return false;
    }

    if (!uql.context.issue) filters.applyUqlContext(uql);
    if (uql.validation.state !== 'empty' && uql.validation.state !== 'valid') {
      this.loading = false;
      this.persist();
      return false;
    }

    return true;
  }

  #queue(immediate: boolean): void {
    // Keep the navigation guard active while the debounced search is queued too.
    let cancelled = false;
    void withPageRequest(async () => {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, immediate ? 0 : 150);
        this.#cancelTimer = () => {
          cancelled = true;
          clearTimeout(timer);
          resolve();
        };
      });

      if (cancelled) return;
      this.#cancelTimer = undefined;
      this.persist();
      await this.#run();
    }).catch((reason) => {
      if (!this.#disposed)
        this.error = reason instanceof Error ? reason.message : 'Search could not be started.';
    });
  }

  async #run(): Promise<void> {
    const { filters, uql } = this.#source;
    this.#controller?.abort();
    this.#controller = new AbortController();
    const controller = this.#controller;
    const requestedPage = this.page;
    this.loading = true;
    this.error = '';
    try {
      const result = await inheritanceRepository.search(
        filters.values,
        requestedPage - 1,
        this.pageSize,
        controller.signal,
        filters.mode,
        uql.validation
      );

      if (controller.signal.aborted) return;
      const records =
        this.listMode === 'infinite' && requestedPage > 1
          ? [...this.inheritance.records, ...result.records]
          : result.records;

      this.inheritance = {
        ...result,
        records: [...new Map(records.map((record) => [record.id, record])).values()]
      };
    } catch (reason) {
      if (!controller.signal.aborted)
        this.error =
          reason instanceof Error ? reason.message : 'Inheritance records could not be loaded.';
    } finally {
      if (!controller.signal.aborted) this.loading = false;
    }
  }
}
