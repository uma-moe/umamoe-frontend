import type { CharacterNames } from '@/lib/game-data/characters';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { fetchJsonResource } from '@/services/resources/json-response';
import { finiteNumber, isRecord, numberList } from '../json-guards';

/** What a trainee card gives: its unique as inherited, and its starting and potential-level skills. */
export interface UmaSkills {
  cardId: number;
  unique?: number;
  skills: number[];
}

/** Out on Global, coming with a (possibly estimated) first banner, or only on JP with no Global date yet. */
export type UmaRelease =
  { kind: 'released' } | { kind: 'upcoming'; date: Date; estimated: boolean } | { kind: 'jp' };

/** A card the picker offers. */
export interface ExplorerUma extends UmaSkills {
  name: string;
  outfit?: string;
  release: UmaRelease;
}

/** What of an uma's skills the explorer has no value for yet: skills newer than its model. */
export interface UnvaluedSkills {
  unique: boolean;
  skills: number;
}

/** A character banner as the timeline lists it. */
export interface CharacterBanner {
  eventType: string;
  date: Date;
  predicted?: boolean;
  pickupCardIds: number[];
}

export interface FirstBanner {
  date: Date;
  estimated: boolean;
}

function parseCard(value: unknown): UmaSkills {
  if (!isRecord(value)) throw new Error('Skill Explorer uma data has an invalid card.');

  const cardId = finiteNumber(value.card, 'uma card');
  const skills = numberList(value.skills, 'uma skills');
  if (value.unique === undefined) return { cardId, skills };
  return { cardId, unique: finiteNumber(value.unique, 'uma unique'), skills };
}

export function parseUmaSkills(value: unknown): UmaSkills[] {
  if (!isRecord(value) || !Array.isArray(value.cards))
    throw new Error('Skill Explorer uma data is invalid.');
  return value.cards.map(parseCard);
}

let umaSkillsPromise: Promise<UmaSkills[]> | undefined;

export function loadUmaSkills(): Promise<UmaSkills[]> {
  umaSkillsPromise ??= fetchJsonResource<unknown>('/skill-explorer/umas.json.gz')
    .then(parseUmaSkills)
    .catch((error: unknown) => {
      umaSkillsPromise = undefined;
      throw error;
    });

  return umaSkillsPromise;
}

/** Each card's first character banner on Global, past or still to come. */
export function firstBanners(events: readonly CharacterBanner[]): Map<number, FirstBanner> {
  const first = new Map<number, FirstBanner>();
  for (const event of events) {
    if (event.eventType !== 'character_banner') continue;

    for (const cardId of event.pickupCardIds) {
      const current = first.get(cardId);
      if (current === undefined || event.date < current.date)
        first.set(cardId, { date: event.date, estimated: event.predicted === true });
    }
  }

  return first;
}

/** The character list knows what is out; a banner that has already run counts too, should the list lag behind. */
export function umaRelease(
  cardId: number,
  {
    released,
    banners,
    now
  }: { released: ReadonlySet<number>; banners: ReadonlyMap<number, FirstBanner>; now: number }
): UmaRelease {
  if (released.has(cardId)) return { kind: 'released' };

  const banner = banners.get(cardId);
  if (banner === undefined) return { kind: 'jp' };
  if (banner.date.getTime() <= now) return { kind: 'released' };
  return { kind: 'upcoming', date: banner.date, estimated: banner.estimated };
}

const RELEASE_ORDER: Record<UmaRelease['kind'], number> = { released: 0, upcoming: 1, jp: 2 };

/** Released first, then upcoming by banner date, then JP only; each in card order, so outfits stay together. */
function comparePicking(left: ExplorerUma, right: ExplorerUma): number {
  const byRelease = RELEASE_ORDER[left.release.kind] - RELEASE_ORDER[right.release.kind];
  if (byRelease !== 0) return byRelease;

  if (left.release.kind === 'upcoming' && right.release.kind === 'upcoming') {
    const byDate = left.release.date.getTime() - right.release.date.getTime();
    if (byDate !== 0) return byDate;
  }

  return left.cardId - right.cardId;
}

/** Every card with a known name, released or not, each with its release, in picking order. */
export function explorerUmas({
  cards,
  names,
  released,
  banners,
  now
}: {
  cards: readonly UmaSkills[];
  names: CharacterNames;
  released: ReadonlySet<number>;
  banners: ReadonlyMap<number, FirstBanner>;
  now: number;
}): ExplorerUma[] {
  const umas = cards.flatMap((card) => {
    const character = names[String(Math.floor(card.cardId / 100))];
    if (character === undefined || character.name === '') return [];

    return [
      {
        ...card,
        name: character.name,
        outfit: character.skins?.[String(card.cardId).slice(-2)],
        release: umaRelease(card.cardId, { released, banners, now })
      }
    ];
  });

  return umas.sort(comparePicking);
}

/** Her unique and every skill she starts with or unlocks. */
export function skillsGivenBy(uma: UmaSkills): Set<number> {
  const skillIds = new Set(uma.skills);
  if (uma.unique !== undefined) skillIds.add(uma.unique);
  return skillIds;
}

/**
 * Uniques of umas still to come that the Global skill list cannot name yet, named after their uma so their values
 * still show. Their Japanese text is not translated, so they have no description or requirements.
 */
export function upcomingUniques(
  umas: readonly ExplorerUma[],
  skills: ReadonlyMap<number, SkillData>
): Map<number, SkillData> {
  const unnamed = new Map<number, SkillData>();
  for (const uma of umas) {
    if (uma.unique === undefined || unnamed.has(uma.unique)) continue;

    const known = skills.get(uma.unique);
    if (known !== undefined && known.name !== '') continue;

    const outfit = uma.outfit === undefined ? '' : ` (${uma.outfit})`;
    unnamed.set(uma.unique, {
      skill_id: uma.unique,
      name: `${uma.name}${outfit} unique`,
      rarity: 1,
      icon: '',
      unique: true,
      inherited: true
    });
  }

  return unnamed;
}

export function unvaluedSkills(
  uma: UmaSkills,
  isValued: (skillId: number) => boolean
): UnvaluedSkills {
  return {
    unique: uma.unique !== undefined && !isValued(uma.unique),
    skills: uma.skills.filter((skillId) => !isValued(skillId)).length
  };
}
