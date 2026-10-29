import { trackName, type RaceCourse } from '@/lib/game-data/racing/courses';
import { MAX_TRACKS, type OptimizeMode } from '../../requests/optimize-request';

/**
 * Team Trials draws each match's course at random from every course of its distance, so a build is searched on that
 * pool: the server deals one course to each race, and the time she gains is averaged over them.
 */
export type TeamTrialsMode = Exclude<OptimizeMode, 'cm'>;

/**
 * How often Team Trials draws each distance, in percent of matches, counted from real Team Trials. A mode races only
 * these distances: Dirt, for one, draws no sprint or long dirt course.
 */
export const TEAM_TRIALS_DISTANCE_SHARES: Record<
  TeamTrialsMode,
  Readonly<Record<number, number>>
> = {
  tt_sprint: { 1000: 8, 1200: 54, 1400: 38 },
  tt_mile: { 1500: 5.3, 1600: 36.7, 1800: 58 },
  tt_medium: { 2000: 62.6, 2200: 20, 2300: 4.7, 2400: 12.7 },
  tt_long: { 2500: 18, 2600: 37.3, 3000: 16.7, 3200: 8, 3400: 10.7, 3600: 9.3 },
  tt_dirt: { 1600: 10, 1700: 35.3, 1800: 54.7 }
};

/** The JRA's ten racecourses; local and overseas tracks are left out of a pool until picked. */
const isJra = (course: RaceCourse) =>
  course.race_track_id >= 10001 && course.race_track_id <= 10010;

/** The share of the mode's matches run at `distance`, in percent; undefined where the mode never runs it. */
export function distanceShare(mode: TeamTrialsMode, distance: number): number | undefined {
  return TEAM_TRIALS_DISTANCE_SHARES[mode][distance];
}

/** Whether Team Trials can draw this course for the mode: one of its distances, on turf or for Dirt on dirt. */
export function fitsTeamTrials(course: RaceCourse, mode: TeamTrialsMode): boolean {
  const surface = mode === 'tt_dirt' ? 2 : 1;
  return course.surface === surface && distanceShare(mode, course.distance) !== undefined;
}

/** Every course the mode can draw, by track, then distance. */
export function teamTrialsCourses(
  courseLookup: ReadonlyMap<number, RaceCourse>,
  mode: TeamTrialsMode
): RaceCourse[] {
  return [...courseLookup.values()]
    .filter((course) => fitsTeamTrials(course, mode))
    .sort(
      (a, b) =>
        a.race_track_id - b.race_track_id ||
        a.distance - b.distance ||
        a.course - b.course ||
        a.course_id - b.course_id
    );
}

/** The pool before anything is picked: the JRA's courses of the distance. */
export function defaultPool(courses: ReadonlyArray<RaceCourse>): number[] {
  return courses.filter(isJra).map((course) => course.course_id);
}

/** The courses she races: the picked ones that still fit the mode, or the default pool when none are picked. */
export function teamTrialsPool(
  courseLookup: ReadonlyMap<number, RaceCourse>,
  mode: TeamTrialsMode,
  picked?: ReadonlyArray<number>
): RaceCourse[] {
  const courses = teamTrialsCourses(courseLookup, mode);
  const ids = new Set(picked ?? defaultPool(courses));
  return courses.filter((course) => ids.has(course.course_id));
}

/**
 * How much each pool course counts, by course id: its distance's share split evenly over the pool's courses at that
 * distance. The server deals the courses out evenly and weighs each race by these, so the result follows how often the
 * game draws each distance.
 */
export function poolWeights(
  pool: ReadonlyArray<RaceCourse>,
  mode: TeamTrialsMode
): Map<number, number> {
  const atDistance = new Map<number, number>();
  for (const course of pool)
    atDistance.set(course.distance, (atDistance.get(course.distance) ?? 0) + 1);

  return new Map(
    pool.map((course) => [
      course.course_id,
      (distanceShare(mode, course.distance) ?? 0) / (atDistance.get(course.distance) ?? 1)
    ])
  );
}

/** Why a pool can't be searched, or '' when it can. */
export function poolProblem(pool: ReadonlyArray<RaceCourse>): string {
  if (!pool.length) return 'Pick at least one track for Team Trials.';
  if (pool.length > MAX_TRACKS)
    return 'Pick at most ' + MAX_TRACKS + ' tracks; ' + pool.length + ' are on.';
  return '';
}

export interface CourseGrid {
  tracks: Array<{ trackId: number; name: string }>;
  /** A row per distance, shortest first; each holds a cell per track, empty where the track has no such course. */
  rows: Array<{ distance: number; cells: RaceCourse[][] }>;
}

/** The mode's courses laid out with tracks across and distances down, in the order the courses come. */
export function courseGrid(courses: ReadonlyArray<RaceCourse>): CourseGrid {
  const trackIds = [...new Set(courses.map((course) => course.race_track_id))];
  const distances = [...new Set(courses.map((course) => course.distance))].sort((a, b) => a - b);

  return {
    tracks: trackIds.map((trackId) => ({ trackId, name: trackName(trackId) })),
    rows: distances.map((distance) => ({
      distance,
      cells: trackIds.map((trackId) =>
        courses.filter((course) => course.race_track_id === trackId && course.distance === distance)
      )
    }))
  };
}
