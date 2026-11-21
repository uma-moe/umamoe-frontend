import type { MoodName } from '@/lib/race/replay/race-display';
import { TIMELINE_FOLDER, artLink } from './art-trees';

/** Stats and support types by the names of their icons. */
export type StatIcon = 'speed' | 'stamina' | 'power' | 'guts' | 'wit' | 'friend' | 'group';

export type RunningStyleBadge = 'front' | 'pace' | 'late' | 'end';

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy';

/** The race times the game has an icon for; Morning has none. */
export type TimeOfDay = 'midday' | 'evening' | 'night';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export type SupportRarity = 'R' | 'SR' | 'SSR';

const TIMES_OF_DAY: readonly TimeOfDay[] = ['midday', 'evening', 'night'];

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The 128 px portrait of a card. */
export function umaPortrait(cardId: number): string {
  return artLink(`umas/${cardId}/portrait.webp`);
}

export function supportCardHalf(cardId: number | string): string {
  return artLink(`support-cards/${cardId}/half.webp`);
}

export function supportCardFull(cardId: number | string): string {
  return artLink(`support-cards/${cardId}/card.webp`);
}

/** The icon the game names `utx_ico_skill_<id>`, as skill data lists it, with or without an extension. */
export function skillIcon(iconName: string | undefined): string | undefined {
  const iconId = iconName?.match(/utx_ico_skill_(\d+)/)?.[1];
  return iconId === undefined ? undefined : artLink(`skills/icons/${iconId}.webp`);
}

export function itemIcon(itemId: number): string {
  return artLink(`items/${String(itemId).padStart(5, '0')}.webp`);
}

/** The rank emblems the game names `utx_ico_statusrank_<index>`: aptitude grades and the trained rank. */
export function statusRankIcon(iconIndex: number): string {
  return artLink(`ui/status-ranks/${twoDigits(iconIndex)}.webp`);
}

/** The lettered rank the game names `utx_txt_rank_<index>`. */
export function rankTextIcon(iconIndex: number): string {
  return artLink(`ui/ranks/${twoDigits(iconIndex)}.webp`);
}

/** The club emblem of ranks 1 to 11; undefined for any other value. */
export function circleRankIcon(rank: number | undefined): string | undefined {
  const isClubRank = rank !== undefined && Number.isInteger(rank) && rank >= 1 && rank <= 11;
  return isClubRank ? artLink(`ui/circle-ranks/${twoDigits(rank)}.webp`) : undefined;
}

const STAT_ICON_NAMES: ReadonlyMap<string, StatIcon> = new Map([
  ['speed', 'speed'],
  ['stamina', 'stamina'],
  ['power', 'power'],
  ['guts', 'guts'],
  ['wit', 'wit'],
  ['wiz', 'wit'],
  ['wisdom', 'wit'],
  ['intelligence', 'wit'],
  ['friend', 'friend'],
  ['group', 'group']
]);

export function statIcon(stat: StatIcon | Capitalize<StatIcon>): string {
  return artLink(`ui/stats/${stat.toLowerCase()}.webp`);
}

/** The icon of a stat or support type as data names it ("Speed", "wiz", "intelligence"); undefined for other names. */
export function statIconByName(name: string): string | undefined {
  const stat = STAT_ICON_NAMES.get(name.toLowerCase());
  return stat === undefined ? undefined : statIcon(stat);
}

export function moodIcon(mood: MoodName): string {
  return artLink(`ui/moods/${mood.toLowerCase()}.webp`);
}

/** The round lettered badge of a running style, such as PACE. */
export function runningStyleBadge(style: RunningStyleBadge): string {
  return artLink(`ui/running-styles/labels/${style}.webp`);
}

export function weatherIcon(weather: Weather): string {
  return artLink(`ui/weather/${weather}.webp`);
}

export function timeOfDayIcon(time: TimeOfDay): string {
  return artLink(`ui/times-of-day/${twoDigits(TIMES_OF_DAY.indexOf(time))}.webp`);
}

/** The English game's lettered season tile. */
export function seasonIcon(season: Season): string {
  return artLink(`ui/seasons/${season}.webp`);
}

export function raceBanner(thumbnailId: number): string {
  return artLink(`races/banners/${String(thumbnailId).padStart(4, '0')}.webp`);
}

export function supportRarityIcon(rarity: SupportRarity): string {
  return artLink(`ui/support-rarities/${rarity.toLowerCase()}.webp`);
}

export function scenarioLogo(scenarioId: number): string {
  return artLink(`scenarios/${scenarioId}/logo.webp`);
}

/** The game's skill point icon, which stands in for "SP" beside amounts as stat icons do for stats. */
export const SKILL_POINTS_ICON = artLink('ui/skill-points.webp');

/**
 * A timeline banner by the timeline's `image_path`: `assets/images/<path>` and
 * `assets/timeline-images/<path>` are both `art/timeline/<path>`. Anything else has no banner.
 */
export function timelineBanner(imagePath: string): string | undefined {
  const path = imagePath
    .replace(/^\//, '')
    .match(/^assets\/(?:images|timeline-images)\/(.+)$/)?.[1];
  return path === undefined ? undefined : artLink(`${TIMELINE_FOLDER}${path}`);
}
