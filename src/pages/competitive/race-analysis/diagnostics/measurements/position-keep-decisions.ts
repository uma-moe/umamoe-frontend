import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { diagnosticLabel, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';

const modeKeys = [
  '',
  'positionKeepSpeedUp',
  'positionKeepOvertake',
  'positionKeepPaceUp',
  'positionKeepPaceDown',
  'positionKeepPaceUpEx'
];

export function positionKeepModeLabel(mode: number): string {
  const key = modeKeys[mode];
  return key ? diagnosticLabel(key) : mode === 0 ? 'None' : String(mode);
}

export function positionKeepDecisionRows(capture: ParsedRaceCapture, horse: HorseDiagnostics) {
  const decisions = horse.positionKeepDecisions ?? [];
  return decisions.map((decision) => {
    const time = Number(decision.time);
    const key = modeKeys[Number(decision.attemptedMode)];
    const flag = key ? (capture.detailed?.annotations.flags[key] ?? 0) : 0;
    let duration: number | '—' = '—';
    if (decision.outcome === 'Started' && Number.isFinite(time) && flag) {
      const first = horse.spans.findIndex(
        (span) => (span.mask & flag) !== 0 && span.startTime <= time + 1e-5 && span.endTime > time
      );
      if (first >= 0) {
        let end = horse.spans[first]!.endTime;
        for (const span of horse.spans.slice(first + 1)) {
          if ((span.mask & flag) === 0 || Math.abs(span.startTime - end) > 1e-5) break;
          end = span.endTime;
        }
        const nextStart = decisions.reduce(
          (next, candidate) =>
            candidate.outcome === 'Started' &&
            typeof candidate.time === 'number' &&
            candidate.time > time + 1e-5
              ? Math.min(next, candidate.time)
              : next,
          Infinity
        );
        duration = Math.max(0, Math.min(end, nextStart) - time);
      }
    }
    const pacemaker = decision.referenceHorseIndex;
    return {
      ...decision,
      duration,
      pacemakerHorseIndex:
        typeof pacemaker === 'number' &&
        capture.runners.some((runner) => runner.index === pacemaker)
          ? pacemaker
          : -1
    };
  });
}
