import { environment } from '@/config/environment';
import type { CharacterData, CharacterNames } from '@/lib/game-data/characters';
import {
  normalizeSupportCards,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-card-details';
import { fetchJsonResource } from '@/services/resources/json-response';
import type { GachaDisplayCatalog } from './gacha-display';

interface JpCharacterRecord extends CharacterData {
  name_en?: string;
  title_en?: string;
}

interface JpSupportRecord extends SupportCardData {
  character_name?: string;
  card_name?: string;
  card_title?: string;
  card_full_name?: string;
  name_en?: string;
  title_en?: string;
}

export async function loadJpGachaCatalog(names: CharacterNames): Promise<GachaDisplayCatalog> {
  const [characterRecords, supportRecords] = await Promise.all([
    fetchJsonResource<JpCharacterRecord[]>(
      `${environment.resourceUrl}/jp/current/character.json.gz`
    ),
    fetchJsonResource<JpSupportRecord[]>(
      `${environment.resourceUrl}/jp/current/support-cards-db.json.gz`
    )
  ]);

  const characters = characterRecords.flatMap((entry): [number, CharacterData][] => {
    const id = Number(entry.id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    const translated = names[String(Math.floor(id / 100))];
    const variant = String(id).slice(-2);

    return [
      [
        id,
        {
          ...entry,
          id: String(id),
          name: entry.name_en?.trim() || translated?.name || entry.name,
          subtitle: entry.title_en?.trim() || translated?.skins?.[variant] || entry.subtitle
        }
      ]
    ];
  });
  const englishSupports = supportRecords.map(englishSupportRecord);
  const supports = normalizeSupportCards(englishSupports);

  return {
    characters: new Map(characters),
    supports: new Map(supports.map((card) => [Number(card.id), card]))
  };
}

/**
 * A JP record read in English. A card keeps its own name only when that name is its own: a Group
 * card is filed under the group (Darley Arabian's card is Progenitors and Guides), and a few cards
 * spell their character differently. When the name is just the character again, the English name
 * book wins, since the master's text is Japanese.
 */
export function englishSupportRecord(card: JpSupportRecord): JpSupportRecord {
  const masterName = card.character_name || card.name;
  const ownName = card.card_name?.trim();
  const characterName = card.name_en?.trim() || masterName;
  const cardName = ownName && ownName !== masterName ? ownName : characterName;
  const title = card.title_en?.trim().replace(/^\[|\]$/g, '');

  return {
    ...card,
    character_name: characterName,
    card_name: cardName,
    card_title: title ? `[${title}]` : (card.card_title ?? card.cardTitle),
    card_full_name: title ? `[${title}] ${cardName}` : (card.card_full_name ?? card.cardFullName)
  };
}
