import { factorOptions } from '@/lib/game-data/factors/factors';
import { loadRaceQueryValues, type RaceQueryValue } from '@/lib/game-data/racing/races';
import {
  activeVeteranFilterCount,
  computeVeteranStatBounds,
  type AncestorScope,
  type VeteranFactorFilter,
  type VeteranFilterState
} from '@/lib/profile/veterans/profile-veterans';
import type { ProfileVeteran } from '../../../profile-repository';
import {
  allDistances,
  allStyles,
  scopeLabels,
  statFields,
  type AptitudeField,
  type CollectionSortField,
  type StatField
} from '../roster-options';

/** Filter, sort and facet state shared by the sidebar, drawer, chips and results. */
export class RosterFilters {
  bounds = $state(computeVeteranStatBounds([]));
  speedMin = $state(0);
  speedMax = $state(1500);
  staminaMin = $state(0);
  staminaMax = $state(1500);
  powerMin = $state(0);
  powerMax = $state(1500);
  gutsMin = $state(0);
  gutsMax = $state(1500);
  wizMin = $state(0);
  wizMax = $state(1500);

  query = $state('');
  distance = $state<string[]>([...allDistances]);
  style = $state<string[]>([...allStyles]);
  minTotal = $state(0);
  sortField = $state<CollectionSortField>('total');
  sortDirection = $state<'asc' | 'desc'>('desc');

  aptitudeFilters = $state<Partial<Record<AptitudeField, string>>>({});
  selectedSkills = $state<number[]>([]);
  skillQuery = $state('');
  selectedFactors = $state<VeteranFactorFilter[]>([]);
  factorCategory = $state('all');
  include = $state<Partial<Record<AncestorScope, number[]>>>({});
  exclude = $state<Partial<Record<AncestorScope, number[]>>>({});

  minSp = $state('');
  maxSp = $state('');
  minAffinity = $state('');
  minWhites = $state('');
  scenarioFilter = $state('');
  uql = $state('');
  appliedUql = $state('');

  raceChoices = $state<RaceQueryValue[]>([]);
  raceQuery = $state('');
  selectedRaceIds = $state<number[]>([]);
  raceSaddleIndex = $state<Map<number, number[]>>(new Map());
  scheduleLoading = $state(false);
  scheduleError = $state('');

  expanded = $state<Record<string, boolean>>({});

  factors = $derived(factorOptions());
  activeCount = $derived(
    activeVeteranFilterCount(this.filterState(), this.bounds) +
      [
        this.minSp || this.maxSp,
        this.minAffinity,
        this.minWhites,
        this.scenarioFilter,
        this.appliedUql
      ].filter(Boolean).length
  );

  resetStatRanges(nextBounds = this.bounds) {
    this.speedMin = nextBounds.speed[0];
    this.speedMax = nextBounds.speed[1];
    this.staminaMin = nextBounds.stamina[0];
    this.staminaMax = nextBounds.stamina[1];
    this.powerMin = nextBounds.power[0];
    this.powerMax = nextBounds.power[1];
    this.gutsMin = nextBounds.guts[0];
    this.gutsMax = nextBounds.guts[1];
    this.wizMin = nextBounds.wiz[0];
    this.wizMax = nextBounds.wiz[1];
  }

  /** Recomputes the stat bounds for a new collection and resets the ranges to them. */
  resetBounds(veterans: ProfileVeteran[]) {
    this.bounds = computeVeteranStatBounds(veterans);
    this.resetStatRanges(this.bounds);
  }

  currentStats(): VeteranFilterState['stats'] {
    return {
      speed: [this.speedMin, this.speedMax],
      stamina: [this.staminaMin, this.staminaMax],
      power: [this.powerMin, this.powerMax],
      guts: [this.gutsMin, this.gutsMax],
      wiz: [this.wizMin, this.wizMax]
    };
  }

  filterState(): VeteranFilterState {
    return {
      query: this.query,
      distance: this.distance.length === allDistances.length ? null : this.distance.map(Number),
      style: this.style.length === allStyles.length ? null : this.style.map(Number),
      minTotal: this.minTotal,
      stats: this.currentStats(),
      aptitudes: this.aptitudeFilters,
      skills: this.selectedSkills,
      include: this.include,
      exclude: this.exclude,
      factors: this.selectedFactors,
      raceIds: this.selectedRaceIds
    };
  }

  /** Reads every value that changes the result list, so an effect can react to any of them. */
  trackResultInputs(): void {
    this.query;
    this.distance;
    this.style;
    this.minTotal;
    this.sortField;
    this.sortDirection;
    this.minSp;
    this.maxSp;
    this.minAffinity;
    this.minWhites;
    this.scenarioFilter;
    this.appliedUql;
    this.speedMin;
    this.speedMax;
    this.staminaMin;
    this.staminaMax;
    this.powerMin;
    this.powerMax;
    this.gutsMin;
    this.gutsMax;
    this.wizMin;
    this.wizMax;
    this.aptitudeFilters;
    this.selectedSkills;
    this.selectedFactors;
    this.include;
    this.exclude;
  }

  statValue(field: StatField, end = false): number {
    const values: { [key: string]: number } = {
      speedMin: this.speedMin,
      speedMax: this.speedMax,
      staminaMin: this.staminaMin,
      staminaMax: this.staminaMax,
      powerMin: this.powerMin,
      powerMax: this.powerMax,
      gutsMin: this.gutsMin,
      gutsMax: this.gutsMax,
      wizMin: this.wizMin,
      wizMax: this.wizMax
    };

    return values[`${field}${end ? 'Max' : 'Min'}`] ?? 0;
  }

  changeStat(field: StatField, start: number, end?: number): void {
    if (field === 'speed') {
      this.speedMin = start;
      this.speedMax = end ?? start;
    } else if (field === 'stamina') {
      this.staminaMin = start;
      this.staminaMax = end ?? start;
    } else if (field === 'power') {
      this.powerMin = start;
      this.powerMax = end ?? start;
    } else if (field === 'guts') {
      this.gutsMin = start;
      this.gutsMax = end ?? start;
    } else {
      this.wizMin = start;
      this.wizMax = end ?? start;
    }
  }

  statChanged(field: StatField): boolean {
    return (
      this.statValue(field) !== this.bounds[field][0] ||
      this.statValue(field, true) !== this.bounds[field][1]
    );
  }

  clearFacet(id: string): void {
    if (id === 'type') {
      this.distance = [...allDistances];
      this.style = [...allStyles];
    }

    if (id === 'factors') {
      this.selectedFactors = [];
      this.factorCategory = 'all';
    }

    if (id === 'stats') {
      this.minTotal = 0;
      this.minSp = '';
      this.maxSp = '';
      this.resetStatRanges();
    }

    if (id === 'aptitudes') this.aptitudeFilters = {};

    if (id === 'skills') {
      this.selectedSkills = [];
      this.skillQuery = '';
    }

    if (id === 'parents') {
      this.include = {};

      this.exclude = {};
    }

    if (id === 'saddle') this.selectedRaceIds = [];
    if (id === 'database') {
      this.minAffinity = '';
      this.minWhites = '';
      this.scenarioFilter = '';
    }

    if (id === 'uql') {
      this.uql = '';
      this.appliedUql = '';
    }
  }

  clearFilters(): void {
    this.minSp = '';
    this.maxSp = '';
    this.minAffinity = '';
    this.minWhites = '';
    this.scenarioFilter = '';
    this.uql = '';
    this.appliedUql = '';
    this.query = '';
    this.distance = [...allDistances];
    this.style = [...allStyles];
    this.minTotal = 0;
    this.aptitudeFilters = {};

    this.selectedSkills = [];
    this.selectedFactors = [];
    this.selectedRaceIds = [];
    this.include = {};

    this.exclude = {};

    this.skillQuery = '';
    this.resetStatRanges();
  }

  facetCount(id: string): number {
    if (id === 'type')
      return (
        Number(this.distance.length !== allDistances.length) +
        Number(this.style.length !== allStyles.length)
      );
    if (id === 'factors') return this.selectedFactors.length;
    if (id === 'skills') return this.selectedSkills.length;
    if (id === 'parents')
      return [...Object.values(this.include), ...Object.values(this.exclude)].reduce(
        (count, ids) => count + (ids?.length ?? 0),
        0
      );
    if (id === 'saddle') return this.selectedRaceIds.length;
    if (id === 'database')
      return [this.minAffinity, this.minWhites, this.scenarioFilter].filter(Boolean).length;
    if (id === 'uql') return this.appliedUql.trim() ? 1 : 0;
    if (id === 'aptitudes') return Object.values(this.aptitudeFilters).filter(Boolean).length;
    return (
      (this.minTotal ? 1 : 0) +
      (this.minSp || this.maxSp ? 1 : 0) +
      statFields.filter((field) => this.statChanged(field.id)).length
    );
  }

  setAptitude(field: AptitudeField, value: string): void {
    this.aptitudeFilters = { ...this.aptitudeFilters, [field]: value };
  }

  addFactor(filter: VeteranFactorFilter) {
    if (
      !this.selectedFactors.some(
        (item) =>
          item.factorId === filter.factorId &&
          item.scope === filter.scope &&
          item.minLevel === filter.minLevel &&
          (item.mode ?? 'minimum') === (filter.mode ?? 'minimum')
      )
    )
      this.selectedFactors = [...this.selectedFactors, filter];
  }

  addSkill(id: number) {
    if (!this.selectedSkills.includes(id)) this.selectedSkills = [...this.selectedSkills, id];
  }

  removeSkill(id: number) {
    this.selectedSkills = this.selectedSkills.filter((skillId) => skillId !== id);
  }

  sortTable(field: CollectionSortField) {
    this.sortDirection = this.sortField === field && this.sortDirection === 'desc' ? 'asc' : 'desc';
    this.sortField = field;
  }

  sparkLabel(filter: VeteranFactorFilter) {
    return `${this.factors.find((factor) => Number(factor.id) === filter.factorId)?.text ?? `Factor ${filter.factorId}`} · ${filter.mode === 'total' ? 'Total ' : ''}${filter.minLevel}${filter.maxLevel != null ? '–' + filter.maxLevel : ''}★${filter.mode === 'exact' ? ' exactly' : filter.maxLevel != null ? '' : '+'} · ${scopeLabels[filter.scope]}`;
  }

  /** Adds characters to one include/exclude rule and drops them from the opposite rule. */
  addAncestors(scope: AncestorScope, mode: 'include' | 'exclude', ids: number[]): void {
    const current = mode === 'include' ? this.include : this.exclude,
      opposite = mode === 'include' ? this.exclude : this.include;

    const next = { ...current, [scope]: [...new Set([...(current[scope] ?? []), ...ids])] },
      remaining = {
        ...opposite,
        [scope]: (opposite[scope] ?? []).filter((id) => !ids.includes(id))
      };

    if (mode === 'include') {
      this.include = next;
      this.exclude = remaining;
    } else {
      this.exclude = next;
      this.include = remaining;
    }
  }

  removeAncestor(scope: AncestorScope, id: number, excluded = false): void {
    const target = excluded ? this.exclude : this.include;
    const next = { ...target, [scope]: (target[scope] ?? []).filter((value) => value !== id) };

    if (excluded) this.exclude = next;
    else this.include = next;
  }

  toggleRace(id: string): void {
    const numeric = Number(id);
    this.selectedRaceIds = this.selectedRaceIds.includes(numeric)
      ? this.selectedRaceIds.filter((value) => value !== numeric)
      : [...this.selectedRaceIds, numeric];
  }

  matchesSelectedRaces(veteran: ProfileVeteran): boolean {
    if (!this.selectedRaceIds.length) return true;
    const saddles = new Set(
      (veteran.succession_chara_array ?? []).flatMap((node) => node.win_saddle_id_array ?? [])
    );

    return this.selectedRaceIds.some((raceId) =>
      (this.raceSaddleIndex.get(raceId) ?? []).some((saddle) => saddles.has(saddle))
    );
  }

  async loadSchedule(): Promise<void> {
    this.scheduleLoading = true;
    this.scheduleError = '';
    try {
      this.raceChoices = await loadRaceQueryValues();
      this.raceSaddleIndex = new Map(this.raceChoices.map((race) => [race.id, race.saddleIds]));
    } catch {
      this.scheduleError = 'Race choices could not be loaded.';
    } finally {
      this.scheduleLoading = false;
    }
  }
}
