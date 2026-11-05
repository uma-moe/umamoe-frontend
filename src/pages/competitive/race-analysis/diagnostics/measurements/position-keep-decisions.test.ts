import { expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
import { positionKeepDecisionRows, positionKeepModeLabel } from './position-keep-decisions';

const capture: ParsedRaceCapture = {
  source: 'api',
  fileName: 'race.json',
  track: {},
  frames: [],
  events: [],
  runners: [0, 1].map((index) => ({
    index,
    name: 'Aston Machan',
    trainerName: index ? 'B' : 'A',
    isPlayer: false,
    stats: {},
    aptitudes: {},
    skillIds: [],
    raw: {}
  })),
  detailed: {
    engineBuild: 'test',
    seed: 1,
    replay: { data: '' },
    annotations: {
      schemaVersion: 7,
      flags: { positionKeepSpeedUp: 1 },
      horses: [],
      paceMakerSpans: [
        { startTime: 0, endTime: 2, horseIndex: 0 },
        { startTime: 2, endTime: 10, horseIndex: 1 }
      ]
    }
  }
};
const horse: HorseDiagnostics = {
  horseIndex: 0,
  spans: [
    { startTime: 1, endTime: 2, mask: 1 },
    { startTime: 2, endTime: 3, mask: 33 },
    { startTime: 4, endTime: 6, mask: 1 }
  ],
  positionKeepDecisions: [
    { time: 1, attemptedMode: 1, outcome: 'Started', referenceHorseIndex: 0 },
    { time: 3, attemptedMode: 1, outcome: 'FailedRoll', referenceHorseIndex: 0 },
    { time: 4, attemptedMode: 1, outcome: 'Started', referenceHorseIndex: 0 },
    { time: 5, attemptedMode: 1, outcome: 'Started', referenceHorseIndex: 0 }
  ]
};

it('measures contiguous mode duration across other flag changes and bounds repeated starts', () => {
  expect(positionKeepDecisionRows(capture, horse).map((row) => row.duration)).toEqual([
    2,
    '—',
    1,
    1
  ]);
});

it('uses the runner-specific reference even when the race-wide pacemaker differs', () => {
  expect(positionKeepDecisionRows(capture, horse).map((row) => row.pacemakerHorseIndex)).toEqual([
    0, 0, 0, 0
  ]);
});

it('uses a recorded reference even outside the race-wide pacemaker intervals', () => {
  const rows = positionKeepDecisionRows(capture, {
    horseIndex: 0,
    spans: [],
    positionKeepDecisions: [
      { time: 12, attemptedMode: 1, outcome: 'Started', referenceHorseIndex: 1 }
    ]
  });
  expect(rows[0]).toMatchObject({ duration: '—', pacemakerHorseIndex: 1 });
});

it('does not fall back to the race-wide pacemaker for missing or invalid references', () => {
  const rows = positionKeepDecisionRows(capture, {
    horseIndex: 0,
    spans: [],
    positionKeepDecisions: [
      { time: 1, attemptedMode: 1, outcome: 'Started' },
      { time: 2, attemptedMode: 1, outcome: 'Started', referenceHorseIndex: 99 }
    ]
  });
  expect(rows.map((row) => row.pacemakerHorseIndex)).toEqual([-1, -1]);
});

it('uses the same mode names as Race behaviour', () => {
  expect([1, 2, 3, 4, 5].map(positionKeepModeLabel)).toEqual([
    'Speed up',
    'Overtake',
    'Pace up',
    'Pace down',
    'Pace up ex'
  ]);
});
