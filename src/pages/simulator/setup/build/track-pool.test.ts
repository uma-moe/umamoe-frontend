import { describe, expect, it } from 'vitest';
import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { MAX_TRACKS } from '../../requests/optimize-request';
import { defaultPool, poolProblem, teamTrialsCourses, teamTrialsPool } from './track-pool';

const course = (
  course_id: number,
  race_track_id: number,
  distance: number,
  distance_type: number,
  surface = 1
) =>
  ({
    course_id,
    race_track_id,
    distance,
    distance_type,
    surface,
    turn: 1,
    course: 1
  }) as CourseCatalogEntry;
const catalog = new Map(
  [
    course(10101, 10005, 1200, 1),
    course(10301, 10003, 1000, 1),
    course(10601, 10006, 1600, 2),
    course(10602, 10006, 1400, 1),
    course(10603, 10006, 1600, 2, 2),
    course(20101, 10101, 1200, 1, 2),
    course(20201, 10201, 1000, 1)
  ].map((entry) => [entry.course_id, entry])
);

describe('Team Trials track pool', () => {
  it('takes the turf courses of the distance, or every dirt course', () => {
    expect(teamTrialsCourses(catalog, 'tt_sprint').map((entry) => entry.course_id)).toEqual([
      10301, 10101, 10602, 20201
    ]);
    expect(teamTrialsCourses(catalog, 'tt_mile').map((entry) => entry.course_id)).toEqual([10601]);
    expect(teamTrialsCourses(catalog, 'tt_dirt').map((entry) => entry.course_id)).toEqual([
      10603, 20101
    ]);
  });

  it('starts from the JRA courses and keeps a pick to the courses that fit', () => {
    expect(defaultPool(teamTrialsCourses(catalog, 'tt_sprint'))).toEqual([10301, 10101, 10602]);
    expect(teamTrialsPool(catalog, 'tt_sprint').map((entry) => entry.course_id)).toEqual([
      10301, 10101, 10602
    ]);
    expect(
      teamTrialsPool(catalog, 'tt_sprint', [20201, 10601, 10101]).map((entry) => entry.course_id)
    ).toEqual([10101, 20201]);
    expect(teamTrialsPool(catalog, 'tt_sprint', [])).toEqual([]);
  });

  it('says when a pool is empty or too big to search', () => {
    expect(poolProblem([])).toContain('at least one');
    expect(poolProblem([course(1, 10005, 1200, 1)])).toBe('');
    expect(
      poolProblem(
        Array.from({ length: MAX_TRACKS + 1 }, (_, index) => course(index, 10005, 1200, 1))
      )
    ).toContain('at most 32');
  });
});
