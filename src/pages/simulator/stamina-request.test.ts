import { describe, expect, it } from 'vitest';
import {
  MAX_EFFECT_TRIGGERS,
  aptitudeGradeNumber,
  buildStaminaRequest,
  type StaminaForm
} from './stamina-request';

function baseForm(): StaminaForm {
  return {
    courseId: 11103,
    raceInstanceId: 800023,
    seed: 42,
    ground: 1,
    weather: 1,
    season: 1,
    startTimeType: 2,
    stats: { speed: 1200, stamina: 900, power: 1000, guts: 600, wisdom: 800 },
    runningStyle: 'Nige',
    motivation: 3,
    distanceAptitudes: ['S', 'A', 'A', 'A'],
    styleAptitudes: ['A', 'A', 'A', 'A'],
    groundAptitudes: ['A', 'A'],
    fullSpurt: true
  };
}

describe('stamina request', () => {
  it('maps aptitude grades to the simulator scale (8=S … 1=G)', () => {
    expect(aptitudeGradeNumber('S')).toBe(8);
    expect(aptitudeGradeNumber('A')).toBe(7);
    expect(aptitudeGradeNumber('C')).toBe(5);
    expect(aptitudeGradeNumber('G')).toBe(1);
  });

  it('builds the normalized stamina body', () => {
    const body = buildStaminaRequest(baseForm());

    expect(body.course_id).toBe(11103);
    expect(body.setup).toEqual({
      race_instance_id: 800023,
      race_type: 0,
      season: 1,
      weather: 1,
      ground_condition: 1,
      start_time_type: 2
    });
    expect(body.uma.aptitudes).toEqual({
      distance: [8, 7, 7, 7],
      running_style: [7, 7, 7, 7],
      ground: [7, 7]
    });
    expect(body.uma.running_style).toBe('Nige');
    expect(body.full_spurt).toBe(true);
    expect(body.effects).toEqual([]);
    expect(body.states).toEqual([]);
  });

  it('normalizes the seed to an int32', () => {
    expect(buildStaminaRequest({ ...baseForm(), seed: 1.9 }).seed).toBe(1);
    expect(buildStaminaRequest({ ...baseForm(), seed: 2147483648 }).seed).toBe(-2147483648);
  });

  it('accepts a race type and falls back to Champions Meeting for unknown values', () => {
    expect(buildStaminaRequest({ ...baseForm(), raceType: 14 }).setup.race_type).toBe(14);
    expect(buildStaminaRequest({ ...baseForm(), raceType: 99 }).setup.race_type).toBe(0);
  });

  it('normalizes effects and drops rows that cannot trigger', () => {
    const body = buildStaminaRequest({
      ...baseForm(),
      courseDistanceM: 2000,
      effects: [
        { count: 3, hpPercent: 150, startDistanceM: 600, endDistanceM: 1200 },
        { count: 0, hpPercent: 10, startDistanceM: 100 },
        { count: 2, hpPercent: -5, startDistanceM: 2500 },
        { count: 2, hpPercent: 5, startDistanceM: 400, endDistanceM: 400 }
      ]
    });

    expect(body.effects).toEqual([
      { count: 3, hp_percent: 100, start_distance_m: 600, end_distance_m: 1200 },
      { count: 2, hp_percent: 5, start_distance_m: 400 }
    ]);
  });

  it('caps the total effect triggers at the documented limit', () => {
    const body = buildStaminaRequest({
      ...baseForm(),
      effects: Array.from({ length: 3 }, () => ({ count: 600, hpPercent: 1, startDistanceM: 100 }))
    });

    expect(body.effects).toEqual([
      { count: 600, hp_percent: 1, start_distance_m: 100 },
      { count: MAX_EFFECT_TRIGGERS - 600, hp_percent: 1, start_distance_m: 100 }
    ]);
  });

  it('normalizes states and omits false flags and out-of-range additions', () => {
    const body = buildStaminaRequest({
      ...baseForm(),
      states: [
        {
          startDistanceM: 100,
          durationSeconds: 5000,
          spotStruggle: true,
          rushed: false,
          targetSpeedAddMps: 99,
          hpConsumptionMultiplier: 20
        },
        { startDistanceM: 200, durationSeconds: 0 },
        { startDistanceM: -5, durationSeconds: 10 }
      ]
    });

    expect(body.states).toEqual([
      {
        start_distance_m: 100,
        duration_seconds: 1200,
        spot_struggle: true,
        target_speed_add_mps: 30,
        hp_consumption_multiplier: 10
      }
    ]);
    expect(Object.hasOwn(body.states[0] ?? {}, 'rushed')).toBe(false);
  });
});
