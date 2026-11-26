export type GachaKind = 'character' | 'support';
export type GachaRarity = 1 | 2 | 3;
export type GachaDrawCount = 1 | 10;
export type GachaPoolSource = 'live' | 'preliminary' | 'estimated';

export interface GachaPoolEntry {
  cardId: number;
  rarity: GachaRarity;
  odds: number;
  featured: boolean;
}

export interface GachaPool {
  id: number;
  kind: GachaKind;
  cost: number;
  guaranteedRarity: 2;
  source: GachaPoolSource;
  entries: readonly GachaPoolEntry[];
}

export interface GachaDrawResult extends GachaPoolEntry {
  guaranteed: boolean;
}

export interface GachaDrawOptions {
  /** A carat ten-draw lands its last draw on the guaranteed rarity, keeping the top-rarity rate. */
  guaranteed?: boolean;
  random?: () => number;
}

interface WeightedEntry {
  entry: GachaPoolEntry;
  upperBound: number;
}

/** Draws with the master database's per-card weights. A guaranteed tenth draw keeps the normal
 * top-rarity rate and moves the R rate to SR, matching the in-game 3% / 97% table. */
export function drawGacha(
  pool: GachaPool,
  count: GachaDrawCount,
  { guaranteed = false, random = Math.random }: GachaDrawOptions = {}
): GachaDrawResult[] {
  const weighted = weightEntries(pool.entries);
  if (!weighted.length) throw new Error('This banner has no drawable cards.');

  const totalOdds = weighted.reduce((total, entry) => Math.max(total, entry.upperBound), 0);
  const results: GachaDrawResult[] = [];

  for (let index = 0; index < count; index++) {
    const isGuaranteed = guaranteed && count === 10 && index === count - 1;
    if (!isGuaranteed) {
      results.push({ ...pickWeighted(weighted, totalOdds, random), guaranteed: false });
      continue;
    }

    const topRarityWeight = pool.entries
      .filter((entry) => entry.rarity === 3)
      .reduce((sum, entry) => sum + entry.odds, 0);
    const rarity: GachaRarity = random() < topRarityWeight / totalOdds ? 3 : 2;
    const rarityEntries = weightEntries(pool.entries.filter((entry) => entry.rarity === rarity));
    if (!rarityEntries.length) throw new Error(`This banner has no rarity-${rarity} cards.`);

    const rarityTotal = rarityEntries.reduce(
      (total, entry) => Math.max(total, entry.upperBound),
      0
    );
    results.push({ ...pickWeighted(rarityEntries, rarityTotal, random), guaranteed: true });
  }

  return results;
}

export function rarityRate(pool: GachaPool, rarity: GachaRarity): number {
  const total = pool.entries.reduce((sum, entry) => sum + entry.odds, 0);
  if (total <= 0) return 0;

  return (
    pool.entries
      .filter((entry) => entry.rarity === rarity)
      .reduce((sum, entry) => sum + entry.odds, 0) / total
  );
}

/** A single card's chance per draw, from the pool's own weights. */
export function entryRate(pool: GachaPool, cardId: number): number {
  const total = pool.entries.reduce((sum, entry) => sum + entry.odds, 0);
  const entry = pool.entries.find((item) => item.cardId === cardId);
  return entry && total > 0 ? entry.odds / total : 0;
}

function weightEntries(entries: readonly GachaPoolEntry[]): WeightedEntry[] {
  let total = 0;
  const weighted: WeightedEntry[] = [];

  for (const entry of entries) {
    if (!Number.isFinite(entry.odds) || entry.odds <= 0)
      throw new Error(`Card ${entry.cardId} has invalid draw odds.`);

    total += entry.odds;
    weighted.push({ entry, upperBound: total });
  }

  return weighted;
}

function pickWeighted(
  entries: readonly WeightedEntry[],
  totalOdds: number,
  random: () => number
): GachaPoolEntry {
  const roll = random() * totalOdds;
  const selected = entries.find((entry) => roll < entry.upperBound) ?? entries[entries.length - 1];
  if (!selected) throw new Error('This banner has no drawable cards.');

  return selected.entry;
}
