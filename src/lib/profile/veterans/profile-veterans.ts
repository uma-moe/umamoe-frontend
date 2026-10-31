import {
  decodeFactor,
  decodeFactorEntry,
  type FactorCategory
} from '@/lib/game-data/factors/factors';
import { characterImagePath, type CharacterData } from '@/lib/game-data/characters';
import type {
  FactorInfoEntry,
  ProfileVeteran,
  SuccessionChara
} from '@/pages/profile/profile-repository';
import {
  aptitudeGrade,
  distanceName,
  runningStyleName,
  scenarioName,
  totalStats
} from '../profile-display';

export type VeteranSortField =
  | 'total'
  | 'rank_score'
  | 'speed'
  | 'stamina'
  | 'power'
  | 'guts'
  | 'wiz'
  | 'blue'
  | 'pink'
  | 'green'
  | 'name'
  | 'creation_time';
export type FactorTone = 'blue' | 'pink' | 'green' | 'white';
export type AncestorScope = 'parent' | 'grandparent' | 'greatgrandparent';
export type FactorScope = AncestorScope | 'any' | 'family' | 'p1' | 'p2';
export interface VeteranFactorFilter {
  factorId: number;
  minLevel: number;
  maxLevel?: number;
  operator?: 'and' | 'or';
  scope: FactorScope;
  mode?: 'minimum' | 'exact' | 'total';
}

export function veteranBaseStat(value: number | null | undefined, mood: number): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  // Mechanics: https://github.com/jalbarrang/torena-sim/blob/main/honse-sim/src/primitives/runner/stats.rs
  const capped = Math.min(value, 1200) + Math.floor(Math.max(0, value - 1200) / 2);
  return capped * (1 + mood * 0.02);
}

export function veteranCreationTime(veteran: ProfileVeteran): number | null {
  const timestamp = Date.parse(veteran.creation_time ?? veteran.create_time ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

export interface ResolvedVeteranFactor {
  id: number;
  encodedId: number;
  name: string;
  level: number;
  type: number;
  category: FactorCategory;
  tone: FactorTone;
}

export interface VeteranFilterState {
  query: string;
  distance: number | number[] | null;
  style: number | number[] | null;
  minTotal: number;
  stats: Record<'speed' | 'stamina' | 'power' | 'guts' | 'wiz', [number, number]>;
  aptitudes: Partial<Record<keyof ProfileVeteran, string>>;
  skills: number[];
  include: Partial<Record<AncestorScope, number[]>>;
  exclude: Partial<Record<AncestorScope, number[]>>;
  factors: VeteranFactorFilter[];
  raceIds: number[];
}

export interface VeteranDisplayRecord {
  veteran: ProfileVeteran;
  name: string;
  image?: string;
  scenario: string;
  distance: string;
  style: string;
  total: number;
  skills: number[];
  factors: ResolvedVeteranFactor[];
}

const gradeOrder = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const positions: Record<AncestorScope, number[]> = {
  parent: [],
  grandparent: [10, 20],
  greatgrandparent: [11, 12, 21, 22]
};

function toneForType(type: number): FactorTone {
  if (type === 0) return 'blue';
  if (type === 1) return 'pink';
  if (type === 5) return 'green';
  return 'white';
}

export function encodedSkills(veteran: ProfileVeteran): number[] {
  return veteran.skill_array?.length
    ? veteran.skill_array.map((skill) => skill.skill_id * 10 + skill.level)
    : (veteran.skills ?? []);
}

export function resolveVeteranFactors(node: {
  factor_info_array?: FactorInfoEntry[] | null;
  factor_id_array?: number[] | null;
  factors?: number[] | null;
}): ResolvedVeteranFactor[] {
  const entries = node.factor_info_array?.length
    ? node.factor_info_array.map((factor) => {
        const decoded = decodeFactorEntry(factor.factor_id, factor.level);
        return { encodedId: decoded.id * 10 + decoded.level, level: decoded.level };
      })
    : (node.factor_id_array ?? node.factors ?? []).map((encodedId) => ({
        encodedId,
        level: decodeFactor(encodedId).level
      }));

  const order: Record<FactorTone, number> = { blue: 0, pink: 1, green: 2, white: 3 };

  return entries
    .map(({ encodedId, level }) => {
      const decoded = decodeFactor(encodedId);
      return { ...decoded, encodedId, level, tone: toneForType(decoded.type) };
    })
    .sort((left, right) => order[left.tone] - order[right.tone]);
}

export function factorStarSum(veteran: ProfileVeteran, tone: Exclude<FactorTone, 'white'>): number {
  const family = veteranFactors(veteran, 'family');
  if (family.length)
    return family
      .filter((factor) => factor.tone === tone)
      .reduce((sum, factor) => sum + factor.level, 0);
  const inherited = veteran.inheritance;
  if (tone === 'blue') return inherited?.blue_stars_sum ?? 0;
  if (tone === 'pink') return inherited?.pink_stars_sum ?? 0;
  return inherited?.green_stars_sum ?? 0;
}

function ancestorNodes(
  veteran: ProfileVeteran,
  scope: FactorScope
): Array<ProfileVeteran | SuccessionChara> {
  if (scope === 'parent') return [veteran];
  const successors = veteran.succession_chara_array ?? [];
  if (scope === 'any') return [veteran, ...successors];
  if (scope === 'family')
    return [
      veteran,
      ...successors.filter((node) => node.position_id === 10 || node.position_id === 20)
    ];
  const allowed = scope === 'p1' ? [10] : scope === 'p2' ? [20] : positions[scope];
  return successors.filter((node) => allowed.includes(node.position_id));
}

export function veteranFactors(
  veteran: ProfileVeteran,
  scope: FactorScope
): ResolvedVeteranFactor[] {
  return ancestorNodes(veteran, scope).flatMap(resolveVeteranFactors);
}

export function veteranFactorTotals(
  veteran: ProfileVeteran
): Array<ResolvedVeteranFactor & { ownStars: number }> {
  const totals = new Map<number, ResolvedVeteranFactor & { ownStars: number }>();
  const own = resolveVeteranFactors(veteran);
  for (const factor of veteranFactors(veteran, 'family')) {
    const current = totals.get(factor.id);
    if (current) current.level += factor.level;
    else
      totals.set(factor.id, {
        ...factor,
        ownStars: own
          .filter((item) => item.id === factor.id)
          .reduce((sum, item) => sum + item.level, 0)
      });
  }

  return [...totals.values()];
}

function matchesAncestorIds(
  veteran: ProfileVeteran,
  scope: AncestorScope,
  ids: number[],
  excluded: boolean
): boolean {
  if (!ids.length) return true;
  const values =
    scope === 'parent'
      ? veteran.card_id == null
        ? []
        : [veteran.card_id]
      : (veteran.succession_chara_array ?? [])
          .filter((node) => positions[scope].includes(node.position_id))
          .map((node) => node.card_id);

  const match = values.some((id) => ids.includes(id));
  return excluded ? !match : match;
}

function matchesAptitude(
  veteran: ProfileVeteran,
  field: keyof ProfileVeteran,
  minimum: string | undefined
): boolean {
  if (!minimum) return true;
  const actual = aptitudeGrade(veteran[field] as number | null | undefined);
  return gradeOrder.indexOf(actual) <= gradeOrder.indexOf(minimum);
}

export function filterAndSortVeterans(
  veterans: ProfileVeteran[],
  filters: VeteranFilterState,
  sortField: VeteranSortField,
  sortDirection: 'asc' | 'desc',
  characters: Map<number, CharacterData>
): ProfileVeteran[] {
  const query = filters.query.trim().toLocaleLowerCase();
  // Database semantics: OR joins alternatives; AND starts another required group.
  const groups: VeteranFactorFilter[][] = [];
  for (const filter of filters.factors) {
    if (filter.operator === 'or' && groups.length) groups[groups.length - 1]!.push(filter);
    else groups.push([filter]);
  }

  const key = (filter: VeteranFactorFilter) =>
    [
      filter.factorId,
      filter.scope,
      filter.minLevel,
      filter.maxLevel ?? '',
      filter.mode ?? 'minimum'
    ].join('|');

  const requiredCounts = new Map<string, number>();
  for (const group of groups)
    if (group.length === 1)
      requiredCounts.set(key(group[0]!), (requiredCounts.get(key(group[0]!)) ?? 0) + 1);
  const result = veterans.filter((veteran) => {
    if (
      query &&
      !(characters.get(veteran.card_id ?? -1)?.name ?? `Character ${veteran.card_id ?? ''}`)
        .toLocaleLowerCase()
        .includes(query)
    )
      return false;
    if (
      filters.distance != null &&
      (Array.isArray(filters.distance)
        ? !filters.distance.includes(veteran.distance_type ?? -1)
        : veteran.distance_type !== filters.distance)
    )
      return false;
    if (
      filters.style != null &&
      (Array.isArray(filters.style)
        ? !filters.style.includes(veteran.running_style ?? -1)
        : veteran.running_style !== filters.style)
    )
      return false;
    if (filters.minTotal > 0 && totalStats(veteran) < filters.minTotal) return false;
    for (const field of ['speed', 'stamina', 'power', 'guts', 'wiz'] as const) {
      const [minimum, maximum] = filters.stats[field];
      const value = veteran[field] ?? 0;
      if (value < minimum || value > maximum) return false;
    }

    for (const [field, grade] of Object.entries(filters.aptitudes)) {
      if (!matchesAptitude(veteran, field as keyof ProfileVeteran, grade)) return false;
    }

    if (filters.skills.length) {
      const available = encodedSkills(veteran);
      if (
        !filters.skills.every(
          (skill) =>
            available.includes(skill) ||
            available.some((encoded) => Math.floor(encoded / 10) === skill)
        )
      )
        return false;
    }

    for (const scope of ['parent', 'grandparent', 'greatgrandparent'] as const) {
      if (!matchesAncestorIds(veteran, scope, filters.include[scope] ?? [], false)) return false;
      if (!matchesAncestorIds(veteran, scope, filters.exclude[scope] ?? [], true)) return false;
    }

    const factorsByScope = new Map<FactorScope, ResolvedVeteranFactor[]>();
    if (
      !groups.every((group) =>
        group.some((filter) => {
          let scoped = factorsByScope.get(filter.scope);
          if (!scoped) {
            scoped = veteranFactors(veteran, filter.scope);
            factorsByScope.set(filter.scope, scoped);
          }

          const factors = scoped.filter((factor) => factor.id === filter.factorId);
          const maximum = filter.mode === 'exact' ? filter.minLevel : (filter.maxLevel ?? Infinity);
          if (filter.mode === 'total') {
            const stars = factors.reduce((sum, factor) => sum + factor.level, 0);
            return stars >= filter.minLevel && stars <= maximum;
          }

          const count = factors.filter(
            (factor) => factor.level >= filter.minLevel && factor.level <= maximum
          ).length;

          return count >= (group.length === 1 ? (requiredCounts.get(key(filter)) ?? 1) : 1);
        })
      )
    )
      return false;
    return true;
  });

  function sortableValue(veteran: ProfileVeteran): string | number | null {
    if (sortField === 'creation_time') return veteranCreationTime(veteran);
    if (sortField === 'total') return totalStats(veteran);
    if (sortField === 'name')
      return characters.get(veteran.card_id ?? -1)?.name ?? `Character ${veteran.card_id ?? ''}`;
    if (sortField === 'blue' || sortField === 'pink' || sortField === 'green')
      return factorStarSum(veteran, sortField);
    return veteran[sortField] ?? 0;
  }

  return result.sort((left, right) => {
    const a = sortableValue(left);
    const b = sortableValue(right);
    if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
    const comparison = typeof a === 'string' ? a.localeCompare(String(b)) : a - Number(b);
    return sortDirection === 'asc' ? comparison : -comparison;
  });
}

export function veteranDisplay(
  veteran: ProfileVeteran,
  characters: Map<number, CharacterData>
): VeteranDisplayRecord {
  const entry = characters.get(veteran.card_id ?? -1);
  return {
    veteran,
    name: entry?.name ?? `Character ${veteran.card_id ?? 'Unknown'}`,
    image: veteran.card_id ? characterImagePath(veteran.card_id) : undefined,
    scenario: scenarioName(veteran.scenario_id),
    distance: distanceName(veteran.distance_type),
    style: runningStyleName(veteran.running_style),
    total: totalStats(veteran),
    skills: encodedSkills(veteran),
    factors: resolveVeteranFactors(veteran)
  };
}

export function computeVeteranStatBounds(
  veterans: ProfileVeteran[]
): Record<'speed' | 'stamina' | 'power' | 'guts' | 'wiz', [number, number]> {
  return Object.fromEntries(
    (['speed', 'stamina', 'power', 'guts', 'wiz'] as const).map((field) => {
      const values = veterans.map((veteran) => veteran[field] ?? 0).filter((value) => value > 0);
      return [
        field,
        values.length
          ? [Math.floor(Math.min(...values) / 50) * 50, Math.ceil(Math.max(...values) / 50) * 50]
          : [0, 1500]
      ];
    })
  ) as Record<'speed' | 'stamina' | 'power' | 'guts' | 'wiz', [number, number]>;
}

export function activeVeteranFilterCount(
  filters: VeteranFilterState,
  bounds: VeteranFilterState['stats']
): number {
  let count =
    Number(Boolean(filters.query)) +
    Number(filters.distance != null) +
    Number(filters.style != null) +
    Number(filters.minTotal > 0);

  for (const field of ['speed', 'stamina', 'power', 'guts', 'wiz'] as const)
    if (
      filters.stats[field][0] !== bounds[field][0] ||
      filters.stats[field][1] !== bounds[field][1]
    )
      count += 1;
  count +=
    Object.values(filters.aptitudes).filter(Boolean).length +
    filters.skills.length +
    filters.factors.length +
    filters.raceIds.length;
  for (const scope of ['parent', 'grandparent', 'greatgrandparent'] as const)
    count += (filters.include[scope]?.length ?? 0) + (filters.exclude[scope]?.length ?? 0);
  return count;
}
