import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { MAX_TRACKS, type OptimizeMode } from '../../requests/optimize-request';

/**
 * Team Trials draws each match's course at random from every course of its distance, so a build is searched on that
 * pool: the server deals one course to each race, and the time she gains is averaged over them.
 */
export type TeamTrialsMode = Exclude<OptimizeMode, 'cm'>;

const DISTANCE_TYPE: Record<Exclude<TeamTrialsMode, 'tt_dirt'>, number> = {
  tt_sprint: 1,
  tt_mile: 2,
  tt_medium: 3,
  tt_long: 4
};

/** The JRA's ten racecourses; local and overseas tracks are left out of a pool until picked. */
const isJra = (course: RaceCourse) =>
  course.race_track_id >= 10001 && course.race_track_id <= 10010;

/** Whether Team Trials can draw this course for the mode: turf of its distance, or any dirt course. */
export function fitsTeamTrials(course: RaceCourse, mode: TeamTrialsMode): boolean {
  return mode === 'tt_dirt'
    ? course.surface === 2
    : course.surface === 1 && course.distance_type === DISTANCE_TYPE[mode];
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

/** Why a pool can't be searched, or '' when it can. */
export function poolProblem(pool: ReadonlyArray<RaceCourse>): string {
  if (!pool.length) return 'Pick at least one track for Team Trials.';
  if (pool.length > MAX_TRACKS)
    return 'Pick at most ' + MAX_TRACKS + ' tracks; ' + pool.length + ' are on.';
  return '';
}
