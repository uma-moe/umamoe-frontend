import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { MAX_TRACKS } from '../../requests/optimize-request';
import {
  courseGrid,
  defaultPool,
  poolProblem,
  poolWeights,
  teamTrialsCourses,
  teamTrialsPool
} from './track-pool';

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
  }) as RaceCourse;

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
  it('takes the courses at the distances Team Trials runs, on turf or for Dirt on dirt', () => {
    expect(teamTrialsCourses(catalog, 'tt_sprint').map((entry) => entry.course_id)).toEqual([
      10301, 10101, 10602, 20201
    ]);
    expect(teamTrialsCourses(catalog, 'tt_mile').map((entry) => entry.course_id)).toEqual([10601]);
    // Dirt runs 1,600 to 1,800 m only, so the 1,200 m dirt course is left out.
    expect(teamTrialsCourses(catalog, 'tt_dirt').map((entry) => entry.course_id)).toEqual([10603]);
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

  it('lays the courses out with tracks across and distances down', () => {
    const grid = courseGrid(teamTrialsCourses(catalog, 'tt_sprint'));
    const cellIds = grid.rows.map((row) =>
      row.cells.map((cell) => cell.map((entry) => entry.course_id))
    );

    expect(grid.tracks.map((track) => track.name)).toEqual([
      'Niigata',
      'Nakayama',
      'Tokyo',
      'Longchamp'
    ]);
    expect(grid.rows.map((row) => row.distance)).toEqual([1000, 1200, 1400]);
    expect(cellIds).toEqual([
      [[10301], [], [], [20201]],
      [[], [10101], [], []],
      [[], [], [10602], []]
    ]);
  });

  it('splits each distance share over the pool courses at that distance', () => {
    const pool = teamTrialsCourses(catalog, 'tt_sprint');

    const weights = poolWeights(pool, 'tt_sprint');

    // 1,000 m: 8% over two courses; 1,200 m: 54% on one; 1,400 m: 38% on one.
    expect(Object.fromEntries(weights)).toEqual({ 10301: 4, 20201: 4, 10101: 54, 10602: 38 });
  });
});
