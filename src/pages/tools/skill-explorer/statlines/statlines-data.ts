import { fetchJsonResource } from '@/services/resources/json-response';
import { explorerFileUrl } from '../skill-explorer-data';
import { finiteNumber, isRecord, numberList } from '../json-guards';
import {
  RUNNING_STYLES,
  forecastStatline,
  type CmStatline,
  type RunningStyle,
  type StatErrors,
  type StatlineModel,
  type Stats
} from './statline-model';

/** What past CM winners brought, plus precomputed hybrid forecasts (and optional legacy linear model). */
export interface StatlinesData {
  latestCm: number;
  method?: string;
  model?: StatlineModel;
  errors: StatErrors;
  past: CmStatline[];
  forecasts?: Record<string, Partial<Record<RunningStyle, Stats>>>;
}

/** One style's statline to aim for: the value, and either a range or a ± margin. */
export interface TargetRow {
  style: RunningStyle;
  stats: Stats;
  /** Winners' 25th and 75th percentiles, for a past CM. */
  low?: Stats;
  high?: Stats;
}

export type TargetStatlines =
  | { kind: 'winners'; cm: number; rows: TargetRow[] }
  | {
      kind: 'forecast';
      rows: TargetRow[];
      margin: Stats;
      fromCm?: number;
      latestCm?: number;
      method?: string;
    };

function stats(value: unknown, label: string): Stats {
  const list = numberList(value, label);
  if (list.length !== 5) throw new Error(`Skill Explorer data has an invalid ${label}.`);
  return list as Stats;
}

function parsePast(value: unknown): CmStatline {
  if (!isRecord(value)) throw new Error('Skill Explorer statlines have an invalid CM.');
  const style = finiteNumber(value.style, 'statline style');
  if (!RUNNING_STYLES.includes(style as RunningStyle))
    throw new Error('Skill Explorer statlines have an invalid style.');

  return {
    cm: finiteNumber(value.cm, 'statline CM'),
    courseId: finiteNumber(value.courseId, 'statline course'),
    distance: finiteNumber(value.distance, 'statline distance'),
    dirt: value.dirt === true,
    style: style as RunningStyle,
    winners: finiteNumber(value.winners, 'winner count'),
    median: stats(value.median, 'median statline'),
    p25: stats(value.p25, 'statline range'),
    p75: stats(value.p75, 'statline range')
  };
}

function parseModel(value: unknown): StatlineModel {
  if (!isRecord(value) || !Array.isArray(value.stats) || value.stats.length !== 5)
    throw new Error('Skill Explorer statlines have an invalid model.');
  return {
    stats: value.stats.map((fit) => {
      if (!isRecord(fit)) throw new Error('Skill Explorer statlines have an invalid stat fit.');
      return {
        distance: fit.distance === true,
        coefficients: numberList(fit.coefficients, 'stat coefficients')
      };
    })
  };
}

function parseForecasts(
  value: unknown
): Record<string, Partial<Record<RunningStyle, Stats>>> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, Partial<Record<RunningStyle, Stats>>> = {};
  for (const [courseId, byStyle] of Object.entries(value)) {
    if (!isRecord(byStyle)) continue;
    const styles: Partial<Record<RunningStyle, Stats>> = {};
    for (const style of RUNNING_STYLES) {
      const entry = byStyle[String(style)];
      if (entry !== undefined) styles[style] = stats(entry, 'forecast statline');
    }

    out[courseId] = styles;
  }

  return out;
}

export function parseStatlines(value: unknown): StatlinesData {
  if (!isRecord(value) || !Array.isArray(value.past) || !isRecord(value.errors))
    throw new Error('Skill Explorer statlines are invalid.');
  const model = value.model !== undefined ? parseModel(value.model) : undefined;
  const forecasts = parseForecasts(value.forecasts);
  if (model === undefined && forecasts === undefined)
    throw new Error('Skill Explorer statlines have neither forecasts nor model.');
  return {
    latestCm: finiteNumber(value.latestCm, 'latest CM'),
    method: typeof value.method === 'string' ? value.method : undefined,
    model,
    errors: {
      model: stats(value.errors.model, 'held-out error'),
      previousCm: stats(value.errors.previousCm, 'baseline error'),
      forecasts: finiteNumber(value.errors.forecasts, 'forecast count')
    },
    past: value.past.map(parsePast),
    forecasts
  };
}

let statlinesPromise: Promise<StatlinesData> | undefined;

export function loadStatlines(): Promise<StatlinesData> {
  statlinesPromise ??= explorerFileUrl('statlines.json.gz')
    .then((url) => fetchJsonResource<unknown>(url, {}, 'Stat lines'))
    .then(parseStatlines)
    .catch((error: unknown) => {
      statlinesPromise = undefined;
      throw error;
    });

  return statlinesPromise;
}

/**
 * The statline to aim for: what the winners of a past CM brought, or the model's current-era forecast for a course,
 * with its typical held-out miss as the margin. None without a course.
 */
export function targetStatlines(
  data: StatlinesData,
  race: { cm?: number; course?: { courseId?: number; distance: number; dirt: boolean } }
): TargetStatlines | undefined {
  const winners = data.past.filter((statline) => statline.cm === race.cm);
  if (race.cm !== undefined && winners.length > 0) {
    return {
      kind: 'winners',
      cm: race.cm,
      rows: winners
        .map((statline) => ({
          style: statline.style,
          stats: statline.median,
          low: statline.p25,
          high: statline.p75
        }))
        .sort((left, right) => left.style - right.style)
    };
  }

  if (race.course === undefined) return undefined;

  const fromCm =
    data.past.length > 0 ? Math.min(...data.past.map((statline) => statline.cm)) : undefined;
  const precomputed =
    race.course.courseId !== undefined ? data.forecasts?.[String(race.course.courseId)] : undefined;
  if (precomputed !== undefined) {
    const rows: TargetRow[] = RUNNING_STYLES.flatMap((style) => {
      const value = precomputed[style];
      return value !== undefined ? [{ style, stats: value }] : [];
    });
    if (rows.length > 0) {
      return {
        kind: 'forecast',
        margin: data.errors.model,
        fromCm,
        latestCm: data.latestCm,
        method: data.method,
        rows
      };
    }
  }

  if (data.model === undefined) return undefined;

  const { distance, dirt } = race.course;
  const cm = Math.max(race.cm ?? 0, data.latestCm + 1);
  return {
    kind: 'forecast',
    margin: data.errors.model,
    fromCm,
    latestCm: data.latestCm,
    method: data.method,
    rows: RUNNING_STYLES.map((style) => ({
      style,
      stats: forecastStatline(data.model!, { style, distance, dirt, cm })
    }))
  };
}
