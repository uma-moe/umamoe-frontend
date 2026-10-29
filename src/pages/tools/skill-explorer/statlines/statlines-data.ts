import { fetchJsonResource } from '@/services/resources/json-response';
import { EXPLORER_FILES_URL } from '../skill-explorer-data';
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

/** What past CM winners brought, and the model fitted on it with its held-out errors. */
export interface StatlinesData {
  latestCm: number;
  model: StatlineModel;
  errors: StatErrors;
  past: CmStatline[];
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
  | { kind: 'forecast'; rows: TargetRow[]; margin: Stats };

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

export function parseStatlines(value: unknown): StatlinesData {
  if (!isRecord(value) || !Array.isArray(value.past) || !isRecord(value.errors))
    throw new Error('Skill Explorer statlines are invalid.');
  return {
    latestCm: finiteNumber(value.latestCm, 'latest CM'),
    model: parseModel(value.model),
    errors: {
      model: stats(value.errors.model, 'held-out error'),
      previousCm: stats(value.errors.previousCm, 'baseline error'),
      forecasts: finiteNumber(value.errors.forecasts, 'forecast count')
    },
    past: value.past.map(parsePast)
  };
}

let statlinesPromise: Promise<StatlinesData> | undefined;

export function loadStatlines(): Promise<StatlinesData> {
  statlinesPromise ??= fetchJsonResource<unknown>(
    `${EXPLORER_FILES_URL}/statlines.json.gz`,
    {},
    'Stat lines'
  )
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
  race: { cm?: number; course?: { distance: number; dirt: boolean } }
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

  const { distance, dirt } = race.course;
  const cm = Math.max(race.cm ?? 0, data.latestCm + 1);
  return {
    kind: 'forecast',
    margin: data.errors.model,
    rows: RUNNING_STYLES.map((style) => ({
      style,
      stats: forecastStatline(data.model, { style, distance, dirt, cm })
    }))
  };
}
