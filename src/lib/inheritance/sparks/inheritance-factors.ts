import { decodeFactor, type DecodedFactor } from '@/lib/game-data/factors/factors';
import {
  applyPlannerPayload,
  calculatePlannerAffinity,
  parsePlannerTransfer,
  plannerNodeAffinity
} from '@/lib/lineage/planner';
import type { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import {
  encodedFactorLevels,
  type InheritanceRecord,
  type InheritanceSearchFilters
} from '../search/inheritance-search';
import type { UqlSparkHighlight } from '../uql/uql-spark-highlight';

export type FactorOwner = 'main' | 'left' | 'right';
export type SparkOrder = 'main' | 'stars' | 'occurrences' | 'alphabetical';
export interface FactorContribution {
  owner: FactorOwner;
  side: 'p1' | 'p2';
  level: number;
}

export interface InheritanceFactor extends DecodedFactor {
  group: number;
  owner?: FactorOwner;
  copies: number;
  mainStars: number;
  sources: FactorContribution[];
}

/** Angular highlights selected requirements, not every spark in a matching record. */
export function inheritanceFactorMatched(
  factor: InheritanceFactor,
  filters?: InheritanceSearchFilters,
  uql?: UqlSparkHighlight
): boolean {
  if (uql) {
    if (uql.global.has(factor.id * 10 + factor.level)) return true;
    if (
      factor.sources.some(
        (source) => source.side === 'p1' && uql[source.owner].has(factor.id * 10 + source.level)
      )
    )
      return true;
    if (
      ![0, 1, 5].includes(factor.group) &&
      (uql.optionalWhite.has(factor.id) ||
        uql.lineageWhite.has(factor.id) ||
        (uql.optionalMainWhite.has(factor.id) &&
          factor.sources.some((source) => source.side === 'p1' && source.owner === 'main')))
    )
      return true;
  }

  if (!filters) return false;
  const color =
    factor.group === 0
      ? 'blue'
      : factor.group === 1
        ? 'pink'
        : factor.group === 5
          ? 'green'
          : 'white';

  if (
    filters[color].some(
      (requirement) =>
        (color !== 'white' || requirement.factorId > 0) &&
        encodedFactorLevels(requirement).includes(
          requirement.factorId === 0 ? factor.level : factor.id * 10 + factor.level
        )
    )
  )
    return true;
  const hasMain = factor.sources.some((source) => source.side === 'p1' && source.owner === 'main');
  const main =
    color === 'blue'
      ? filters.mainBlue
      : color === 'pink'
        ? filters.mainPink
        : color === 'green'
          ? filters.mainGreen
          : filters.mainWhite;

  if (
    hasMain &&
    main.some(
      (requirement) =>
        requirement.factorId === factor.id ||
        (color !== 'white' &&
          requirement.factorId === 0 &&
          factor.sources.some(
            (source) =>
              source.side === 'p1' &&
              source.owner === 'main' &&
              encodedFactorLevels(requirement, 3).includes(source.level)
          ))
    )
  )
    return true;
  if (color !== 'white') return false;
  return (
    filters.optionalWhite.some((requirement) => requirement.factorId === factor.id) ||
    filters.optionalWhiteIds.includes(factor.id) ||
    (factor.sources.some((source) => source.side === 'p1') &&
      (filters.lineageWhite.some((requirement) => requirement.factorId === factor.id) ||
        filters.lineageWhiteIds.includes(factor.id))) ||
    (hasMain && filters.optionalMainWhite.some((requirement) => requirement.factorId === factor.id))
  );
}

function orderFactors(factors: InheritanceFactor[], order: SparkOrder): InheritanceFactor[] {
  if (order === 'main') return factors;
  const occurrences = new Map<number, number>();
  if (order === 'occurrences')
    for (const factor of factors)
      occurrences.set(factor.id, (occurrences.get(factor.id) ?? 0) + factor.copies);
  return factors.sort(
    (a, b) =>
      (order === 'occurrences' ? (occurrences.get(b.id) ?? 0) - (occurrences.get(a.id) ?? 0) : 0) ||
      (order !== 'alphabetical' ? b.level - a.level : 0) ||
      a.name.localeCompare(b.name)
  );
}

export function inheritanceFactors(
  record: InheritanceRecord,
  split = false,
  focus?: FactorOwner,
  partner?: VeteranRecord,
  order: SparkOrder = 'main'
): InheritanceFactor[] {
  const sources: InheritanceFactor[] = [];
  const add = (
    encoded: number | undefined,
    owner: FactorOwner,
    side: 'p1' | 'p2',
    fallbackGroup?: number
  ): void => {
    if (!encoded || !Number.isFinite(encoded)) return;
    const factor = decodeFactor(encoded);
    sources.push({
      ...factor,
      group: factor.type >= 0 ? factor.type : (fallbackGroup ?? 3),
      owner,
      copies: 1,
      mainStars: owner === 'main' && side === 'p1' ? factor.level : 0,
      sources: [{ owner, side, level: factor.level }]
    });
  };

  for (const owner of ['main', 'left', 'right'] as const) {
    if (focus && focus !== owner) continue;
    add(record[`${owner}Blue`], owner, 'p1', 0);
    add(record[`${owner}Pink`], owner, 'p1', 1);
    add(record[`${owner}Green`], owner, 'p1', 5);
    for (const encoded of record[`${owner}White`]) add(encoded, owner, 'p1', 3);
  }

  if (partner && !focus) {
    for (const factor of partner.factors) add(factor.id * 10 + factor.level, 'main', 'p2');
    for (const parent of partner.parents) {
      if (parent.positionId !== 10 && parent.positionId !== 20) continue;
      for (const factor of parent.factors)
        add(factor.id * 10 + factor.level, parent.positionId === 10 ? 'left' : 'right', 'p2');
    }
  }

  if (split || focus) return orderFactors(sources, order);
  const merged = new Map<number, InheritanceFactor>();
  for (const factor of sources) {
    const current = merged.get(factor.id);
    if (current) {
      current.level += factor.level;
      current.copies++;
      current.mainStars += factor.mainStars;
      current.sources.push(...factor.sources);
    } else merged.set(factor.id, { ...factor, sources: [...factor.sources], owner: undefined });
  }

  // Older records expose only combined arrays. Never count totals a second time.
  for (const [group, values] of [
    [0, record.blueSparks],
    [1, record.pinkSparks],
    [5, record.greenSparks],
    [3, record.whiteSparks]
  ] as const)
    for (const encoded of values) {
      const factor = decodeFactor(encoded);
      if (!merged.has(factor.id))
        merged.set(factor.id, {
          ...factor,
          group: factor.type >= 0 ? factor.type : group,
          copies: 0,
          mainStars: 0,
          sources: []
        });
    }

  // The default preserves Angular's source order: main parent, grandparents, then P2.
  return orderFactors([...merged.values()], order);
}

export function inheritanceAffinity(
  record: InheritanceRecord,
  targetId: number | undefined,
  partner: VeteranRecord | undefined,
  engine: VeteranAffinityEngine | undefined,
  groups: ReadonlyMap<number, number>,
  partnerWins?: readonly number[]
) {
  const nodes = applyPlannerPayload(
    parsePlannerTransfer({
      record,
      targetCharaId: targetId,
      veteran: partner,
      veteranPosition: 'p2'
    })?.payload ?? []
  );

  if (partnerWins) nodes.p2.winSaddleIds = [...partnerWins];
  const tree = calculatePlannerAffinity(engine, nodes, groups);
  const base = (id: number) => (id >= 10000 ? Math.floor(id / 100) : id);
  const breedingLeft = engine?.pair(base(record.mainParentId), base(record.leftParentId)) ?? 0;
  const breedingRight = engine?.pair(base(record.mainParentId), base(record.rightParentId)) ?? 0;
  const left = breedingLeft + (tree?.race.p1Left ?? 0);
  const right = breedingRight + (tree?.race.p1Right ?? 0);
  const source = (entry: FactorContribution): number => {
    if (entry.side === 'p1' && !targetId)
      return entry.owner === 'main'
        ? left + right || record.affinity
        : entry.owner === 'left'
          ? left
          : right;
    return plannerNodeAffinity(
      tree,
      entry.owner === 'main' ? entry.side : `${entry.side}-${entry.owner === 'left' ? 1 : 2}`
    );
  };

  const detail = (owner: FactorOwner) => {
    if (!tree || !record.mainParentId) return null;
    const race =
      owner === 'main'
        ? tree.race.p1Left + tree.race.p1Right + (targetId ? tree.race.parentPair : 0)
        : owner === 'left'
          ? tree.race.p1Left
          : tree.race.p1Right;

    const base = targetId
      ? owner === 'main'
        ? tree.parentOne.total
        : tree.parentOne[owner]
      : owner === 'main'
        ? breedingLeft + breedingRight
        : owner === 'left'
          ? breedingLeft
          : breedingRight;

    const cross = targetId && owner === 'main' ? tree.shared : 0;
    const total = base + cross + race;
    return total ? { total, base, cross, race } : null;
  };

  return {
    total: targetId ? (tree?.total ?? null) : left + right || record.affinity,
    base: targetId ? (tree?.relationTotal ?? null) : tree ? breedingLeft + breedingRight : null,
    race: targetId ? (tree?.race.total ?? 0) : (tree?.race.p1Left ?? 0) + (tree?.race.p1Right ?? 0),
    crossRace: tree?.race.parentPair ?? 0,
    detail,
    source
  };
}
