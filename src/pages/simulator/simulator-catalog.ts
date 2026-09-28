/**
 * Simulator master data, published as uma.moe resources.
 *
 * `room_match_races` gives real race names with the course and race-instance ids
 * the simulator wants, so the page can offer "Arima Kinen" instead of a raw
 * course number. `simulator_courses` supplies the course geometry the simulator
 * loads by `course_id`.
 */

import { resourceRepository } from '@/lib/catalog/resource-repository';
import { RACE_TYPES, type RaceType } from './stamina-request';

export interface SimulatorRace {
  name: string;
  short_name: string;
  /** The simulator's `course_id`. */
  course_set_id: number;
  /** The simulator's `setup.race_instance_id`. */
  race_instance_id: number;
  distance: number;
  race_track_id: number;
  course_ground: number;
}

export interface SimulatorCourse {
  course_id: number;
  distance: number;
  distance_type: number;
  surface: number;
  race_track_id: number;
}

export const SURFACE_NAMES: Record<number, string> = { 1: 'Turf', 2: 'Dirt' };
export const DISTANCE_NAMES: Record<number, string> = {
  1: 'Sprint',
  2: 'Mile',
  3: 'Medium',
  4: 'Long'
};

/** Human labels for the simulator's `race_type` values. */
export const RACE_TYPE_LABELS: Record<RaceType, string> = {
  0: 'Champions Meeting',
  5: 'Champions Meeting (alt)',
  6: 'Career',
  7: 'Career (team)',
  8: 'Champions Meeting (win rate)',
  14: 'Team Trials'
};

/** Ready for `SelectField`; keeps the simulator's numeric `race_type` as the option value. */
export const RACE_TYPE_OPTIONS: Array<{ value: string; label: string }> = RACE_TYPES.map((raceType) => ({
  value: String(raceType),
  label: RACE_TYPE_LABELS[raceType]
}));

/** Label for a raw `race_type`, falling back to the number when unknown. */
export function raceTypeLabel(raceType: number): string {
  const match = RACE_TYPES.find((candidate) => candidate === raceType);
  return match === undefined ? `Race type ${raceType}` : RACE_TYPE_LABELS[match];
}

let racesPromise: Promise<Array<SimulatorRace>> | undefined;
let coursesPromise: Promise<Map<number, SimulatorCourse>> | undefined;

/** Every race a room match can run, name-sorted. */
export function loadSimulatorRaces(): Promise<Array<SimulatorRace>> {
  racesPromise ??= resourceRepository
    .load<{ races: Array<SimulatorRace> }>('room_match_races')
    .then((data) =>
      [...data.races].sort(
        (left, right) => left.name.localeCompare(right.name) || left.distance - right.distance
      )
    )
    .catch((error) => {
      racesPromise = undefined;
      throw error;
    });
  return racesPromise;
}

/** Course geometry keyed by `course_id`. */
export function loadSimulatorCourses(): Promise<Map<number, SimulatorCourse>> {
  coursesPromise ??= resourceRepository
    .load<{ courses: Array<SimulatorCourse> }>('simulator_courses')
    .then((data) => new Map(data.courses.map((course) => [course.course_id, course])))
    .catch((error) => {
      coursesPromise = undefined;
      throw error;
    });
  return coursesPromise;
}

/** `2200m · Turf · Medium` for a race, using the course record when it resolves. */
export function describeRace(race: SimulatorRace, course: SimulatorCourse | undefined): string {
  const surface = SURFACE_NAMES[course?.surface ?? race.course_ground] ?? 'Unknown';
  const distanceType = course ? DISTANCE_NAMES[course.distance_type] : undefined;
  return [ `${race.distance}m`, surface, distanceType ].filter(Boolean).join(' · ');
}
