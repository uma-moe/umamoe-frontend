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
  const englishSupports = supportRecords.map((card) => {
    const name = card.name_en?.trim() || card.character_name || card.name;
    const title = card.title_en?.trim().replace(/^\[|\]$/g, '');

    return {
      ...card,
      character_name: name,
      card_name: name,
      card_title: title ? `[${title}]` : card.cardTitle,
      card_full_name: title ? `[${title}] ${name}` : card.cardFullName
    };
  });
  const supports = normalizeSupportCards(englishSupports);

  return {
    characters: new Map(characters),
    supports: new Map(supports.map((card) => [Number(card.id), card]))
  };
}
