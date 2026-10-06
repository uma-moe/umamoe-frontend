/**
 * The manual trainee every simulator surface edits.
 *
 * Every leaf is a string because `TextField` and `SelectField` bind strings.
 * The converters below are the only place that turns those strings into
 * simulator values; they clamp or default anything out of range, so a request
 * can never carry an invalid stat, grade, style or motivation.
 */

import {
  APTITUDE_GRADES,
  aptitudeGradeNumber,
  type AptitudeGrade,
  type TraineeStats
} from './stamina-request';

export const RUNNING_STYLES = ['Nige', 'Senko', 'Sashi', 'Oikomi', 'Oonige'] as const;
export type RunningStyle = (typeof RUNNING_STYLES)[number];

export const TRAINEE_MIN_STAT = 1;
export const TRAINEE_MAX_STAT = 3000;

export interface Trainee {
  speed: string;
  stamina: string;
  power: string;
  guts: string;
  wisdom: string;
  runningStyle: string;
  motivation: string;
  /** Sprint, Mile, Medium, Long. */
  distanceAptitudes: Array<string>;
  /** Nige, Senko, Sashi, Oikomi. */
  styleAptitudes: Array<string>;
  /** Turf, Dirt. */
  groundAptitudes: Array<string>;
}

export interface TraineeAptitudes {
  distance: Array<number>;
  running_style: Array<number>;
  ground: Array<number>;
}

/** The `uma` block of a simulator request built from a manual trainee. */
export interface TraineeUma {
  stats: TraineeStats;
  running_style: RunningStyle;
  motivation: number;
  aptitudes: TraineeAptitudes;
  single_mode_team_rank: number;
}

/** A fresh trainee matching the simulator page's defaults. */
export function createTrainee(overrides: Partial<Trainee> = {}): Trainee {
  return {
    speed: '1200',
    stamina: '900',
    power: '1000',
    guts: '600',
    wisdom: '800',
    runningStyle: 'Nige',
    motivation: '3',
    distanceAptitudes: ['A', 'A', 'A', 'A'],
    styleAptitudes: ['A', 'A', 'A', 'A'],
    groundAptitudes: ['A', 'A'],
    ...overrides
  };
}

/** Stats as ints clamped to the simulator's 1 … 3000 range. */
export function traineeStats(trainee: Trainee): TraineeStats {
  return {
    speed: statValue(trainee.speed),
    stamina: statValue(trainee.stamina),
    power: statValue(trainee.power),
    guts: statValue(trainee.guts),
    wisdom: statValue(trainee.wisdom)
  };
}

/** Aptitudes on the simulator scale (8=S … 1=G), padded to the expected lengths. */
export function traineeAptitudes(trainee: Trainee): TraineeAptitudes {
  return {
    distance: grades(trainee.distanceAptitudes, 4),
    running_style: grades(trainee.styleAptitudes, 4),
    ground: grades(trainee.groundAptitudes, 2)
  };
}

/** Falls back to Nige when the select holds something the simulator does not know. */
export function traineeRunningStyle(trainee: Trainee): RunningStyle {
  return RUNNING_STYLES.find((style) => style === trainee.runningStyle) ?? 'Nige';
}

/** Motivation as an int clamped to 1 … 5 (3 is neutral). */
export function traineeMotivation(trainee: Trainee): number {
  return clampInt(trainee.motivation, 1, 5, 3);
}

/** Everything a request body needs for its `uma` field. Team rank stays 0. */
export function traineeUma(trainee: Trainee): TraineeUma {
  return {
    stats: traineeStats(trainee),
    running_style: traineeRunningStyle(trainee),
    motivation: traineeMotivation(trainee),
    aptitudes: traineeAptitudes(trainee),
    single_mode_team_rank: 0
  };
}

/**
 * Parses a bound field into an integer, defaulting empty/unparsable input
 * instead of throwing. Svelte binds a number input to a real number, to null
 * when it is cleared, and a select still hands back a string, so accept all
 * three shapes here.
 */
function clampInt(
  value: string | number | null | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function statValue(value: string | number | null | undefined): number {
  return clampInt(value, TRAINEE_MIN_STAT, TRAINEE_MAX_STAT, TRAINEE_MIN_STAT);
}

function gradeFrom(value: string | undefined): AptitudeGrade {
  const grade = APTITUDE_GRADES.find((candidate) => candidate === value);
  return grade ?? 'A';
}

function grades(values: Array<string>, count: number): Array<number> {
  const numbers: Array<number> = [];
  for (let index = 0; index < count; index += 1) {
    numbers.push(aptitudeGradeNumber(gradeFrom(values[index])));
  }
  return numbers;
}
