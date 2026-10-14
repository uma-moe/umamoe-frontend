import { factorMetadata } from '@/lib/catalog/factor-catalog';
import { sparkProbability } from '@/lib/inheritance/spark-probability';
import type { VeteranRecord } from './generated/veteran-record';

export interface VeteranBranchAffinity {
  self: number;
  grandparentOne: number;
  grandparentTwo: number;
}

export interface SparkProcResult {
  factorId: number;
  name: string;
  type: number;
  atLeastOne: number;
  atLeastTwo: number;
  copies: number;
}

export function sparkChance(factorId: number, level: number, affinity: number): number | null {
  const type = factorMetadata(factorId)?.type;
  if (type === undefined) return null;
  return sparkProbability(type, level, affinity);
}

function addFactorChances(target: Map<number, number[]>, veteran: VeteranRecord, affinity: VeteranBranchAffinity): void {
  for (const factor of veteran.factors) {
    const chance = sparkChance(factor.id, factor.level, affinity.self);
    if (chance !== null) target.set(factor.id, [...(target.get(factor.id) ?? []), chance]);
  }
  const grandparents = veteran.parents.slice().sort((left, right) => left.positionId - right.positionId);
  grandparents.forEach((grandparent, index) => {
    const branchAffinity = index === 0 ? affinity.grandparentOne : affinity.grandparentTwo;
    for (const factor of grandparent.factors) {
      const chance = sparkChance(factor.id, factor.level, branchAffinity);
      if (chance !== null) target.set(factor.id, [...(target.get(factor.id) ?? []), chance]);
    }
  });
}

function distribution(probabilities: number[]): number[] {
  let values = [1];
  for (const probability of probabilities) {
    const next = Array.from({ length: values.length + 1 }, () => 0);
    values.forEach((value, count) => { next[count] = (next[count] ?? 0) + value * (1 - probability); next[count + 1] = (next[count + 1] ?? 0) + value * probability; });
    values = next;
  }
  return values;
}

export function calculateSparkProcs(parentOne: VeteranRecord, parentTwo: VeteranRecord, parentOneAffinity: VeteranBranchAffinity, parentTwoAffinity: VeteranBranchAffinity, fullRun = true): SparkProcResult[] {
  const chances = new Map<number, number[]>();
  addFactorChances(chances, parentOne, parentOneAffinity);
  addFactorChances(chances, parentTwo, parentTwoAffinity);
  return [...chances.entries()].map(([factorId, probabilities]) => {
    const attempts = fullRun ? [...probabilities, ...probabilities] : probabilities;
    const values = distribution(attempts);
    const metadata = factorMetadata(factorId);
    return {
      factorId,
      name: metadata?.text ?? `Factor ${factorId}`,
      type: metadata?.type ?? -1,
      atLeastOne: (1 - (values[0] ?? 0)) * 100,
      atLeastTwo: (1 - (values[0] ?? 0) - (values[1] ?? 0)) * 100,
      copies: probabilities.length
    };
  }).filter((result) => result.type !== 0).sort((left, right) => left.type - right.type || right.atLeastOne - left.atLeastOne);
}
