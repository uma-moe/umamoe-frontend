import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { raceFrameAtTime } from '@/lib/race/replay/race-replay';
import {
  diagnosticHorse,
  modeDuration,
  lastSpurtResult,
  runnerHpResult
} from '@/lib/race/capture/race-diagnostics';
import { runningStyleName } from '@/lib/race/replay/race-display';
import { skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';

export const n = (v: unknown, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

export function raceResultRows(capture: ParsedRaceCapture, catalog: Map<number, SkillData>) {
  return [...capture.runners]
    .sort((a, b) => (a.result?.finishOrder ?? 99) - (b.result?.finishOrder ?? 99))
    .map((r, place) => {
      const h = diagnosticHorse(capture, r.index),
        result = r.result,
        hpResult = runnerHpResult(capture, r.index);

      const end =
        result?.finishTimeRaw && result.finishTimeRaw > 0
          ? result.finishTimeRaw
          : result?.finishTime;

      const flags = capture.detailed?.annotations.flags;
      const exhausted = capture.frames.find((f) => (f.horses[r.index]?.hp ?? 1) <= 0);
      const previousRunner = capture.runners.find(
          (other) => other.result?.finishOrder === (result?.finishOrder ?? 0) - 1
        ),
        previous = previousRunner?.result;

      const previousTime = previous?.finishTimeRaw ?? previous?.finishTime;
      const priorFinish =
        previousTime === undefined ? undefined : raceFrameAtTime(capture.frames, previousTime);

      const recordedGap =
        priorFinish && previousRunner
          ? Math.max(
              0,
              (priorFinish.horses[previousRunner.index]?.distance ?? 0) -
                (priorFinish.horses[r.index]?.distance ?? 0)
            )
          : undefined;

      const exhaustedDistance = h ? h.hpExhaustedDistance : exhausted?.horses[r.index]?.distance;

      const exhaustedBeforeFinish =
        typeof exhaustedDistance === 'number' && capture.raceDistance
          ? Math.max(0, capture.raceDistance - exhaustedDistance)
          : undefined;

      const downhill = modeDuration(h, flags, ['downhill']);
      const downhillLate =
        h && flags
          ? [2, 3, 4].reduce(
              (sum, phase) => sum + (modeDuration(h, flags, ['downhill'], phase) ?? 0),
              0
            )
          : undefined;

      const spurtResult = lastSpurtResult(capture, r.index);

      let startStatus = result?.startDelayTime === undefined ? '' : 'Normal';
      if (h?.lostStartAccelerationFrame) startStatus = 'Lost acceleration frame';
      else if ((result?.startDelayTime ?? 0) >= 0.08) startStatus = 'Late start';
      return {
        id: r.index,
        place: result?.finishOrder ?? place + 1,
        gate: r.index + 1,
        name: r.name,
        trainer: r.trainerName ?? '',
        grade: Number(r.raw.final_grade ?? r.raw.finalGrade) || '—',
        time: end ?? '—',
        gap: h ? (h.finishDistanceToPrevious ?? '—') : (recordedGap ?? '—'),
        style: runningStyleName(result?.runningStyle),
        delay: result?.startDelayTime !== undefined ? result.startDelayTime * 1000 : '—',
        late: startStatus,
        spurt: spurtResult.delay ?? '—',
        hp: hpResult.finish ?? '—',
        startHp: hpResult.start ?? '—',
        maxHp: hpResult.max ?? '—',
        deficit: h?.hpDeficit ?? '—',
        exhausted: exhaustedDistance ?? '—',
        exhaustedBeforeFinish: exhaustedBeforeFinish ?? '—',
        duel: modeDuration(h, flags, ['dueling']) ?? '—',
        downhill: downhill ?? '—',
        downhillLate: downhillLate ?? '—',
        downhillEarly:
          downhill !== undefined && downhillLate !== undefined
            ? Math.max(0, downhill - downhillLate)
            : '—',
        paceUp:
          modeDuration(h, flags, [
            'positionKeepSpeedUp',
            'positionKeepOvertake',
            'positionKeepPaceUp',
            'positionKeepPaceUpEx'
          ]) ?? '—',
        paceDown: modeDuration(h, flags, ['positionKeepPaceDown']) ?? '—',
        loss: h?.worldTransformDistanceLoss ?? '—',
        rushed: h?.temptationSpans?.reduce((n, s) => n + s.endTime - s.startTime, 0) ?? '—',
        blocked: h?.frontBlockSpans?.reduce((n, s) => n + s.endTime - s.startTime, 0) ?? '—',
        popularity: h?.popularity ?? (Number(r.raw.popularity) || '—'),
        sp: skillPointTotal(catalog, r.skillIds) ?? '—'
      };
    });
}
