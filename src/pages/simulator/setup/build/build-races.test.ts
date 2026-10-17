import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { createSimulatorUma } from '../../simulator-uma';
import { buildRaces, fieldWhere } from './build-races';

const course = (fields: Partial<RaceCourse> & Pick<RaceCourse, 'course_id' | 'race_track_id'>) =>
  ({
    distance: 1600,
    distance_type: 2,
    surface: 1,
    turn: 1,
    course: 1,
    ...fields
  }) as RaceCourse;

const SETUP = {
  raceInstanceId: 800023,
  raceType: 0,
  season: 1,
  weather: 1,
  ground: 1,
  startTimeType: 2
};

const her = {
  ...createSimulatorUma('Her'),
  fanCount: 250000,
  skills: [{ skillId: 200362, level: 1 }]
};

// The CMs the simulator has fields for, and courses she might run.
const HANSHIN_MILE = course({ course_id: 10903, race_track_id: 10009 });
const NAKAYAMA_LONG = course({
  course_id: 10506,
  race_track_id: 10005,
  distance: 2500,
  distance_type: 4
});

const COURSES = new Map([HANSHIN_MILE, NAKAYAMA_LONG].map((entry) => [entry.course_id, entry]));

const fieldsFrom = (course_id: number) => ({
  course_id,
  fields: 64,
  held_out_races: 1000,
  winner_accuracy: 0.37,
  winner_accuracy_without_skills: 0.33
});

describe('Build search races', () => {
  it('races her alone on the CM course, with its race', () => {
    const races = buildRaces({ her, seed: 7, course: NAKAYAMA_LONG, setup: SETUP })!;
    expect(races.scenarios).toHaveLength(1);
    const [only] = races.scenarios;
    expect(only!.runners).toEqual([{ trainee: her.trainee, skills: her.skills, fanCount: 250000 }]);
    expect(only!.setup.raceInstanceId).toBe(800023);
    expect(races.where).toEqual([
      'She raced on Nakayama Turf 2500m (Long) Right against the simulator’s own pack of eight runners without skills.',
      'The pack is the same in every race, so the result measures only her own time.'
    ]);
  });

  it('races her alone on every course of a Team Trials pool, with no race of its own', () => {
    const pool = [
      course({ course_id: 10101, race_track_id: 10005, distance: 1200, distance_type: 1 }),
      course({ course_id: 10801, race_track_id: 10008, distance: 1400, course: 1 }),
      course({ course_id: 10802, race_track_id: 10008, distance: 1400, course: 2 })
    ];

    const races = buildRaces({
      her,
      seed: 7,
      pool,
      setup: { ...SETUP, raceType: 14 }
    })!;

    expect(races.scenarios.map((scenario) => scenario.courseId)).toEqual([10101, 10801, 10802]);
    expect(new Set(races.scenarios.map((scenario) => scenario.name)).size).toBe(3);
    expect(races.scenarios.every((scenario) => scenario.runners.length === 1)).toBe(true);
    expect(races.scenarios.every((scenario) => scenario.setup.raceInstanceId === 0)).toBe(true);
    expect(races.scenarios.every((scenario) => scenario.setup.raceType === 14)).toBe(true);
    expect(races.course.course_id).toBe(10101);
    expect(races.where[0]).toContain('3 Team Trials courses, one drawn per race');
  });

  it('needs a course', () => {
    expect(buildRaces({ her, seed: 7, setup: SETUP })).toBeUndefined();
    expect(buildRaces({ her, seed: 7, pool: [], setup: SETUP })).toBeUndefined();
  });
});

describe('Build search CM fields', () => {
  it('says she raced the CM races recorded on her own course', () => {
    const where = fieldWhere(fieldsFrom(10903), HANSHIN_MILE, COURSES);

    expect(where).toEqual([
      'She raced in 64 races recorded at this CM, each time in place of a runner of her running style.'
    ]);
  });

  it('names the course an older simulator took her opponents from', () => {
    const where = fieldWhere(fieldsFrom(10903), NAKAYAMA_LONG, COURSES);

    expect(where).toEqual([
      'Her opponents came from 64 races of the CM on Hanshin Turf 1600m (Mile) Right.'
    ]);
  });

  it('still names a CM course missing from the course data', () => {
    const where = fieldWhere(fieldsFrom(12345), NAKAYAMA_LONG, COURSES);

    expect(where).toEqual(['Her opponents came from 64 races of the CM on course 12345.']);
  });
});
