import { describe, expect, it } from 'vitest';
import { drawGacha, entryRate, rarityRate, type GachaPool } from './gacha-draw';

const pool: GachaPool = {
  id: 7,
  kind: 'support',
  cost: 150,
  guaranteedRarity: 2,
  source: 'live',
  entries: [
    { cardId: 10001, rarity: 1, odds: 790_000, featured: false },
    { cardId: 20001, rarity: 2, odds: 180_000, featured: false },
    { cardId: 30001, rarity: 3, odds: 22_500, featured: false },
    { cardId: 30002, rarity: 3, odds: 7_500, featured: true }
  ]
};

function randomSequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe('gacha draws', () => {
  it.each([
    [0, 10001],
    [0.789999, 10001],
    [0.79, 20001],
    [0.97, 30001],
    [0.9925, 30002]
  ])('uses exact item weights at roll %f', (roll, expectedCard) => {
    const [result] = drawGacha(pool, 1, { random: () => roll });

    expect(result).toMatchObject({ cardId: expectedCard, guaranteed: false });
  });

  it('guarantees SR or better only on the tenth draw', () => {
    const results = drawGacha(pool, 10, {
      guaranteed: true,
      random: randomSequence([...Array(9).fill(0), 0.5, 0])
    });

    expect(results).toHaveLength(10);
    expect(results.slice(0, 9).every((result) => result.rarity === 1)).toBe(true);
    expect(results[9]).toMatchObject({ cardId: 20001, rarity: 2, guaranteed: true });
  });

  it('leaves the tenth draw to the pool when the purchase pays no guarantee', () => {
    const results = drawGacha(pool, 10, {
      random: randomSequence([...Array(10).fill(0.5)])
    });

    expect(results).toHaveLength(10);
    expect(results.every((result) => result.guaranteed === false)).toBe(true);
  });

  it('keeps the top-rarity rate at 3% on the guaranteed draw', () => {
    const featured = drawGacha(pool, 10, {
      guaranteed: true,
      random: randomSequence([...Array(9).fill(0), 0.029, 0.99])
    })[9];
    const notTopRarity = drawGacha(pool, 10, {
      guaranteed: true,
      random: randomSequence([...Array(9).fill(0), 0.03, 0])
    })[9];

    expect(featured).toMatchObject({ cardId: 30002, rarity: 3, featured: true });
    expect(notTopRarity).toMatchObject({ cardId: 20001, rarity: 2 });
  });

  it('derives displayed rarity rates from the pool weights', () => {
    expect(rarityRate(pool, 1)).toBe(0.79);
    expect(rarityRate(pool, 2)).toBe(0.18);
    expect(rarityRate(pool, 3)).toBe(0.03);
  });

  it('reports one card’s share of the pool', () => {
    expect(entryRate(pool, 30002)).toBe(0.0075);
    expect(entryRate(pool, 99999)).toBe(0);
  });

  it('rejects pools without drawable cards or with invalid weights', () => {
    expect(() => drawGacha({ ...pool, entries: [] }, 1)).toThrow('no drawable cards');
    expect(() =>
      drawGacha({ ...pool, entries: [{ cardId: 1, rarity: 1, odds: 0, featured: false }] }, 1)
    ).toThrow('invalid draw odds');
  });
});
