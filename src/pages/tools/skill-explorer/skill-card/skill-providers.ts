import { characterImagePath, type CharacterNames } from '@/lib/game-data/characters';
import {
  supportCardImagePath,
  type SupportCardData
} from '@/lib/game-data/support-cards/support-cards';
import {
  supportCardDisplay,
  supportTypeName
} from '@/lib/game-data/support-cards/support-card-details';
import { fetchJsonResource } from '@/services/resources/json-response';
import { finiteNumber, isRecord, numberList } from '../json-guards';

export interface SkillProvider {
  id: number;
  name: string;
  detail: string;
  image: string;
  href: string;
}

export interface SkillProviders {
  umas: SkillProvider[];
  supports: SkillProvider[];
}

export interface ProviderCard {
  cardId: number;
  skills: number[];
  href: string;
}

export interface ProviderCatalog {
  umas: ProviderCard[];
  supports: ProviderCard[];
}

export function parseProviderCatalog(value: unknown): ProviderCatalog {
  if (!isRecord(value)) throw new Error('Skill source data is invalid.');

  function cards(value: unknown, kind: 'characters' | 'supports'): ProviderCard[] {
    if (!Array.isArray(value)) throw new Error('Skill source cards are invalid.');

    return value.map((card: unknown) => {
      if (!isRecord(card)) throw new Error('Skill source card is invalid.');
      const cardId = finiteNumber(card.card, 'source card');
      if (
        !Number.isSafeInteger(cardId) ||
        cardId <= 0 ||
        typeof card.path !== 'string' ||
        !card.path.startsWith(`${cardId}-`) ||
        !/^[a-z0-9-]+$/.test(card.path)
      )
        throw new Error('Skill source card page is invalid.');

      const skills = numberList(card.skills, 'source skills');
      if (!skills.every((skillId) => Number.isSafeInteger(skillId) && skillId > 0))
        throw new Error('Skill source IDs are invalid.');

      return { cardId, skills, href: `https://gametora.com/umamusume/${kind}/${card.path}` };
    });
  }

  return { umas: cards(value.umas, 'characters'), supports: cards(value.supports, 'supports') };
}

export async function loadProviderCatalog(): Promise<ProviderCatalog> {
  return parseProviderCatalog(
    await fetchJsonResource<unknown>('/skill-explorer/providers.json.gz', {}, 'Skill sources')
  );
}

export function skillProviders({
  catalog,
  names,
  released,
  supports
}: {
  catalog: ProviderCatalog;
  names: CharacterNames;
  released: ReadonlySet<number>;
  supports: readonly SupportCardData[];
}): Map<number, SkillProviders> {
  const bySkill = new Map<number, SkillProviders>();

  function add(skillId: number, kind: keyof SkillProviders, provider: SkillProvider) {
    const sources = bySkill.get(skillId) ?? { umas: [], supports: [] };
    if (!sources[kind].some((source) => source.id === provider.id)) sources[kind].push(provider);
    bySkill.set(skillId, sources);
  }

  for (const card of catalog.umas) {
    if (!released.has(card.cardId)) continue;
    const character = names[String(Math.floor(card.cardId / 100))];
    if (character === undefined) continue;

    const provider = {
      id: card.cardId,
      name: character.name,
      detail: character.skins?.[String(card.cardId).slice(-2)] ?? 'Original outfit',
      image: characterImagePath(card.cardId),
      href: card.href
    };
    for (const skillId of card.skills) add(skillId, 'umas', provider);
  }

  const releasedSupports = new Map(
    supports.filter((card) => card.isReleased_en === true).map((card) => [Number(card.id), card])
  );
  for (const source of catalog.supports) {
    const card = releasedSupports.get(source.cardId);
    if (card === undefined) continue;

    const display = supportCardDisplay(card);
    const rarity = ['R', 'SR', 'SSR'][card.rarity - 1] ?? '';
    const provider = {
      id: source.cardId,
      name: display.character,
      detail: `${rarity} · ${supportTypeName(card.type)} · ${display.title}`,
      image: supportCardImagePath(card.id),
      href: source.href
    };
    for (const skillId of source.skills) add(skillId, 'supports', provider);
  }

  // Card IDs group SSR, SR and R in descending order, then put newer cards first.
  for (const sources of bySkill.values())
    sources.supports.sort((left, right) => right.id - left.id);

  return bySkill;
}
