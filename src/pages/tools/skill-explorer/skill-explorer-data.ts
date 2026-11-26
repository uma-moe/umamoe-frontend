import { fetchJsonResource, readJsonResponse } from '@/services/resources/json-response';
import { finiteNumber, isRecord } from './json-guards';

/** The simulator serves the explorer's files, built from the model it runs. */
export const EXPLORER_FILES_URL = '/api/sim/skill-explorer';

/** The race in the game's 24 sections; the model records where a skill first fires in each. */
export const SECTIONS = 24;

/** Running styles as the simulator numbers them, plus every style averaged. */
export type StyleKey = '1' | '2' | '3' | '4' | 'all';

export const STYLE_KEYS = ['1', '2', '3', '4'] as const;

export const STYLE_NAMES: Record<StyleKey, string> = {
  all: 'All styles',
  '1': 'Front',
  '2': 'Pace',
  '3': 'Late',
  '4': 'End'
};

/** Which courses a data file averages: every course of a surface and length, or one course. A CM is its course. */
export type ExplorerScope =
  | { kind: 'group'; surface: 'all' | '1' | '2'; distance: 'all' | '1' | '2' | '3' | '4' }
  | { kind: 'course'; course: ExplorerCourse };

export interface ExplorerCourse {
  courseId: number;
  distance: number;
  distanceType: number;
  surface: number;
  trackId: number;
}

/** What a skill mainly does: acting on others first, then acceleration, speed, healing and stats. */
export type SkillKind = 'speed' | 'acceleration' | 'recovery' | 'stat' | 'debuff' | 'other';

export const SKILL_KINDS: readonly SkillKind[] = [
  'speed',
  'acceleration',
  'recovery',
  'stat',
  'debuff',
  'other'
];

/** What the explorer knows of a skill beyond its value: its kind and, for a unique, its character card. */
export interface SkillFacts {
  kind: SkillKind;
  card?: number;
}

/** The build-value model the values come from. */
export interface ExplorerModel {
  variant: string;
  checkpoint: string;
}

export interface ExplorerIndex {
  buildSize: number;
  model: ExplorerModel;
  skills: Map<number, SkillFacts>;
  /** Evolved skill ID -> base gold skill ID it evolves from. */
  evolvesFrom: Map<number, number>;
  courses: ExplorerCourse[];
}

/** One skill for one style over a scope. */
export interface SkillPoint {
  skillId: number;
  /**
   * Win points (0–100) it adds to the reference build, and on its own over no skills, by the model: in the races it
   * fires in, where it fires.
   */
  win: number;
  winAlone: number;
  /** Win points it adds to the reference build over all races: per firing times its rate, 0 where it was forced. */
  expected: number;
  /** Share of races it fires in. */
  rate: number;
  /** Mean first activation, as a share of the race. */
  mean: number;
  /** Courses of the scope it can fire on. */
  courses: number;
  /** Share of races it first fires in each section, summing to `rate`. */
  sections: number[];
  /** Win points added per firing when it first activates in each section (single course, non-recovery skills). */
  sectionWins?: number[];
  /** True when the skill's value came from direct paired races rather than the model alone. */
  raced?: boolean;
  /** 95% confidence / prediction interval half-width in win points over all races, matching `expected`. */
  ci95?: number;
  /**
   * Courses of the scope it never fired on in her build, so it was valued forced to fire wherever the course lets it
   * (the runners around her and other skills' activations counting as met; course, day and style still apply).
   */
  forced: number;
  /** For a skill that waits on her other skills' activations, like Groundwork: its other timings. */
  gated?: GatedValues;
}

/** Reference runner metadata for one style on a single course. */
export interface StyleBaseline {
  stats?: [number, number, number, number, number];
  win?: number;
}

/** A gated skill's value at one timing, read as a row's: per firing, over all races, its rate and mean proc point. */
export interface TimedValue {
  win: number;
  expected: number;
  rate: number;
  mean: number;
}

/**
 * The skills bought beside the reference build so they open a gated skill's gate by `at` (a share of the race): the
 * earliest point any such setup reaches. None when the build opens it by then as it is.
 */
export interface GatedSetup {
  feeders: number[];
  /** The feeders' SP before hints. */
  sp: number;
  at: number;
}

/** A gated skill forced to fire from `at` (a share of the race) on. */
export interface ForcedPoint extends TimedValue {
  at: number;
  /** The headline point, its value raced on fresh lobbies rather than the model's. */
  raced: boolean;
}

/**
 * A gated skill's values beyond its row (which is its If triggered value, at its headline point): forced to fire at
 * its best point, the same build for every skill; on a single course, its setup and every forced point.
 */
export interface GatedValues {
  forced: TimedValue;
  setup?: GatedSetup;
  points?: ForcedPoint[];
}

/**
 * The forced point a gated skill's Set up value is: the point its setup opens by, else a raced point, else (no
 * setup reaches any) the one worth most. Undefined when the skill ran naturally unforced with zero feeders.
 */
export function headlinePoint(gated: GatedValues): ForcedPoint | undefined {
  const points = gated.points ?? [];
  const opened = points.find((point) => point.at === gated.setup?.at);
  if (opened !== undefined) return opened;

  if (gated.setup !== undefined && gated.setup.feeders.length === 0) return undefined;

  const raced = points.find((point) => point.raced);
  if (raced !== undefined) return raced;

  return mostWorth(points);
}

/** Minimum share of races a section needs before its per-section WR contributes to WR-weighted means. */
const MIN_WR_MEAN_SHARE = 0.01;

/**
 * Average activation point weighted by each section's win-rate contribution (`sections[i] * sectionWins[i]`),
 * skipping tiny noise slivers when meaningful activation buckets exist.
 */
export function wrWeightedMean(
  sections: readonly number[],
  sectionWins: readonly number[] | undefined
): number | undefined {
  if (
    sectionWins === undefined ||
    sectionWins.length !== SECTIONS ||
    sections.length !== SECTIONS
  ) {
    return undefined;
  }

  const peakShare = Math.max(0, ...sections);
  const floor = peakShare >= MIN_WR_MEAN_SHARE ? MIN_WR_MEAN_SHARE : 0;

  let positiveWeight = 0;
  let positiveWeightedPos = 0;
  let absoluteWeight = 0;
  let absoluteWeightedPos = 0;

  for (let i = 0; i < SECTIONS; i += 1) {
    const share = sections[i]!;
    const win = sectionWins[i]!;
    if (share < floor || share <= 0 || !Number.isFinite(win)) continue;

    const center = (i + 0.5) / SECTIONS;
    const contribution = share * win;
    if (contribution > 0) {
      positiveWeight += contribution;
      positiveWeightedPos += center * contribution;
    }

    const magnitude = Math.abs(contribution);
    if (magnitude > 0) {
      absoluteWeight += magnitude;
      absoluteWeightedPos += center * magnitude;
    }
  }

  if (positiveWeight > 0) return positiveWeightedPos / positiveWeight;
  if (absoluteWeight > 0) return absoluteWeightedPos / absoluteWeight;

  return undefined;
}

/** The value worth most over all races. */
export function mostWorth<Value extends TimedValue>(values: Value[]): Value | undefined {
  return values.reduce<Value | undefined>(
    (best, value) => (best === undefined || value.expected > best.expected ? value : best),
    undefined
  );
}

/** A skill that raises another's value beside it, and by how many win points. */
export interface Partner {
  skillId: number;
  win: number;
}

export interface ScopeData {
  /** Courses the scope averages. */
  courses: number;
  styles: Record<StyleKey, SkillPoint[]>;
  /** The reference build per style, for a single course. */
  builds?: Partial<Record<StyleKey, number[]>>;
  /** Per style on a single course: the reference runner's forecasted statline and measured baseline win rate. */
  baselines?: Partial<Record<StyleKey, StyleBaseline>>;
  /** Per style, each skill's partners, for a single course. */
  partners?: Partial<Record<StyleKey, Map<number, Partner[]>>>;
  /**
   * Per style, the share of a skill's value 80% of the skills checked against full races came within (0.4 = ±40%).
   * Absent for a style no check covers yet; every style together takes the widest.
   */
  margins: Partial<Record<StyleKey, number>>;
}

/** Selection names in the simulator's paths, by surface and by length as the game numbers them. */
const SURFACE_PATHS: Record<string, string> = { all: 'all', '1': 'turf', '2': 'dirt' };
const DISTANCE_PATHS: Record<string, string> = {
  all: 'all',
  '1': 'sprint',
  '2': 'mile',
  '3': 'medium',
  '4': 'long'
};

function parseCourse(value: unknown): ExplorerCourse {
  if (!isRecord(value)) throw new Error('Skill Explorer index has an invalid course.');
  return {
    courseId: finiteNumber(value.course_id, 'course id'),
    distance: finiteNumber(value.distance, 'course distance'),
    distanceType: finiteNumber(value.distance_type, 'course length'),
    surface: finiteNumber(value.surface, 'course surface'),
    trackId: finiteNumber(value.track_id, 'track id')
  };
}

function parseModel(value: unknown): ExplorerModel {
  if (!isRecord(value) || typeof value.variant !== 'string' || typeof value.checkpoint !== 'string')
    throw new Error('Skill Explorer index names no model.');
  return { variant: value.variant, checkpoint: value.checkpoint };
}

function isSkillKind(value: unknown): value is SkillKind {
  return SKILL_KINDS.some((kind) => kind === value);
}

/** `{skill id: [kind, card id or 0]}`. */
function parseSkillFacts(value: unknown): Map<number, SkillFacts> {
  if (!isRecord(value)) throw new Error('Skill Explorer index has no skill facts.');
  return new Map(
    Object.entries(value).map(([id, entry]) => {
      if (!Array.isArray(entry) || !isSkillKind(entry[0]))
        throw new Error('Skill Explorer index has an invalid skill fact.');
      const card = finiteNumber(entry[1], 'character card');
      return [Number(id), card > 0 ? { kind: entry[0], card } : { kind: entry[0] }];
    })
  );
}

function parseEvolvesFrom(value: unknown): Map<number, number> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).map(([evoId, baseId]) => [
      Number(evoId),
      finiteNumber(baseId, 'base gold skill')
    ])
  );
}

export function parseIndex(value: unknown): ExplorerIndex {
  if (!isRecord(value) || !Array.isArray(value.courses))
    throw new Error('Skill Explorer index is invalid.');
  return {
    buildSize: finiteNumber(value.buildSize, 'build size'),
    model: parseModel(value.model),
    skills: parseSkillFacts(value.skills),
    evolvesFrom: parseEvolvesFrom(value.evolvesFrom),
    courses: value.courses.map(parseCourse)
  };
}

/**
 * A row is [id, win points in build, win points alone, rate, mean, courses, sections in permille of races, win points
 * over all races, courses forced on]; a bundle from before the last two reads them from the rest.
 */
export function parseRow(value: unknown): SkillPoint {
  if (!Array.isArray(value) || ![7, 9].includes(value.length) || !Array.isArray(value[6]))
    throw new Error('Skill Explorer data has an invalid skill row.');
  const sections = value[6].map((share) => finiteNumber(share, 'section share') / 1000);
  if (sections.length !== SECTIONS)
    throw new Error('Skill Explorer data has an invalid section count.');

  const win = finiteNumber(value[1], 'win points');
  const rate = finiteNumber(value[3], 'fire rate');
  return {
    skillId: finiteNumber(value[0], 'skill id'),
    win,
    winAlone: finiteNumber(value[2], 'win points alone'),
    expected: value.length === 9 ? finiteNumber(value[7], 'win points over all races') : win * rate,
    rate,
    mean: finiteNumber(value[4], 'fire point'),
    courses: finiteNumber(value[5], 'course count'),
    sections,
    forced: value.length === 9 ? finiteNumber(value[8], 'forced course count') : 0
  };
}

function timedValue(value: Record<string, unknown>, what: string): TimedValue {
  const win = finiteNumber(value.win, `${what} win points`);
  const rate = finiteNumber(value.rate, `${what} fire rate`);
  return { win, expected: win * rate, rate, mean: finiteNumber(value.mean, `${what} fire point`) };
}

function parseSetup(value: unknown): GatedSetup {
  if (!isRecord(value) || !Array.isArray(value.feeders))
    throw new Error('Skill Explorer data has an invalid setup.');
  return {
    feeders: value.feeders.map((id) => finiteNumber(id, 'setup skill')),
    sp: finiteNumber(value.sp, 'setup SP'),
    at: finiteNumber(value.at, 'setup point')
  };
}

function parseForcedPoint(value: unknown): ForcedPoint {
  if (!isRecord(value)) throw new Error('Skill Explorer data has an invalid forced point.');
  return {
    ...timedValue(value, 'forced point'),
    at: finiteNumber(value.at, 'forced point'),
    raced: value.raced === true
  };
}

/** `{skill id: {forced: [win, over all races, rate, mean], setup?, points?}}`. */
export function parseGated(value: unknown): Map<number, GatedValues> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).map(([id, entry]) => {
      if (!isRecord(entry) || !Array.isArray(entry.forced) || entry.forced.length !== 4)
        throw new Error('Skill Explorer data has an invalid gated skill.');
      const [win, expected, rate, mean] = entry.forced.map((number) =>
        finiteNumber(number, 'forced value')
      ) as [number, number, number, number];
      const gated: GatedValues = { forced: { win, expected, rate, mean } };
      if (entry.setup !== undefined) gated.setup = parseSetup(entry.setup);
      if (Array.isArray(entry.points)) gated.points = entry.points.map(parseForcedPoint);
      return [Number(id), gated];
    })
  );
}

/** `points` with each gated skill's values from `gated` attached. */
export function withGated(points: SkillPoint[], gated: Map<number, GatedValues>): SkillPoint[] {
  if (gated.size === 0) return points;
  return points.map((point) => {
    const values = gated.get(point.skillId);
    return values === undefined ? point : { ...point, gated: values };
  });
}

/** Per style, `{skill id: [[partner id, win points], ...]}`. */
function parsePartners(value: unknown): ScopeData['partners'] {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    STYLE_KEYS.map((style) => {
      const byStyle = value[style];
      const entries = isRecord(byStyle) ? Object.entries(byStyle) : [];
      return [
        style,
        new Map(
          entries.map(([id, partners]) => {
            if (!Array.isArray(partners))
              throw new Error('Skill Explorer data has invalid partners.');
            return [
              Number(id),
              partners.map((partner) => {
                if (!Array.isArray(partner))
                  throw new Error('Skill Explorer data has an invalid partner.');
                return {
                  skillId: finiteNumber(partner[0], 'partner skill'),
                  win: finiteNumber(partner[1], 'partner win points')
                };
              })
            ];
          })
        )
      ];
    })
  );
}

function parseBuilds(value: unknown): ScopeData['builds'] {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    STYLE_KEYS.map((style) => {
      const build = value[style];
      return [
        style,
        Array.isArray(build) ? build.map((id) => finiteNumber(id, 'build skill')) : []
      ];
    })
  );
}

function parseBaselines(value: unknown): ScopeData['baselines'] {
  if (!isRecord(value)) return undefined;

  const baselines: Partial<Record<StyleKey, StyleBaseline>> = {};
  for (const style of STYLE_KEYS) {
    const entry = value[style];
    if (!isRecord(entry)) continue;

    const baseline: StyleBaseline = {};
    if (Array.isArray(entry.stats) && entry.stats.length === 5) {
      baseline.stats = entry.stats.map((stat) => finiteNumber(stat, 'baseline stat')) as [
        number,
        number,
        number,
        number,
        number
      ];
    }

    if (entry.win !== undefined) {
      baseline.win = finiteNumber(entry.win, 'baseline win');
    }

    if (baseline.stats !== undefined || baseline.win !== undefined) {
      baselines[style] = baseline;
    }
  }

  return Object.keys(baselines).length > 0 ? baselines : undefined;
}

/** Per style, `{skill id: [24 tenths of a win point]}` converted to win points per firing. */
function parseSectionWins(value: unknown): Map<number, number[]> {
  if (!isRecord(value)) return new Map();

  return new Map(
    Object.entries(value).map(([id, raw]) => {
      if (!Array.isArray(raw) || raw.length !== SECTIONS) {
        throw new Error('Skill Explorer data has an invalid section win count.');
      }

      const wins = raw.map((tenths) => finiteNumber(tenths, 'section win points') / 10);
      return [Number(id), wins];
    })
  );
}

function parseRaced(value: unknown): Set<number> {
  if (!Array.isArray(value)) return new Set();

  return new Set(value.map((id) => finiteNumber(id, 'raced skill')));
}

function parseCi95(value: unknown): Map<number, number> {
  if (!isRecord(value)) return new Map();

  return new Map(
    Object.entries(value).map(([id, half]) => [
      Number(id),
      finiteNumber(half, '95% interval half-width')
    ])
  );
}

function attachStyleExtras(
  points: SkillPoint[],
  gated: Map<number, GatedValues>,
  sectionWins: Map<number, number[]>,
  raced: Set<number>,
  ci95: Map<number, number>
): SkillPoint[] {
  if (gated.size === 0 && sectionWins.size === 0 && raced.size === 0 && ci95.size === 0) {
    return points;
  }

  return points.map((point) => {
    const gatedValues = gated.get(point.skillId);
    const wins = sectionWins.get(point.skillId);
    const isRaced = raced.has(point.skillId);
    const interval = ci95.get(point.skillId);
    if (gatedValues === undefined && wins === undefined && !isRaced && interval === undefined) {
      return point;
    }

    return {
      ...point,
      ...(gatedValues !== undefined ? { gated: gatedValues } : {}),
      ...(wins !== undefined ? { sectionWins: wins } : {}),
      ...(isRaced ? { raced: true } : {}),
      ...(interval !== undefined ? { ci95: interval } : {})
    };
  });
}

export function parseScope(value: unknown): ScopeData {
  if (!isRecord(value) || !isRecord(value.styles))
    throw new Error('Skill Explorer data is invalid.');
  const styles = value.styles;
  const gated = isRecord(value.gated) ? value.gated : {};
  const sectionWins = isRecord(value.sectionWins) ? value.sectionWins : {};
  const raced = isRecord(value.raced) ? value.raced : {};
  const ci95 = isRecord(value.ci95) ? value.ci95 : {};
  const byStyle = Object.fromEntries(
    STYLE_KEYS.map((style) => {
      const rows = styles[style];
      const points = Array.isArray(rows) ? rows.map(parseRow) : [];
      return [
        style,
        attachStyleExtras(
          points,
          parseGated(gated[style]),
          parseSectionWins(sectionWins[style]),
          parseRaced(raced[style]),
          parseCi95(ci95[style])
        )
      ];
    })
  ) as Record<(typeof STYLE_KEYS)[number], SkillPoint[]>;

  return {
    courses: finiteNumber(value.courses, 'course count'),
    styles: { ...byStyle, all: averageStyles(Object.values(byStyle)) },
    builds: parseBuilds(value.builds),
    baselines: parseBaselines(value.baselines),
    partners: parsePartners(value.partners),
    margins: parseMargins(value.margins)
  };
}

/** Per style, `{style: margin}`; a selection's checks may not cover every style yet. */
function parseMargins(value: unknown): ScopeData['margins'] {
  if (!isRecord(value)) return {};
  const margins: ScopeData['margins'] = {};
  for (const style of STYLE_KEYS) {
    if (value[style] !== undefined) margins[style] = finiteNumber(value[style], 'margin');
  }

  const known = Object.values(margins);
  if (known.length > 0) margins.all = Math.max(...known);
  return margins;
}

/**
 * Win points, rates and section shares averaged over styles where the skill can fire on at least one course.
 * Impossible styles keep their zero rows without diluting eligible styles; the fire point is weighted by proc rate.
 */
export function averageStyles(styles: SkillPoint[][]): SkillPoint[] {
  const totals = new Map<
    number,
    SkillPoint & {
      firedMean: number;
      eligibleStyles: number;
      forcedTotal?: TimedValue;
      secWinWeighted?: number[];
      secWinWeight?: number[];
      secWinSum?: number[];
      secWinCount: number;
      ci95Sum: number;
      ci95Count: number;
    }
  >();
  for (const points of styles) {
    for (const point of points) {
      let total = totals.get(point.skillId);
      if (total === undefined) {
        total = {
          skillId: point.skillId,
          win: 0,
          winAlone: 0,
          expected: 0,
          rate: 0,
          mean: 0,
          firedMean: 0,
          eligibleStyles: 0,
          courses: 0,
          sections: new Array<number>(SECTIONS).fill(0),
          forced: 0,
          secWinCount: 0,
          ci95Sum: 0,
          ci95Count: 0
        };
        totals.set(point.skillId, total);
      }

      if (point.courses === 0) continue;

      total.eligibleStyles += 1;
      total.win += point.win;
      total.winAlone += point.winAlone;
      total.expected += point.expected;
      total.rate += point.rate;
      total.forced = Math.max(total.forced, point.forced);
      total.firedMean += point.mean * point.rate;
      total.courses = Math.max(total.courses, point.courses);
      if (point.ci95 !== undefined && point.ci95 > 0) {
        total.ci95Sum += point.ci95;
        total.ci95Count += 1;
      }
      if (point.gated) {
        total.forcedTotal ??= { win: 0, expected: 0, rate: 0, mean: 0 };
        const forced = point.gated.forced;
        total.forcedTotal.win += forced.win;
        total.forcedTotal.expected += forced.expected;
        total.forcedTotal.rate += forced.rate;
        total.forcedTotal.mean += forced.mean * forced.rate;
      }

      point.sections.forEach((share, index) => {
        total.sections[index]! += share;
      });

      if (point.sectionWins !== undefined && point.sectionWins.length === SECTIONS) {
        total.secWinWeighted ??= new Array<number>(SECTIONS).fill(0);
        total.secWinWeight ??= new Array<number>(SECTIONS).fill(0);
        total.secWinSum ??= new Array<number>(SECTIONS).fill(0);
        total.secWinCount += 1;
        for (let i = 0; i < SECTIONS; i += 1) {
          const share = point.sections[i]!;
          const win = point.sectionWins[i]!;
          total.secWinWeighted[i]! += share * win;
          total.secWinWeight[i]! += share;
          total.secWinSum[i]! += win;
        }
      }
    }
  }

  return [...totals.values()].map(
    ({
      firedMean,
      eligibleStyles,
      forcedTotal,
      secWinWeighted,
      secWinWeight,
      secWinSum,
      secWinCount,
      ci95Sum,
      ci95Count,
      ...total
    }) => {
      const count = Math.max(1, eligibleStyles);
      const gated: Pick<SkillPoint, 'gated'> = forcedTotal
        ? {
            gated: {
              forced: {
                win: forcedTotal.win / count,
                expected: forcedTotal.expected / count,
                rate: forcedTotal.rate / count,
                mean: forcedTotal.rate > 0 ? forcedTotal.mean / forcedTotal.rate : 0
              }
            }
          }
        : {};
      const sectionWins: Pick<SkillPoint, 'sectionWins'> =
        secWinCount > 0 && secWinWeighted && secWinWeight && secWinSum
          ? {
              sectionWins: secWinWeighted.map((weighted, i) => {
                const weight = secWinWeight[i]!;
                return weight > 0 ? weighted / weight : secWinSum[i]! / secWinCount;
              })
            }
          : {};
      const ci95: Pick<SkillPoint, 'ci95'> =
        ci95Count > 0 ? { ci95: Math.round((ci95Sum / ci95Count) * 100) / 100 } : {};
      return {
        ...total,
        ...gated,
        ...sectionWins,
        ...ci95,
        win: total.win / count,
        winAlone: total.winAlone / count,
        expected: total.expected / count,
        rate: total.rate / count,
        mean: total.rate > 0 ? firedMean / total.rate : 0,
        sections: total.sections.map((share) => share / count)
      };
    }
  );
}

/** A surface, then a length: `turf/medium`. */
function selectionPath(surface: string, distance: string): string {
  const surfacePath = SURFACE_PATHS[surface];
  const distancePath = DISTANCE_PATHS[distance];
  if (surfacePath === undefined || distancePath === undefined)
    throw new Error(
      `The Skill Explorer has no selection for surface ${surface}, length ${distance}.`
    );

  return `${surfacePath}/${distancePath}`;
}

/** The simulator's file for a scope: a surface and length, or a course under its own, like `turf/medium/10808`. */
export function scopePath(scope: ExplorerScope): string {
  switch (scope.kind) {
    case 'group':
      return `${selectionPath(scope.surface, scope.distance)}.json.gz`;
    case 'course': {
      const { course } = scope;
      const selection = selectionPath(String(course.surface), String(course.distanceType));
      return `${selection}/${course.courseId}.json.gz`;
    }
    default: {
      const unknownScope: never = scope;
      throw new Error(`Unknown Skill Explorer scope ${JSON.stringify(unknownScope)}`);
    }
  }
}

interface VersionedIndex {
  index: ExplorerIndex;
  /** The simulator's bundle version, from the index's ETag; empty when none came through. */
  version: string;
}

let indexPromise: Promise<VersionedIndex> | undefined;

/** The bundle version in an ETag such as `"99aa1c99d7485599"` or `W/"99aa1c99d7485599"`. */
export function etagVersion(etag: string | null): string {
  return etag?.replace(/^W\//, '').replace(/"/g, '') ?? '';
}

// The browser keeps the index but asks again on every load (no-cache), getting a 304 while the bundle is unchanged, so
// a new bundle shows once the CDN has it instead of after the hours a browser may otherwise keep its copy.
function loadVersionedIndex(): Promise<VersionedIndex> {
  indexPromise ??= fetch(`${EXPLORER_FILES_URL}/index.json.gz`, {
    credentials: 'omit',
    cache: 'no-cache'
  })
    .then(async (response) => ({
      index: parseIndex(await readJsonResponse<unknown>(response, 'Skill values')),
      version: etagVersion(response.headers.get('etag'))
    }))
    .catch((error: unknown) => {
      indexPromise = undefined;
      throw error;
    });

  return indexPromise;
}

export async function loadExplorerIndex(): Promise<ExplorerIndex> {
  return (await loadVersionedIndex()).index;
}

/**
 * A simulator explorer file under the bundle version, like `…/turf/medium/10808.json.gz?v=99aa1c99d7485599`. Browsers
 * and the CDN may keep it as long as they like: a new bundle changes every URL.
 */
export async function explorerFileUrl(path: string): Promise<string> {
  const { version } = await loadVersionedIndex();
  const url = `${EXPLORER_FILES_URL}/${path}`;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

export async function loadScope(scope: ExplorerScope, signal?: AbortSignal): Promise<ScopeData> {
  return parseScope(
    await fetchJsonResource<unknown>(
      await explorerFileUrl(scopePath(scope)),
      { signal },
      'Skill values for this selection'
    )
  );
}
