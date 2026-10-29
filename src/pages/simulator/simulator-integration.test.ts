import { describe, expect, it, vi } from 'vitest';
import {
  simulatorRoster,
  simulatorTeamColors,
  simulatorTeamColor,
  simulatorTeamLabel,
  addSimulatorTeamColor
} from './simulator-roster.svelte';
import {
  simulatorUmaFromCm,
  simulatorUmaFromVeteran,
  simulatorUmaSummary,
  createSimulatorUma
} from './simulator-uma';
import {
  simulatorReplayCapture,
  simulatorResults,
  simulatorTeamResults,
  simulatorFinishDistributions,
  simulatorHeadToHead,
  simulatorSampleReplay,
  simulatorSampleSummary,
  simulatorMatchups,
  type SimulatorReplay
} from './simulator-results';
import { winRateInterval } from '@/lib/race/win-rate-interval';
import { createExampleRace } from './simulator-example';
import {
  raceSignalSpreads,
  racePositionClouds,
  trajectoryPreviewSamples,
  compactRaceTrajectory,
  raceFieldSpread,
  raceDistanceSpread,
  meanRaceCapture,
  meanTrajectorySignal,
  trajectoryAtTime,
  trajectorySeries
} from '@/lib/race/replay/race-ensemble';
import { hpCalculation } from './hp-calculation';
import {
  veteranTeamCount,
  veteranTeams,
  pairingSeeds,
  benchmarkFields,
  pairingFrameOrders
} from './setup/veterans/team-search/veteran-pairings';
import { cmPreset } from './courses/cm-presets';
import { buildMonteCarloRequest } from './requests/race-sim-request';
import { createSimulatorRepository, type StaminaResult } from './simulator-repository';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import type { Build, Summary } from '@/pages/competitive/hakuraku-types';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

const course = {
  course_id: 10601,
  race_track_id: 10006,
  distance: 1600,
  distance_type: 2,
  surface: 1,
  turn: 2,
  course: 1
};

const setup = {
  raceInstanceId: 0,
  raceType: 0,
  season: 1,
  weather: 1,
  ground: 1,
  startTimeType: 2
};

describe('simulator source integration', () => {
  it('overlays every real-time trajectory in source order and calculates the arithmetic mean, holding finishers at the line', () => {
    const umas = ['A', 'B'].map(createSimulatorUma);
    const motion = {
      distance: 0,
      lane_units: 100,
      speed_units: 2000,
      hp_units: 1000,
      temptation: 0,
      block_front_index: -1
    };

    const replay = (seed: number, sources: number[], end: number, hp: number) => ({
      schema_version: 3,
      seed,
      course_id: course.course_id,
      runner_source_indices: sources,
      frames: [
        { time: 0, runners: sources.map(() => ({ ...motion, hp_units: hp })) },
        {
          time: end,
          runners: sources.map((source) => ({
            ...motion,
            distance: source === 0 ? 1600 : 800,
            hp_units: hp / 2
          }))
        },
        {
          time: end * 2,
          runners: sources.map(() => ({ ...motion, distance: 1700, hp_units: hp / 4 }))
        }
      ],
      events: []
    });

    const replays = [
      replay(1, [0, 1], 4, 1000),
      replay(2, [1, 0], 2, 2000),
      replay(3, [0, 1], 8, 3000)
    ];

    const captures = replays.map((data) => simulatorReplayCapture(data, umas, course));
    const trajectories = captures.map((capture, index) =>
      compactRaceTrajectory(capture, replays[index]!.runner_source_indices, index)
    );

    expect(trajectoryAtTime(trajectories[1]!, 1)[0]).toBe(800);
    expect(trajectoryAtTime(trajectories[1]!, 1)[4]).toBe(400);
    expect(trajectoryAtTime(trajectories[1]!, 20)[0]).toBe(1600);
    expect(trajectoryAtTime(trajectories[1]!, 20)[2]).toBe(0);
    const mean = meanRaceCapture(trajectories, captures[0]!);
    expect(mean.frames.find((frame) => frame.time === 2)!.horses[0]!.distance).toBeCloseTo(
      (800 + 1600 + 400) / 3
    );
    expect(mean.frames.find((frame) => frame.time === 2)!.horses[1]!.distance).toBeCloseTo(
      (400 + 800 + 200) / 3
    );
    expect(mean.frames[0]!.horses[0]!.hp).toBe(2000);
    expect(meanTrajectorySignal(trajectories, 2, 0, 'hp')).toBeCloseTo((75 + 50 + 87.5) / 3);
    const reversed = compactRaceTrajectory(captures[0]!, [1, 0], 1);
    expect(meanTrajectorySignal([trajectories[0]!, reversed], 2, 0, 'gap')).toBeCloseTo(200);
    // Opposite leaders have identical mean positions but a nonzero mean gap in their own races.
    const spread = raceFieldSpread([trajectories[0]!, reversed], 2);
    expect(spread[0]).toMatchObject({ mean: 200, median: 200, p10: 40, p90: 360 });
    expect(spread[1]?.mean).toBe(200);
    const distanceSpread = raceDistanceSpread(trajectories, 2, 0);
    expect(distanceSpread).toMatchObject({
      mean: (800 + 1600 + 400) / 3,
      median: 800,
      p10: 480,
      p90: 1440,
      finished: 1
    });

    expect(distanceSpread.values).toEqual([400, 800, 1600]);
    expect(raceDistanceSpread(trajectories, 100, 0)).toMatchObject({
      mean: 1600,
      p10: 1600,
      p90: 1600,
      finished: 3
    });

    expect(raceDistanceSpread(trajectories, 0, 1)).toMatchObject({
      mean: 0,
      p10: 0,
      p90: 0,
      finished: 0
    });

    expect(raceFieldSpread([trajectories[0]!, reversed], 100)).toEqual(
      raceFieldSpread([trajectories[0]!, reversed], 4)
    );
    expect(meanTrajectorySignal([trajectories[0]!, reversed], 100, 0, 'gap')).toBe(400);
    const trends = raceSignalSpreads([trajectories[0]!, reversed]);
    expect(trends.times).toHaveLength(81);
    expect(trends.runners).toHaveLength(2);
    expect(trends.runners[0]!.speed[0]).toMatchObject({ mean: 20, p10: 20, p90: 20 });
    expect(trends.runners[0]!.hp[0]).toMatchObject({ mean: 100, p10: 100, p90: 100 });
    expect(trends.runners[0]!.speed.at(-1)).toBeNull();
    expect(trends.runners[0]!.gap.at(-1)).toMatchObject({ mean: 400, p10: 80, p90: 720 });
    expect(trends.runners[1]!.gap.at(-1)?.mean).toBe(400);
    expect(trends.runners[0]!.hp.at(-1)?.mean).toBeCloseTo(50 / 2 + (50 - (25 * 8) / 9) / 2);
    expect(raceSignalSpreads([]).runners).toEqual([]);
    expect(mean.events).toEqual([]);
    expect(mean.runners[0]!.result).toBeUndefined();
    expect(
      mean.frames.at(-1)!.horses.every((horse) => horse.distance === 1600 && horse.speed === 0)
    ).toBe(true);
    expect(trajectorySeries(trajectories[1]!, 0, 'distance').map((point) => point[1])).toEqual([
      0, 1600, 1600
    ]);
    const crossing = trajectories[0]!.finishTimes[1]!;
    expect(trajectoryAtTime(trajectories[0]!, crossing)[4]).toBe(1600);
    expect(() => compactRaceTrajectory(captures[0]!, [0, 0], 0)).toThrow(/missing a runner/);
    expect(() => meanRaceCapture([], captures[0]!)).toThrow(/Load the sampled/);
  });

  it('keeps distance and lane samples paired while bounding report frames and seed selection', () => {
    const umas = ['A', 'B'].map(createSimulatorUma);
    const replay = (seed: number, sources: number[]) => ({
      schema_version: 3,
      seed,
      course_id: course.course_id,
      runner_source_indices: sources,
      frames: Array.from({ length: 21 }, (_, index) => ({
        time: index / 10,
        runners: sources.map((source) => ({
          distance: index * 100 + (seed - 1) * 20,
          lane_units: (source + 1) * 100 + seed * 50 + index,
          speed_units: 2000,
          hp_units: 1000,
          temptation: 0,
          block_front_index: -1
        }))
      })),
      events: []
    });

    const samples = [replay(1, [0, 1]), replay(2, [1, 0])].map((replay, index) =>
      compactRaceTrajectory(
        simulatorReplayCapture(replay, umas, course),
        replay.runner_source_indices,
        index,
        0.5
      )
    );

    expect(samples[0]!.times.length).toBeLessThanOrEqual(6);
    const clouds = racePositionClouds(samples, 0.5);
    expect(clouds[0]!.points).toEqual([
      { sample: 0, distance: 500, lane: 155 },
      { sample: 1, distance: 520, lane: 205 }
    ]);

    expect(clouds[0]).toMatchObject({ distance: 510, lane: 180, finished: 0 });
    expect(clouds[1]!.lane).toBe(280);
    expect(
      racePositionClouds(samples, 10).every((row) => row.distance === 1600 && row.finished === 2)
    ).toBe(true);
    const selected = trajectoryPreviewSamples(100);
    expect(selected).toHaveLength(24);
    expect(new Set(selected).size).toBe(24);
    expect(selected[0]).toBe(0);
    expect(selected.at(-1)).toBe(99);
    expect(trajectoryPreviewSamples(3)).toEqual([0, 1, 2]);
    expect(trajectoryPreviewSamples(1)).toEqual([0]);
  });

  it('loads a complete CM example and derives medians from all samples without changing their seed order', () => {
    const example = createExampleRace();
    expect(example.umas).toHaveLength(9);
    for (const teamId of [1, 2, 3]) {
      const team = example.umas.filter((uma) => uma.teamId === teamId);
      expect(team).toHaveLength(3);
      expect(new Set(team.map((uma) => Math.floor(uma.cardId! / 100))).size).toBe(3);
    }

    expect(
      example.umas.every((uma) => uma.skills.length >= 17 && uma.trainee.motivation === '5')
    ).toBe(true);
    expect(new Set(example.umas.map((uma) => uma.trainee.runningStyle)).size).toBe(5);
    const first = createExampleRace().umas[0]!.skills[0]!.level;
    example.umas[0]!.skills[0]!.level = 1;
    expect(createExampleRace().umas[0]!.skills[0]!.level).toBe(first);
    const result = {
      schema_version: 5,
      engine_build: 'test',
      runs: 4,
      seeds: [11, 22, 33, 44],
      finish_order: [
        [0, 1],
        [1, 0],
        [1, 0],
        [0, 1]
      ],
      finish_times: [
        [10, 20],
        [40, 20],
        [30, 20],
        [10, 20]
      ]
    };

    const plot = simulatorFinishDistributions(result, 2),
      a = plot.runners.find((row) => row.source === 0)!;

    expect(a.median).toBe(20);
    expect(a.p10).toBe(10);
    expect(a.p90).toBeCloseTo(37);
    expect(a.samples.map((sample) => sample.sample)).toEqual([0, 3, 2, 1]);
    expect(plot.runners.every((row) => row.bins.reduce((a, b) => a + b, 0) === 4)).toBe(true);
    expect(result.finish_times[0]).toEqual([10, 20]);
    const constant = simulatorFinishDistributions(
      {
        ...result,
        finish_times: [
          [20, 20],
          [20, 20],
          [20, 20],
          [20, 20]
        ]
      },
      2
    );

    expect(constant.max).toBeGreaterThan(constant.min);
    expect(constant.runners[0]!.median).toBe(20);
    expect(
      simulatorFinishDistributions(
        { ...result, runs: 3, seeds: [11, 22, 33], finish_times: result.finish_times.slice(0, 3) },
        2
      ).runners.find((row) => row.source === 0)!.median
    ).toBe(30);

    const replay = { seed: 22 } as SimulatorReplay;
    const rerun = {
      ...result,
      runs: 1,
      seeds: [22],
      finish_order: [result.finish_order[1]!],
      finish_times: [result.finish_times[1]!],
      first_replay: replay
    };

    expect(simulatorSampleReplay(result, rerun, 1)).toBe(replay);
    expect(() => simulatorSampleReplay(result, { ...rerun, engine_build: 'changed' }, 1)).toThrow(
      /no longer matches/
    );

    expect(() => simulatorSampleReplay(result, { ...rerun, finish_times: [[39, 20]] }, 1)).toThrow(
      /no longer matches/
    );

    expect(() => simulatorSampleReplay(result, { ...rerun, seeds: [33] }, 1)).toThrow(
      /no longer matches/
    );
  });

  it('compares paired races before summarizing and respects finish order when times are rounded equal', () => {
    const result = {
      schema_version: 5,
      engine_build: 'test',
      runs: 4,
      seeds: [11, 22, 33, 44],
      finish_order: [
        [0, 1, 2, 3],
        [0, 1, 2, 3],
        [1, 2, 3, 0],
        [0, 1, 2, 3]
      ],
      finish_times: [
        [100, 101, 500, 600],
        [200, 201, 500, 600],
        [300, 299, 299, 299],
        [400, 400, 500, 600]
      ]
    };

    const paired = simulatorHeadToHead(result, 0, 1);
    expect(paired.samples.map((sample) => sample.time)).toEqual([-1, -1, 0, 1]);
    expect(paired.ahead).toBe(3);
    expect(paired.rate).toBe(75);
    expect(paired.mean).toBe(-0.25);
    expect(paired.median).toBe(-0.5);
    expect(paired.p90).toBeCloseTo(0.7);
    expect(paired.bins.reduce((sum, value) => sum + value, 0)).toBe(4);
    expect(paired.interval[0]).toBeLessThan(75);
    expect(paired.interval[1]).toBeGreaterThan(75);
    const pair = simulatorFinishDistributions(result, 4, [0, 1]);
    expect(pair.max).toBeLessThan(500);
    expect(pair.runners).toHaveLength(2);
    expect(pair.runners.find((row) => row.source === 0)!.mean).toBe(250);
    expect(simulatorResults(result, 4).find((row) => row.source === 0)!.top3).toBe(75);
    expect(result.finish_order[0]).toEqual([0, 1, 2, 3]);
    expect(result.finish_times[0]).toEqual([100, 101, 500, 600]);
    const equal = simulatorHeadToHead(
      { ...result, finish_times: result.finish_times.map(() => [100, 100]) },
      0,
      1
    );

    expect(equal.min).toBeLessThan(equal.max);
    expect(equal.mean).toBe(0);
    expect(equal.bins.reduce((sum, value) => sum + value, 0)).toBe(4);
  });

  it('preserves Veteran skills, levels, raw stats, aptitudes and fans', () => {
    const veteran = {
      id: '123',
      card_id: 100101,
      speed: 1500,
      stamina: 900,
      power: 1200,
      guts: 650,
      wiz: 1100,
      running_style: 5,
      proper_ground_turf: 8,
      proper_distance_mile: 7,
      proper_running_style_nige: 6,
      skill_array: [{ skill_id: 200001, level: 3 }],
      fans: 150000
    } as ProfileVeteran;

    const uma = simulatorUmaFromVeteran(veteran, 'Veteran');
    expect(uma.skills).toEqual([{ skillId: 200001, level: 3 }]);
    expect(uma.fanCount).toBe(150000);
    expect(uma.trainee.speed).toBe('1500');
    expect(simulatorUmaSummary(uma, 0, course).aptitudes).toEqual({
      surface: 8,
      distance: 7,
      style: 6
    });

    expect(
      simulatorUmaFromVeteran({ ...veteran, skill_array: null, skills: [2000013] }, 'Encoded')
        .skills
    ).toEqual(uma.skills);

    expect(() => simulatorUmaFromVeteran({ ...veteran, speed: null }, 'Missing')).toThrow(
      /missing trained stats/
    );
  });

  it('maps only the captured CM course aptitudes and uses Front aptitude for Runaway', () => {
    const build = {
      card: 100101,
      racingStyle: 5,
      stats: [1500, 900, 1200, 650, 1100],
      aptitudes: ['S', 'B', 'C'],
      skills: [[200001, 2]]
    } as Build;

    const data = {
      cards: { 100101: { name: 'CM Uma' } },
      meta: { courseDistance: 'Mile', courseSurface: 'Turf' }
    } as unknown as Pick<Summary, 'cards' | 'meta'>;

    const uma = simulatorUmaFromCm(build, data, 1);
    expect(uma.trainee.distanceAptitudes).toEqual(['A', 'S', 'A', 'A']);
    expect(uma.trainee.styleAptitudes).toEqual(['C', 'A', 'A', 'A']);
    expect(simulatorUmaSummary(uma, 0, course).aptitudes).toEqual({
      surface: 6,
      distance: 8,
      style: 5
    });

    const body = buildMonteCarloRequest({
      courseId: course.course_id,
      seed: 1,
      setup,
      runners: [uma, createSimulatorUma('Other')].map((uma) => ({
        trainee: uma.trainee,
        teamId: 1,
        skills: uma.skills,
        fanCount: 90000
      }))
    });

    expect(body.input.runners.map((uma) => uma.team_member_id)).toEqual([1, 2]);
    expect(body.input.runners[0]!.fan_count).toBe(90000);
  });

  it('keeps source-index statistics and gate-order replay identities separate', () => {
    const result = {
      schema_version: 5,
      engine_build: 'test',
      runs: 2,
      seeds: [1, 2],
      finish_order: [
        [2, 0, 1],
        [0, 2, 1]
      ],
      finish_times: [
        [100, 102, 99],
        [99, 103, 100]
      ],
      final_hp: [[10, 20, 30]],
      last_spurt_decisions: [
        [1, 8, 2],
        [2, 4, 2]
      ]
    };

    const rows = simulatorResults(result, 3);
    expect(rows.find((row) => row.source === 2)).toMatchObject({
      wins: 1,
      time: 99.5,
      hp: 30,
      fullSpurt: 0
    });

    expect(rows.find((row) => row.source === 1)?.fullSpurt).toBe(0);
    const motion = {
      distance: 0,
      lane_units: 125,
      speed_units: 2100,
      hp_units: 2500,
      temptation: 0,
      block_front_index: -1
    };

    const replay = {
      schema_version: 3,
      seed: 1,
      course_id: course.course_id,
      runner_source_indices: [2, 0, 1],
      frames: [
        { time: 0, runners: [motion, motion, motion] },
        { time: 1, runners: [{ ...motion, distance: 21 }, motion, motion] }
      ],
      events: [],
      results: [
        {
          source_input_index: 2,
          finish_order: 0,
          finish_time_seconds: 99,
          finish_time_raw_seconds: 99
        },
        {
          source_input_index: 0,
          finish_order: 1,
          finish_time_seconds: 100,
          finish_time_raw_seconds: 100
        },
        {
          source_input_index: 1,
          finish_order: 2,
          finish_time_seconds: 102,
          finish_time_raw_seconds: 102
        }
      ]
    };

    const capture = simulatorReplayCapture(replay, ['A', 'B', 'C'].map(createSimulatorUma), course);
    expect(capture.runners.map((uma) => uma.name)).toEqual(['C', 'A', 'B']);
    expect(capture.runners[0]?.result).toMatchObject({ finishOrder: 1, finishTime: 99 });
    expect(capture.runners[0]?.result?.startDelayTime).toBeUndefined();
    expect(capture.frames[1]!.horses[0]).toMatchObject({
      distance: 21,
      lanePosition: 125,
      speed: 2100
    });

    expect(() =>
      simulatorReplayCapture(
        { ...replay, runner_source_indices: [0, 0, 1] },
        capture.runners.map((runner) => createSimulatorUma(runner.name)),
        course
      )
    ).toThrow(/does not match/);
  });

  it('does not treat a forced full spurt as proof of sufficient HP', () => {
    const result = {
      max_hp: 2500,
      remaining_hp: 0,
      check_hp: [500],
      full_spurt_need_hp: [700],
      full_spurt: true
    } as StaminaResult;

    expect(hpCalculation(result, true)).toMatchObject({
      spurt: 'Forced full spurt',
      balance: -200,
      feasibility: 'Insufficient HP at the first spurt check'
    });
  });

  it('aggregates the whole Monte Carlo sample by runner and team with nonzero uncertainty at the extremes', () => {
    const umas = [1, 1, 2].map((teamId, index) => ({
      ...createSimulatorUma(String(index)),
      teamId
    }));

    const result = {
      schema_version: 5,
      engine_build: 'test',
      runs: 4,
      seeds: [1, 2, 3, 4],
      finish_order: [
        [0, 1, 2],
        [1, 0, 2],
        [2, 0, 1],
        [0, 2, 1]
      ],
      finish_times: [
        [100, 101, 102],
        [101, 100, 102],
        [101, 102, 100],
        [100, 102, 101]
      ]
    };

    expect(simulatorResults(result, 3).find((row) => row.source === 0)).toMatchObject({
      wins: 2,
      winRate: 50,
      place: 1.5,
      finishes: [2, 2, 0]
    });

    expect(
      simulatorTeamResults(result, umas).map((team) => ({
        id: team.id,
        wins: team.wins,
        rate: team.winRate,
        place: team.place
      }))
    ).toEqual([
      { id: 1, wins: 3, rate: 75, place: 1.25 },
      { id: 2, wins: 1, rate: 25, place: 2.25 }
    ]);

    expect(winRateInterval(50, 100)[0]).toBeCloseTo(40.38, 1);
    expect(winRateInterval(50, 100)[1]).toBeCloseTo(59.62, 1);
    expect(winRateInterval(0, 100)[1]).toBeGreaterThan(3);
    expect(winRateInterval(100, 100)[0]).toBeLessThan(97);
    expect(winRateInterval(0, 0)).toEqual([0, 100]);
  });

  it('streams every legal Veteran team, excludes same-character variants and repeats common seeds', () => {
    const umas = [100101, 100102, 100201, 100301].map((cardId) => ({
      ...createSimulatorUma(String(cardId)),
      cardId
    }));

    expect(veteranTeamCount(umas)).toBe(2);
    expect([...veteranTeams(umas)].map((team) => team.map((uma) => uma.cardId))).toEqual([
      [100101, 100201, 100301],
      [100102, 100201, 100301]
    ]);
    const seeds = pairingSeeds(-2147483648, 100);
    expect(new Set(seeds).size).toBe(100);
    expect(seeds).toEqual(pairingSeeds(-2147483648, 100));
    expect(seeds.every(Number.isInteger)).toBe(true);
  });

  it('resolves resource CM descriptions without choosing between ambiguous layouts', () => {
    const event = {
      eventType: 'champions_meeting',
      description: 'Tokyo - Turf<br>1600m - Mile - Counterclockwise<br>Firm - Spring - Sunny'
    } as TimelineRecord;

    const preset = cmPreset(event, [
      course,
      { ...course, course_id: 10602, course: 2 },
      { ...course, course_id: 10603, surface: 2 }
    ]);

    expect(preset.candidates.map((course) => course.course_id)).toEqual([10601, 10602]);
    expect(preset).toMatchObject({ season: '1', weather: '1', ground: '1' });
  });

  it('rotates complete CM teams and assigns reproducible, unique gates for fair comparisons', () => {
    const teams = Array.from({ length: 3 }, (_, team) =>
      Array.from({ length: 3 }, (_, runner) => createSimulatorUma(`${team}-${runner}`))
    );

    const fields = benchmarkFields(teams);
    expect(fields.map((field) => field.map((uma) => uma.name))).toEqual([
      ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2'],
      ['0-0', '0-1', '0-2', '2-0', '2-1', '2-2'],
      ['1-0', '1-1', '1-2', '2-0', '2-1', '2-2']
    ]);
    expect(fields.every((field) => field.map((uma) => uma.teamId).join() === '2,2,2,3,3,3')).toBe(
      true
    );
    expect(pairingFrameOrders(42, 9)).toEqual(pairingFrameOrders(42, 9));
    expect([...pairingFrameOrders(42, 9)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9
    ]);
    expect(pairingFrameOrders(43, 9)).not.toEqual(pairingFrameOrders(42, 9));
  });

  it('requires production browser verification on all simulator endpoints', async () => {
    vi.stubEnv('DEV', false);
    try {
      const request = vi.fn(async () => '{"schema_version":3,"results":[]}');
      const repository = createSimulatorRepository(request);
      await expect(repository.stamina({ body: {} })).rejects.toThrow(/incompatible results/);
      await repository.batch({ body: { races: [] } });
      expect(request.mock.calls).toHaveLength(2);
      for (const call of request.mock.calls)
        expect(call).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ browserProof: true, headers: { accept: 'application/json' } })
          ])
        );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

it('reports observed spread, depletion and paired comparisons from the full sample', () => {
  const result = {
    schema_version: 5,
    engine_build: 'test',
    runs: 4,
    seeds: [1, 2, 3, 4],
    finish_order: [
      [0, 1],
      [1, 0],
      [0, 1],
      [1, 0]
    ],
    finish_times: [
      [100, 102],
      [104, 101],
      [102, 103],
      [106, 105]
    ],
    final_hp: [
      [10, 20],
      [0, 10],
      [-2, 5],
      [4, 0]
    ],
    last_spurt_decisions: [
      [1, 2],
      [2, 4],
      [4, 8],
      [8, 1]
    ]
  };

  expect(simulatorSampleSummary([])).toBeUndefined();
  expect(simulatorSampleSummary([4])).toMatchObject({ min: 4, max: 4, median: 4, sd: 0 });
  const spread = simulatorSampleSummary([100, 104, 102, 106])!;
  expect(spread).toMatchObject({ mean: 103, median: 103 });
  expect(spread.p10).toBeCloseTo(100.6);
  expect(spread.p90).toBeCloseTo(105.4);
  const rows = simulatorResults(result, 2),
    runner = rows.find((row) => row.source === 0)!;

  expect(runner).toMatchObject({
    depleted: 50,
    fullSpurt: 25,
    hpSummary: { mean: 3, median: 2 },
    placeSummary: { min: 1, max: 2, median: 1.5 }
  });

  expect(runner.spurtCounts.map((row) => row.count)).toEqual([1, 1, 1, 1]);
  const pairs = simulatorMatchups(result, 2);
  expect(pairs[0]![0]).toBeUndefined();
  expect(pairs[0]![1]).toMatchObject({ ahead: 2, rate: 50, gap: 0.25 });
  expect(pairs[1]![0]?.gap).toBe(-0.25);
});

it('keeps color teams unique, preserves imported IDs and includes colors in replay identities', () => {
  const originalUmas = simulatorRoster.umas,
    originalColors = { ...simulatorTeamColors };

  try {
    expect(Object.keys(simulatorTeamColors)).toHaveLength(5);
    expect(simulatorTeamLabel(1)).toBe('Blue team');
    expect(simulatorTeamLabel(0)).toBe('No team');
    simulatorRoster.umas = [{ ...createSimulatorUma('Imported'), teamId: 6 }];
    expect(addSimulatorTeamColor('#69B7EE')).toBe(1);
    const id = addSimulatorTeamColor('#123ABC');
    expect(id).toBe(7);
    expect(simulatorTeamColor(id)).toBe('#123abc');
    expect(addSimulatorTeamColor('#123abc')).toBe(id);
    expect(() => addSimulatorTeamColor('red')).toThrow(/valid team color/);
    expect(simulatorTeamColor(255)).toMatch(/^#[0-9a-f]{6}$/);
    expect(simulatorTeamLabel(id)).toBe('#123ABC team');
    const uma = { ...createSimulatorUma('Custom'), teamId: id, teamColor: simulatorTeamColor(id) };

    expect(simulatorUmaSummary(uma).raw).toMatchObject({ team_id: 7, team_color: '#123abc' });
  } finally {
    simulatorRoster.umas = originalUmas;
    for (const id of Object.keys(simulatorTeamColors)) delete simulatorTeamColors[Number(id)];
    Object.assign(simulatorTeamColors, originalColors);
  }
});
