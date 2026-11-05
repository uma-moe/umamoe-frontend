import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from './race-capture-parser';
import { hpChangeEvents, lastSpurtResult, validateDetailedReplay } from './race-diagnostics';

const capture = {
  frames: [{ time: 1, horses: [{ hp: 500 }, { hp: 850 }] }],
  detailed: {
    annotations: {
      horses: [
        { horseIndex: 0, maxHp: 1000 },
        { horseIndex: 1, maxHp: 2000 }
      ]
    }
  }
} as ParsedRaceCapture;

const event = {
  time: 1,
  skillId: 200001,
  casterHorseIndex: 0,
  targetHorseIndex: 1,
  requestedHpDelta: -30,
  appliedHpDelta: -30
};

it('displays spurt delay and speed penalties without losing delays after recalculation', () => {
  const first = {
    result: 'True',
    checkDistance: 1600,
    selectedStartDistance: 1630,
    fullSpurtTargetSpeed: 24,
    selectedTargetSpeed: 23.7
  };

  const latest = { ...first, checkDistance: 1640, delayPenalty: false, speedPenalty: true };

  const replay = {
    raceDistance: 2400,
    runners: [{ index: 0, result: { lastSpurtStartDistance: 1630 } }],
    detailed: {
      annotations: {
        horses: [{ horseIndex: 0, lastSpurtDecision: latest, lastSpurtDecisions: [first, latest] }]
      }
    }
  } as unknown as ParsedRaceCapture;

  expect(lastSpurtResult(replay, 0)).toMatchObject({
    delay: 30,
    speed: 23.7,
    noSpurt: false,
    speedPenalty: true
  });

  expect(lastSpurtResult(replay, 0).reduction).toBeCloseTo(0.3);
  replay.detailed!.annotations.horses[0]!.lastSpurtDecision = {
    ...first,
    selectedStartDistance: 1600,
    selectedTargetSpeed: 24
  };

  expect(lastSpurtResult(replay, 0)).toMatchObject({
    delay: 0,
    speed: 24,
    reduction: 0,
    speedPenalty: false
  });

  replay.detailed!.annotations.horses[0]!.lastSpurtDecision = {
    ...first,
    result: 'False',
    selectedStartDistance: -1,
    selectedTargetSpeed: 0
  };

  expect(lastSpurtResult(replay, 0)).toMatchObject({
    noSpurt: true,
    delay: undefined,
    speed: undefined,
    reduction: undefined
  });

  delete replay.detailed;
  expect(lastSpurtResult(replay, 0)).toMatchObject({
    delay: 30,
    speed: undefined,
    reduction: undefined
  });

  replay.runners[0]!.result!.lastSpurtStartDistance = 0;
  expect(lastSpurtResult(replay, 0).noSpurt).toBe(true);
});

describe('HP change display', () => {
  it('uses exact application values and the target runner’s maximum HP', () => {
    expect(
      hpChangeEvents(capture, [{ ...event, hpBefore: 880.5, hpAfter: 850.5 }])[0]
    ).toMatchObject({ before: 880.5, after: 850.5, estimated: false, percent: -1.5 });
  });

  it('reconstructs successive applications on one tick without assigning the final HP to every event', () => {
    const events = hpChangeEvents(capture, [
      event,
      { ...event, requestedHpDelta: 100, appliedHpDelta: 100 }
    ]);

    expect(events[0]).toMatchObject({ before: 780, after: 750, estimated: true, percent: -1.5 });
    expect(events[1]).toMatchObject({ before: 750, after: 850, estimated: true, percent: 5 });
  });

  it('leaves before/after unknown when the capture has no nearby HP observation', () => {
    expect(hpChangeEvents(capture, [{ ...event, time: 0.5 }])[0]).toMatchObject({
      before: undefined,
      after: undefined,
      percent: -1.5
    });
  });

  it('uses applied rather than requested HP for a recovery capped at maximum HP', () => {
    expect(
      hpChangeEvents(capture, [
        { ...event, requestedHpDelta: 150, appliedHpDelta: 10, hpBefore: 1990 }
      ])[0]
    ).toMatchObject({ before: 1990, after: 2000, estimated: false, percent: 0.5 });
  });

  it('estimates between sparse samples without spreading skill changes across the interval', () => {
    const sparse = {
      ...capture,
      frames: [
        { time: 0, horses: [{ hp: 500 }, { hp: 1000 }] },
        { time: 1, horses: [{ hp: 450 }, { hp: 800 }] }
      ]
    } as ParsedRaceCapture;

    const events = hpChangeEvents(sparse, [
      { ...event, time: 0.4 },
      { ...event, time: 0.7, appliedHpDelta: 50 }
    ]);

    expect(events[0]).toMatchObject({ before: 912, after: 882, estimated: true });
    expect(events[1]).toMatchObject({ before: 816, after: 866, estimated: true });
  });

  it('preserves simultaneous effect order between samples and ignores other runners’ HP changes', () => {
    const sparse = {
      ...capture,
      frames: [
        { time: 0, horses: [{ hp: 500 }, { hp: 1000 }] },
        { time: 1, horses: [{ hp: 450 }, { hp: 850 }] }
      ]
    } as ParsedRaceCapture;

    const events = hpChangeEvents(sparse, [
      { ...event, time: 0.5 },
      { ...event, time: 0.5, targetHorseIndex: 0, appliedHpDelta: -50 },
      { ...event, time: 0.5, appliedHpDelta: 100 }
    ]);

    expect(events[0]).toMatchObject({ before: 890, after: 860, estimated: true });
    expect(events[2]).toMatchObject({ before: 860, after: 960, estimated: true });
  });
});

describe('skill activation misses', () => {
  const replayWithDecision = (miss: unknown) => ({
    engineBuild: 'test',
    seed: 1,
    replay: { data: '', encoding: 'base64', compression: 'gzip', format: 'uma-race-binary' },
    annotations: {
      schemaVersion: 7,
      flags: {},
      horses: [
        {
          horseIndex: 0,
          spans: [],
          skillActivationDecisions: [
            { skillId: 1, required: true, passed: true, activated: false, miss }
          ]
        }
      ]
    }
  });

  it('accepts a decision with the simulator reason, or without one', () => {
    const impossible = { kind: 'impossible', reasons: ['no place fits among 5 runners'] };

    expect(() => validateDetailedReplay(replayWithDecision(impossible), 1)).not.toThrow();
    expect(() => validateDetailedReplay(replayWithDecision(undefined), 1)).not.toThrow();
  });

  it('rejects a miss of an unknown kind or without reasons', () => {
    const unknownKind = { kind: 'unlucky', reasons: [] };
    const missingReasons = { kind: 'impossible' };

    expect(() => validateDetailedReplay(replayWithDecision(unknownKind), 1)).toThrow(
      'Invalid skill activation decision.'
    );
    expect(() => validateDetailedReplay(replayWithDecision(missingReasons), 1)).toThrow(
      'Invalid skill activation decision.'
    );
  });
});
