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

export async function loadJpGachaCatalog(
  names: CharacterNames,
  englishCards: readonly SupportCardData[] = []
): Promise<GachaDisplayCatalog> {
  const [characterRecords, supportRecords] = await Promise.all([
    fetchJsonResource<JpCharacterRecord[]>(
      `${environment.resourceUrl}/jp/current/character.json.gz`
    ),
    fetchJsonResource<JpSupportRecord[]>(
      `${environment.resourceUrl}/jp/current/support-cards-db.json.gz`
    )
  ]);
  const englishById = new Map(englishCards.map((card) => [Number(card.id), card]));

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
  const englishSupports = supportRecords.map((card) =>
    englishSupportRecord(card, englishById.get(Number(card.id)))
  );
  const supports = normalizeSupportCards(englishSupports);

  return {
    characters: new Map(characters),
    supports: new Map(supports.map((card) => [Number(card.id), card]))
  };
}

/**
 * A JP record read in English. The global card set carries the English names, including a Group
 * card's group (Symboli Rudolf's card is Heirs to the Throne); the JP record only has them in
 * Japanese, so it supplies whatever the global set does not have yet.
 */ export function englishSupportRecord(
  card: JpSupportRecord,
  english?: SupportCardData
): JpSupportRecord {
  const masterName = card.character_name || card.name;
  const ownName = card.card_name?.trim();
  const title = card.title_en?.trim().replace(/^\[|\]$/g, '');
  const englishTitle = english?.cardTitle?.replace(/^\[|\]$/g, '').trim();

  const characterName = english?.name?.trim() || card.name_en?.trim() || masterName;
  const cardName =
    english?.cardName?.trim() ||
    (ownName && ownName !== masterName && isTranslated(ownName) ? ownName : characterName);

  return {
    ...card,
    character_name: characterName,
    card_name: cardName,
    card_title: englishTitle
      ? `[${englishTitle}]`
      : title
        ? `[${title}]`
        : (card.card_title ?? card.cardTitle),
    card_full_name: englishTitle
      ? `[${englishTitle}] ${cardName}`
      : title
        ? `[${title}] ${cardName}`
        : (card.card_full_name ?? card.cardFullName)
  };
}

/** True for a name that is not Japanese: the JP master's own card names are in kana and kanji. */
function isTranslated(name: string): boolean {
  return !/[\u3040-\u30ff\u3400-\u9fff]/.test(name);
}
