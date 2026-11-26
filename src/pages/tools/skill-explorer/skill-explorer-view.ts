import { umaPortrait, skillIcon } from '@/lib/game-assets/art-links';
import { isEvoSkill, type SkillData } from '@/lib/game-data/skills/skills';
import { finalSpurtSection } from '@/lib/race/final-spurt';
import type { LinearAxis } from './scatter/scatter-scale';
import { dayAllows, type RaceDay } from './cm/race-day';
import type { CountGate } from './skill-card/skill-requirements';
import {
  wrWeightedMean,
  type SkillFacts,
  type SkillKind,
  type SkillPoint,
  type TimedValue
} from './skill-explorer-data';
import type {
  AxisUnit,
  PlotBand,
  PlotMark,
  PlottedSkill,
  QuadrantLabels
} from './scatter/SkillScatter.svelte';

/** Left to right by mean first proc, WR-weighted proc point, or SP efficiency (WR / 100 SP vs total SP cost). */
export type XMode = 'position' | 'wrPosition' | 'cost';
/**
 * What it adds to the reference build, set up as players set it up; the same with skills that wait on others forced to
 * fire at their best point; or on its own.
 */
export type YMode = 'value' | 'forced' | 'alone';

/** The race phases as shares of its distance, named and coloured as in the simulator's course breakdown. */
export const RACE_PHASES: readonly PlotBand[] = [
  { from: 0, to: 1 / 6, label: 'Early race', color: 'var(--accent-secondary)' },
  { from: 1 / 6, to: 2 / 3, label: 'Mid race', color: 'var(--accent-primary)' },
  { from: 2 / 3, to: 1, label: 'Late race', color: 'var(--accent-purple)' }
];

/** The earliest a runner can start her final spurt, with HP to spare: the start of the late race. */
const SPURT = finalSpurtSection(1);
export const FINAL_SPURT_MARK: PlotMark = {
  at: SPURT.start,
  label: 'Final spurt can begin',
  color: SPURT.color
};

/** White skills, gold skills, evolved skills, inherited uniques, and the uniques runners have as their own. */
export type SkillRarity = 'white' | 'gold' | 'evolved' | 'inherited' | 'personal';

export const SKILL_RARITIES: readonly SkillRarity[] = [
  'white',
  'gold',
  'evolved',
  'inherited',
  'personal'
];

/** Default visible rarities: evolved skills stay off by default and appear in relation to their base skill or Uma. */
export const DEFAULT_SKILL_RARITIES: readonly SkillRarity[] = [
  'white',
  'gold',
  'inherited',
  'personal'
];

/**
 * Which version of each unique shows: inherited from a parent, or the character's own. One at a time, so each ranks
 * among the other skills without its twin beside it.
 */
export type UniqueVersion = 'inherited' | 'own';

/** The unique rarity `version` leaves out. */
export function hiddenRarity(version: UniqueVersion): SkillRarity {
  return version === 'own' ? 'inherited' : 'personal';
}

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

/** Inherited uniques are numbered in 900000..999999. */
const INHERITED_UNIQUE_FROM = 900_000;
const INHERITED_UNIQUE_TO = 1_000_000;

/** Ground, weather, season and time-of-day conditions: the explorer values these skills as if their day holds. */
const DAY_CONDITION = /\b(?:ground_condition|weather|season|time)==/;

/** Negative skills (×, Paddock Fright, Defeatist…) all use the purple icon variants, numbered …4. */
const NEGATIVE_ICON = /_\d{4}4\.(?:png|webp)$/i;

export function isDayBound(skill: SkillData): boolean {
  return DAY_CONDITION.test(skill.conditions ?? '');
}

/** A negative skill a trainee only ever gets forced on her; nobody buys one. */
export function isNegativeSkill(skill: SkillData): boolean {
  return NEGATIVE_ICON.test(skill.icon);
}

/** Full base purchase SP cost of a skill, including its prerequisite tier when required, before hint discounts. */
export interface SkillCostBreakdown {
  /** Total base SP cost (`direct + prerequisite`). */
  total: number;
  /** Direct base SP cost of this skill (or its base gold skill for an evolved skill). */
  direct: number;
  /** Prerequisite lower-tier SP cost (`0` when standalone). */
  prerequisite: number;
  /** True when priced from an evolved skill's base gold skill. */
  fromBase?: boolean;
}

/**
 * Full base purchase SP cost for a skill before hint discounts: sums non-negative lower-tier prerequisites in the
 * same skill family (`gold + white`, 3-tier `gold + ◎ + ○`, or `◎ + ○`), and prices evolved skills from their base
 * gold skill.
 */
export function skillPurchaseCost(
  skill: SkillData,
  skills: ReadonlyMap<number, SkillData>,
  evolvesFrom?: ReadonlyMap<number, number>
): SkillCostBreakdown | undefined {
  if (isEvoSkill(skill)) {
    const baseId = evolvesFrom?.get(skill.skill_id);
    const baseSkill = baseId !== undefined ? skills.get(baseId) : undefined;
    if (baseSkill && !isEvoSkill(baseSkill)) {
      const baseCost = skillPurchaseCost(baseSkill, skills);
      if (baseCost !== undefined) return { ...baseCost, fromBase: true };
    }
  }

  const rarity = rarityOf(skill);
  if (rarity === 'personal') return undefined;

  const direct = skill.baseCost;
  if (direct === undefined || direct <= 0) return undefined;

  let prerequisite = 0;
  const isGold = skill.rarity === 2;
  const isDoubleCircle = skill.rarity === 1 && skill.name.endsWith('◎');
  if (isGold || isDoubleCircle) {
    const familyBase = skillFamily(skill.skill_id) * 10;
    for (let digit = 1; digit <= 4; digit += 1) {
      const siblingId = familyBase + digit;
      if (siblingId === skill.skill_id) continue;
      const sibling = skills.get(siblingId);
      if (
        sibling === undefined ||
        sibling.rarity !== 1 ||
        isNegativeSkill(sibling) ||
        sibling.baseCost === undefined ||
        sibling.baseCost <= 0
      ) {
        continue;
      }
      if (isGold || sibling.name.endsWith('○')) {
        prerequisite += sibling.baseCost;
      }
    }
  }

  return { total: direct + prerequisite, direct, prerequisite };
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
  /** The version of each unique to show; none shows both. */
  uniqueVersion?: UniqueVersion;
  kinds: ReadonlySet<SkillKind>;
  search: string;
  /** A picked uma's skills: only they match, along with the search. */
  umaSkillIds?: ReadonlySet<number>;
  /** Compared skills bypass display filters, limits and best-version grouping. */
  comparedSkillIds?: ReadonlySet<number>;
  /** Evolved skill ID -> base gold skill ID: searching a base skill also surfaces and highlights its evos. */
  evolvesFrom?: ReadonlyMap<number, number>;
  /** Evolved skills explicitly revealed from a base skill card ("Display evo"): bypass default evo hiding & limits. */
  revealedEvoIds?: ReadonlySet<number>;
  showDayBound: boolean;
  /** A CM's race day: its day-bound skills show when their day holds, unforced, whatever `showDayBound` says. */
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
  /** Optional unit suffix appended to the median/efficiency readout (e.g. `'/ 100 SP'`). */
  yUnitSuffix?: string;
  /** Optional lower floor for the root-scaled vertical axis (`0.5` for WR / 100 SP efficiency). */
  yFloor?: number;
  quadrants: QuadrantLabels;
  /** Behind the skills on the proc point axis: the race's phases, and where the final spurt can begin. */
  bands: readonly PlotBand[];
  marks: readonly PlotMark[];
}

interface Candidate {
  point: SkillPoint;
  skill: SkillData;
  x: number;
  y: number;
  rawY: number;
  spCost?: number;
  matches: boolean;
  searchMatch: boolean;
}

function rarityOf(skill: SkillData): SkillRarity {
  if (isEvoSkill(skill)) return 'evolved';
  if (skill.skill_id >= INHERITED_UNIQUE_FROM && skill.skill_id < INHERITED_UNIQUE_TO) {
    return 'inherited';
  }
  if (skill.unique || skill.rarity >= 3) return 'personal';
  return skill.rarity === 2 ? 'gold' : 'white';
}

/** The rarities `points` hold, in filter order: a filter for a rarity without skills would show nothing. */
export function raritiesOf(
  points: readonly SkillPoint[],
  skills: Map<number, SkillData>
): SkillRarity[] {
  const held = new Set<SkillRarity>();
  for (const point of points) {
    const skill = skills.get(point.skillId);
    if (skill) held.add(rarityOf(skill));
  }

  return SKILL_RARITIES.filter((rarity) => held.has(rarity));
}

const TIERS: Record<SkillRarity, PlottedSkill['tier']> = {
  white: 'white',
  gold: 'gold',
  evolved: 'evolved',
  inherited: 'inherited',
  personal: 'personal'
};

/** A unique shows its character; any other skill (including evolved skills) its icon. */
function imageOf(skill: SkillData, facts: SkillFacts | undefined): string | undefined {
  if (facts?.card !== undefined && !isEvoSkill(skill)) return umaPortrait(facts.card);
  return skillIcon(skill.icon);
}

function positionLabel(share: number, courseDistance: number | undefined): string {
  if (courseDistance === undefined) return `${Math.round(share * 100)}% of race`;
  return `${Math.round(share * courseDistance)} m`;
}

/** A gated skill forced to fire at its best point, in the Optimal view; undefined for any other skill or view. */
export function forcedValue(point: SkillPoint, yMode: YMode): TimedValue | undefined {
  return yMode === 'forced' ? point.gated?.forced : undefined;
}

/**
 * The value plotted: per firing, or scaled by its proc rate. A skill forced to fire somewhere, or a ground, weather or
 * season skill on a CM whose day it holds on, is scaled by the rate it fires at when forced; the chart marks it forced.
 * In the Optimal view a gated skill takes its best forced point's value and rate.
 */
function plottedY(point: SkillPoint, skill: SkillData, options: PlotOptions): number {
  const forced = forcedValue(point, options.yMode);
  if (forced) return options.procScaled ? forced.expected : forced.win;

  const perFiring = options.yMode === 'alone' ? point.winAlone : point.win;
  if (!options.procScaled) return perFiring;

  const firesAtForcedRate = point.forced > 0 || (options.day !== undefined && isDayBound(skill));
  if (firesAtForcedRate) return perFiring * point.rate;
  if (point.win === 0) return 0;
  return perFiring * (point.expected / point.win);
}

/** 95% interval half-width in the same Y units as the plot (unavailable in the solo `alone` view). */
function plottedYError(
  point: SkillPoint,
  options: PlotOptions,
  spCost?: number
): number | undefined {
  if (options.yMode === 'alone' || point.ci95 === undefined || point.ci95 <= 0) return undefined;
  const rawErr = options.procScaled ? point.ci95 : point.ci95 / Math.max(point.rate, 0.05);
  const scaled =
    options.xMode === 'cost' && spCost && spCost > 0 ? rawErr * (100 / spCost) : rawErr;
  return Math.round(scaled * 100) / 100;
}

function plottedX(point: SkillPoint, skill: SkillData, options: PlotOptions): number | undefined {
  if (options.xMode === 'position') return forcedValue(point, options.yMode)?.mean ?? point.mean;
  if (options.xMode === 'wrPosition') {
    return (
      forcedValue(point, options.yMode)?.mean ??
      wrWeightedMean(point.sections, point.sectionWins) ??
      point.mean
    );
  }

  return skillPurchaseCost(skill, options.skills, options.evolvesFrom)?.total;
}

/**
 * A gated skill valued at its best timing: every one in the Optimal view, and in the In build view one no setup reaches
 * on at least half the courses it is valued on.
 */
function atOptimalTiming(point: SkillPoint, yMode: YMode): boolean {
  if (forcedValue(point, yMode) !== undefined) return true;
  return yMode === 'value' && point.gated !== undefined && mostlyForced(point);
}

/**
 * A day-bound skill valued as if its day held on at least half the courses it is valued on. On a CM the day is the
 * meeting's, and it shows only where it holds.
 */
function forcedByDay(point: SkillPoint, options: PlotOptions): boolean {
  return options.day === undefined && point.gated === undefined && mostlyForced(point);
}

function mostlyForced(point: SkillPoint): boolean {
  return point.forced > 0 && point.forced * 2 >= point.courses;
}

/** On a single course in the In build view: a gated skill's setup buys skills to trigger it. */
function setUpWithSkills(point: SkillPoint, yMode: YMode): boolean {
  if (yMode !== 'value') return false;
  return (point.gated?.setup?.feeders.length ?? 0) > 0;
}

function dayBoundShown(skill: SkillData, options: PlotOptions): boolean {
  if (options.day !== undefined) return dayAllows(skill.conditions, options.day);
  return options.showDayBound || options.comparedSkillIds?.has(skill.skill_id) === true;
}

function candidatesOf(options: PlotOptions): Candidate[] {
  const search = options.search.trim().toLowerCase();
  // When searching, also surface and highlight evolved versions of any base gold skill whose name matches.
  const matchedBaseIds = new Set<number>();
  if (search !== '' && options.evolvesFrom && options.evolvesFrom.size > 0) {
    for (const point of options.points) {
      const skill = options.skills.get(point.skillId);
      if (skill !== undefined && skill.name.toLowerCase().includes(search)) {
        matchedBaseIds.add(skill.skill_id);
      }
    }
  }

  const candidates: Candidate[] = [];
  for (const point of options.points) {
    const skill = options.skills.get(point.skillId);
    if (skill === undefined || skill.name === '') continue;
    if (isNegativeSkill(skill)) continue;
    if (isDayBound(skill) && !dayBoundShown(skill, options)) continue;

    const compared = options.comparedSkillIds?.has(point.skillId) === true;
    const rarity = rarityOf(skill);
    const versionHidden =
      options.uniqueVersion !== undefined && rarity === hiddenRarity(options.uniqueVersion);

    const directNameMatch = search !== '' && skill.name.toLowerCase().includes(search);
    const baseId = rarity === 'evolved' ? options.evolvesFrom?.get(skill.skill_id) : undefined;
    const baseNameMatch = baseId !== undefined && matchedBaseIds.has(baseId);
    const searchMatch = directNameMatch || baseNameMatch;
    const nameMatches = search === '' || searchMatch;
    const umaGivesIt = options.umaSkillIds === undefined || options.umaSkillIds.has(skill.skill_id);
    const revealedEvo =
      rarity === 'evolved' && options.revealedEvoIds?.has(skill.skill_id) === true;
    const relationalEvo =
      rarity === 'evolved' &&
      (revealedEvo || searchMatch || (options.umaSkillIds !== undefined && umaGivesIt));

    if (!compared && ((!options.rarities.has(rarity) && !relationalEvo) || versionHidden)) continue;

    const kind = options.facts.get(skill.skill_id)?.kind ?? 'other';
    if (!compared && !revealedEvo && !options.kinds.has(kind)) continue;

    const x = plottedX(point, skill, options);
    if (x === undefined) continue;

    const rawY = plottedY(point, skill, options);
    const spCost = options.xMode === 'cost' ? x : undefined;
    const y = spCost !== undefined && spCost > 0 ? rawY * (100 / spCost) : rawY;

    candidates.push({
      point,
      skill,
      x,
      y,
      rawY,
      spCost,
      searchMatch,
      matches: nameMatches && umaGivesIt
    });
  }

  return candidates;
}

/** The most valuable version of each family; a search match or revealed evo stays beside it. */
function bestOfFamilies(
  candidates: Candidate[],
  searching: boolean,
  compared?: ReadonlySet<number>,
  revealed?: ReadonlySet<number>
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
      compared?.has(candidate.point.skillId) ||
      revealed?.has(candidate.point.skillId)
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
    ? bestOfFamilies(candidates, searching, options.comparedSkillIds, options.revealedEvoIds)
    : candidates;
  const ranked = deduplicated.sort((left, right) => right.y - left.y);
  const shown = ranked.filter(
    (candidate, rank) =>
      limit === undefined ||
      rank < limit ||
      (searching && (candidate.matches || candidate.searchMatch)) ||
      options.comparedSkillIds?.has(candidate.point.skillId) ||
      options.revealedEvoIds?.has(candidate.point.skillId)
  );

  const isPositionAxis = xMode === 'position' || xMode === 'wrPosition';
  const plotted: PlottedSkill[] = shown.map(
    ({ point, skill, x, y, spCost, matches, searchMatch }) => ({
      skillId: point.skillId,
      name: skill.name,
      image: imageOf(skill, options.facts.get(skill.skill_id)),
      tier: TIERS[rarityOf(skill)],
      x,
      y,
      yError: plottedYError(point, options, spCost),
      raced: point.raced === true,
      xLabel: isPositionAxis ? positionLabel(x, courseDistance) : `${x} SP`,
      matches,
      searchMatch,
      forced: forcedByDay(point, options),
      optimal: atOptimalTiming(point, options.yMode),
      setUp: setUpWithSkills(point, options.yMode)
    })
  );
  const ySplit = median(plotted.map((point) => point.y));

  if (isPositionAxis) {
    const axisName = xMode === 'wrPosition' ? 'Avg WR activation point' : 'Mean first activation';
    return {
      plotted,
      xAxis: { min: 0, max: 1 },
      xUnit:
        courseDistance === undefined
          ? { scale: 100, suffix: '%' }
          : { scale: courseDistance, suffix: ' m' },
      xTitle:
        courseDistance === undefined ? `${axisName} (share of the race)` : `${axisName} (metres)`,
      xSplit: 0.5,
      ySplit,
      quadrants: {
        topLeft: 'Strong early',
        topRight: 'Strong late',
        bottomLeft: 'Weaker early',
        bottomRight: 'Weaker late'
      },
      bands: RACE_PHASES,
      marks: [FINAL_SPURT_MARK]
    };
  }

  const costs = plotted.map((point) => point.x);
  const minCost = costs.length > 0 ? Math.min(...costs) : 80;
  const maxCost = costs.length > 0 ? Math.max(...costs) : 400;
  const xMin = Math.max(0, Math.floor((minCost - 10) / 20) * 20);
  const xMax = Math.max(xMin + 40, Math.ceil((maxCost + 10) / 20) * 20);
  const xAxis = { min: xMin, max: xMax };
  return {
    plotted,
    xAxis,
    xUnit: { scale: 1, suffix: ' SP' },
    xTitle: 'Total base SP cost (before hints)',
    xSplit: (xAxis.min + xAxis.max) / 2,
    ySplit,
    yUnitSuffix: '/ 100 SP',
    yFloor: 0.4,
    quadrants: {
      topLeft: 'Efficient cheap',
      topRight: 'Efficient costly',
      bottomLeft: 'Weaker cheap',
      bottomRight: 'Weaker costly'
    },
    bands: [],
    marks: []
  };
}

export interface GateFeederOptions {
  skillId: number;
  gate: CountGate;
  points: readonly SkillPoint[];
  skills: ReadonlyMap<number, SkillData>;
  facts?: ReadonlyMap<number, SkillFacts>;
  /** Owning card when the gated skill itself (or highlighted Uma) is character-locked. */
  ownerCardId?: number;
  day?: RaceDay;
  limit?: number;
}

const INHERITED_UNIQUE_OFFSET = 800_000;
const MAX_OWN_UNIQUE_FEEDERS = 1;
const MAX_INHERITED_UNIQUE_FEEDERS = 2;

/**
 * Picks up to `limit` build-legal skills that predominantly fire in `gate`'s window: at most one owned unique (and
 * only the card's own unique/evos when `ownerCardId` is fixed), at most two inherited uniques without duplicating the
 * owned unique, zero other-Uma evolved skills, one version per skill family, and matching the CM's race day.
 */
export function gateFeeders({
  skillId,
  gate,
  points,
  skills,
  facts,
  ownerCardId,
  day,
  limit = 5
}: GateFeederOptions): SkillPoint[] {
  const [from, to] = gate.sections;
  const ranked = points
    .filter((point) => {
      const skill = skills.get(point.skillId);
      if (point.skillId === skillId || skill === undefined || isNegativeSkill(skill)) return false;
      if (day !== undefined && isDayBound(skill) && !dayAllows(skill.conditions, day)) return false;

      const countsForGate =
        gate.counted === 'any' || facts?.get(point.skillId)?.kind === 'recovery';
      if (!countsForGate) return false;

      const inWindow = point.sections.slice(from, to).reduce((sum, share) => sum + share, 0);
      return inWindow > point.rate / 2;
    })
    .sort((left, right) => right.win - left.win);

  const picked: SkillPoint[] = [];
  const seenFamilies = new Set<number>();
  const seenUniqueBases = new Set<number>();
  let ownUniques = 0;
  let inheritedUniques = 0;

  for (const point of ranked) {
    if (picked.length >= limit) break;
    const skill = skills.get(point.skillId)!;
    const rarity = rarityOf(skill);
    const card = facts?.get(point.skillId)?.card;

    if (rarity === 'evolved') {
      if (ownerCardId === undefined || card !== ownerCardId) continue;
    } else if (rarity === 'personal') {
      if (ownUniques >= MAX_OWN_UNIQUE_FEEDERS) continue;
      if (ownerCardId !== undefined && card !== ownerCardId) continue;
      if (seenUniqueBases.has(point.skillId)) continue;
      ownUniques += 1;
      seenUniqueBases.add(point.skillId);
    } else if (rarity === 'inherited') {
      const baseId = point.skillId - INHERITED_UNIQUE_OFFSET;
      if (inheritedUniques >= MAX_INHERITED_UNIQUE_FEEDERS) continue;
      if (seenUniqueBases.has(baseId)) continue;
      inheritedUniques += 1;
      seenUniqueBases.add(baseId);
    } else {
      const family = skillFamily(point.skillId);
      if (seenFamilies.has(family)) continue;
      seenFamilies.add(family);
    }

    picked.push(point);
  }

  return picked;
}
