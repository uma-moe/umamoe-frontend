import { validateInheritanceUql, type UqlValidation } from './uql';
import { occurrenceComparison, factorPresence } from './factor-occurrences';

export type InheritanceFilterMode = 'basic' | 'advanced' | 'uql';
export type InheritanceSort = 'trending' | 'win_count' | 'white_count' | 'affinity_score' | 'parent_rank' | 'last_updated' | 'follower_num' | 'blue_stars_sum' | 'pink_stars_sum' | 'green_stars_sum' | 'white_stars_sum';

export interface FactorRequirement {
  factorId: number;
  minimumStars: number;
  maximumStars?: number;
  minimumOccurrences?: number;
  maximumOccurrences?: number;
  metric?: 'stars' | 'occurrences';
  priority?: number;
  operator?: 'and' | 'or';
}

export interface InheritanceSearchFilters {
  trainerId?: string;
  trainerName?: string;
  playerCharaId?: number;
  mainParentIds: number[];
  parentLeftId?: number;
  parentRightId?: number;
  includeMainParentIds: number[];
  includeParentIds: number[];
  excludeParentIds: number[];
  excludeMainParentIds: number[];
  scenarioIds: number[];
  blue: FactorRequirement[];
  pink: FactorRequirement[];
  green: FactorRequirement[];
  white: FactorRequirement[];
  mainBlue: FactorRequirement[];
  mainPink: FactorRequirement[];
  mainGreen: FactorRequirement[];
  mainWhite: FactorRequirement[];
  optionalWhite: FactorRequirement[];
  optionalMainWhite: FactorRequirement[];
  lineageWhite: FactorRequirement[];
  optionalWhiteIds: number[];
  lineageWhiteIds: number[];
  supportCardId?: number;
  minLimitBreak?: number;
  minWinCount?: number;
  minWhiteCount?: number;
  minParentRank?: number;
  maxFollowerNum?: number;
  minBlueStarsSum?: number;
  minPinkStarsSum?: number;
  minGreenStarsSum?: number;
  minWhiteStarsSum?: number;
  minCommonWhiteCount?: number;
  minCommonWhiteStarsSum?: number;
  minScenarioWhiteCount?: number;
  minScenarioWhiteStarsSum?: number;
  minRaceWhiteCount?: number;
  minRaceWhiteStarsSum?: number;
  minMainCommonWhiteCount?: number;
  minMainCommonWhiteStarsSum?: number;
  minMainScenarioWhiteCount?: number;
  minMainScenarioWhiteStarsSum?: number;
  minMainRaceWhiteCount?: number;
  minMainRaceWhiteStarsSum?: number;
  minMainWhiteCount?: number;
  raceSchedule: [number, number, number, number][];
  mainWinSaddle: number[];
  p2MainCharaId?: number;
  p2WinSaddle: number[];
  uql?: string;
  sortBy: InheritanceSort;
  sortOrder: 'asc' | 'desc';
}

export interface InheritanceRecord {
  id: number;
  accountId: string;
  trainerName: string;
  followerCount?: number;
  borrowViews: number;
  borrowCopies: number;
  lastUpdated?: string;
  mainParentId: number;
  leftParentId: number;
  rightParentId: number;
  rankScore: number;
  rarity: number;
  scenarioId?: number;
  blueSparks: number[];
  pinkSparks: number[];
  greenSparks: number[];
  whiteSparks: number[];
  mainBlue?: number;
  mainPink?: number;
  mainGreen?: number;
  mainWhite: number[];
  leftBlue?: number;
  leftPink?: number;
  leftGreen?: number;
  leftWhite: number[];
  rightBlue?: number;
  rightPink?: number;
  rightGreen?: number;
  rightWhite: number[];
  winCount?: number;
  whiteCount?: number;
  affinity: number;
  supportCardId?: number;
  supportLimitBreak?: number;
  supportExperience?: number;
  mainWinSaddles: number[];
  leftWinSaddles: number[];
  rightWinSaddles: number[];
  raceResults: number[];
  isStale?: boolean;
  upvotes?: number;
  downvotes?: number;
}

export interface InheritanceSearchResult {
  records: InheritanceRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiInheritanceRecord {
  inheritance_id: number;
  main_parent_id: number;
  parent_left_id: number;
  parent_right_id: number;
  parent_rank: number;
  parent_rarity: number;
  scenario_id?: number | null;
  blue_sparks?: unknown;
  pink_sparks?: unknown;
  green_sparks?: unknown;
  white_sparks?: unknown;
  main_blue_factors?: number;
  main_pink_factors?: number;
  main_green_factors?: number;
  main_white_factors?: unknown;
  left_blue_factors?: number;
  left_pink_factors?: number;
  left_green_factors?: number;
  left_white_factors?: unknown;
  right_blue_factors?: number;
  right_pink_factors?: number;
  right_green_factors?: number;
  right_white_factors?: unknown;
  win_count?: number;
  white_count?: number;
  affinity_score?: number;
  main_win_saddles?: unknown;
  left_win_saddles?: unknown;
  right_win_saddles?: unknown;
  race_results?: unknown;
}

export interface ApiInheritanceSearchResult {
  items: Array<{
    account_id: string;
    trainer_name: string;
    follower_num?: number | null;
    borrow_view_count?: number;
    borrow_copy_count?: number;
    last_updated?: string | null;
    is_stale?: boolean;
    upvotes?: number;
    downvotes?: number;
    inheritance?: ApiInheritanceRecord | null;
    support_card?: { support_card_id: number; limit_break_count?: number | null; experience?: number } | null;
  }>;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export function emptyInheritanceFilters(): InheritanceSearchFilters {
  return {
    mainParentIds: [], includeMainParentIds: [], includeParentIds: [], excludeParentIds: [], excludeMainParentIds: [], scenarioIds: [],
    blue: [], pink: [], green: [], white: [], mainBlue: [], mainPink: [], mainGreen: [], mainWhite: [],
    optionalWhite: [], optionalMainWhite: [], lineageWhite: [], optionalWhiteIds: [], lineageWhiteIds: [],
    raceSchedule: [], mainWinSaddle: [], p2WinSaddle: [], sortBy: 'trending', sortOrder: 'desc', minParentRank: 1, maxFollowerNum: 999
  };
}

function appendList(query: URLSearchParams, name: string, values: number[]): void {
  if (values.length) query.set(name, [...new Set(values)].join(','));
}

export function activeFactorRequirement(requirement: FactorRequirement): FactorRequirement {
  return requirement.metric === 'occurrences'
    ? { ...requirement, minimumStars: 1, maximumStars: undefined, minimumOccurrences: requirement.minimumOccurrences ?? 0, maximumOccurrences: requirement.maximumOccurrences ?? 3 }
    : { ...requirement, minimumOccurrences: undefined, maximumOccurrences: undefined };
}

export function encodedFactorLevels(requirement: FactorRequirement, maximumCap = 9): number[] {
  requirement = activeFactorRequirement(requirement);
  const id = Math.trunc(requirement.factorId);
  if (!Number.isFinite(id) || id < 0) return [];
  const minimum = Math.max(1, Math.min(maximumCap, Math.trunc(requirement.minimumStars || 1)));
  const maximum = Math.max(minimum, Math.min(maximumCap, Math.trunc(requirement.maximumStars ?? maximumCap)));
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => Number(`${id}${minimum + index}`));
}

function factorPredicate(field: string, requirement: FactorRequirement, maximumCap: number): string {
  const hasCount = requirement.minimumOccurrences !== undefined || requirement.maximumOccurrences !== undefined;
  if (!hasCount) return factorPresence(field, encodedFactorLevels(requirement, maximumCap));
  if (requirement.factorId === 0) {
    const minimum = requirement.minimumOccurrences ?? 0;
    const maximum = requirement.maximumOccurrences ?? (maximumCap === 3 ? 1 : 3);
    if (maximumCap === 3) return minimum <= 1 && maximum >= 1 ? factorPresence(field, encodedFactorLevels(requirement, 3)) : '(1 = 0)';
    return `any_spark(${field}, ${requirement.minimumStars}, ${requirement.maximumStars ?? 9}, ${minimum}, ${maximum})`;
  }
  const clauses: string[] = [];
  if (requirement.minimumOccurrences !== undefined) clauses.push(occurrenceComparison(requirement.factorId, [field], '>=', requirement.minimumOccurrences));
  if (requirement.maximumOccurrences !== undefined) clauses.push(occurrenceComparison(requirement.factorId, [field], '<=', requirement.maximumOccurrences));
  return `(${clauses.join(' and ')})`;
}

function appendFactorGroups(query: URLSearchParams, name: string, requirements: FactorRequirement[], maximumCap = 9): string | undefined {
  requirements = requirements.map(activeFactorRequirement);
  const field = name.replace(/^main_parent_(blue|pink|green|white)_sparks$/, 'main_$1_factors');
  const valid = requirements.filter(item => encodedFactorLevels(item, maximumCap).length && !(item.factorId === 0 && name.includes('white')));
  if (valid.some(item => item.minimumOccurrences !== undefined || item.maximumOccurrences !== undefined) || (field !== name && !name.includes('white') && (valid.length > 1 || valid.some(item => item.factorId === 0)))) {
    const groups: string[][] = [];
    for (const item of valid) {
      const clause = factorPredicate(field, item, maximumCap);
      if (item.operator === 'or' && groups.length) groups[groups.length - 1]!.push(clause);
      else groups.push([clause]);
    }
    return groups.map(group => `(${group.join(' or ')})`).join(' and ');
  }
  const groups: number[][] = [];
  let hasAlternatives = false;
  for (const requirement of requirements) {
    if (requirement.factorId === 0 && name.includes('white')) continue;
    const levels = encodedFactorLevels(requirement, maximumCap);
    if (!levels.length) continue;
    if (requirement.operator === 'or' && groups.length) { groups[groups.length - 1]!.push(...levels); hasAlternatives = true; }
    else groups.push(levels);
  }
  const alternatives = groups.map((group) => [...new Set(group)].join(','));
  // The legacy matcher counts overlapping groups. Mixed AND/OR needs each group to match.
  if (groups.length > 1 && hasAlternatives) {
    const field = name === 'main_parent_white_sparks' ? 'main_white_factors' : name;
    return alternatives.map((values) => `overlaps(${field}, (${values}))`).join(' and ');
  }
  for (const group of alternatives) query.append(name, group);
  return undefined;
}

function priorityValues(requirements: FactorRequirement[]): { ids: number[]; priorities: string[] } {
  const valid = requirements.filter((requirement) => Number.isFinite(requirement.factorId) && requirement.factorId > 0);
  return {
    ids: valid.map((requirement) => Math.trunc(requirement.factorId)),
    priorities: valid.map((requirement) => `${Math.trunc(requirement.factorId)}:${Math.max(0, Math.floor(requirement.priority ?? 0))}`)
  };
}

export function excludedMainParentIds(filters: InheritanceSearchFilters): number[] {
  const result = [...filters.excludeMainParentIds];
  const base = (id: number) => id >= 10000 ? Math.floor(id / 100) : id;
  if (filters.p2MainCharaId && !result.some((id) => base(id) === base(filters.p2MainCharaId!))) result.push(base(filters.p2MainCharaId));
  return result;
}

export function inheritanceRequestFilters(filters: InheritanceSearchFilters, mode: InheritanceFilterMode): InheritanceSearchFilters {
  if (mode !== 'uql') return { ...filters, uql: undefined, minParentRank: filters.minParentRank ?? 1, minWinCount: filters.minWinCount ?? 0, minWhiteCount: filters.minWhiteCount ?? 0 };
  return {
    ...emptyInheritanceFilters(), minParentRank: undefined,
    uql: filters.uql, playerCharaId: filters.playerCharaId,
    p2MainCharaId: filters.p2MainCharaId, p2WinSaddle: filters.p2WinSaddle,
    sortBy: filters.sortBy, sortOrder: filters.sortOrder
  };
}

export function inheritanceSearchQuery(filters: InheritanceSearchFilters, page: number, limit: number, mode: InheritanceFilterMode = filters.uql === undefined ? 'advanced' : 'uql', validation?: UqlValidation): URLSearchParams {
  filters = inheritanceRequestFilters(filters, mode);
  const query = new URLSearchParams({ page: String(page), limit: String(limit), search_type: 'inheritance' });
  if (filters.trainerId?.trim()) query.set('trainer_id', filters.trainerId.trim());
  if (filters.trainerName?.trim()) query.set('trainer_name', filters.trainerName.trim());
  if (filters.playerCharaId) query.set('player_chara_id', String(filters.playerCharaId));
  appendList(query, 'main_parent_id', filters.mainParentIds);
  if (filters.parentLeftId) query.set('parent_left_id', String(filters.parentLeftId));
  if (filters.parentRightId) query.set('parent_right_id', String(filters.parentRightId));
  appendList(query, 'parent_id', filters.includeParentIds);
  appendList(query, 'exclude_parent_id', filters.excludeParentIds);
  appendList(query, 'exclude_main_parent_id', excludedMainParentIds(filters));
  appendList(query, 'scenario_id', filters.scenarioIds);
  const factorPredicates = [
    appendFactorGroups(query, 'blue_sparks', filters.blue),
    appendFactorGroups(query, 'pink_sparks', filters.pink),
    appendFactorGroups(query, 'green_sparks', filters.green),
    appendFactorGroups(query, 'white_sparks', filters.white),
    appendFactorGroups(query, 'main_parent_white_sparks', filters.mainWhite, 3),
    appendFactorGroups(query, 'main_parent_blue_sparks', filters.mainBlue, 3),
    appendFactorGroups(query, 'main_parent_pink_sparks', filters.mainPink, 3),
    appendFactorGroups(query, 'main_parent_green_sparks', filters.mainGreen, 3)
  ].filter((predicate) => predicate !== undefined);
  const optionalWhite = priorityValues(filters.optionalWhite.length ? filters.optionalWhite : filters.optionalWhiteIds.map((factorId) => ({ factorId, minimumStars: 1 })));
  const optionalMainWhite = priorityValues(filters.optionalMainWhite);
  const lineageWhite = priorityValues(filters.lineageWhite.length ? filters.lineageWhite : filters.lineageWhiteIds.map((factorId) => ({ factorId, minimumStars: 1 })));
  appendList(query, 'optional_white_sparks', optionalWhite.ids);
  if (optionalWhite.ids.length) query.set('optional_white_priorities', optionalWhite.priorities.join(','));
  appendList(query, 'optional_main_white_sparks', optionalMainWhite.ids);
  if (optionalMainWhite.ids.length) query.set('optional_main_white_priorities', optionalMainWhite.priorities.join(','));
  appendList(query, 'lineage_white', lineageWhite.ids);
  if (lineageWhite.ids.length) query.set('lineage_white_priorities', lineageWhite.priorities.join(','));
  const scalars: Array<[string, number | undefined]> = [
    ['support_card_id', filters.supportCardId], ['min_limit_break', filters.minLimitBreak], ['min_win_count', filters.minWinCount],
    ['min_white_count', filters.minWhiteCount], ['parent_rank', filters.minParentRank], ['max_follower_num', filters.maxFollowerNum],
    ['min_blue_stars_sum', filters.minBlueStarsSum], ['min_pink_stars_sum', filters.minPinkStarsSum],
    ['min_green_stars_sum', filters.minGreenStarsSum], ['min_white_stars_sum', filters.minWhiteStarsSum],
    ['min_common_white_count', filters.minCommonWhiteCount], ['min_common_white_stars_sum', filters.minCommonWhiteStarsSum],
    ['min_scenario_white_count', filters.minScenarioWhiteCount], ['min_scenario_white_stars_sum', filters.minScenarioWhiteStarsSum],
    ['min_race_white_count', filters.minRaceWhiteCount], ['min_race_white_stars_sum', filters.minRaceWhiteStarsSum],
    ['min_main_common_white_count', filters.minMainCommonWhiteCount], ['min_main_common_white_stars_sum', filters.minMainCommonWhiteStarsSum],
    ['min_main_scenario_white_count', filters.minMainScenarioWhiteCount], ['min_main_scenario_white_stars_sum', filters.minMainScenarioWhiteStarsSum],
    ['min_main_race_white_count', filters.minMainRaceWhiteCount], ['min_main_race_white_stars_sum', filters.minMainRaceWhiteStarsSum],
    ['min_main_white_count', filters.minMainWhiteCount], ['p2_main_chara_id', filters.p2MainCharaId]
  ];
  for (const [name, value] of scalars) if (value !== undefined && Number.isFinite(value) && value >= 0) query.set(name, String(value));
  const uql = mode === 'uql' && validation ? validation : validateInheritanceUql(filters.uql ?? '');
  if (uql.state === 'invalid' || uql.state === 'incomplete') throw new Error(uql.message);
  if (uql.state === 'valid' && uql.compiled) query.set('uql', uql.compiled);
  else if (factorPredicates.length) query.set('uql', factorPredicates.join(' and '));
  if (uql.explicitFollowerFilter) query.set('max_follower_num', '1000');
  appendList(query, 'main_win_saddle', filters.mainWinSaddle);
  appendList(query, 'p2_win_saddle', filters.p2WinSaddle);
  query.set('sort_by', uql.sortBy ?? filters.sortBy);
  query.set('sort_order', filters.sortOrder);
  return query;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

export function normalizeInheritanceRecord(account: ApiInheritanceSearchResult['items'][number]): InheritanceRecord | null {
  const inheritance = account.inheritance;
  if (!inheritance) return null;
  return {
    id: inheritance.inheritance_id,
    accountId: account.account_id,
    trainerName: account.trainer_name,
    followerCount: account.follower_num ?? undefined,
    borrowViews: account.borrow_view_count ?? 0,
    borrowCopies: account.borrow_copy_count ?? 0,
    lastUpdated: account.last_updated ?? undefined,
    mainParentId: inheritance.main_parent_id,
    leftParentId: inheritance.parent_left_id,
    rightParentId: inheritance.parent_right_id,
    rankScore: inheritance.parent_rank,
    rarity: inheritance.parent_rarity,
    scenarioId: inheritance.scenario_id ?? undefined,
    blueSparks: numbers(inheritance.blue_sparks), pinkSparks: numbers(inheritance.pink_sparks), greenSparks: numbers(inheritance.green_sparks), whiteSparks: numbers(inheritance.white_sparks),
    mainBlue: inheritance.main_blue_factors, mainPink: inheritance.main_pink_factors, mainGreen: inheritance.main_green_factors, mainWhite: numbers(inheritance.main_white_factors),
    leftBlue: inheritance.left_blue_factors, leftPink: inheritance.left_pink_factors, leftGreen: inheritance.left_green_factors, leftWhite: numbers(inheritance.left_white_factors),
    rightBlue: inheritance.right_blue_factors, rightPink: inheritance.right_pink_factors, rightGreen: inheritance.right_green_factors, rightWhite: numbers(inheritance.right_white_factors),
    winCount: inheritance.win_count, whiteCount: inheritance.white_count, affinity: inheritance.affinity_score ?? 0,
    supportCardId: account.support_card?.support_card_id, supportLimitBreak: account.support_card?.limit_break_count ?? undefined, supportExperience: account.support_card?.experience,
    mainWinSaddles: numbers(inheritance.main_win_saddles), leftWinSaddles: numbers(inheritance.left_win_saddles), rightWinSaddles: numbers(inheritance.right_win_saddles), raceResults: numbers(inheritance.race_results),
    isStale: account.is_stale, upvotes: account.upvotes, downvotes: account.downvotes
  };
}

export function normalizeInheritanceSearch(payload: ApiInheritanceSearchResult): InheritanceSearchResult {
  const records = payload.items.map(normalizeInheritanceRecord).filter((record) => record !== null);
  return { records, total: payload.total, page: payload.page, pageSize: payload.limit, totalPages: payload.total_pages };
}

export function activeInheritanceFilterCount(filters: InheritanceSearchFilters): number {
  let count = 0;
  if (filters.trainerId?.trim()) count++;
  if (filters.trainerName?.trim()) count++;
  const arrays: unknown[][] = [filters.mainParentIds, filters.includeParentIds, filters.excludeParentIds, filters.excludeMainParentIds, filters.scenarioIds, filters.raceSchedule];
  count += arrays.reduce((sum, values) => sum + values.length, 0);
  const factors = [filters.blue, filters.pink, filters.green, filters.mainBlue, filters.mainPink, filters.mainGreen, ...[filters.white, filters.mainWhite, filters.optionalWhite, filters.optionalMainWhite, filters.lineageWhite].map(values => values.filter(item => item.factorId > 0))];
  count += factors.reduce((sum, values) => sum + values.filter((requirement) => Number.isFinite(requirement.factorId) && requirement.factorId >= 0).length, 0);
  const optionalScalars = [filters.playerCharaId, filters.parentLeftId, filters.parentRightId, filters.supportCardId, filters.minLimitBreak, filters.minWinCount, filters.minWhiteCount, filters.minBlueStarsSum, filters.minPinkStarsSum, filters.minGreenStarsSum, filters.minWhiteStarsSum, filters.minCommonWhiteCount, filters.minCommonWhiteStarsSum, filters.minScenarioWhiteCount, filters.minScenarioWhiteStarsSum, filters.minRaceWhiteCount, filters.minRaceWhiteStarsSum, filters.minMainCommonWhiteCount, filters.minMainCommonWhiteStarsSum, filters.minMainScenarioWhiteCount, filters.minMainScenarioWhiteStarsSum, filters.minMainRaceWhiteCount, filters.minMainRaceWhiteStarsSum, filters.minMainWhiteCount, filters.p2MainCharaId];
  count += optionalScalars.filter((value) => value !== undefined && value !== 0).length;
  if ((filters.minParentRank ?? 1) > 1) count++;
  if (filters.uql?.trim()) count++;
  return count;
}
