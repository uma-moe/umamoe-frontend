import { describe, expect, it } from 'vitest';
import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { createSimulatorUma } from '../../simulator-uma';
import { buildRaces, fieldWhere } from './build-races';

const course = (course_id: number, race_track_id: number, distance: number, layout = 1) =>
  ({
    course_id,
    race_track_id,
    distance,
    distance_type: 1,
    surface: 1,
    turn: 2,
    course: layout
  }) as CourseCatalogEntry;
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

describe('Build search races', () => {
  it('races her alone on the CM course, with its race', () => {
    const races = buildRaces({ her, seed: 7, course: course(10506, 10005, 2500), setup: SETUP })!;
    expect(races.scenarios).toHaveLength(1);
    const [only] = races.scenarios;
    expect(only!.runners).toEqual([{ trainee: her.trainee, skills: her.skills, fanCount: 250000 }]);
    expect(only!.setup.raceInstanceId).toBe(800023);
    expect(races.where).toMatch(/^She raced with the pack on Nakayama/);
  });

  it('races her alone on every course of a Team Trials pool, with no race of its own', () => {
    const pool = [
      course(10101, 10005, 1200),
      course(10801, 10008, 1400, 1),
      course(10802, 10008, 1400, 2)
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
    expect(races.where).toContain('3 courses, one drawn per race');
  });

  it('needs a course', () => {
    expect(buildRaces({ her, seed: 7, setup: SETUP })).toBeUndefined();
    expect(buildRaces({ her, seed: 7, pool: [], setup: SETUP })).toBeUndefined();
  });

  it('says which recorded CM her real fields came from', () => {
    const fields = {
      course_id: 10903,
      fields: 32,
      held_out_races: 1000,
      winner_accuracy: 0.37,
      winner_accuracy_without_skills: 0.33
    };
    const [cm, other] = [course(10903, 10009, 1600), course(10506, 10005, 2500)];
    const courses = new Map([cm, other].map((entry) => [entry.course_id, entry]));
    expect(fieldWhere(fields, cm, courses)).toBe(
      'She raced 32 real CM fields from this CM, in place of a runner of her style.'
    );
    expect(fieldWhere(fields, other, courses)).toMatch(
      /^She raced 32 CM fields from Hanshin · .*, the closest CM recorded, in place of a runner of her style\. Their runners were rebuilt for this race: aptitudes, course and weather skills, and stamina for the distance\.$/
    );
  });
});
