import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { DiagnosticRow, HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
import { modeRows, modeSpans, skillActivationOutcome, skillRows } from './diagnostics-format';

describe('rushing as a race behaviour', () => {
  const capture: ParsedRaceCapture = {
    source: 'api',
    fileName: 'race.json',
    track: {},
    runners: [],
    frames: [],
    events: []
  };

  it('summarizes all rushing periods and exposes their replay timestamps', () => {
    const horse: HorseDiagnostics = {
      horseIndex: 0,
      spans: [],
      temptationSpans: [
        { startTime: 10, endTime: 12, mode: 1 },
        { startTime: 12, endTime: 15, mode: 2 }
      ]
    };

    expect(modeRows(capture, horse)).toEqual([
      { id: 'rushing', mode: 'Rushed', duration: 5, periods: 2, time: 10 }
    ]);
    expect(modeSpans(capture, horse, 'rushing')).toEqual(horse.temptationSpans);
  });

  it('omits rushing when the runner did not rush', () => {
    const horse: HorseDiagnostics = {
      horseIndex: 0,
      spans: [],
      temptationDecision: { enabled: false },
      temptationSpans: []
    };

    expect(modeRows(capture, horse)).toEqual([]);
  });

  it('summarizes blocking while retaining who blocked each period', () => {
    const horse: HorseDiagnostics = {
      horseIndex: 0,
      spans: [],
      frontBlockSpans: [
        { startTime: 4, endTime: 6, blockerHorseIndex: 1 },
        { startTime: 9, endTime: 12, blockerHorseIndex: 2 }
      ]
    };

    expect(modeRows(capture, horse)).toEqual([
      { id: 'blocked', mode: 'Blocked', duration: 5, periods: 2, time: 4 }
    ]);
    expect(modeSpans(capture, horse, 'blocked')).toEqual(horse.frontBlockSpans);
  });
});

describe('skill activation outcomes', () => {
  it.each<{
    label: string;
    decision: DiagnosticRow | undefined;
    observed: boolean;
    expected: string;
  }>([
    { label: 'recorded activation', decision: undefined, observed: true, expected: 'Activated' },
    {
      label: 'missing activation data',
      decision: undefined,
      observed: false,
      expected: 'Not recorded'
    },
    {
      label: 'simulator activation',
      decision: { activated: true, required: true, passed: true },
      observed: false,
      expected: 'Activated'
    },
    {
      label: 'failed wit check',
      decision: { activated: false, required: true, passed: false },
      observed: false,
      expected: 'Wit check failed'
    },
    {
      label: 'passed wit check without activation',
      decision: { activated: false, required: true, passed: true },
      observed: false,
      expected: 'Condition failed'
    },
    {
      label: 'no wit check without activation',
      decision: { activated: false, required: false, passed: true },
      observed: false,
      expected: 'Condition failed'
    },
    {
      label: 'observed activation despite failed initial lottery',
      decision: { activated: false, required: true, passed: false },
      observed: true,
      expected: 'Activated'
    },
    {
      label: 'precondition never met',
      decision: {
        activated: false,
        required: true,
        passed: true,
        miss: { kind: 'preconditionNeverMet', reasons: [] }
      },
      observed: false,
      expected: 'Precondition failed'
    },
    {
      label: 'condition never met',
      decision: {
        activated: false,
        required: true,
        passed: true,
        miss: { kind: 'conditionNeverMet', reasons: [] }
      },
      observed: false,
      expected: 'Condition failed'
    },
    {
      label: 'impossible skill after a failed wit check',
      decision: {
        activated: false,
        required: true,
        passed: false,
        miss: { kind: 'impossible', reasons: ['no place fits among 5 runners'] }
      },
      observed: false,
      expected: 'Impossible'
    }
  ])('$label', ({ decision, observed, expected }) => {
    expect(skillActivationOutcome(decision, observed)).toBe(expected);
  });

  it('gives the simulator reason for an impossible skill only', () => {
    const impossibleReason =
      'order>=3 (place 3-5), order_rate<=40 (place 1-2): no place fits among 5 runners';
    const capture: ParsedRaceCapture = {
      source: 'api',
      fileName: 'race.json',
      track: {},
      runners: [],
      frames: [],
      events: []
    };
    const horse: HorseDiagnostics = {
      horseIndex: 0,
      spans: [],
      skillActivationDecisions: [
        {
          skillId: 1,
          activated: false,
          required: true,
          passed: false,
          miss: { kind: 'impossible', reasons: [impossibleReason] }
        },
        {
          skillId: 2,
          activated: false,
          required: true,
          passed: true,
          miss: { kind: 'conditionNeverMet', reasons: [] }
        }
      ]
    };

    const outcomes = skillRows(capture, 0, horse, undefined).map(({ id, status, reason }) => ({
      id,
      status,
      reason
    }));

    expect(outcomes).toEqual([
      { id: 2, status: 'Condition failed', reason: '' },
      { id: 1, status: 'Impossible', reason: impossibleReason }
    ]);
  });

  it('keeps wit and condition failures contiguous while preserving their original order', () => {
    const runner: RaceRunner = {
      index: 0,
      name: 'Test Uma',
      isPlayer: true,
      stats: {},
      aptitudes: {},
      skillIds: [1, 2, 3, 4, 5, 6],
      raw: {}
    };
    const capture: ParsedRaceCapture = {
      source: 'api',
      fileName: 'race.json',
      track: {},
      runners: [runner],
      frames: [],
      events: []
    };
    const horse: HorseDiagnostics = {
      horseIndex: 0,
      spans: [],
      skillActivationDecisions: [
        { skillId: 1, activated: false, required: false, passed: true },
        { skillId: 2, activated: false, required: true, passed: false },
        { skillId: 3, activated: true, required: true, passed: true },
        { skillId: 4, activated: false, required: true, passed: false },
        { skillId: 5, activated: false, required: true, passed: true }
      ]
    };

    const outcomes = skillRows(capture, 0, horse, runner).map(({ id, status }) => ({ id, status }));

    expect(outcomes).toEqual([
      { id: 3, status: 'Activated' },
      { id: 2, status: 'Wit check failed' },
      { id: 4, status: 'Wit check failed' },
      { id: 1, status: 'Condition failed' },
      { id: 5, status: 'Condition failed' },
      { id: 6, status: 'Not recorded' }
    ]);
  });
});
