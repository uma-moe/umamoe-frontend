import { describe, expect, it } from 'vitest';
import type { VeteranRecord } from './generated/veteran-record';
import { rankVeteranPairs, VeteranAffinityEngine } from './affinity-engine';

function record(id: string, cardId: number, grandparents: number[] = [], rankScore = 0): VeteranRecord {
  return {
    schemaVersion: 1,
    recordId: id,
    cardId,
    rankScore,
    stats: { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 },
    skills: [],
    factors: [],
    parents: grandparents.map((value, index) => ({ positionId: index === 0 ? 10 : 20, cardId: value * 100 + 1, factors: [] }))
  };
}

function fixture(): VeteranAffinityEngine {
  const chars = [1, 2, 3, 4];
  const size = chars.length;
  const aff2 = Array.from({ length: size * size }, (_, index) => Math.floor(index / size) * 10 + index % size);
  const aff3 = Array.from({ length: size ** 3 }, (_, index) => index);
  return new VeteranAffinityEngine({ chars, aff2, aff3 });
}

describe('VeteranAffinityEngine', () => {
  it('uses the same row-major aff2 and aff3 indexing as the Angular engine', () => {
    const engine = fixture();
    expect(engine.pair(2, 4)).toBe(13);
    expect(engine.triple(2, 3, 4)).toBe(27);
    expect(engine.pair(999, 2)).toBe(0);
  });

  it('scores both parent branches and counts the parent pair once', () => {
    const engine = fixture();
    const result = engine.scoreVeteranPair(1, record('p1', 201, [3, 4]), record('p2', 301, [4]));
    expect(result.targetParentOne).toBe(1);
    expect(result.targetParentTwo).toBe(2);
    expect(result.parentPair).toBe(12);
    expect(result.total).toBe(result.parentOneTotal + result.parentTwoTotal + result.parentPair);
  });

  it('ranks unique parent combinations and excludes the target character', () => {
    const engine = fixture();
    const scores = rankVeteranPairs(engine, 1, [record('target', 101), record('a', 201), record('b', 301), record('c', 401)], 2);
    expect(scores).toHaveLength(2);
    expect(scores.every((score) => score.parentOne.recordId !== 'target' && score.parentTwo.recordId !== 'target')).toBe(true);
    expect(scores[0]!.relation.total).toBeGreaterThanOrEqual(scores[1]!.relation.total);
  });
});
