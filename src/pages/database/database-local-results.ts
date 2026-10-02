import { decodeFactor } from '@/lib/catalog/factor-catalog';
import { activeFactorRequirement, excludedMainParentIds, type FactorRequirement, type InheritanceRecord, type InheritanceSearchFilters } from '@/lib/inheritance/inheritance-search';

export type BookmarkStatusFilter = 'all' | 'unchanged' | 'modified';

function meaningful(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(meaningful);
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return value === true;
}

/** Matches Angular's automatic affinity sort without considering sort/paging defaults as filters. */
export function hasMeaningfulInheritanceFilters(filters: InheritanceSearchFilters): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'sortBy' || key === 'sortOrder') return false;
    if (key === 'maxFollowerNum') return typeof value === 'number' && value !== 999 && value !== 1000;
    if (key === 'minParentRank') return typeof value === 'number' && value > 1;
    return meaningful(value);
  });
}

export function automaticInheritanceSort(filters: InheritanceSearchFilters): InheritanceSearchFilters['sortBy'] {
  return hasMeaningfulInheritanceFilters(filters) ? 'affinity_score' : 'trending';
}

function factorMatches(encoded: number, requirement: FactorRequirement): boolean {
  const factor = decodeFactor(Math.abs(encoded));
  const minimum = Math.max(1, requirement.minimumStars || 1);
  const maximum = Math.max(minimum, requirement.maximumStars ?? 9);
  return (requirement.factorId === 0 ? Math.abs(encoded) >= 10 : factor.id === requirement.factorId) && factor.level >= minimum && factor.level <= maximum;
}

function matchesRequirements(values: Array<number | undefined>, requirements: FactorRequirement[], slots: Array<Array<number | undefined>> = [values]): boolean {
  const factors = values.filter((value): value is number => Number.isFinite(value));
  const groups: FactorRequirement[][] = [];
  for (const requirement of requirements.map(activeFactorRequirement).filter((entry) => Number.isFinite(entry.factorId) && entry.factorId >= 0)) {
    if (requirement.operator === 'or' && groups.length) groups[groups.length - 1]!.push(requirement);
    else groups.push([requirement]);
  }
  return groups.every(group => group.some(requirement => {
    if (requirement.minimumOccurrences === undefined && requirement.maximumOccurrences === undefined) return factors.some(value => factorMatches(value, requirement));
    const ids = requirement.factorId === 0 ? factors.filter(value => Math.abs(value) >= 10).map(value => decodeFactor(Math.abs(value)).id) : [requirement.factorId];
    return ids.some(factorId => {
      const count = slots.filter(slot => slot.some(value => value !== undefined && decodeFactor(Math.abs(value)).id === factorId)).length;
      return count >= (requirement.minimumOccurrences ?? 0) && count <= (requirement.maximumOccurrences ?? slots.length);
    });
  }));
}

function stars(values: number[]): number { return values.reduce((total, value) => total + decodeFactor(Math.abs(value)).level, 0); }
function parents(record: InheritanceRecord): number[] { return [record.mainParentId, record.leftParentId, record.rightParentId]; }

export function bookmarkMatchesFilters(record: InheritanceRecord, filters: InheritanceSearchFilters, includeMaxFollowers: boolean): boolean {
  const trainerId = filters.trainerId?.trim().toLocaleLowerCase();
  const trainerName = filters.trainerName?.trim().toLocaleLowerCase();
  if (trainerId && !record.accountId.toLocaleLowerCase().includes(trainerId)) return false;
  if (trainerName && !record.trainerName.toLocaleLowerCase().includes(trainerName)) return false;
  if (filters.mainParentIds.length && !filters.mainParentIds.includes(record.mainParentId)) return false;
  if (filters.parentLeftId && filters.parentLeftId !== record.leftParentId) return false;
  if (filters.parentRightId && filters.parentRightId !== record.rightParentId) return false;
  const lineage = parents(record);
  if (filters.includeParentIds.length && !filters.includeParentIds.some((id) => lineage.includes(id))) return false;
  if (filters.excludeParentIds.some((id) => lineage.includes(id))) return false;
  const mainCharacterId = record.mainParentId >= 10000 ? Math.floor(record.mainParentId / 100) : record.mainParentId;
  if (excludedMainParentIds(filters).some((id) => (id >= 10000 ? Math.floor(id / 100) : id) === mainCharacterId)) return false;
  if (filters.scenarioIds.length && (!record.scenarioId || !filters.scenarioIds.includes(record.scenarioId))) return false;
  if (!matchesRequirements(record.blueSparks, filters.blue, [[record.mainBlue], [record.leftBlue], [record.rightBlue]])) return false;
  if (!matchesRequirements(record.pinkSparks, filters.pink, [[record.mainPink], [record.leftPink], [record.rightPink]])) return false;
  if (!matchesRequirements(record.greenSparks, filters.green, [[record.mainGreen], [record.leftGreen], [record.rightGreen]])) return false;
  if (!matchesRequirements(record.whiteSparks, filters.white.filter(item => item.factorId > 0), [record.mainWhite, record.leftWhite, record.rightWhite])) return false;
  if (!matchesRequirements([record.mainBlue], filters.mainBlue, [[record.mainBlue]])) return false;
  if (!matchesRequirements([record.mainPink], filters.mainPink, [[record.mainPink]])) return false;
  if (!matchesRequirements([record.mainGreen], filters.mainGreen, [[record.mainGreen]])) return false;
  if (!matchesRequirements(record.mainWhite, filters.mainWhite.filter(item => item.factorId > 0))) return false;
  if (filters.supportCardId && record.supportCardId !== filters.supportCardId) return false;
  if (filters.minLimitBreak != null && (record.supportLimitBreak ?? 0) < filters.minLimitBreak) return false;
  if (filters.minWinCount != null && (record.winCount ?? 0) < filters.minWinCount) return false;
  if (filters.minWhiteCount != null && (record.whiteCount ?? 0) < filters.minWhiteCount) return false;
  if (filters.minParentRank != null && record.rankScore < filters.minParentRank) return false;
  if (!includeMaxFollowers && record.followerCount === 1000) return false;
  if (filters.maxFollowerNum != null && (record.followerCount ?? 0) > filters.maxFollowerNum) return false;
  if (filters.minBlueStarsSum != null && stars(record.blueSparks) < filters.minBlueStarsSum) return false;
  if (filters.minPinkStarsSum != null && stars(record.pinkSparks) < filters.minPinkStarsSum) return false;
  if (filters.minGreenStarsSum != null && stars(record.greenSparks) < filters.minGreenStarsSum) return false;
  if (filters.minWhiteStarsSum != null && stars(record.whiteSparks) < filters.minWhiteStarsSum) return false;
  if (filters.minMainWhiteCount != null && record.mainWhite.length < filters.minMainWhiteCount) return false;
  if (filters.mainWinSaddle.length && !filters.mainWinSaddle.every((id) => record.mainWinSaddles.includes(id))) return false;
  return true;
}

function sortValue(record: InheritanceRecord, sortBy: InheritanceSearchFilters['sortBy']): number {
  if (sortBy === 'affinity_score') return record.affinity;
  if (sortBy === 'win_count') return record.winCount ?? 0;
  if (sortBy === 'white_count') return record.whiteCount ?? 0;
  if (sortBy === 'parent_rank') return record.rankScore;
  if (sortBy === 'blue_stars_sum') return stars(record.blueSparks);
  if (sortBy === 'pink_stars_sum') return stars(record.pinkSparks);
  if (sortBy === 'green_stars_sum') return stars(record.greenSparks);
  if (sortBy === 'white_stars_sum') return stars(record.whiteSparks);
  if (sortBy === 'last_updated') return record.lastUpdated ? Date.parse(record.lastUpdated) || 0 : 0;
  if (sortBy === 'follower_num') return record.followerCount ?? 0;
  return record.borrowCopies * 1_000_000 + record.borrowViews;
}

export function filterAndSortBookmarks(records: InheritanceRecord[], filters: InheritanceSearchFilters, status: BookmarkStatusFilter, includeMaxFollowers: boolean): InheritanceRecord[] {
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  return records
    .filter((record) => status === 'all' || (status === 'modified') === Boolean(record.isStale))
    .filter((record) => bookmarkMatchesFilters(record, filters, includeMaxFollowers))
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const delta = (sortValue(left.record, filters.sortBy) - sortValue(right.record, filters.sortBy)) * direction;
      return delta || left.index - right.index;
    })
    .map(({ record }) => record);
}
