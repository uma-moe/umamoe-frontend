import { fetchJsonResource } from '@/services/resources/json-response';
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
  courses: ExplorerCourse[];
}

/** One skill for one style over a scope. */
export interface SkillPoint {
  skillId: number;
  /** Win points (0–100) it adds to the reference build, and on its own over no skills, by the model. */
  win: number;
  winAlone: number;
  /** Share of races it fires in. */
  rate: number;
  /** Mean first activation, as a share of the race. */
  mean: number;
  /** Courses of the scope it can fire on. */
  courses: number;
  /** Share of races it first fires in each section, summing to `rate`. */
  sections: number[];
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

export function parseIndex(value: unknown): ExplorerIndex {
  if (!isRecord(value) || !Array.isArray(value.courses))
    throw new Error('Skill Explorer index is invalid.');
  return {
    buildSize: finiteNumber(value.buildSize, 'build size'),
    model: parseModel(value.model),
    skills: parseSkillFacts(value.skills),
    courses: value.courses.map(parseCourse)
  };
}

/** A row is [id, win points in build, win points alone, rate, mean, courses, sections in permille of races]. */
function parseRow(value: unknown): SkillPoint {
  if (!Array.isArray(value) || value.length !== 7 || !Array.isArray(value[6]))
    throw new Error('Skill Explorer data has an invalid skill row.');
  const sections = value[6].map((share) => finiteNumber(share, 'section share') / 1000);
  if (sections.length !== SECTIONS)
    throw new Error('Skill Explorer data has an invalid section count.');

  return {
    skillId: finiteNumber(value[0], 'skill id'),
    win: finiteNumber(value[1], 'win points'),
    winAlone: finiteNumber(value[2], 'win points alone'),
    rate: finiteNumber(value[3], 'fire rate'),
    mean: finiteNumber(value[4], 'fire point'),
    courses: finiteNumber(value[5], 'course count'),
    sections
  };
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

export function parseScope(value: unknown): ScopeData {
  if (!isRecord(value) || !isRecord(value.styles))
    throw new Error('Skill Explorer data is invalid.');
  const styles = value.styles;
  const byStyle = Object.fromEntries(
    STYLE_KEYS.map((style) => {
      const rows = styles[style];
      return [style, Array.isArray(rows) ? rows.map(parseRow) : []];
    })
  ) as Record<(typeof STYLE_KEYS)[number], SkillPoint[]>;

  return {
    courses: finiteNumber(value.courses, 'course count'),
    styles: { ...byStyle, all: averageStyles(Object.values(byStyle)) },
    builds: parseBuilds(value.builds),
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
 * Every style averaged as the scope files average courses: win points, rates and section shares over all styles (0
 * where a style cannot fire the skill), the fire point over the races it fired in.
 */
export function averageStyles(styles: SkillPoint[][]): SkillPoint[] {
  const totals = new Map<number, SkillPoint & { firedMean: number }>();
  for (const points of styles) {
    for (const point of points) {
      let total = totals.get(point.skillId);
      if (total === undefined) {
        total = {
          skillId: point.skillId,
          win: 0,
          winAlone: 0,
          rate: 0,
          mean: 0,
          firedMean: 0,
          courses: 0,
          sections: new Array<number>(SECTIONS).fill(0)
        };
        totals.set(point.skillId, total);
      }

      total.win += point.win;
      total.winAlone += point.winAlone;
      total.rate += point.rate;
      total.firedMean += point.mean * point.rate;
      total.courses = Math.max(total.courses, point.courses);
      point.sections.forEach((share, index) => {
        total.sections[index]! += share;
      });
    }
  }

  const count = styles.length;
  return [...totals.values()].map(({ firedMean, ...total }) => ({
    ...total,
    win: total.win / count,
    winAlone: total.winAlone / count,
    rate: total.rate / count,
    mean: total.rate > 0 ? firedMean / total.rate : 0,
    sections: total.sections.map((share) => share / count)
  }));
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

let indexPromise: Promise<ExplorerIndex> | undefined;

export function loadExplorerIndex(): Promise<ExplorerIndex> {
  indexPromise ??= fetchJsonResource<unknown>(`${EXPLORER_FILES_URL}/index.json.gz`)
    .then(parseIndex)
    .catch((error: unknown) => {
      indexPromise = undefined;
      throw error;
    });

  return indexPromise;
}

export async function loadScope(scope: ExplorerScope, signal?: AbortSignal): Promise<ScopeData> {
  return parseScope(
    await fetchJsonResource<unknown>(`${EXPLORER_FILES_URL}/${scopePath(scope)}`, { signal })
  );
}
