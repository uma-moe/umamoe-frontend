import { tick } from 'svelte';
import { MediaQuery } from 'svelte/reactivity';
import type { RosterFilters } from './filters/roster-filters.svelte';
import type { RosterQuery } from './roster-query.svelte';

/** Display settings, the filter drawer and focus moves between the roster's sections. */
export class RosterView {
  #filters: RosterFilters;
  #query: RosterQuery;

  displayTab = $state<'cards' | 'inheritance'>('cards');
  viewMode = $state<'grid' | 'table'>('grid');
  expandedSection = $state<'sparks' | 'skills' | 'compact'>('skills');
  sparkSource = $state<'family' | 'parent' | 'p1' | 'p2'>('family');
  statView = $state('displayed');
  cardMood = $state('0');
  preferredColumns = $state<number>();
  displayOptions = $state(false);
  filterDrawerOpen = $state(false);
  drawerView = $state<'filters' | 'sort'>('filters');
  browseToolbar = $state<HTMLDivElement>();
  queryPanel = $state<HTMLElement>();

  desktopFilters = new MediaQuery('(min-width:1024px)');
  #fullHd = new MediaQuery('(min-width:1920px)');

  gridColumns = $derived(this.preferredColumns ?? (this.#fullHd.current ? 3 : 2));
  cardGrid = $derived(this.displayTab === 'cards' && this.viewMode === 'grid');

  constructor(filters: RosterFilters, query: RosterQuery) {
    this.#filters = filters;
    this.#query = query;
  }

  openFilter(id: string, toggle = false): void {
    const filters = this.#filters;
    const close = toggle && Boolean(filters.expanded[id]);
    if (id !== 'factors' || close) filters.factorCategory = 'all';
    this.drawerView = 'filters';
    this.filterDrawerOpen = id !== 'uql' && !this.desktopFilters.current;
    filters.expanded = close ? {} : { [id]: true };

    if (!close) {
      if (id === 'saddle' && !filters.raceChoices.length) void filters.loadSchedule();
      if (id === 'uql') void this.focusQuery();
    }
  }

  async focusQuery() {
    await this.#query.loadEditor();
    await tick();
    if (this.#filters.expanded.uql) {
      this.queryPanel?.scrollIntoView({ block: 'start' });
      this.queryPanel?.querySelector<HTMLElement>('.cm-content')?.focus({ preventScroll: true });
    }
  }

  async hideQuery() {
    this.#filters.expanded = {};

    await tick();
    (
      document.getElementById('veteran-uql-trigger') ??
      this.browseToolbar?.querySelector<HTMLElement>('button[aria-label="Filters"]')
    )?.focus({ preventScroll: true });
  }

  openDrawer(view: 'filters' | 'sort') {
    this.drawerView = view;
    this.filterDrawerOpen = true;
  }

  async showResults() {
    this.filterDrawerOpen = false;
    await tick();
    this.browseToolbar?.scrollIntoView({ block: 'start' });
  }
}
