import {
  normalizeSupportCards,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-card-details';
import { resourceCache } from '@/services/resources/resource-cache';
export type { SupportCardData } from '@/lib/game-data/support-cards/support-card-details';

export function supportCardImagePath(id: string | number): string {
  return `/assets/images/support_card/half/support_card_s_${id}.webp`;
}

/** Shared resource index for display and planner calculations. */
export async function loadSupportCards(refresh = false): Promise<SupportCardData[]> {
  return resourceCache.load('support-cards-db', refresh, normalizeSupportCards);
}

export async function readCachedSupportCards(): Promise<SupportCardData[] | undefined> {
  const cached = await resourceCache.readCached<unknown>('support-cards-db');
  if (cached === undefined) return undefined;
  try {
    return normalizeSupportCards(cached);
  } catch {
    return undefined;
  }
}

export async function loadSupportCardRarities(): Promise<Record<string, number>> {
  return Object.fromEntries((await loadSupportCards()).map((card) => [card.id, card.rarity]));
}
