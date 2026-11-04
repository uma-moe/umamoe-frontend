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
  it('asks for a CM field with the selected race settings', () => {
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
});
