import {
  statIconByName,
  supportCardHalf,
  supportRarityIcon,
  umaPortrait,
  type SupportRarity
} from '@/lib/game-assets/art-links';
import { type CharacterNames } from '@/lib/game-data/characters';
import { supportTypeName } from '@/lib/game-data/support-cards/support-card-details';
import { type SupportCardData } from '@/lib/game-data/support-cards/support-cards';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import type { TimelinePickup } from '@/components/cards/timeline-types';

export interface TimelinePickupCatalog {
  characters: CharacterNames;
  supports: ReadonlyMap<number, SupportCardData>;
}

function publicName(value: string | undefined, fallback: string): string {
  const name = value?.trim();
  return name &&
    !/^unknown[_\s-]*\d+$/i.test(name) &&
    !/^(?:support card|umamusume|character)\s+\d+$/i.test(name)
    ? name
    : fallback;
}

function gametoraUrl(id: number, kind: 'character' | 'support', name: string): string | undefined {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f.'’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return Number.isSafeInteger(id) && id > 0 && slug
    ? `https://gametora.com/umamusume/${kind === 'character' ? 'characters' : 'supports'}/${id}-${slug}`
    : undefined;
}

export function pickupRarityRank(
  id: number,
  kind: 'character' | 'support',
  catalog: TimelinePickupCatalog
): number {
  if (kind === 'support') {
    const known = catalog.supports.get(id)?.rarity;
    if (typeof known === 'number' && known > 0) return known;
    if (id >= 30000) return 3;
    if (id >= 20000) return 2;
    return 1;
  }

  return 3;
}

export function timelinePickup(
  id: number,
  catalog: TimelinePickupCatalog,
  label?: string,
  kind: 'character' | 'support' = id >= 100000 ? 'character' : 'support'
): TimelinePickup {
  if (kind === 'support') {
    const card = catalog.supports.get(id);
    const rarity = pickupRarityRank(id, kind, catalog);
    const rarityLabel: SupportRarity = rarity === 3 ? 'SSR' : rarity === 2 ? 'SR' : 'R';
    const supportType = card?.type
      ? card.type.toLowerCase() === 'group'
        ? 'Group'
        : supportTypeName(card.type)
      : undefined;
    const groupCardName = card?.type === 'group' ? publicName(card.cardName, '') : '';
    const name =
      groupCardName && (!label || label.trim().toLowerCase() === card?.name.trim().toLowerCase())
        ? groupCardName
        : publicName(label, groupCardName || (card?.name ?? `Support ${id}`));
    return {
      id: String(id),
      kind,
      rarity,
      rarityLabel,
      rarityIcon: supportRarityIcon(rarityLabel),
      supportType,
      typeIcon: supportType ? statIconByName(supportType) : undefined,
      gametoraUrl: gametoraUrl(id, kind, groupCardName || card?.name || publicName(label, '')),
      image: supportCardHalf(id),
      name,
      subLabel: [rarityLabel, supportType ? `${supportType} Support` : 'Support card']
        .filter(Boolean)
        .join(' '),
      searchTerms: [
        'support',
        rarityLabel,
        ...(supportType ? [supportType] : []),
        ...(card?.name && card.name.toLowerCase() !== name.toLowerCase() ? [card.name] : []),
        ...(card?.type && card.type.toLowerCase() !== supportType?.toLowerCase() ? [card.type] : [])
      ]
    };
  }

  const character = catalog.characters[Math.floor(id / 100)];
  const name = publicName(label, character?.name ?? `Character ${id}`);
  const match = /^(.*?)\s*(?:\(([^()]+)\)|\[([^\[\]]+)\])\s*$/.exec(name);
  const base = character?.name ?? match?.[1]?.trim() ?? name;
  const skin = character?.skins?.[String(id).slice(-2)];
  const variant =
    match?.[2] ?? match?.[3] ?? (skin && !/^original$/i.test(skin) ? skin : undefined);

  return {
    id: String(id),
    kind,
    rarity: 3,
    gametoraUrl: gametoraUrl(id, kind, base),
    name: variant ? `${base} [${variant}]` : base,
    subLabel: variant ? `${variant} variant` : 'Character',
    image: umaPortrait(id),
    searchTerms: [base, ...(variant ? [variant, `${base} ${variant}`] : [])]
  };
}

export function timelinePickups(
  event: TimelineRecord,
  catalog: TimelinePickupCatalog
): TimelinePickup[] {
  const ids = [...event.pickupCardIds];
  if (event.eventType === 'legend_race') {
    for (const value of event.relatedCharacters) {
      const id = Number(/chara_stand_(\d+)\.webp(?:$|[?#])/i.exec(value)?.[1]);
      if (id >= 100000 && !ids.includes(id)) ids.push(id);
    }
  }

  const uniqueIds = [...new Set(ids)].filter((id) => Number.isFinite(id) && id > 0);
  return uniqueIds
    .map((id, order) => {
      const kind = id >= 100000 ? 'character' : 'support';
      const index = ids
        .filter((candidate) => (kind === 'character' ? candidate >= 100000 : candidate < 100000))
        .indexOf(id);

      const name = (kind === 'character' ? event.relatedCharacters : event.relatedSupportCards)[
        index
      ];

      const pickup = timelinePickup(id, catalog, name?.includes('chara_stand_') ? undefined : name);
      return {
        pickup:
          event.eventType === 'legend_race' && kind === 'character'
            ? { ...pickup, subLabel: 'Legend Race participant' }
            : pickup,
        rarity: pickup.rarity ?? pickupRarityRank(id, kind, catalog),
        order
      };
    })
    .sort((left, right) => right.rarity - left.rarity || left.order - right.order)
    .map((entry) => entry.pickup);
}

export function timelineDisplayTitle(event: TimelineRecord): string {
  const kind =
    event.eventType === 'character_banner'
      ? 'character'
      : event.eventType === 'support_card_banner'
        ? 'support'
        : undefined;

  const pickups = kind
    ? event.pickups?.filter((item) => item.kind === kind)
    : event.eventType === 'paid_banner'
      ? event.pickups
      : [];

  if (!pickups?.length) return event.title;

  if (event.eventType === 'support_card_banner') {
    const ssrs = pickups.filter((item) => (item.rarity ?? 0) >= 3);
    if (ssrs.length === 2) {
      const total = Math.max(
        pickups.length,
        (Number(/\+\s*(\d+)\s+more/i.exec(event.title)?.[1]) || 0) + 1
      );
      const remaining = Math.max(0, total - 2);
      const pair = `${ssrs[0]!.name} & ${ssrs[1]!.name}`;
      return remaining ? `${pair} + ${remaining} more` : pair;
    }
  }

  const extra = Math.max(
    pickups.length - 1,
    Number(/\+\s*(\d+)\s+more/i.exec(event.title)?.[1]) || 0
  );

  return pickups[0]!.name + (extra ? ` + ${extra} more` : '');
}
