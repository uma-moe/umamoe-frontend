import type { AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { runningStyleName } from '@/lib/race/replay/race-display';

/** Game aptitude grades in the order captures number them from 1. */
export const aptitudeGrades: AptitudeGradeValue[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

export interface RaceContext {
  surface?: number;
  distance?: number;
}

/** The one grade of a category that a race applies, with the label of what it was read for. */
export interface RaceAptitude {
  group: 'Distance' | 'Track' | 'Style';
  label?: string;
  grade?: AptitudeGradeValue;
}

type DistanceCategory = 'short' | 'mile' | 'middle' | 'long';

const categoryGradeKeys = [
  'proper_ground_turf',
  'proper_ground_dirt',
  'proper_distance_short',
  'proper_distance_mile',
  'proper_distance_middle',
  'proper_distance_long',
  'proper_running_style_nige',
  'proper_running_style_senko',
  'proper_running_style_sashi',
  'proper_running_style_oikomi'
];

const distanceNames: Record<DistanceCategory, string> = {
  short: 'Sprint',
  mile: 'Mile',
  middle: 'Medium',
  long: 'Long'
};

const surfaceKeys: Record<number, 'turf' | 'dirt'> = { 1: 'turf', 2: 'dirt' };

const styleKeys = ['', 'nige', 'senko', 'sashi', 'oikomi', 'nige'];

function distanceCategory(distance: number | undefined): DistanceCategory | undefined {
  if (!distance) return undefined;
  if (distance <= 1400) return 'short';
  if (distance <= 1800) return 'mile';
  if (distance <= 2400) return 'middle';

  return 'long';
}

/** The runner's distance, track and style grades for one race. */
export function raceAptitudes(runner: RaceRunner, raceContext: RaceContext): RaceAptitude[] {
  const style = runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
  const styleKey = styleKeys[style];
  const surfaceKey =
    raceContext.surface === undefined ? undefined : surfaceKeys[raceContext.surface];
  const distanceKey = distanceCategory(raceContext.distance);

  // Captures without per-category grades, such as the demo races, only carry summary grades.
  const hasCategoryGrades = categoryGradeKeys.some((key) => typeof runner.raw[key] === 'number');

  const grade = (
    key: string | undefined,
    aggregate: string,
    summary: keyof RaceRunner['aptitudes']
  ) => {
    const camel = key?.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const recorded = key ? (runner.raw[key] ?? (camel ? runner.raw[camel] : undefined)) : undefined;
    const fallback = hasCategoryGrades ? undefined : runner.aptitudes[summary];
    const value = Number(recorded ?? runner.raw[aggregate] ?? fallback);

    return aptitudeGrades[value - 1];
  };

  return [
    {
      group: 'Distance',
      label: distanceKey ? distanceNames[distanceKey] : undefined,
      grade: grade(
        distanceKey ? 'proper_distance_' + distanceKey : undefined,
        'apt_distance',
        'distance'
      )
    },
    {
      group: 'Track',
      label: surfaceKey ? (surfaceKey === 'turf' ? 'Turf' : 'Dirt') : undefined,
      grade: grade(surfaceKey ? 'proper_ground_' + surfaceKey : undefined, 'apt_ground', 'surface')
    },
    {
      group: 'Style',
      label: styleKey ? runningStyleName(style, true) : undefined,
      grade: grade(styleKey ? 'proper_running_style_' + styleKey : undefined, 'apt_style', 'style')
    }
  ];
}
