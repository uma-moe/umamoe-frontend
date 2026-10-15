import type { CharacterData } from '@/lib/game-data/characters';
import { loadG1SaddleGroups } from '@/lib/game-data/racing/races';
import { skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
import { encodedSkills, filterAndSortVeterans } from '@/lib/profile/veterans/profile-veterans';
import { profileVeteranAffinity } from '@/lib/profile/veterans/profile-veteran-metrics';
import { veteranQueryRow } from '@/lib/profile/veterans/profile-veteran-query';
import { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
import { veteranAffinityRepository } from '@/lib/veterans/affinity/affinity-repository';
import type { ProfileResponse, ProfileVeteran } from '../../profile-repository';
import type { RosterCharacters } from './roster-characters.svelte';
import type { RosterFilters } from './filters/roster-filters.svelte';
import { isMetricSort } from './roster-options';
import type { RosterQuery } from './roster-query.svelte';

interface CollectionSources {
  trainer: () => ProfileResponse['trainer'];
  characters: () => Map<number, CharacterData>;
  filters: RosterFilters;
  query: RosterQuery;
  picks: RosterCharacters;
}

/** The veteran collection with per-veteran metrics and the filtered, sorted result list. */
export class RosterCollection {
  #src: CollectionSources;
  #live = true;

  veterans = $state.raw<ProfileVeteran[]>([]);
  skillCatalog = $state<Map<number, SkillData>>(new Map());
  affinityEngine = $state<VeteranAffinityEngine>();
  raceGroups = $state<ReadonlyMap<number, number>>(new Map());
  metricError = $state('');

  affinityByVeteran = $derived(
    new Map(
      this.veterans.map((v) => [
        v,
        profileVeteranAffinity(v, this.affinityEngine, this.raceGroups, this.#src.picks.targetId)
      ])
    )
  );

  spByVeteran = $derived(
    new Map(this.veterans.map((v) => [v, skillPointTotal(this.skillCatalog, encodedSkills(v))]))
  );

  spCeiling = $derived(
    Math.max(
      1000,
      Math.ceil(
        Math.max(
          0,
          ...[...this.spByVeteran.values()].filter((value): value is number => value != null)
        ) / 500
      ) * 500
    )
  );

  databaseRows = $derived(
    new Map(
      this.veterans.map((v) => [
        v,
        veteranQueryRow(
          v,
          this.#src.trainer(),
          this.raceGroups,
          this.affinityByVeteran.get(v)?.main ?? null,
          this.affinityByVeteran.get(v)?.race ?? null
        )
      ])
    )
  );

  affinityCeiling = $derived(
    Math.max(
      100,
      Math.ceil(
        Math.max(0, ...[...this.affinityByVeteran.values()].map((value) => value.main ?? 0)) / 10
      ) * 10
    )
  );

  whiteCeiling = $derived(
    Math.max(10, ...[...this.databaseRows.values()].map((row) => Number(row.white_count ?? 0)))
  );

  propertyFiltered = $derived.by(() =>
    filterAndSortVeterans(
      this.veterans,
      $state.snapshot(this.#src.filters.filterState()),
      isMetricSort(this.#src.filters.sortField) ? 'total' : this.#src.filters.sortField,
      this.#src.filters.sortDirection,
      this.#src.characters()
    )
  );

  filtered = $derived.by(() => {
    const filters = this.#src.filters,
      query = this.#src.query;

    const metricSort = isMetricSort(filters.sortField) ? filters.sortField : undefined;
    const result = this.propertyFiltered.filter(
      (v) =>
        filters.matchesSelectedRaces(v) &&
        (!filters.minSp || (this.spByVeteran.get(v) ?? -1) >= Number(filters.minSp)) &&
        (!filters.maxSp || (this.spByVeteran.get(v) ?? Infinity) <= Number(filters.maxSp)) &&
        (!filters.minAffinity ||
          (this.affinityByVeteran.get(v)?.main ?? -1) >= Number(filters.minAffinity)) &&
        (!filters.minWhites ||
          Number(this.databaseRows.get(v)?.white_count ?? -1) >= Number(filters.minWhites)) &&
        (!filters.scenarioFilter || v.scenario_id === Number(filters.scenarioFilter)) &&
        (!filters.appliedUql || query.applied.matches(this.databaseRows.get(v)!))
    );

    const sort = query.applied.validation.sortBy;
    if (filters.appliedUql && sort)
      return result.sort(
        (a, b) =>
          Number(this.databaseRows.get(b)?.[sort] ?? -1) -
          Number(this.databaseRows.get(a)?.[sort] ?? -1)
      );
    if (metricSort)
      result.sort((a, b) => {
        const left = this.databaseRows.get(a)?.[metricSort],
          right = this.databaseRows.get(b)?.[metricSort];

        return left == null
          ? right == null
            ? 0
            : 1
          : right == null
            ? -1
            : (Number(left) - Number(right)) * (filters.sortDirection === 'asc' ? 1 : -1);
      });
    return result;
  });

  constructor(sources: CollectionSources) {
    this.#src = sources;
  }

  async loadAffinity() {
    this.metricError = '';
    try {
      const [data, groups] = await Promise.all([
        veteranAffinityRepository.load(),
        loadG1SaddleGroups()
      ]);

      if (this.#live) {
        this.affinityEngine = new VeteranAffinityEngine(data);
        this.raceGroups = groups;
      }
    } catch {
      if (this.#live)
        this.metricError =
          'Affinity details could not be loaded. Stored main scores are still shown.';
    }
  }

  dispose() {
    this.#live = false;
  }
}
