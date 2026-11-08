import { expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics, DiagnosticRow } from '@/lib/race/capture/race-diagnostics';
import { calculationOutcome, hpReport, spurtOutcome, spurtSelection } from './hp-report';

function capture(horse: Partial<HorseDiagnostics>): ParsedRaceCapture {
  return {
    source: 'api',
    fileName: 'race.json',
    track: {},
    frames: [],
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
        result: {
          finishOrder: 1,
          finishTime: 65,
          finishTimeRaw: 60,
          finishDiffTime: 0,
          runningStyle: 1
        }
      }
    ],
    detailed: {
      engineBuild: 'test',
      seed: 1,
      replay: { data: '' },
      annotations: {
        schemaVersion: 7,
        flags: {},
        horses: [{ horseIndex: 0, spans: [], maxHp: 1000, startHp: 1000, finalHp: 50, ...horse }]
      }
    }
  };
}

const first = { time: 40, checkHp: 400, fullSpurtNeedHp: 450, calculationCount: 1 };

function effect(time: number, appliedHpDelta: number, extra: DiagnosticRow = {}): DiagnosticRow {
  return {
    time,
    appliedHpDelta,
    requestedHpDelta: appliedHpDelta,
    skillId: 1,
    targetHorseIndex: 0,
    casterHorseIndex: 1,
    ...extra
  };
}

it('keeps the first-check shortfall when a later recovery produces a surplus', () => {
  const later = { ...first, time: 45, checkHp: 500, fullSpurtNeedHp: 420, calculationCount: 2 };
  const report = hpReport(
    capture({ lastSpurtDecisions: [first, later], lastSpurtDecision: later }),
    0
  );

  expect(report.balance).toBe(-50);
  expect(report.checkTime).toBe(40);
});

it('places the chart check at the first decision and keeps every decision for the history', () => {
  const firstCheck = { ...first, checkDistance: 1500 };
  const later = { ...first, time: 45, checkDistance: 1800, calculationCount: 2 };

  const report = hpReport(
    capture({ lastSpurtDecisions: [firstCheck, later], lastSpurtDecision: later }),
    0
  );

  expect(report.checkDistance).toBe(1500);
  expect(report.calculations).toEqual([firstCheck, later]);
});

it('lists the final calculation alone when a capture kept no history', () => {
  const final = { ...first, calculationCount: 3 };

  const report = hpReport(capture({ lastSpurtDecision: final }), 0);

  expect(report.calculations).toEqual([final]);
  expect(hpReport(capture({}), 0).calculations).toEqual([]);
});

it('totals actual negative effects, including self-cost, without netting recovery or post-finish effects', () => {
  const report = hpReport(
    capture({
      lastSpurtDecisions: [first],
      hpSkillApplications: [
        effect(5, -15.22),
        effect(20, 5.33),
        effect(30, -60.89, { casterHorseIndex: 0 }),
        effect(40, -2),
        effect(45, -5, { requestedHpDelta: -30 }),
        effect(46, -10, { targetHorseIndex: 1 }),
        effect(60, -99),
        effect(62, -99)
      ]
    }),
    0
  );

  expect(report.lossBeforeCheck).toBeCloseTo(78.11);
  expect(report.totalLoss).toBeCloseTo(83.11);
  expect(report.effects).toHaveLength(5);
  expect(report.effects[0]?.percent).toBeCloseTo(-1.522);
});

it('distinguishes zero losses from missing HP application data', () => {
  expect(
    hpReport(capture({ lastSpurtDecisions: [first], hpSkillApplications: [] }), 0)
  ).toMatchObject({ lossBeforeCheck: 0, totalLoss: 0 });
  expect(hpReport(capture({ lastSpurtDecisions: [first] }), 0)).toMatchObject({
    lossBeforeCheck: undefined,
    totalLoss: undefined
  });
});

it('does not call a later recalculation the first check when history is missing', () => {
  expect(
    hpReport(capture({ lastSpurtDecision: { ...first, calculationCount: 2 } }), 0)
  ).toMatchObject({ balance: undefined, checkTime: undefined });
  expect(hpReport(capture({ lastSpurtDecision: { ...first, checkHp: 460 } }), 0).balance).toBe(10);
});

it('heads the spurt with whether it started late or ran below full speed', () => {
  const spurt = {
    start: 1500,
    delay: 0,
    speed: 24,
    reduction: 0,
    noSpurt: false,
    speedPenalty: false
  };

  expect(spurtOutcome(spurt)).toEqual({ label: 'Full spurt', clean: true });
  expect(spurtOutcome({ ...spurt, delay: 0.04 })?.label).toBe('Full spurt');
  expect(spurtOutcome({ ...spurt, delay: 20 })?.label).toBe('Delayed spurt');
  expect(spurtOutcome({ ...spurt, speedPenalty: true })?.label).toBe('Slower spurt');
  expect(spurtOutcome({ ...spurt, delay: 20, speedPenalty: true })?.label).toBe(
    'Delayed and slower'
  );
  expect(spurtOutcome({ ...spurt, noSpurt: true })).toEqual({ label: 'No spurt', clean: false });
});

it('leaves the spurt unheaded when nothing about it was measured', () => {
  const unmeasured = {
    start: undefined,
    delay: undefined,
    speed: undefined,
    reduction: undefined,
    noSpurt: false,
    speedPenalty: false
  };

  expect(spurtOutcome(unmeasured)).toBeUndefined();
});

it('names what each calculation chose', () => {
  const full = {
    result: 'True',
    fullSpurtTargetSpeed: 24,
    selectedTargetSpeed: 24,
    delayPenalty: false,
    speedPenalty: false
  };

  expect(calculationOutcome(full)).toEqual({ label: 'Full spurt', clean: true, selected: true });
  expect(calculationOutcome({ ...full, selectedTargetSpeed: 23 }).label).toBe('Slower spurt');
  expect(calculationOutcome({ ...full, delayPenalty: true }).label).toBe('Delayed spurt');
  expect(calculationOutcome({ ...full, delayPenalty: true, speedPenalty: true }).label).toBe(
    'Delayed and slower'
  );
  expect(calculationOutcome({ ...full, result: 'False' }).label).toBe('No spurt');
  expect(calculationOutcome({ ...full, result: 'FalseBelowNeedMinimumHp' }).label).toBe(
    'Insufficient HP'
  );
});

it('heads the calculation with a full, reduced or missing spurt', () => {
  const full = {
    result: 'TrueExceedNeedMaximumHp',
    fullSpurtTargetSpeed: 24,
    selectedTargetSpeed: 24
  };

  expect(spurtSelection(full)).toEqual({ label: 'Full spurt selected', clean: true });
  expect(spurtSelection({ ...full, result: 'True', speedPenalty: true })).toEqual({
    label: 'Reduced spurt selected',
    clean: false
  });
  expect(spurtSelection({ ...full, result: 'False' })).toEqual({ label: 'No spurt', clean: false });
});
