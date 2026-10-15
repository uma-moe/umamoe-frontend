import { characterImagePath, type CharacterNames } from '@/lib/catalog/character-catalog';
import { supportCardImagePath, type SupportCardCatalogEntry } from '@/lib/catalog/support-card-catalog';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import type { TimelinePickup } from '@/components/cards/timeline-types';

export interface TimelinePickupCatalog {
  characters: CharacterNames;
  supports: ReadonlyMap<number, SupportCardCatalogEntry>;
}

function publicName(value: string | undefined, fallback: string): string {
  const name = value?.trim();
  return name && !/^unknown[_\s-]*\d+$/i.test(name) && !/^(?:support card|umamusume|character)\s+\d+$/i.test(name) ? name : fallback;
}

function gametoraUrl(id: number, kind: 'character' | 'support', name: string): string | undefined {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f.'’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return Number.isSafeInteger(id) && id > 0 && slug ? `https://gametora.com/umamusume/${kind === 'character' ? 'characters' : 'supports'}/${id}-${slug}` : undefined;
}

export function timelinePickup(id: number, catalog: TimelinePickupCatalog, label?: string, kind: 'character' | 'support' = id >= 100000 ? 'character' : 'support'): TimelinePickup {
  if (kind === 'support') {
    const card = catalog.supports.get(id);
    const type = card?.type ? card.type[0]!.toUpperCase() + card.type.slice(1).toLowerCase() : '';
    return { id: String(id), kind, gametoraUrl: gametoraUrl(id, kind, card?.name ?? publicName(label, "")), image: supportCardImagePath(id), name: publicName(label, card?.name ?? `Support ${id}`), subLabel: [[null, 'R', 'SR', 'SSR'][card?.rarity ?? 0], type ? `${type} Support` : 'Support card'].filter(Boolean).join(' · '), searchTerms: ['support', ...(type ? [type] : [])] };
  }
  const character = catalog.characters[Math.floor(id / 100)];
  const name = publicName(label, character?.name ?? `Character ${id}`);
  const match = /^(.*?)\s*(?:\(([^()]+)\)|\[([^\[\]]+)\])\s*$/.exec(name);
  const base = character?.name ?? match?.[1]?.trim() ?? name;
  const skin = character?.skins?.[String(id).slice(-2)];
  const variant = match?.[2] ?? match?.[3] ?? (skin && !/^original$/i.test(skin) ? skin : undefined);
  return { id: String(id), kind, gametoraUrl: gametoraUrl(id, kind, base), name: variant ? `${base} [${variant}]` : base, subLabel: variant ? `${variant} variant` : 'Character', image: characterImagePath(id), searchTerms: [base, ...(variant ? [variant, `${base} ${variant}`] : [])] };
}

export function timelinePickups(event: TimelineRecord, catalog: TimelinePickupCatalog): TimelinePickup[] {
  const ids = [...event.pickupCardIds];
  if (event.eventType === 'legend_race') {
    for (const value of event.relatedCharacters) {
      const id = Number(/chara_stand_(\d+)\.webp(?:$|[?#])/i.exec(value)?.[1]);
      if (id >= 100000 && !ids.includes(id)) ids.push(id);
    }
  }
  return [...new Set(ids)].filter(id => Number.isFinite(id) && id > 0).map(id => {
    const kind = id >= 100000 ? 'character' : 'support';
    const index = ids.filter(id => kind === 'character' ? id >= 100000 : id < 100000).indexOf(id);
    const name = (kind === 'character' ? event.relatedCharacters : event.relatedSupportCards)[index];
    const pickup = timelinePickup(id, catalog, name?.includes('chara_stand_') ? undefined : name);
    return event.eventType === 'legend_race' && kind === 'character' ? { ...pickup, subLabel: 'Legend Race participant' } : pickup;
  });
}

export function timelineDisplayTitle(event: TimelineRecord): string {
  const kind = event.eventType === 'character_banner' ? 'character' : event.eventType === 'support_card_banner' ? 'support' : undefined;
  const pickups = kind ? event.pickups?.filter(item => item.kind === kind) : event.eventType === 'paid_banner' ? event.pickups : [];
  if (!pickups?.length) return event.title;
  const extra = Math.max(pickups.length - 1, Number(/\+\s*(\d+)\s+more/i.exec(event.title)?.[1]) || 0);
  return pickups[0]!.name + (extra ? ` + ${extra} more` : '');
}
