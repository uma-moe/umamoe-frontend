import { describe, expect, it } from 'vitest';
import {
  createSimulatorUma,
  restoreSimulatorUma,
  simulatorBuildKey,
  simulatorUmasFromCapture
} from './simulator-uma';
import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';

describe('saved simulator runner', () => {
  it('restores the supported fields of a trained runner', () => {
    const runner = {
      ...createSimulatorUma('Your runner'),
      cardId: 100101,
      teamId: 0,
      fanCount: 0,
      skills: [{ skillId: 100101, level: 6 }, { skillId: 200101 }],
      source: 'CM Data',
      drawnFrom: 'cm21-2026-11-02',
      capturedAptitudes: ['S', 'A', 'A']
    };

    expect(restoreSimulatorUma(JSON.parse(JSON.stringify(runner)), createSimulatorUma())).toEqual(
      runner
    );
  });

  it('keeps valid falsy input and replaces malformed nested fields with defaults', () => {
    const fallback = createSimulatorUma();
    const runner = restoreSimulatorUma(
      {
        name: '',
        fanCount: 0,
        teamId: 0,
        trainee: { speed: 0, stamina: null, groundAptitudes: ['S', {}], styleAptitudes: 'A' },
        skills: [null, {}, { skillId: '100101' }, { skillId: 200101, level: 99 }]
      },
      fallback
    );

    expect(runner).toMatchObject({
      name: '',
      fanCount: 0,
      teamId: 0,
      trainee: {
        speed: '0',
        stamina: '900',
        groundAptitudes: ['S', 'A'],
        styleAptitudes: ['A', 'A', 'A', 'A']
      },
      skills: [{ skillId: 200101, level: 1 }]
    });

    expect(restoreSimulatorUma({ name: 'broken', trainee: null }, fallback)).toBe(fallback);
  });
});

describe('simulator build key', () => {
  const veteranBuild = () => ({
    ...createSimulatorUma('Sakura Bakushin O'),
    cardId: 100401,
    skills: [
      { skillId: 100401, level: 4 },
      { skillId: 200331, level: 1 }
    ]
  });

  it('matches a placed copy saved and restored under another name, mood and team', () => {
    const veteran = veteranBuild();
    const placed = restoreSimulatorUma(
      JSON.parse(
        JSON.stringify({
          ...veteran,
          id: 'placed',
          name: 'Sakura copy',
          teamId: 2,
          trainee: { ...veteran.trainee, motivation: '5' },
          skills: [...veteran.skills].reverse()
        })
      ),
      createSimulatorUma()
    );

    expect(simulatorBuildKey(placed)).toBe(simulatorBuildKey(veteran));
  });

  it('tells an edited build apart', () => {
    const veteran = veteranBuild();
    const edited = { ...veteran, trainee: { ...veteran.trainee, speed: '1201' } };

    expect(simulatorBuildKey(edited)).not.toBe(simulatorBuildKey(veteran));
  });
});

describe('simulator field from a race capture', () => {
  const runner = (index: number, raw: Record<string, unknown>) =>
    ({
      index,
      cardId: raw.card_id as number | undefined,
      name: 'Runner ' + (index + 1),
      trainerName: 'Trainer ' + (index + 1),
      isPlayer: index === 0,
      stats: { speed: 1500, stamina: 1100, power: 1200, guts: 600, wit: 1000 },
      aptitudes: {},
      skillIds: [],
      raw: {
        running_style: 2,
        motivation: 5,
        frame_order: index + 1,
        proper_distance_short: 1,
        proper_distance_mile: 4,
        proper_distance_middle: 7,
        proper_distance_long: 8,
        proper_running_style_nige: 2,
        proper_running_style_senko: 8,
        proper_running_style_sashi: 6,
        proper_running_style_oikomi: 1,
        proper_ground_turf: 8,
        proper_ground_dirt: 3,
        skill_array: [],
        ...raw
      }
    }) as unknown as RaceRunner;

  it('lists the field in the capture’s own order, which simulator results follow', () => {
    const umas = simulatorUmasFromCapture({
      runners: [
        { ...runner(0, {}), sourceIndex: 1 },
        { ...runner(1, {}), sourceIndex: 0 }
      ]
    });

    expect(umas.map((uma) => uma.frameOrder)).toEqual([2, 1]);
  });

  it('keeps each runner’s build, mood, gate and aptitudes', () => {
    const [uma] = simulatorUmasFromCapture({
      runners: [runner(0, { card_id: 100101, fan_count: 250000 })]
    });

    expect(uma).toMatchObject({
      name: 'Runner 1',
      cardId: 100101,
      frameOrder: 1,
      fanCount: 250000,
      source: 'Trainer 1',
      trainee: {
        speed: '1500',
        wisdom: '1000',
        runningStyle: 'Senko',
        motivation: '5',
        distanceAptitudes: ['G', 'D', 'A', 'S'],
        styleAptitudes: ['F', 'S', 'B', 'G'],
        groundAptitudes: ['S', 'E']
      }
    });
  });

  it('numbers teams from one by their captured ids', () => {
    const umas = simulatorUmasFromCapture({
      runners: [
        runner(0, { team_id: 900000123 }),
        runner(1, { team_id: 400 }),
        runner(2, { team_id: 900000123 }),
        runner(3, { team_id: 0 })
      ]
    });

    expect(umas.map((uma) => uma.teamId)).toEqual([2, 1, 2, undefined]);
  });

  it('renumbers inherited uniques but keeps the card’s own unique', () => {
    const skills = [
      { skill_id: 100011, level: 4 },
      { skill_id: 100021, level: 2 },
      { skill_id: 200012, level: 1 }
    ];

    const [special, mob] = simulatorUmasFromCapture({
      runners: [
        runner(0, { card_id: 100101, skill_array: skills }),
        runner(1, { card_id: 100101, npc_type: 0, skill_array: skills })
      ]
    });

    expect(special!.skills).toEqual([
      { skillId: 100011, level: 4 },
      { skillId: 900021, level: 2 },
      { skillId: 200012, level: 1 }
    ]);
    expect(mob!.skills.map((skill) => skill.skillId)).toEqual([100011, 100021, 200012]);
  });

  it('refuses a runner without recorded stats', () => {
    const missing = { ...runner(0, {}), stats: { speed: 1500 } } as RaceRunner;

    expect(() => simulatorUmasFromCapture({ runners: [missing] })).toThrow('no recorded stats');
  });
});
