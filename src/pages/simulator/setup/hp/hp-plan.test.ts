import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import {
  addSkillCount,
  classifySkill,
  countSkills,
  createHpPlan,
  skillCountLabel,
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
        label: 'Recovery: 1 unique, 2 gold, 1 white, in mid race'
      },
      { kind: 'debuff', at: 400, length: 1200, label: 'HP debuffs: 1 gold, 2 white, in mid race' }
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
      'Speed: 1 gold, 2 white, 1 unique, in the spurt',
      'Acceleration: 1 gold, in the spurt'
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

  it('counts learned skills by what their catalog effect does', () => {
    const catalog = new Map(
      [
        {
          skill_id: 200351,
          name: 'Swinging Maestro',
          rarity: 2,
          effect: 'Stamina Recovery (0.055)'
        },
        {
          skill_id: 200352,
          name: 'Corner Recovery ○',
          rarity: 1,
          effect: 'Stamina Recovery (0.015)'
        },
        { skill_id: 100231, name: 'Unique heal', rarity: 3, effect: 'Stamina Recovery (0.035)' },
        {
          skill_id: 200362,
          name: 'Straightaway Adept',
          rarity: 1,
          effect: 'Increase Target Speed (0.15)'
        },
        {
          skill_id: 100011,
          name: 'Shooting Star',
          rarity: 3,
          effect: 'Increase Target Speed (0.35)'
        },
        {
          skill_id: 201601,
          name: 'Groundwork',
          rarity: 1,
          effect: 'Increase Acceleration (0.2)',
          conditions: 'activate_count_start>=3'
        },
        {
          skill_id: 202711,
          name: 'Check',
          rarity: 2,
          effect: 'Increase Acceleration (0.4)',
          conditions: 'phase>=2'
        },
        {
          skill_id: 200011,
          name: 'Right-Handed ◎',
          rarity: 1,
          effect: 'Speed Stat Up (60)',
          conditions: 'rotation==1'
        },
        {
          skill_id: 200022,
          name: 'Left-Handed ○',
          rarity: 1,
          effect: 'Speed Stat Up (40)',
          conditions: 'rotation==2'
        },
        {
          skill_id: 200132,
          name: 'Standard Distance ○',
          rarity: 1,
          effect: 'Stamina Stat Up (40)',
          conditions: 'is_basis_distance==1'
        }
      ].map((entry) => [entry.skill_id, normalizeSkill(entry)])
    );

    const counts = countSkills(
      [200351, 200352, 200362, 100011, 201601, 202711, 200011, 200022, 200132]
        .map((skillId) => ({ skillId, level: 1 }))
        .concat({ skillId: 100231, level: 4 }),
      catalog,
      { distance: 2400, turn: 1 }
    );

    expect(counts.recovery).toMatchObject({
      gold: 1,
      white: 1,
      unique: 1,
      uniquePercent: 3.5,
      uniqueLevel: 4
    });

    expect(counts.speed).toEqual({ gold: 0, white: 1, unique: 1 });
    expect(counts.accel).toEqual({ gold: 1, white: 0, unique: 0 });
    expect(counts.green.speed).toEqual({ gold: 1, white: 0 });
    expect(counts.green.stamina).toEqual({ gold: 0, white: 1 });
  });

  it('adds a skill to the counter it belongs to', () => {
    const catalog = new Map(
      [
        {
          skill_id: 200351,
          name: 'Swinging Maestro',
          rarity: 2,
          effect: 'Stamina Recovery (0.055)'
        },
        {
          skill_id: 100231,
          name: 'Unique heal',
          rarity: 3,
          effect: 'Stamina Recovery (0.055)',
          unique: true
        },
        {
          skill_id: 100011,
          name: 'Shooting Star',
          rarity: 3,
          effect: 'Increase Target Speed (0.35)',
          unique: true
        },
        {
          skill_id: 201601,
          name: 'Groundwork',
          rarity: 1,
          effect: 'Increase Acceleration (0.2)',
          conditions: 'activate_count_start>=3'
        },
        {
          skill_id: 200022,
          name: 'Left-Handed ○',
          rarity: 1,
          effect: 'Speed Stat Up (40)',
          conditions: 'rotation==2'
        },
        { skill_id: 200432, name: 'Focus', rarity: 1, effect: 'Improve Start Reaction Time (0.9)' }
      ].map((entry) => [entry.skill_id, normalizeSkill(entry)])
    );

    const plan = createHpPlan();
    const heal = classifySkill(catalog.get(100231)!)!;
    expect(skillCountLabel(heal)).toBe('Unique recovery');
    expect(addSkillCount(plan, heal)).toBe(true);
    expect(plan.recovery).toMatchObject({ unique: 1, uniquePercent: 5.5, uniqueLevel: 1 });
    expect(skillCountLabel(classifySkill(catalog.get(100011)!, true)!)).toBe('White speed');
    const green = classifySkill(catalog.get(200022)!)!;
    expect(skillCountLabel(green)).toBe('Speed ○');
    addSkillCount(plan, green);
    expect(plan.green.speed).toEqual({ gold: 0, white: 1 });
    expect(classifySkill(catalog.get(201601)!)).toMatchObject({ kind: 'accel', early: true });
    // Two uniques at most.
    expect(addSkillCount(plan, heal)).toBe(true);
    expect(addSkillCount(plan, heal)).toBe(false);
    expect(plan.recovery.unique).toBe(2);
  });

  it('tells what a skill does from its icon and description when the catalog has no effect values', () => {
    const entry = (
      skill_id: number,
      name: string,
      rarity: number,
      icon: string,
      description: string,
      extra = {}
    ) =>
      normalizeSkill({
        skill_id,
        name,
        rarity,
        icon: 'utx_ico_skill_' + icon + '.webp',
        description,
        ...extra
      });

    const catalog = new Map(
      [
        entry(
          200351,
          'Swinging Maestro',
          2,
          '20022',
          'Recover endurance on a corner with efficient turning.'
        ),
        entry(200352, 'Corner Recovery ○', 1, '20021', 'Slightly recover endurance on a corner.'),
        entry(200353, 'Corner Recovery ×', 1, '20024', 'Slightly decrease endurance on a corner.'),
        entry(
          100231,
          'Pure Heart',
          4,
          '20023',
          'Greatly recover endurance when well-positioned mid-race.',
          { unique: true }
        ),
        entry(
          200362,
          'Straightaway Adept',
          1,
          '20011',
          'Slightly increase velocity on a straight.'
        ),
        entry(201601, 'Groundwork', 1, '20041', 'Slightly increase acceleration out of the gate.', {
          conditions: 'activate_count_start>=3'
        }),
        entry(
          200011,
          'Right-Handed ◎',
          1,
          '10011',
          'Increase performance on right-handed tracks.',
          { conditions: 'rotation==1' }
        ),
        entry(
          200012,
          'Right-Handed ○',
          1,
          '10011',
          'Moderately increase performance on right-handed tracks.',
          { conditions: 'rotation==1' }
        ),
        entry(
          200531,
          'Front Runner Savvy ◎',
          1,
          '10051',
          'Increase ability to get into a good position.'
        ),
        entry(
          900101,
          'Engines LIT!',
          1,
          '10011',
          'Very slightly increase velocity continuously for an extremely long time.'
        ),
        entry(
          900102,
          'Blinding Magia',
          1,
          '10011',
          'Increase navigation and moderately surge ahead late-race.'
        ),
        entry(
          900103,
          'Umadol★Onstage!',
          1,
          '10011',
          'Greatly increase navigation for a medium duration early-race.'
        ),
        entry(
          900104,
          'Carnival Bonus',
          1,
          '10011',
          'Increase attributes by +{0}％ in the Racing Carnival.'
        ),
        entry(
          900105,
          'Restraint',
          1,
          '10051',
          'Increase Wit and moderately decrease the chance of being Rushed.'
        )
      ].map((skill) => [skill.skill_id, skill])
    );

    const label = (id: number) => {
      const count = classifySkill(catalog.get(id)!);
      return count && skillCountLabel(count);
    };

    expect(label(200351)).toBe('Gold recovery');
    expect(label(200352)).toBe('White recovery');
    expect(label(200353)).toBeUndefined();
    expect(classifySkill(catalog.get(100231)!)).toMatchObject({
      kind: 'recovery',
      tier: 'unique',
      value: 0.055
    });

    expect(label(200362)).toBe('White speed');
    expect(classifySkill(catalog.get(201601)!)).toMatchObject({ kind: 'accel', early: true });
    expect(label(200011)).toBe('Speed ◎');
    expect(label(200012)).toBe('Speed ○');
    expect(label(200531)).toBe('Wit ◎');
    // An inherited unique on a stat icon is still what its description says.
    expect(label(900101)).toBe('White speed');
    expect(label(900102)).toBe('White speed');
    // Navigation and placeholder effects do not change HP use.
    expect(label(900103)).toBeUndefined();
    expect(label(900104)).toBeUndefined();
    expect(label(900105)).toBe('Wit ◎');
    const counts = countSkills(
      [200351, 200352, 100231, 200362, 201601, 200011, 200012].map((skillId) => ({
        skillId,
        level: 1
      })),
      catalog,
      { turn: 1 }
    );

    expect(counts.recovery).toMatchObject({ gold: 1, white: 1, unique: 1, uniquePercent: 5.5 });
    expect(counts.speed).toEqual({ gold: 0, white: 1, unique: 0 });
    expect(counts.accel).toEqual({ gold: 0, white: 0, unique: 0 });
    expect(counts.green.speed).toEqual({ gold: 1, white: 1 });
  });
});
