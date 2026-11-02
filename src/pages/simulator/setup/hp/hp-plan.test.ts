import { describe, expect, it } from 'vitest';
import {
  createHpPlan,
  effectRates,
  effectTriggers,
  planEvents,
  planStats,
  situationSeconds,
  uniqueRecovery
} from './hp-plan';
import {
  effectiveStamina,
  hpPerStamina,
  neededStamina
} from '../../reports/outcomes/stamina-report';

const course = {
  distance: 2400,
  corners: [
    { start: 600, length: 300 },
    { start: 1500, length: 300 }
  ],
  straights: [
    { start: 0, end: 600 },
    { start: 900, end: 1500 },
    { start: 1950, end: 2400 }
  ],
  slopes: [
    { start: 1000, length: 200, slope: -150 },
    { start: 1600, length: 100, slope: 200 }
  ]
};

describe('HP calculator plan', () => {
  it('places repeated triggers evenly across the spread and all at the start without one', () => {
    expect(
      effectTriggers({ count: 3, hpPercent: 5.5, startDistanceM: 1000, endDistanceM: 1400 })
    ).toEqual([1000, 1200, 1400]);

    expect(effectTriggers({ count: 2, hpPercent: -5, startDistanceM: 600 })).toEqual([600, 600]);
    expect(effectTriggers({ count: 0, hpPercent: 5, startDistanceM: 600 })).toEqual([]);
  });

  it('splits recovery and debuffs before the spurt check from the total', () => {
    const rates = effectRates(
      [
        { count: 1, hpPercent: 5.5, startDistanceM: 1000 },
        { count: 1, hpPercent: -5, startDistanceM: 1800 }
      ],
      1668
    );

    expect(rates.before).toBeCloseTo(0.055);
    expect(rates.total).toBeCloseTo(0.005);
  });

  it('needs less stamina when HP is spare at the spurt check and more when it is short', () => {
    const perPoint = hpPerStamina('Nige', 3),
      stamina = effectiveStamina(544);

    expect(perPoint).toBeCloseTo(0.76);
    expect(neededStamina({ check: 912, need: 771, finalHp: 146 }, stamina, perPoint)).toBeCloseTo(
      544 - 141 / 0.76,
      0
    );

    expect(
      neededStamina({ check: 520, need: 771, finalHp: 0, deficit: 212 }, stamina, perPoint)! > 544
    ).toBe(true);

    expect(neededStamina({ check: 912, need: 771 }, stamina, 0)).toBeUndefined();
  });

  it('lets recovery and debuffs land anywhere in mid race, before the spurt decision', () => {
    const plan = createHpPlan();
    Object.assign(plan.recovery, {
      gold: 2,
      white: 1,
      unique: 1,
      uniquePercent: 5.5,
      uniqueLevel: 3
    });

    plan.debuffs = { gold: 1, white: 2, unique: 0 };

    const { effects, markers } = planEvents(plan, course, 600);
    expect(effects).toEqual([
      { count: 1, hpPercent: 5.72, startDistanceM: 400, endDistanceM: 1600 },
      { count: 2, hpPercent: 5.5, startDistanceM: 400, endDistanceM: 1600 },
      { count: 1, hpPercent: 1.5, startDistanceM: 400, endDistanceM: 1600 },
      { count: 1, hpPercent: -3, startDistanceM: 400, endDistanceM: 1600 },
      { count: 2, hpPercent: -1, startDistanceM: 400, endDistanceM: 1600 }
    ]);

    expect(markers).toEqual([
      {
        kind: 'recovery',
        at: 400,
        length: 1200,
        label: 'Recovery (1 unique, 2 gold, 1 white) in mid race'
      },
      { kind: 'debuff', at: 400, length: 1200, label: 'HP debuffs (1 gold, 2 white) in mid race' }
    ]);

    expect(uniqueRecovery(plan)).toBe(5.72);
  });

  it('starts speed skills anywhere in the spurt, acceleration near its start and the unique on the final straight', () => {
    const plan = createHpPlan();
    plan.speed = { gold: 1, white: 2, unique: 1 };

    plan.accel = { gold: 1, white: 0, unique: 0 };

    const { states, markers } = planEvents(plan, course, 600);
    const speed = states.filter((state) => state.targetSpeedAddMps);
    expect(speed).toHaveLength(4);
    // Durations scale with the race: a white speed skill's 2.4 s base on 2,400 m; each still ends before the finish.
    expect(speed.find((state) => state.targetSpeedAddMps === 0.15)).toEqual({
      startDistanceM: 1600,
      durationSeconds: 5.8,
      startSpreadM: 620,
      targetSpeedAddMps: 0.15
    });

    expect(speed.find((state) => state.durationSeconds === 12)).toMatchObject({
      startDistanceM: 1950,
      startSpreadM: 150
    });

    expect(
      speed.every(
        (state) =>
          state.startDistanceM + (state.startSpreadM ?? 0) + state.durationSeconds * 20 <= 2400
      )
    ).toBe(true);
    expect(states.filter((state) => state.accelerationAddMps2)).toEqual([
      { startDistanceM: 1600, durationSeconds: 7.2, startSpreadM: 60, accelerationAddMps2: 0.4 }
    ]);

    expect(markers.map((marker) => marker.label)).toEqual([
      'Speed (1 gold, 2 white, 1 unique) in the spurt',
      'Acceleration (1 gold) in the spurt'
    ]);
  });

  it('places situations between runners and downhill mode, and rushes her by her wit', () => {
    const plan = createHpPlan();
    plan.positionFight.on = true;
    plan.rushed = { on: true, seconds: 8 };

    plan.duel.on = true;
    plan.downhill = true;
    const { states, markers } = planEvents(plan, course, 900, 1000);
    expect(states).toContainEqual({
      startDistanceM: 150,
      durationSeconds: situationSeconds('positionFight', 900, course),
      spotStruggle: true
    });

    // Rushed in sections 2 to 9 of 24, by wit: about 10.5% of races at 1,000 wit.
    expect(states).toContainEqual({
      startDistanceM: 200,
      durationSeconds: 8,
      rushed: true,
      chance: 0.105,
      startSpreadM: 700
    });

    expect(markers).toContainEqual({
      kind: 'state',
      at: 200,
      length: 700,
      label: 'Rushed in 11% of races, early to mid race'
    });

    expect(states).toContainEqual({ startDistanceM: 1950, durationSeconds: 22.5, dueling: true });
    expect(states).toContainEqual({ startDistanceM: 1000, durationSeconds: 10, downhill: true });
    expect(states.filter((state) => state.downhill)).toHaveLength(1);
    expect(situationSeconds('positionFight', 900, course)).toBeCloseTo(9.5, 1);
  });

  it('adds green skills to the stats', () => {
    const plan = createHpPlan();
    plan.green.stamina = { gold: 1, white: 2 };

    expect(
      planStats({ speed: 1200, stamina: 900, power: 1000, guts: 600, wisdom: 800 }, plan).stamina
    ).toBe(1040);

    // Above 1,200 raw points count half, and the bonus comes on top of that.
    expect(
      planStats({ speed: 1200, stamina: 1400, power: 1000, guts: 600, wisdom: 800 }, plan).stamina
    ).toBe(1680);
  });
});
