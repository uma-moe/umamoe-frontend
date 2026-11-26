import { describe, expect, it } from 'vitest';
import type { PlannerGachaEntry } from '@/lib/carat-planner/carat-planner';
import type { CharacterData } from '@/lib/game-data/characters';
import { createFutureGachaPool } from './future-gacha-pool';
import { rarityRate } from './gacha-draw';

function character(id: number, rarity: 1 | 2 | 3, releaseDate: string): CharacterData {
  return {
    id: String(id),
    name: `Character ${id}`,
    image: '',
    rarity,
    release_date: releaseDate
  };
}

const gacha: PlannerGachaEntry = {
  gacha_id: 30430,
  gacha_type: 3,
  banner_kind: 'character',
  start_date: '2029-01-04',
  end_date: '2029-01-14',
  jewel_cost_per_pull: 150,
  pickups: [{ pickup_id: 111801, rate: 0.0075 }],
  featured_pickups: [{ pickup_id: 111801, rate: 0.0075 }],
  rarity_rates: [
    { rarity: 1, rate: 0.79 },
    { rarity: 2, rate: 0.18 },
    { rarity: 3, rate: 0.03 }
  ]
};

describe('future gacha pools', () => {
  it('preserves published rates and splits the remainder across JP-released cards', () => {
    const pool = createFutureGachaPool({
      gacha,
      kind: 'character',
      jpReleaseDate: new Date('2026-04-20T03:00:00Z'),
      catalog: {
        characters: [
          character(100101, 1, '2021-02-24'),
          character(100201, 1, '2021-02-24'),
          character(100301, 2, '2021-02-24'),
          character(100401, 3, '2021-02-24'),
          character(111801, 3, '2026-04-20'),
          character(111901, 3, '2026-04-21')
        ],
        supports: []
      }
    });

    expect(pool.source).toBe('estimated');
    expect(pool.entries).toEqual([
      { cardId: 100101, rarity: 1, odds: 395_000, featured: false },
      { cardId: 100201, rarity: 1, odds: 395_000, featured: false },
      { cardId: 100301, rarity: 2, odds: 180_000, featured: false },
      { cardId: 100401, rarity: 3, odds: 22_500, featured: false },
      { cardId: 111801, rarity: 3, odds: 7_500, featured: true }
    ]);
    expect(rarityRate(pool, 1)).toBe(0.79);
    expect(rarityRate(pool, 2)).toBe(0.18);
    expect(rarityRate(pool, 3)).toBe(0.03);
  });

  it('rejects rates without a valid remainder pool', () => {
    expect(() =>
      createFutureGachaPool({
        gacha,
        kind: 'character',
        jpReleaseDate: new Date('2026-04-20'),
        catalog: { characters: [character(111801, 3, '2026-04-20')], supports: [] }
      })
    ).toThrow('remainder pool');
  });
});
