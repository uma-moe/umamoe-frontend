import type { InheritanceFilterMode } from '@/lib/inheritance/inheritance-search';
import { databaseTourChanges } from './database-tour';
import type { DatabaseFilters } from './database-filters.svelte';

interface LayoutSnapshot {
  mode: InheritanceFilterMode;
  expanded: boolean;
  display: boolean;
  affinity: boolean;
  quick: boolean;
  panels: Record<string, boolean>;
}

/** Which filter panels and display options are open, including the layout a tour step needs. */
export class DatabaseLayout {
  filterExpanded = $state(false);
  displayOptionsOpen = $state(false);
  tourPanels = $state<Record<string, boolean>>({
    inheritance: innerWidth > 600,
    main: innerWidth > 600,
    general: innerWidth > 600,
    total: innerWidth > 600,
    races: innerWidth > 600,
    characters: false,
    support: false,
    search: false
  });
  affinityOpen = $state(true);
  quickFiltersOpen = $state(typeof window === 'undefined' ? true : window.innerWidth > 600);

  #beforeTour: LayoutSnapshot | undefined;
  #filters: DatabaseFilters;

  constructor(filters: DatabaseFilters) {
    this.#filters = filters;
  }

  /** Opens what a tour step points at and restores the previous layout once the tour ends. */
  prepareTour(step: string): void {
    if (!step) {
      if (this.#beforeTour) {
        this.#filters.mode = this.#beforeTour.mode;
        this.filterExpanded = this.#beforeTour.expanded;
        this.displayOptionsOpen = this.#beforeTour.display;
        this.affinityOpen = this.#beforeTour.affinity;
        this.quickFiltersOpen = this.#beforeTour.quick;
        this.tourPanels = this.#beforeTour.panels;
        this.#beforeTour = undefined;
      }
      return;
    }
    const changes = databaseTourChanges(step);
    if (!changes) return;
    this.#beforeTour ??= {
      mode: this.#filters.mode,
      expanded: this.filterExpanded,
      display: this.displayOptionsOpen,
      affinity: this.affinityOpen,
      quick: this.quickFiltersOpen,
      panels: { ...this.tourPanels }
    };
    if (changes.display) this.displayOptionsOpen = true;
    if (changes.expanded) this.filterExpanded = true;
    if (changes.mode) this.#filters.mode = changes.mode;
    if (changes.affinity) this.affinityOpen = true;
    if (changes.quick) this.quickFiltersOpen = true;
    for (const panel of changes.panels) this.tourPanels[panel] = true;
  }
}
