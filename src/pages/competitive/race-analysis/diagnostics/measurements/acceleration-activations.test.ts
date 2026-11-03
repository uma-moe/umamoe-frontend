import { expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { SkillEffectAlternative } from '@/lib/game-data/skills/skill-effects';
import {
  accelerationWindows,
  speedSamples,
  sampleAt,
  timeAtDistance
} from './acceleration-activations';

const accel: SkillEffectAlternative = {
  seconds: 3,
  variableDuration: false,
  effects: [{ kind: 31, target: 1, value: 0.4 }]
};
const speed: SkillEffectAlternative = {
  seconds: 3,
  variableDuration: false,
  effects: [{ kind: 27, target: 1, value: 0.35 }]
};
const mechanics = new Map([
  [1, [accel, accel]],
  [2, [speed, accel]]
]);

function fixture(): ParsedRaceCapture {
  return {
    source: 'api',
    fileName: 'race.json',
    track: {},
    events: [],
    runners: [
      {
        index: 0,
        name: 'Test Uma',
        isPlayer: true,
        stats: {},
        aptitudes: {},
        skillIds: [],
        raw: {},
        result: { finishOrder: 1, finishTime: 10, finishDiffTime: 0, runningStyle: 1 }
      }
    ],
    frames: [0, 1, 2, 3].map((time) => ({
      time,
      horses: [
        {
          distance: time * 20,
          lanePosition: 0,
          speed: 2000,
          hp: 1000,
          temptationMode: 0,
          blockFrontHorseIndex: -1
        }
      ]
    })),
    detailed: {
      engineBuild: 'test',
      seed: 1,
      replay: { data: '' },
      annotations: {
        schemaVersion: 7,
        flags: {},
        sampleTimes: [0, 1, 2, 3],
        horses: [
          {
            horseIndex: 0,
            spans: [],
            targetSpeeds: [21, 22, 23, 24],
            accelerationRates: [0, 0.5, 0.7, 0],
            activeSkillSpans: [
              { skillId: 1, detailIndex: 0, startTime: 0.1, endTime: 1, eventOrder: 1 },
              { skillId: 1, detailIndex: 1, startTime: 0.1, endTime: 1, eventOrder: 1 },
              { skillId: 1, detailIndex: 0, startTime: 0.1, endTime: 1, eventOrder: 2 },
              { skillId: 1, detailIndex: 0, startTime: 2.5, endTime: 3 },
              { skillId: 2, detailIndex: 0, startTime: 1, endTime: 2 },
              { skillId: 2, detailIndex: 1, startTime: 2, endTime: 3 },
              { skillId: 1, detailIndex: 0, startTime: 11, endTime: 12 }
            ]
          }
        ]
      }
    }
  };
}

it('shows the active acceleration alternative, combines effects, and keeps repeated procs', () => {
  const rows = accelerationWindows(fixture(), 0, mechanics);

  expect(rows.map((row) => [row.skillId, row.start, row.end])).toEqual([
    [1, 0.1, 1],
    [1, 0.1, 1],
    [2, 2, 3],
    [1, 2.5, 3]
  ]);
  expect(new Set(rows.map((row) => row.id)).size).toBe(4);
});

it('keeps actual speed, target speed, and measured acceleration aligned to their sample time', () => {
  const samples = speedSamples(fixture(), 0);

  expect(samples[1]).toMatchObject({
    time: 1,
    distance: 20,
    speed: 20,
    target: 22,
    acceleration: 0.5
  });
  expect(sampleAt(samples, 39, 'distance')?.time).toBe(2);
  expect(timeAtDistance(samples, 30)).toBe(1.5);
});

it('leaves missing telemetry unknown and still plots current speed', () => {
  const capture = fixture();
  const horse = capture.detailed!.annotations.horses[0]!;
  horse.accelerationRates = undefined;
  horse.targetSpeeds = undefined;

  expect(speedSamples(capture, 0)[0]).toMatchObject({
    speed: 20,
    target: null,
    acceleration: null
  });
  expect(accelerationWindows(capture, 0, new Map())).toEqual([]);
});

it('marks start dash through its crossing tick without changing recorded values', () => {
  const capture = fixture();
  capture.raceDistance = 1200;
  capture.original = { baseSpeed: -1 };
  for (const [i, speed] of [300, 1700, 1800, 2000].entries())
    capture.frames[i]!.horses[0]!.speed = speed;
  const samples = speedSamples(capture, 0);
  expect(samples.map((sample) => sample.startDash)).toEqual([true, true, true, false]);
  expect(samples[1]).toMatchObject({ speed: 17, acceleration: 0.5 });
  capture.raceDistance = undefined;
  expect(speedSamples(capture, 0, 1200).map((sample) => sample.startDash)).toEqual([
    true,
    true,
    true,
    false
  ]);
});

it('excludes the speed-floor jump on the tick after start dash ends', () => {
  const capture = fixture();
  capture.raceDistance = 1200;
  const times = [0, 0.5994, 0.666, 0.7326];
  for (const [i, speed] of [300, 1769, 1804, 1808].entries()) {
    capture.frames[i]!.time = times[i]!;
    capture.frames[i]!.horses[0]!.speed = speed;
  }
  const horse = capture.detailed!.annotations.horses[0]!;
  horse.sampleTimes = times;
  horse.accelerationRates = [0, 25.06, 5.53, 0.6];

  const samples = speedSamples(capture, 0);
  expect(samples.map((sample) => sample.startDash)).toEqual([true, true, true, false]);
  expect(
    samples.filter((sample) => !sample.startDash).map((sample) => sample.acceleration)
  ).toEqual([0.6]);
});
