import { describe, expect, it } from 'vitest';
import { buildFieldRequest } from './field-request';

const setup = {
  raceInstanceId: 800023,
  raceType: 0,
  season: 4,
  weather: 2,
  ground: 2,
  startTimeType: 2
};

describe('field request', () => {
  it('asks for a CM field with the mode default when nothing overrides it', () => {
    const body = buildFieldRequest({ courseId: 10506, seed: 42, setup });

    expect(body).toEqual({
      course_id: 10506,
      seed: 42,
      setup: {
        race_instance_id: 800023,
        race_type: 0,
        season: 4,
        weather: 2,
        ground_condition: 2,
        start_time_type: 2
      },
      mode: 'cm'
    });
  });

  it('keeps API-only layout and SP overrides when they are usable', () => {
    const body = buildFieldRequest({
      courseId: 10506,
      seed: 42,
      setup,
      mode: 'tt_mile',
      layout: { teams: 3, team_size: 2, mobs: 6, mob_team_size: 3 },
      spBudget: 1000
    });

    expect(body.mode).toBe('tt_mile');
    expect(body.layout).toEqual({ teams: 3, team_size: 2, mobs: 6, mob_team_size: 3 });
    expect(body.sp_budget).toBe(1000);
  });

  it('drops unusable layout fields and a zero budget', () => {
    const body = buildFieldRequest({
      courseId: 10506,
      seed: 42,
      setup,
      layout: { teams: 0, team_size: 2.4, mobs: -1 },
      spBudget: 0
    });

    expect(body.layout).toEqual({ team_size: 2 });
    expect(body.sp_budget).toBeUndefined();
  });
});
