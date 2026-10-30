import { characterImagePath } from '@/lib/game-data/characters';
import { skillImage, type SkillData } from '@/lib/game-data/skills/skills';
import type { LinearAxis } from './scatter/scatter-scale';
import { dayAllows, type RaceDay } from './cm/race-day';
import type { SkillFacts, SkillKind, SkillPoint } from './skill-explorer-data';
import type { AxisUnit, PlottedSkill, QuadrantLabels } from './scatter/SkillScatter.svelte';

/** Left to right by where a skill first procs, or by its base SP cost. */
export type XMode = 'position' | 'cost';
/** What it adds to the reference build, or on its own. */
export type YMode = 'value' | 'alone';

/** White skills, gold skills, and inherited uniques. */
export type SkillRarity = 'white' | 'gold' | 'unique';

export const SKILL_RARITIES: readonly SkillRarity[] = ['white', 'gold', 'unique'];

/** Toggle one filter without changing any of the other selections. */
export function toggleType<Type>(selected: ReadonlySet<Type>, type: Type): Set<Type> {
  const next = new Set(selected);
  if (next.has(type)) next.delete(type);
  else next.add(type);

  return next;
}

/** How many of the most valuable skills to show. */
export type ShowLimit = '25' | '50' | '100' | 'all';

export function limitOf(show: ShowLimit): number | undefined {
  return show === 'all' ? undefined : Number(show);
}

/** Inherited uniques are numbered from 900000. */
const INHERITED_UNIQUE_FROM = 900_000;

/** Ground, weather and season conditions: the theory values these skills as if their day holds. */
const DAY_CONDITION = /\b(?:ground_condition|weather|season)==/;

/** Negative skills (×, Paddock Fright, Defeatist…) all use the purple icon variants, numbered …4. */
const NEGATIVE_ICON = /_\d{4}4\.(?:png|webp)$/i;

export function isDayBound(skill: SkillData): boolean {
  return DAY_CONDITION.test(skill.conditions ?? '');
}

/** A negative skill a trainee only ever gets forced on her; nobody buys one. */
export function isNegativeSkill(skill: SkillData): boolean {
  return NEGATIVE_ICON.test(skill.icon);
}

/** ○, ◎ and gold versions of a skill share their id but its last digit, as the game groups them. */
export function skillFamily(skillId: number): number {
  return Math.floor(skillId / 10);
}

export interface PlotOptions {
  points: SkillPoint[];
  skills: Map<number, SkillData>;
  /** Each skill's kind and, for a unique, its character card. */
  facts: Map<number, SkillFacts>;
  xMode: XMode;
  yMode: YMode;
  /** The rarities and kinds to show for skills outside the comparison. */
  rarities: ReadonlySet<SkillRarity>;
  kinds: ReadonlySet<SkillKind>;
  search: string;
  /** A picked uma's skills: only they match, along with the search. */
  umaSkillIds?: ReadonlySet<number>;
  /** Compared skills bypass display filters, limits and best-version grouping. */
  comparedSkillIds?: ReadonlySet<number>;
  showDayBound: boolean;
  /** A CM's race day: its ground, weather and season skills show when they hold, whatever `showDayBound` says. */
  day?: RaceDay;
  /** Values over all races, scaled by how often each skill fires, rather than in the races it fires in. */
  procScaled: boolean;
  /** Only the best version of each skill family. */
  bestOfFamily: boolean;
  /** The most valuable skills to show; search matches show beyond it. None shows every skill. */
  limit?: number;
  /** A single course's distance, for a metre axis. */
  courseDistance?: number;
}

export interface PlotView {
  /** Most valuable first. */
  plotted: PlottedSkill[];
  xAxis: LinearAxis;
  /** How the horizontal axis reads its values, for ticks at any zoom. */
  xUnit: AxisUnit;
  xTitle: string;
  xSplit: number;
  /** The median shown skill's value: the line between strong and weaker. */
  ySplit: number;
  quadrants: QuadrantLabels;
}

interface Candidate {
  point: SkillPoint;
  skill: SkillData;
  x: number;
  y: number;
  matches: boolean;
  searchMatch: boolean;
}

function rarityOf(skill: SkillData): SkillRarity {
  if (skill.skill_id >= INHERITED_UNIQUE_FROM) return 'unique';
  return skill.rarity === 2 ? 'gold' : 'white';
}

const TIERS: Record<SkillRarity, PlottedSkill['tier']> = {
  white: 'white',
  gold: 'gold',
  unique: 'inherited'
};

/** A unique shows its character; any other skill its icon. */
function imageOf(skill: SkillData, facts: SkillFacts | undefined): string | undefined {
  if (facts?.card !== undefined) return characterImagePath(facts.card);
  return skillImage(skill.icon);
}

function positionLabel(share: number, courseDistance: number | undefined): string {
  if (courseDistance === undefined) return `${Math.round(share * 100)}% of race`;
  return `${Math.round(share * courseDistance)} m`;
}

/**
 * The value plotted: per firing, or scaled by its proc rate. A skill forced to fire somewhere, or a ground, weather or
 * season skill on a CM whose day it holds on, is scaled by the rate it fires at when forced; the chart marks it forced.
 */
function plottedY(point: SkillPoint, skill: SkillData, options: PlotOptions): number {
  const perFiring = options.yMode === 'value' ? point.win : point.winAlone;
  if (!options.procScaled) return perFiring;

  const firesAtForcedRate = point.forced > 0 || (options.day !== undefined && isDayBound(skill));
  if (firesAtForcedRate) return perFiring * point.rate;
  if (point.win === 0) return 0;
  return perFiring * (point.expected / point.win);
}

function plottedX(point: SkillPoint, skill: SkillData, xMode: XMode): number | undefined {
  if (xMode === 'position') return point.mean;
  return skill.baseCost;
}

function dayBoundShown(skill: SkillData, options: PlotOptions): boolean {
  if (options.day !== undefined) return dayAllows(skill.conditions, options.day);
  return options.showDayBound || options.comparedSkillIds?.has(skill.skill_id) === true;
}

function candidatesOf(options: PlotOptions): Candidate[] {
  const search = options.search.trim().toLowerCase();
  const candidates: Candidate[] = [];
  for (const point of options.points) {
    const skill = options.skills.get(point.skillId);
    if (skill === undefined || skill.name === '') continue;
    if (isNegativeSkill(skill)) continue;
    if (isDayBound(skill) && !dayBoundShown(skill, options)) continue;

    const compared = options.comparedSkillIds?.has(point.skillId) === true;
    if (!compared && !options.rarities.has(rarityOf(skill))) continue;

    const kind = options.facts.get(skill.skill_id)?.kind ?? 'other';
    if (!compared && !options.kinds.has(kind)) continue;

    const x = plottedX(point, skill, options.xMode);
    if (x === undefined) continue;

    const nameMatches = search === '' || skill.name.toLowerCase().includes(search);
    const umaGivesIt = options.umaSkillIds === undefined || options.umaSkillIds.has(skill.skill_id);
    candidates.push({
      point,
      skill,
      x,
      y: plottedY(point, skill, options),
      searchMatch: search !== '' && nameMatches,
      matches: nameMatches && umaGivesIt
    });
  }

  return candidates;
}

/** The most valuable version of each family; a search match stays beside it. */
function bestOfFamilies(
  candidates: Candidate[],
  searching: boolean,
  compared?: ReadonlySet<number>
): Candidate[] {
  const best = new Map<number, Candidate>();
  for (const candidate of candidates) {
    const family = skillFamily(candidate.skill.skill_id);
    const current = best.get(family);
    if (current === undefined || candidate.y > current.y) best.set(family, candidate);
  }

  const kept = new Set(best.values());
  return candidates.filter(
    (candidate) =>
      kept.has(candidate) ||
      (searching && (candidate.matches || candidate.searchMatch)) ||
      compared?.has(candidate.point.skillId)
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function plotView(options: PlotOptions): PlotView {
  const { xMode, limit, courseDistance } = options;
  // A search or a picked uma: its matches show beyond the limit and beside their family's best version.
  const searching = options.search.trim() !== '' || options.umaSkillIds !== undefined;

  const candidates = candidatesOf(options);
  const deduplicated = options.bestOfFamily
    ? bestOfFamilies(candidates, searching, options.comparedSkillIds)
    : candidates;
  const ranked = deduplicated.sort((left, right) => right.y - left.y);
  const shown = ranked.filter(
    (candidate, rank) =>
      limit === undefined ||
      rank < limit ||
      (searching && (candidate.matches || candidate.searchMatch)) ||
      options.comparedSkillIds?.has(candidate.point.skillId)
  );

  const plotted: PlottedSkill[] = shown.map(({ point, skill, x, y, matches, searchMatch }) => ({
    skillId: point.skillId,
    name: skill.name,
    image: imageOf(skill, options.facts.get(skill.skill_id)),
    tier: TIERS[rarityOf(skill)],
    x,
    y,
    xLabel: xMode === 'position' ? positionLabel(x, courseDistance) : `${x} SP`,
    matches,
    searchMatch,
    forced: point.forced > 0
  }));
  const ySplit = median(plotted.map((point) => point.y));

  if (xMode === 'position') {
    return {
      plotted,
      xAxis: { min: 0, max: 1 },
      xUnit:
        courseDistance === undefined
          ? { scale: 100, suffix: '%' }
          : { scale: courseDistance, suffix: ' m' },
      xTitle:
        courseDistance === undefined
          ? 'Mean first proc (share of the race)'
          : 'Mean first proc (metres)',
      xSplit: 0.5,
      ySplit,
      quadrants: {
        topLeft: 'Strong early skills',
        topRight: 'Strong late skills',
        bottomLeft: 'Weaker early skills',
        bottomRight: 'Weaker late skills'
      }
    };
  }

  const costs = plotted.map((point) => point.x);
  const xAxis = { min: Math.min(...costs, 0), max: Math.max(...costs, 100) };
  return {
    plotted,
    xAxis,
    xUnit: { scale: 1, suffix: ' SP' },
    xTitle: 'Base SP cost',
    xSplit: (xAxis.min + xAxis.max) / 2,
    ySplit,
    quadrants: {
      topLeft: 'Strong cheap skills',
      topRight: 'Strong costly skills',
      bottomLeft: 'Weaker cheap skills',
      bottomRight: 'Weaker costly skills'
    }
  };
}
