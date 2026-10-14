import { normalizeSupportCards, type SupportCardCatalogEntry } from '@/lib/supports/support-card';
import { resourceRepository } from './resource-repository';
export type { SupportCardCatalogEntry } from '@/lib/supports/support-card';

export function supportCardImagePath(id: string | number): string { return `/assets/images/support_card/half/support_card_s_${id}.webp`; }

/** Shared resource index for display and planner calculations. */
export function loadSupportCardCatalog(): Promise<SupportCardCatalogEntry[]> {
  return loadLiveSupportCards();
}

export async function loadLiveSupportCards(refresh = false): Promise<SupportCardCatalogEntry[]> {
  return resourceRepository.load('support-cards-db', refresh, normalizeSupportCards);
}

export async function readCachedSupportCards(): Promise<SupportCardCatalogEntry[] | undefined> {
  const cached = await resourceRepository.readCached<unknown>('support-cards-db');
  if (cached === undefined) return undefined;
  try { return normalizeSupportCards(cached); } catch { return undefined; }
}

export async function loadSupportCardRarities(): Promise<Record<string,number>> {
  return Object.fromEntries((await loadSupportCardCatalog()).map((card) => [card.id,card.rarity]));
}
