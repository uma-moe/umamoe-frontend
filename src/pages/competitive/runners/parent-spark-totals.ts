import { decodeFactorEntry, type DecodedFactor } from '@/lib/game-data/factors/factors';

export function parentSparkTotals(
  parents: readonly { factors: readonly { id: number; level: number }[] }[]
): DecodedFactor[] {
  const totals = new Map<string, DecodedFactor>();
  for (const parent of parents) {
    for (const factor of parent.factors) {
      const spark = decodeFactorEntry(factor.id, factor.level);
      const key = spark.category + ':' + spark.name;
      const current = totals.get(key);
      if (current) current.level += spark.level;
      else totals.set(key, { ...spark });
    }
  }

  const order = { stats: 0, aptitude: 1, unique: 2, 'skills-races': 3 };
  return [...totals.values()].sort((a, b) => order[a.category] - order[b.category] || a.id - b.id);
}
