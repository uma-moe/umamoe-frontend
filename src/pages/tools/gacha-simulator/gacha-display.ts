import {
  statIconByName,
  supportCardFull,
  supportCardHalf,
  umaPortrait,
  umaStand
} from '@/lib/game-assets/art-links';
import type { CharacterData } from '@/lib/game-data/characters';
import {
  supportCardDisplay,
  supportTypeName,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-card-details';
import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';

export interface GachaDisplayCatalog {
  characters: ReadonlyMap<number, CharacterData>;
  supports: ReadonlyMap<number, SupportCardData>;
}

export interface GachaItemDisplay {
  /** The full label, which the art's alt text and the announcements use. */
  name: string;
  /** Full-size art for the result card, which falls back to `thumbImage` when an outfit has none. */
  image: string;
  /** The 128 px art the small rows use, and the fallback for `image`. */
  thumbImage: string;
  typeLabel: string;
  /** The bracketed variation over the name: a support card's title, or an outfit's. */
  subName?: string;
  /** What the card is filed under: the character, or the group for a Group card. */
  ownerName?: string;
  /** The game's icon for a support card's type. */
  typeIcon?: string;
}

export function gachaItemDisplay(
  cardId: number,
  kind: GachaKind,
  catalog: GachaDisplayCatalog
): GachaItemDisplay {
  if (kind === 'support') {
    const card = catalog.supports.get(cardId);
    if (!card)
      return {
        name: `Support card ${cardId}`,
        image: supportCardFull(cardId),
        thumbImage: supportCardHalf(cardId),
        typeLabel: 'Support'
      };

    const display = supportCardDisplay(card);
    return {
      name: `${display.character} ${display.title}`,
      image: supportCardFull(cardId),
      thumbImage: supportCardHalf(cardId),
      typeLabel: supportTypeLabel(card.type),
      subName: bracketedTitle(display.title),
      ownerName: display.character,
      typeIcon: statIconByName(card.type)
    };
  }

  const character = catalog.characters.get(cardId);
  const variant = character?.subtitle?.trim();
  const subName = variant && !/^original$/i.test(variant) ? variant : undefined;
  const name = character
    ? `${character.name}${subName ? ` [${subName}]` : ''}`
    : `Character ${cardId}`;

  return {
    name,
    image: umaStand(cardId),
    thumbImage: umaPortrait(cardId),
    typeLabel: 'Trainee',
    subName,
    ownerName: character?.name
  };
}

/** A Group card is filed under its group, which the shared type name folds into Friend. */
function supportTypeLabel(type: string): string {
  return type.toLowerCase() === 'group' ? 'Group' : supportTypeName(type);
}

/** The text of a bracketed title; undefined when the display fell back to a plain name. */
function bracketedTitle(title: string): string | undefined {
  return title.match(/^\[([^\]]+)\]$/)?.[1]?.trim();
}
