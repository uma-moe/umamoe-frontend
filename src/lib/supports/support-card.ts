export interface SupportCardCatalogEntry {
  id: string;
  name: string;
  rarity: number;
  type: string;
  release_date: string;
  isReleased_en?: boolean;
  cardName?: string;
  cardTitle?: string;
  cardFullName?: string;
}

export function normalizeSupportCards(value: unknown): SupportCardCatalogEntry[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid support-card resource.');
  const data = 'default' in value ? value.default : value;
  if (!data || typeof data !== 'object') throw new Error('Invalid support-card resource.');
  return (Array.isArray(data) ? data : Object.values(data)).map(raw => {
    if (!raw || typeof raw !== 'object' || !/^\d+$/.test(String(raw.id))) throw new Error('Invalid support-card record.');
    const text = (...keys: string[]) => keys.map(key => raw[key]).find(value => typeof value === 'string' && value.trim())?.trim();
    return {
      id: String(raw.id), name: text('character_name','characterName','name') ?? `Card ${raw.id}`,
      rarity: Number(raw.rarity), type: text('type')?.toLowerCase() ?? 'speed', release_date: text('release_date') ?? '',
      isReleased_en: raw.isReleased_en === true,
      cardName: text('card_name','cardName','support_card_name','supportCardName','title'),
      cardTitle: text('card_title','cardTitle','support_card_title','supportCardTitle'),
      cardFullName: text('card_full_name','cardFullName','support_card_full_name','supportCardFullName'),
    };
  });
}

export function normalizeSupportSearch(value: string): string {
  return value.toLowerCase().replace(/[\[\](),.!?'"`:_/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesSupportSearch(text: string, query: string): boolean {
  const needle = normalizeSupportSearch(query), haystack = normalizeSupportSearch(text);
  return !needle || haystack.includes(needle) || needle.split(' ').every(token => haystack.includes(token));
}

export function supportTypeName(type: string): 'Speed' | 'Stamina' | 'Power' | 'Guts' | 'Wit' | 'Friend' {
  switch (type.toLowerCase()) {
    case 'stamina': return 'Stamina';
    case 'power': return 'Power';
    case 'guts': return 'Guts';
    case 'wisdom': case 'intelligence': return 'Wit';
    case 'friend': case 'group': return 'Friend';
    default: return 'Speed';
  }
}

export function supportCardDisplay(card: SupportCardCatalogEntry): { title: string; character: string; searchText: string } {
  const bracketTitle = (value?: string) => value?.match(/^\[([^\]]+)\]/)?.[1]?.trim();
  const title = card.cardTitle?.replace(/^\[|\]$/g, '').trim() || bracketTitle(card.cardFullName) || bracketTitle(card.cardName);
  const character = [card.cardName, card.cardFullName, card.name].map(value => value?.replace(/^\[[^\]]+\]\s*/, '').trim()).find(Boolean) || card.name;
  return { title: title ? `[${title}]` : card.name, character, searchText: normalizeSupportSearch([card.id, card.name, card.cardName, card.cardTitle, card.cardFullName].filter(Boolean).join(' ')) };
}

export function releasedSupportCards(cards: readonly SupportCardCatalogEntry[]): SupportCardCatalogEntry[] {
  const date = (card: SupportCardCatalogEntry) => Date.parse(card.release_date) || 0;
  return cards.filter(card => card.isReleased_en === true).sort((a, b) => date(b) - date(a) || Number(b.id) - Number(a.id) || a.name.localeCompare(b.name));
}
