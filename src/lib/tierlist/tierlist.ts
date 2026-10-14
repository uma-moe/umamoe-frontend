export interface TierCard {
  id: number;
  name: string;
  type: number;
  rarity: number;
  scores: number[];
  tiers?: string[];
  powerProgression?: { totalGrowthPercent?: number; recommendedMinLB?: number; powerSpike?: string };
}

export interface TierlistData { metadata?: { generatedAt?: string; version?: string }; cards: Record<string, TierCard>; }
export type TierName = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
export interface TierDefinition { name: TierName; min: number; max: number; color: string; label: string; }
export interface TierGroup extends TierDefinition { cards: TierCard[]; }

export const TIER_DEFINITIONS: TierDefinition[] = [
  { name: 'S+', min: 99, max: 100, color: '#ff1744', label: '99–100%' },
  { name: 'S', min: 95, max: 98.99, color: '#ff6b35', label: '95–98.99%' },
  { name: 'A', min: 80, max: 94.99, color: '#f7931e', label: '80–94.99%' },
  { name: 'B', min: 60, max: 79.99, color: '#ffcd3c', label: '60–79.99%' },
  { name: 'C', min: 30, max: 59.99, color: '#7cb342', label: '30–59.99%' },
  { name: 'D', min: 0, max: 29.99, color: '#26a69a', label: '0–29.99%' }
];

export function tierForPercentile(percentile: number): TierDefinition {
  return TIER_DEFINITIONS.find((tier) => percentile >= tier.min && percentile <= tier.max) ?? TIER_DEFINITIONS[TIER_DEFINITIONS.length - 1]!;
}

export function cardsForType(data: TierlistData | undefined, type: number, limitBreak: number): TierCard[] {
  return Object.values(data?.cards ?? {})
    .filter((card) => card.type === type && (card.scores[limitBreak] ?? 0) > 0)
    .sort((left, right) => (right.scores[limitBreak] ?? 0) - (left.scores[limitBreak] ?? 0));
}

export function groupTierCards(cards: TierCard[]): TierGroup[] {
  const groups = TIER_DEFINITIONS.map((tier) => ({ ...tier, cards: [] as TierCard[] }));
  cards.forEach((card, index) => {
    const percentile = cards.length ? (cards.length - index) / cards.length * 100 : 0;
    groups.find((group) => group.name === tierForPercentile(percentile).name)?.cards.push(card);
  });
  return groups.filter((group) => group.cards.length > 0);
}

export function cardProgression(card: TierCard): { powerSpike: string; growth: string } {
  const spikes = card.scores.flatMap((score, index) => {
    const previous = card.scores[index - 1] ?? 0;
    return previous > 0 && (score - previous) / previous > .15 ? [`LB${index}`] : [];
  });
  const initial = card.scores[0] ?? 0;
  const calculatedGrowth = initial > 0 ? ((card.scores[4] ?? 0) - initial) / initial * 100 : 0;
  return {
    powerSpike: card.powerProgression?.powerSpike || spikes.join(', ') || 'Gradual',
    growth: (card.powerProgression?.totalGrowthPercent ?? calculatedGrowth).toFixed(0)
  };
}

export function limitBreakLabel(level: number): string {
  return `${'◆'.repeat(Math.max(0, Math.min(4, level)))}${'◇'.repeat(Math.max(0, 4 - level))}  LB${level}`;
}

export function chartAxisBounds(scores: number[], step = 500): { minimum: number; maximum: number } {
  if (!scores.length) return { minimum: 0, maximum: step };
  const minimum = Math.floor(Math.min(...scores) / step) * step;
  return { minimum, maximum: Math.max(minimum + step, Math.ceil(Math.max(...scores) / step) * step) };
}
