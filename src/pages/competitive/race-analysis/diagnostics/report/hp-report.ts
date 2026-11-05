import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import {
  diagnosticHorse,
  lastSpurtResult,
  runnerHpResult
} from '@/lib/race/capture/race-diagnostics';

const measured = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function hpReport(capture: ParsedRaceCapture, index: number) {
  const horse = diagnosticHorse(capture, index);
  const latest = horse?.lastSpurtDecision;
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
    checkHp: measured(first?.checkHp) ? first.checkHp : undefined,
    requiredHp: measured(first?.fullSpurtNeedHp) ? first.fullSpurtNeedHp : undefined,
    balance,
    totalLoss,
    lossBeforeCheck,
    effects
  };
}
