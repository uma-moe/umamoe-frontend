import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import {
  diagnosticHorse,
  lastSpurtResult,
  runnerHpResult,
  type DiagnosticRow
} from '@/lib/race/capture/race-diagnostics';

const measured = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type SpurtResult = ReturnType<typeof lastSpurtResult>;

const spurtResults = new Set(['True', 'TrueExceedNeedMaximumHp']);

/** A delay that rounds to 0.0 m reads as none. */
export const delayedSpurt = (spurt: SpurtResult) => (spurt.delay ?? 0) >= 0.05;

/** The spurt's headline: whether it ran, started late or ran below the full-spurt speed. */
export function spurtOutcome(spurt: SpurtResult): { label: string; clean: boolean } | undefined {
  if (spurt.noSpurt) return { label: 'No spurt', clean: false };
  if (spurt.delay === undefined && spurt.speed === undefined) return undefined;

  const delayed = delayedSpurt(spurt);
  if (delayed && spurt.speedPenalty) return { label: 'Delayed and slower', clean: false };
  if (delayed) return { label: 'Delayed spurt', clean: false };
  if (spurt.speedPenalty) return { label: 'Slower spurt', clean: false };

  return { label: 'Full spurt', clean: true };
}

/** What one spurt calculation chose: a full spurt, a delayed or slower one, or none. */
export function calculationOutcome(calculation: DiagnosticRow): {
  label: string;
  clean: boolean;
  selected: boolean;
} {
  if (!spurtResults.has(String(calculation.result))) {
    const label = calculation.result === 'FalseBelowNeedMinimumHp' ? 'Insufficient HP' : 'No spurt';
    return { label, clean: false, selected: false };
  }

  const { fullSpurtTargetSpeed, selectedTargetSpeed } = calculation;
  const reduction =
    measured(fullSpurtTargetSpeed) && measured(selectedTargetSpeed)
      ? fullSpurtTargetSpeed - selectedTargetSpeed
      : 0;
  const delayed = Boolean(calculation.delayPenalty);
  const slower = Boolean(calculation.speedPenalty) || reduction >= 0.005;

  if (delayed && slower) return { label: 'Delayed and slower', clean: false, selected: true };
  if (delayed) return { label: 'Delayed spurt', clean: false, selected: true };
  if (slower) return { label: 'Slower spurt', clean: false, selected: true };

  return { label: 'Full spurt', clean: true, selected: true };
}

/** The final calculation's choice, as the calculation's heading names it. */
export function spurtSelection(calculation: DiagnosticRow): { label: string; clean: boolean } {
  const { label, clean, selected } = calculationOutcome(calculation);
  if (clean) return { label: 'Full spurt selected', clean };
  if (selected) return { label: 'Reduced spurt selected', clean };

  return { label, clean };
}

export function hpReport(capture: ParsedRaceCapture, index: number) {
  const horse = diagnosticHorse(capture, index);
  const latest = horse?.lastSpurtDecision;
  const history = horse?.lastSpurtDecisions ?? [];
  const finalDecision = latest ?? history.at(-1);
  // Older captures keep only the final calculation.
  const calculations = history.length || !finalDecision ? history : [finalDecision];
  const first =
    horse?.lastSpurtDecisions?.[0] ??
    (Number(latest?.calculationCount ?? 1) <= 1 ? latest : undefined);
  const checkTime = measured(first?.time) ? first.time : undefined;
  const balance =
    measured(first?.checkHp) && measured(first?.fullSpurtNeedHp)
      ? first.checkHp - first.fullSpurtNeedHp
      : undefined;
  const runner = capture.runners.find((runner) => runner.index === index);
  const finishTime =
    runner?.result?.finishTimeRaw && runner.result.finishTimeRaw > 0
      ? runner.result.finishTimeRaw
      : runner?.result?.finishTime;
  const hp = runnerHpResult(capture, index);
  const effects = (horse?.hpSkillApplications ?? []).flatMap((event, eventIndex) => {
    if (
      event.targetHorseIndex !== index ||
      !measured(event.time) ||
      !measured(event.skillId) ||
      !measured(event.appliedHpDelta) ||
      (finishTime !== undefined && event.time >= finishTime)
    )
      return [];

    return [
      {
        id: eventIndex,
        time: event.time,
        skillId: event.skillId,
        change: event.appliedHpDelta,
        percent: hp.max !== undefined && hp.max > 0 ? (event.appliedHpDelta / hp.max) * 100 : '—',
        requested: measured(event.requestedHpDelta) ? event.requestedHpDelta : event.appliedHpDelta
      }
    ];
  });
  const negative = effects.filter((event) => event.change < 0);
  const totalLoss =
    horse?.hpSkillApplications === undefined
      ? undefined
      : negative.reduce((total, event) => total - event.change, 0);
  const lossBeforeCheck =
    checkTime === undefined || totalLoss === undefined
      ? undefined
      : negative
          .filter((event) => event.time <= checkTime)
          .reduce((total, event) => total - event.change, 0);

  return {
    hp,
    exhaustedDistance: horse?.hpExhaustedDistance,
    spurt: lastSpurtResult(capture, index),
    checkTime,
    checkDistance: measured(first?.checkDistance) ? first.checkDistance : undefined,
    checkHp: measured(first?.checkHp) ? first.checkHp : undefined,
    requiredHp: measured(first?.fullSpurtNeedHp) ? first.fullSpurtNeedHp : undefined,
    balance,
    totalLoss,
    lossBeforeCheck,
    effects,
    calculations,
    finalDecision
  };
}
