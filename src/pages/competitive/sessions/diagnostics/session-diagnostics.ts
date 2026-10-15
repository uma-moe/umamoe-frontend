import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import {
  diagnosticHorse,
  diagnosticLabel,
  lastSpurtResult,
  runnerHpResult
} from '@/lib/race/race-diagnostics';
import { formatRaceTime } from '@/lib/race/race-display';

export type DiagnosticEntry = ReturnType<typeof diagnosticEntries>[number];

export function diagnosticEntries(captures: ParsedRaceCapture[]) {
  return captures.flatMap((capture, race) =>
    capture.runners.map((runner) => ({
      capture,
      race,
      runner,
      horse: diagnosticHorse(capture, runner.index),
      key: race + ':' + runner.index
    }))
  );
}

export function outcomeRow(e: DiagnosticEntry, pending: boolean) {
  const h = e.horse,
    spurtResult = lastSpurtResult(e.capture, e.runner.index),
    hp = runnerHpResult(e.capture, e.runner.index);
  return {
    id: e.key,
    name: e.runner.name,
    race: e.race + 1,
    finish: e.runner.result?.finishOrder ?? '—',
    time: formatRaceTime(
      e.runner.result?.finishTimeRaw && e.runner.result.finishTimeRaw > 0
        ? e.runner.result.finishTimeRaw
        : e.runner.result?.finishTime
    ),
    hp: hp.finish ?? '—',
    percent: hp.percent ?? '—',
    spurt: spurtResult.delay ?? '—',
    loss: h?.worldTransformDistanceLoss ?? '—',
    start:
      e.runner.result?.startDelayTime !== undefined ? e.runner.result.startDelayTime * 1000 : '—',
    delayed: Number(
      h?.lostStartAccelerationFrame === true ||
        (!!e.runner.result && (e.runner.result.startDelayTime ?? 0) >= 0.08)
    ),
    blocked: h?.frontBlockSpans?.reduce((sum, s) => sum + s.endTime - s.startTime, 0) ?? '—',
    source: h ? 'Detailed' : pending ? 'Processing' : 'Unavailable'
  };
}

export function diagnosticModes(measured: DiagnosticEntry[]) {
  const totals = new Map<
    string,
    {
      id: string;
      name: string;
      duration: number;
      periods: number;
      entries: Set<string>;
      traces: { race: number; runner: number; name: string; start: number; end: number }[];
    }
  >();
  for (const e of measured)
    for (const [key, flag] of Object.entries(e.capture.detailed?.annotations.flags ?? {})) {
      const spans = e.horse!.spans.filter((s) => (s.mask & flag) !== 0);
      if (!spans.length) continue;
      const row = totals.get(key) ?? {
        id: key,
        name: diagnosticLabel(key),
        duration: 0,
        periods: 0,
        entries: new Set(),
        traces: []
      };
      for (const span of spans) {
        row.duration += span.endTime - span.startTime;
        row.periods++;
        row.traces.push({
          race: e.race,
          runner: e.runner.index,
          name: e.runner.name,
          start: span.startTime,
          end: span.endTime
        });
      }
      row.entries.add(e.key);
      totals.set(key, row);
    }
  return [...totals.values()];
}
