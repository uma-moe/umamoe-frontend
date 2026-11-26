import type { SqlValue } from 'sql.js';
import type {
  GachaKind,
  GachaPool,
  GachaPoolSource,
  GachaRarity
} from '@/lib/gacha-simulator/gacha-draw';

interface PoolAccumulator extends Omit<GachaPool, 'entries'> {
  entries: GachaPool['entries'][number][];
}

/** Validates the fixed pool query rows before they reach the draw engine. */
export function parseGachaPools(
  rows: readonly (readonly SqlValue[])[],
  source: GachaPoolSource = 'live'
): Map<number, GachaPool> {
  const pools = new Map<number, PoolAccumulator>();

  for (const row of rows) {
    if (row.length !== 8) throw new Error('The game database returned an invalid gacha pool row.');

    const gachaId = integer(row[0]);
    const cardType = integer(row[1]);
    const cost = integer(row[2]);
    const guaranteedRarity = integer(row[3]);
    const cardId = integer(row[4]);
    const rarity = integer(row[5]);
    const odds = integer(row[6]);
    const pickup = integer(row[7]);
    if (gachaId <= 0 || cardId <= 0 || cost <= 0 || odds <= 0 || (pickup !== 0 && pickup !== 1))
      throw new Error(`Gacha ${gachaId} has invalid pool values.`);

    const kind = gachaKind(cardType);
    const entry = {
      cardId,
      rarity: gachaRarity(rarity),
      odds,
      featured: pickup === 1
    };

    if (guaranteedRarity !== 2) throw new Error(`Gacha ${gachaId} has an unsupported guarantee.`);

    const existing = pools.get(gachaId);
    if (existing) {
      if (existing.kind !== kind || existing.cost !== cost)
        throw new Error(`Gacha ${gachaId} has inconsistent pool data.`);
      existing.entries.push(entry);
      continue;
    }

    pools.set(gachaId, { id: gachaId, kind, cost, guaranteedRarity, source, entries: [entry] });
  }

  return new Map([...pools].map(([id, pool]) => [id, { ...pool, entries: [...pool.entries] }]));
}

function integer(value: SqlValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('The game database returned invalid gacha pool data.');

  return value;
}

function gachaKind(cardType: number): GachaKind {
  if (cardType === 1) return 'character';
  if (cardType === 2) return 'support';
  throw new Error(`Unsupported gacha card type ${cardType}.`);
}

function gachaRarity(rarity: number): GachaRarity {
  if (rarity === 1 || rarity === 2 || rarity === 3) return rarity;
  throw new Error(`Unsupported gacha rarity ${rarity}.`);
}
