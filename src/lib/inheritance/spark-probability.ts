export interface SparkSource { spark: { type: number; level: number }; affinity: number; }
const baseChances: Record<number, readonly number[]> = { 0: [0, 70, 80, 90], 1: [0, 1, 3, 5], 5: [0, 5, 10, 15], 2: [0, 1, 2, 3], 3: [0, 3, 6, 9], 4: [0, 3, 6, 9] };

export function sparkProbability(type: number, level: number, affinity: number): number {
  const chances = baseChances[type] ?? baseChances[3]!;
  const base = chances[Math.max(0, Math.min(3, Math.trunc(level)))] ?? 0;
  return Math.min(100, Math.max(0, base * (1 + affinity / 100))) / 100;
}

/** Angular's independent source/roll calculation. Stars must not be summed before calculating odds. */
export function sparkMetrics(sources: readonly SparkSource[], perRun = false): { chance: number; expected: number; guaranteed: boolean } {
  let expected = 0;
  let none = 1;
  for (const { spark, affinity } of sources) {
    const probability = sparkProbability(spark.type, spark.level, affinity);
    const rolls = perRun ? 2 : 1;
    expected += probability * rolls;
    none *= (1 - probability) ** rolls;
  }
  return { chance: Math.round((1 - none) * 10000) / 100, expected: Math.round(expected * 100) / 100, guaranteed: none === 0 };
}
