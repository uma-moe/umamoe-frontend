import { setupResourceFixtures } from '../../../../tests/fixtures/resource-setup';

import { describe, expect, it } from 'vitest';
import type { VeteranRecord } from '../generated/veteran-record';
import { calculateSparkProcs, sparkChance } from './spark-proc';

setupResourceFixtures();

function veteran(id: string): VeteranRecord {
  return {
    schemaVersion: 1,
    recordId: id,
    cardId: 101101,
    stats: { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 },
    skills: [],
    factors: [{ id: 200010, level: 3 }],
    parents: []
  };
}

describe('Veteran spark probabilities', () => {
  it('ports Hakuraku factor base chances and affinity scaling', () => {
    expect(sparkChance(200010, 3, 0)).toBeCloseTo(0.09);
    expect(sparkChance(200010, 3, 50)).toBeCloseTo(0.135);
  });

  it('combines both parents and both inheritance events as a poisson-binomial distribution', () => {
    const affinity = { self: 0, grandparentOne: 0, grandparentTwo: 0 };

    const first = calculateSparkProcs(veteran('a'), veteran('b'), affinity, affinity, false)[0]!;
    const full = calculateSparkProcs(veteran('a'), veteran('b'), affinity, affinity, true)[0]!;
    expect(first.atLeastOne).toBeCloseTo(17.19, 2);
    expect(first.atLeastTwo).toBeCloseTo(0.81, 2);
    expect(full.atLeastOne).toBeGreaterThan(first.atLeastOne);
    expect(full.atLeastTwo).toBeGreaterThan(first.atLeastTwo);
  });
});
