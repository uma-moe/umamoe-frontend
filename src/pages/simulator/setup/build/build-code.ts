import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { MAX_TRACKS, OPTIMIZE_MODES, type OptimizeMode } from '../../requests/optimize-request';
import { APTITUDE_GRADES } from '../../requests/stamina-request';
import { createSimulatorUma, type SimulatorUma } from '../../simulator-uma';
import { MAX_HINT, type SkillOffer } from './skill-offers';
import { createTrainee, RUNNING_STYLES } from '../trainee';

/**
 * Build codes: a runner, her race and what she can buy, as gzipped JSON in base64. The JSON mirrors the umalator's
 * page state (same field names, enums and ranges) and adds what Build search needs beyond it: skill points, fans,
 * Fast Learner, the goal and the Team Trials tracks. `contracts/build-code.schema.json` is the full description.
 */
export interface BuildCodeRunner {
  outfitId?: string;
  starCount?: number;
  speed?: number;
  stamina?: number;
  power?: number;
  guts?: number;
  wisdom?: number;
  /** Nige, Senkou, Sasi, Oikomi or Oonige. */
  strategy?: string;
  /** Her aptitudes on the code's course, which win over the grid. */
  distanceAptitude?: string;
  surfaceAptitude?: string;
  strategyAptitude?: string;
  /** Short, mile, medium, long; nige, senkou, sasi, oikomi; turf, dirt. */
  aptitudes?: string[];
  skills?: string[];
  uniqueLv?: number;
  /** −2 (awful) to 2 (great). */
  mood?: number;
  popularity?: number;
  /** Skill points left to spend. */
  sp?: number;
  fans?: number;
  fastLearner?: boolean;
}

export interface BuildCodeRace {
  ground?: number;
  weather?: number;
  season?: number;
  time?: number;
  grade?: number;
}

/** Read by nothing now that Build search scores time gained; kept so older codes still parse. */
export interface BuildCodeScoring {
  selfEvaluate?: number;
  opponentEvaluate?: number;
  supportCardBonus?: number;
  winsBefore?: number;
}

export interface BuildCode {
  version?: number;
  courseId?: number;
  racedef?: BuildCodeRace;
  seed?: number;
  mode?: string;
  /** Read by nothing now that Build search races her alone; kept so older codes still parse. */
  opponents?: string;
  cmSnapshot?: string;
  /** The Team Trials pool: course ids, one drawn per race. Absent means the JRA courses of the distance. */
  tracks?: number[];
  scoring?: BuildCodeScoring;
  uma1?: BuildCodeRunner;
  uma2?: BuildCodeRunner;
  /** The skills on offer. */
  chartSkills?: string[];
  hintLevels?: Record<string, number>;
}

export const BUILD_CODE_VERSION = 1;

/** Whether pasted text looks like a build code, so a paste can open the import. */
export function looksLikeBuildCode(text: string): boolean {
  return /^H4sI[A-Za-z0-9+/=%_-]{40,}$/.test(text.trim());
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const CUT = 'The code is cut off or changed. Copy it again.';

/** Reads a build code, or the JSON inside one. Throws an error that says what is wrong with it. */
export async function decodeBuildCode(text: string): Promise<BuildCode> {
  const value = text.trim();
  if (!value) throw new Error('Paste a build code.');
  let json: string;
  if (value.startsWith('{')) json = value;
  else {
    if (/^https?:\/\//i.test(value) || value.includes('#'))
      throw new Error('Paste the build code itself, not a link.');
    let base64 = value.replace(/\s+/g, '');
    if (base64.includes('%')) {
      try {
        base64 = decodeURIComponent(base64);
      } catch {
        throw new Error(CUT);
      }
    }
    if (!/^[A-Za-z0-9+/=_-]+$/.test(base64) || !base64.startsWith('H4sI'))
      throw new Error('This isn’t a build code. It starts with H4sI.');
    try {
      const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
      const stream = new Response(
        Uint8Array.from(binary, (char) => char.charCodeAt(0))
      ).body!.pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    } catch {
      throw new Error(CUT);
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(CUT);
  }
  const data = record(parsed);
  if (!data || !record(data.uma1)) throw new Error('This code has no runner in it.');
  if (Number(data.version) > BUILD_CODE_VERSION)
    throw new Error('This code is from a newer version. Reload the page and try again.');
  return data as BuildCode;
}

/** Writes a build code: the JSON, gzipped, in base64. */
export async function encodeBuildCode(code: BuildCode): Promise<string> {
  const stream = new Response(JSON.stringify(code)).body!.pipeThrough(
    new CompressionStream('gzip')
  );
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** Code strategies to the simulator's running styles and back; Oonige runs on the Nige aptitude. */
const STYLES: Record<string, (typeof RUNNING_STYLES)[number]> = {
  Nige: 'Nige',
  Senkou: 'Senko',
  Sasi: 'Sashi',
  Oikomi: 'Oikomi',
  Oonige: 'Oonige'
};
const STRATEGIES = Object.fromEntries(Object.entries(STYLES).map(([code, style]) => [style, code]));
const STYLE_APTITUDE: Record<string, number> = {
  Nige: 0,
  Senko: 1,
  Sashi: 2,
  Oikomi: 3,
  Oonige: 0
};

const grade = (value: unknown) =>
  APTITUDE_GRADES.find((item) => item === String(value ?? '').toUpperCase());
const stat = (value: unknown, fallback: string) =>
  Number.isFinite(Number(value)) && Number(value) > 0
    ? String(Math.min(3000, Math.round(Number(value))))
    : fallback;
const count = (value: unknown) =>
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : undefined;
/** A whole positive number, as skill and card ids are. */
const id = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};
/** Character uniques are 1xxxxx; inherited ones (9xxxxx) and the rest are bought skills. */
const isUnique = (skill: number) => skill >= 100000 && skill < 200000;

/**
 * A runner from a code. Her full aptitude grid comes first; the aptitudes for the code's course then fill that
 * course's entries.
 */
export function buildCodeUma(
  runner: BuildCodeRunner,
  options: { name?: string; course?: CourseCatalogEntry; knownSkill?: (id: number) => boolean } = {}
): { uma: SimulatorUma; dropped: number } {
  const defaults = createTrainee();
  const style = STYLES[runner.strategy ?? ''] ?? defaults.runningStyle;
  const grid = (runner.aptitudes ?? []).map(grade);
  const trainee = createTrainee({
    speed: stat(runner.speed, defaults.speed),
    stamina: stat(runner.stamina, defaults.stamina),
    power: stat(runner.power, defaults.power),
    guts: stat(runner.guts, defaults.guts),
    wisdom: stat(runner.wisdom, defaults.wisdom),
    runningStyle: style,
    motivation: String(Math.min(5, Math.max(1, Math.round(Number(runner.mood ?? 2)) + 3))),
    distanceAptitudes: [0, 1, 2, 3].map((index) => grid[index] ?? 'A'),
    styleAptitudes: [4, 5, 6, 7].map((index) => grid[index] ?? 'A'),
    groundAptitudes: [8, 9].map((index) => grid[index] ?? 'A')
  });
  const course = options.course;
  const distance = grade(runner.distanceAptitude),
    surface = grade(runner.surfaceAptitude),
    strategy = grade(runner.strategyAptitude);
  if (distance && course) trainee.distanceAptitudes[course.distance_type - 1] = distance;
  if (surface && course) trainee.groundAptitudes[course.surface - 1] = surface;
  if (strategy) trainee.styleAptitudes[STYLE_APTITUDE[style] ?? 0] = strategy;
  const ids = [...new Set((runner.skills ?? []).map(id))].filter(
    (skill): skill is number => skill !== undefined
  );
  const known = ids.filter((skill) => options.knownSkill?.(skill) ?? true);
  const uniqueLevel = Math.min(6, Math.max(1, Math.round(Number(runner.uniqueLv ?? 1))));
  return {
    uma: {
      ...createSimulatorUma(options.name ?? 'Imported runner'),
      cardId: id(runner.outfitId),
      fanCount: count(runner.fans),
      source: 'Build code',
      trainee,
      skills: known.map((skill) => ({ skillId: skill, level: isUnique(skill) ? uniqueLevel : 1 }))
    },
    dropped: ids.length - known.length
  };
}

/** A code runner from a simulator runner: everything the code carries about her. */
export function buildCodeRunner(
  uma: SimulatorUma,
  course?: CourseCatalogEntry,
  extra: Pick<BuildCodeRunner, 'sp' | 'fastLearner'> = {}
): BuildCodeRunner {
  const trainee = uma.trainee;
  const style = STYLE_APTITUDE[trainee.runningStyle] ?? 0;
  const unique = uma.skills.find((skill) => isUnique(skill.skillId));
  const number = (value: string) => Math.round(Number(value)) || 1;
  return {
    outfitId: uma.cardId ? String(uma.cardId) : '',
    speed: number(trainee.speed),
    stamina: number(trainee.stamina),
    power: number(trainee.power),
    guts: number(trainee.guts),
    wisdom: number(trainee.wisdom),
    strategy: STRATEGIES[trainee.runningStyle] ?? 'Nige',
    ...(course
      ? {
          distanceAptitude: trainee.distanceAptitudes[course.distance_type - 1] ?? 'A',
          surfaceAptitude: trainee.groundAptitudes[course.surface - 1] ?? 'A'
        }
      : {}),
    strategyAptitude: trainee.styleAptitudes[style] ?? 'A',
    aptitudes: [
      ...trainee.distanceAptitudes,
      ...trainee.styleAptitudes,
      ...trainee.groundAptitudes
    ],
    skills: uma.skills.map((skill) => String(skill.skillId)),
    uniqueLv: unique?.level ?? 1,
    mood: Math.min(2, Math.max(-2, (Number(trainee.motivation) || 3) - 3)),
    ...(uma.fanCount !== undefined ? { fans: uma.fanCount } : {}),
    ...extra
  };
}

/** Whether a code's two runners are the same build, as when only one was set up. */
export function sameRunner(a?: BuildCodeRunner, b?: BuildCodeRunner): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * A code's race conditions, as the simulator's setup values. Cherry blossom is spring; a time of day the simulator's
 * picker does not offer is left as it is.
 */
export function buildCodeConditions(race: BuildCodeRace = {}): {
  ground?: string;
  weather?: string;
  season?: string;
  startTime?: string;
} {
  const pick = (value: unknown, allowed: number[]) =>
    allowed.includes(Number(value)) ? String(Number(value)) : undefined;
  return {
    ground: pick(race.ground, [1, 2, 3, 4]),
    weather: pick(race.weather, [1, 2, 3, 4]),
    season: Number(race.season) === 5 ? '1' : pick(race.season, [1, 2, 3, 4]),
    startTime: pick(race.time, [2, 3, 4])
  };
}

/**
 * A code's skills on offer with their hint levels. Skills she already has and character uniques are left out, since
 * neither can be bought.
 */
export function buildCodeOffers(
  code: BuildCode,
  owned: number[],
  knownSkill: (id: number) => boolean = () => true
): SkillOffer[] {
  const hints = record(code.hintLevels) ?? {};
  const offers: SkillOffer[] = [];
  for (const value of code.chartSkills ?? []) {
    const skill = id(value);
    if (!skill || isUnique(skill) || owned.includes(skill) || !knownSkill(skill)) continue;
    if (offers.some((offer) => offer.skillId === skill)) continue;
    const hint = Math.round(Number(hints[String(skill)] ?? 0));
    offers.push({
      skillId: skill,
      hint: Number.isFinite(hint) ? Math.min(MAX_HINT, Math.max(0, hint)) : 0
    });
  }
  return offers;
}

/** What Build search takes from a code beyond the runner and her offers. */
export function buildCodeGoal(code: BuildCode): {
  sp?: number;
  fastLearner?: boolean;
  mode?: OptimizeMode;
  tracks?: number[];
  seed?: number;
} {
  const seed = Number(code.seed);
  const tracks = Array.isArray(code.tracks)
    ? [
        ...new Set(
          code.tracks.map(Number).filter((course) => Number.isInteger(course) && course > 0)
        )
      ].slice(0, MAX_TRACKS)
    : undefined;
  return {
    sp: count(code.uma1?.sp),
    fastLearner: typeof code.uma1?.fastLearner === 'boolean' ? code.uma1.fastLearner : undefined,
    mode: OPTIMIZE_MODES.find((mode) => mode === code.mode),
    tracks: tracks?.length ? tracks : undefined,
    seed: Number.isInteger(seed) && Math.abs(seed) <= 2147483647 ? seed : undefined
  };
}
