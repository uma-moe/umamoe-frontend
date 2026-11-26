import { describe, expect, it } from 'vitest';
import { parseGachaPools } from './gacha-pool-parser';

describe('gacha pool parser', () => {
  it('groups exact card weights by banner and preserves featured flags', () => {
    const pools = parseGachaPools([
      [30148, 1, 150, 2, 100101, 1, 98_750, 0],
      [30148, 1, 150, 2, 104301, 3, 7_500, 1],
      [30149, 2, 150, 2, 30082, 3, 7_500, 1]
    ]);

    expect(pools.get(30148)).toMatchObject({
      id: 30148,
      kind: 'character',
      cost: 150,
      guaranteedRarity: 2,
      source: 'live',
      entries: [
        { cardId: 100101, rarity: 1, odds: 98_750, featured: false },
        { cardId: 104301, rarity: 3, odds: 7_500, featured: true }
      ]
    });
    expect(pools.get(30149)?.kind).toBe('support');
  });

  it('rejects malformed rows instead of drawing from uncertain data', () => {
    expect(() => parseGachaPools([[30148, 1, 150, 2, 104301, 4, 7_500, 1]])).toThrow(
      'Unsupported gacha rarity'
    );
    expect(() => parseGachaPools([[30148, 1, 150, 3, 104301, 3, 7_500, 1]])).toThrow(
      'unsupported guarantee'
    );
    expect(() => parseGachaPools([[30148, 1, 150, 2, 104301, 3, '7500', 1]])).toThrow(
      'invalid gacha pool data'
    );
  });
});
