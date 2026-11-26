/**
 * Target statlines for Champions Meetings: what the winners of each running style brought to past CMs, and a small
 * linear model of it that forecasts the statline for any course, past or still to come.
 */
import { predict, ridgeRegression } from '../least-squares';

/** Speed, stamina, power, guts, wit: the order the game and the datasets list them. */
export const STAT_NAMES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'] as const;

export type Stats = [number, number, number, number, number];

/** Running styles as the simulator numbers them: front, pace, late, end. */
export type RunningStyle = 1 | 2 | 3 | 4;

export const RUNNING_STYLES: readonly RunningStyle[] = [1, 2, 3, 4];

/** The first CM of the current stat era, after the cap rose; CM16 sat between the eras. */
export const CURRENT_ERA_FROM = 17;
const TRANSITION_CM = 16;

/** What the winners of one style brought to one CM. */
export interface CmStatline {
  cm: number;
  courseId: number;
  distance: number;
  dirt: boolean;
  style: RunningStyle;
  winners: number;
  median: Stats;
  p25: Stats;
  p75: Stats;
}

/** What the model knows of a race: the course and the stat era it is run in. */
export interface StatlineFeatures {
  style: RunningStyle;
  distance: number;
  dirt: boolean;
  /** The CM's number; later CMs than any trained on are taken as the current era. */
  cm: number;
}

/** One stat's linear fit, and whether it reads the course's distance. */
export interface StatFit {
  distance: boolean;
  coefficients: number[];
}

/** One fit per stat, in `STAT_NAMES` order. */
export interface StatlineModel {
  stats: StatFit[];
}

/** Per stat, whether its fit reads the course's distance. */
export type DistanceTerms = [boolean, boolean, boolean, boolean, boolean];

/** A small ridge keeps a feature the training CMs cannot tell apart (an era held out) at zero. */
const RIDGE = 1e-3;

/**
 * Per style an intercept and, when `distance`, a slope per 1000 m; then dirt, the transition CM and the current era.
 * Slopes per style let stamina rise faster with distance for some styles than others.
 */
export function featureVector(features: StatlineFeatures, distance: boolean): number[] {
  const vector: number[] = [];
  for (const style of RUNNING_STYLES) {
    const isStyle = features.style === style ? 1 : 0;
    vector.push(isStyle);
    if (distance) vector.push(isStyle * (features.distance / 1000 - 2));
  }

  vector.push(
    features.dirt ? 1 : 0,
    features.cm === TRANSITION_CM ? 1 : 0,
    features.cm >= CURRENT_ERA_FROM ? 1 : 0
  );
  return vector;
}

/** Least squares with a light ridge for one stat. */
function fitStat(statlines: CmStatline[], stat: number, distance: boolean): StatFit {
  const width = featureVector({ style: 1, distance: 2000, dirt: false, cm: 1 }, distance).length;
  const observations = statlines.map((statline) => ({
    features: featureVector(statline, distance),
    target: statline.median[stat]!
  }));

  return { distance, coefficients: ridgeRegression(observations, width, RIDGE) };
}

export function fitStatlineModel(statlines: CmStatline[], terms: DistanceTerms): StatlineModel {
  return { stats: terms.map((distance, stat) => fitStat(statlines, stat, distance)) };
}

export function forecastStatline(model: StatlineModel, features: StatlineFeatures): Stats {
  const stats = model.stats.map((fit) =>
    Math.round(predict(fit.coefficients, featureVector(features, fit.distance)))
  );
  return stats as Stats;
}

/** Mean absolute error per stat of forecasts against what the winners brought. */
export interface StatErrors {
  model: Stats;
  /** Forecasting each CM as a copy of the previous one, the baseline to beat. */
  previousCm: Stats;
  /** CMs × styles the errors average. */
  forecasts: number;
}

/**
 * Each CM forecast by a model fitted on every other CM. A CM with no earlier CM for the same style has no baseline and
 * is left out of both averages, so they compare like with like.
 */
export function leaveOneCmOut(statlines: CmStatline[], terms: DistanceTerms): StatErrors {
  const cms = [...new Set(statlines.map((statline) => statline.cm))].sort((a, b) => a - b);
  const modelTotals = [0, 0, 0, 0, 0];
  const previousTotals = [0, 0, 0, 0, 0];
  let forecasts = 0;

  for (const cm of cms) {
    const previousCm = cms.filter((other) => other < cm).at(-1);
    if (previousCm === undefined) continue;

    const model = fitStatlineModel(
      statlines.filter((statline) => statline.cm !== cm),
      terms
    );
    for (const actual of statlines.filter((statline) => statline.cm === cm)) {
      const previous = statlines.find(
        (statline) => statline.cm === previousCm && statline.style === actual.style
      );
      if (previous === undefined) continue;

      const forecast = forecastStatline(model, actual);
      for (let stat = 0; stat < STAT_NAMES.length; stat++) {
        modelTotals[stat]! += Math.abs(forecast[stat]! - actual.median[stat]!);
        previousTotals[stat]! += Math.abs(previous.median[stat]! - actual.median[stat]!);
      }

      forecasts += 1;
    }
  }

  const mean = (totals: number[]) =>
    totals.map((total) => Math.round(total / Math.max(1, forecasts))) as Stats;
  return { model: mean(modelTotals), previousCm: mean(previousTotals), forecasts };
}

/** Per stat, distance terms only where they make held-out forecasts err less: guts and wit need not follow distance. */
export function chooseDistanceTerms(statlines: CmStatline[]): DistanceTerms {
  const withDistance = leaveOneCmOut(statlines, [true, true, true, true, true]).model;
  const withoutDistance = leaveOneCmOut(statlines, [false, false, false, false, false]).model;
  return withDistance.map((error, stat) => error < withoutDistance[stat]!) as DistanceTerms;
}
