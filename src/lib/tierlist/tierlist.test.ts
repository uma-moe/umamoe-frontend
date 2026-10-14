import { describe, expect, it } from 'vitest';
import { cardProgression, cardsForType, chartAxisBounds, groupTierCards, limitBreakLabel, tierForPercentile, type TierlistData } from './tierlist';

describe('Angular tierlist percentile compatibility', () => {
  it('keeps the original percentile boundaries', () => {
    expect(tierForPercentile(100).name).toBe('S+');
    expect(tierForPercentile(98.99).name).toBe('S');
    expect(tierForPercentile(80).name).toBe('A');
    expect(tierForPercentile(29.99).name).toBe('D');
  });
  it('sorts the selected type and LB before assigning percentile tiers', () => {
    const data = { cards: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index), { id: index, name: `Card ${index}`, type: 0, rarity: 3, scores: [index + 1] }])) } satisfies TierlistData;
    const cards = cardsForType(data, 0, 0); const groups = groupTierCards(cards);
    expect(cards[0]?.id).toBe(99);
    expect(groups.find((group) => group.name === 'S+')?.cards).toHaveLength(2);
    expect(groups.find((group) => group.name === 'D')?.cards).toHaveLength(29);
  });
  it('retains progression fallbacks without treating unavailable LB scores as growth', () => {
    const card = { id: 1, name: 'Card', type: 0, rarity: 3, scores: [100, 110, 150, 0, 200] };
    expect(cardProgression(card)).toEqual({ powerSpike: 'LB2', growth: '100' });
    expect(cardProgression({ ...card, scores: [0, 0, 0, 0, 200] })).toEqual({ powerSpike: 'Gradual', growth: '0' });
    expect(cardProgression({ ...card, powerProgression: { powerSpike: 'Late bloomer', totalGrowthPercent: 0 } })).toEqual({ powerSpike: 'Late bloomer', growth: '0' });
  });
  it('retains the four-diamond Angular limit-break display', () => expect(limitBreakLabel(3)).toBe('◆◆◆◇  LB3'));
  it('uses rounded chart ticks like the Angular chart', () => expect(chartAxisBounds([1968, 3647])).toEqual({ minimum: 1500, maximum: 4000 }));
});
