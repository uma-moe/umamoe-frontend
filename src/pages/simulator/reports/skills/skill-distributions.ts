import type { MonteCarloResult, SimulatorProc } from '../../simulator-repository';
import { simulatorSampleSummary, winRateInterval } from '../../simulator-results';
import { reportCrossing } from '../simulation-report';

export function skillDistributions(result: MonteCarloResult, source: number, owned: number[]) {
  const skills = new Map<number, { id: number; procs: { run: number; proc: SimulatorProc }[] }>();
  for (const id of owned) skills.set(id, { id, procs: [] });
  result.skill_procs?.forEach((trace, run) => {
    for (const proc of trace.activations) {
      if (proc[0] !== source || !(proc[7] & 1)) continue;
      if (!skills.has(proc[1])) skills.set(proc[1], { id: proc[1], procs: [] });
      skills.get(proc[1])!.procs.push({ run, proc });
    }
  });

  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;

  const rows = [...skills.values()]
    .map((row) => {
      const counts = Array<number>(result.runs).fill(0);
      for (const { run } of row.procs) counts[run]!++;
      const triggered = counts.filter((count) => count > 0).length;
      const observedDurations = row.procs
        .filter(({ proc }) => proc[6] > 0)
        .map(({ run, proc }) => {
          const finish = result.report
            ? reportCrossing(result.report, run, source, result.report.distance_m.length - 1)
            : undefined;

          return finish == null ? proc[6] : Math.min(proc[6], Math.max(0, finish - proc[4]));
        });

      return {
        ...row,
        counts,
        triggered,
        observedDurations,
        interval: winRateInterval(triggered, result.runs),
        timing: simulatorSampleSummary(row.procs.map(({ proc }) => proc[4])),
        distances: simulatorSampleSummary(row.procs.map(({ proc }) => proc[5])),
        durations: simulatorSampleSummary(observedDurations),
        countSummary: simulatorSampleSummary(counts),
        activePerRace: observedDurations.reduce((sum, value) => sum + value, 0) / result.runs,
        rate: (triggered / result.runs) * 100,
        total: row.procs.length,
        distance: mean(row.procs.map(({ proc }) => proc[5])),
        time: mean(row.procs.map(({ proc }) => proc[4])),
        duration: mean(observedDurations),
        passive: row.procs.some(({ proc }) => proc[6] < 0),
        instant: row.procs.some(({ proc }) => proc[6] === 0)
      };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.id - b.id);

  const procs = rows.flatMap((row) => row.procs);
  // Keep the time axis in simulation seconds; official finish times use a different clock.
  const endTime = Math.max(
    10,
    Math.ceil(
      procs.reduce((max, { proc }) => Math.max(max, proc[4] + Math.max(0, proc[6])), 0) / 10
    ) * 10
  );

  const maxDuration = procs.reduce((max, { proc }) => Math.max(max, proc[6]), 1);
  const maxCount = rows.reduce(
    (max, row) => row.counts.reduce((max, count) => Math.max(max, count), max),
    1
  );

  return { rows, endTime, maxDuration, maxCount };
}

export type SkillDistributionRow = ReturnType<typeof skillDistributions>['rows'][number];

/** Observed frequencies: per race for counts, per activation for timing and duration. */
export function skillHistogram(
  row: SkillDistributionRow,
  mode: string,
  max: number,
  bins = 48,
  min = 0
): number[] {
  let values: number[];
  if (mode === 'counts') values = row.counts;
  else if (mode === 'duration') values = row.observedDurations;
  else values = row.procs.map(({ proc }) => (mode === 'distance' ? proc[5] : proc[4]));
  const cells = Array<number>(bins).fill(0);
  for (const value of values) {
    const bin =
      mode === 'counts'
        ? value
        : Math.floor(((value - min) / Math.max(Number.EPSILON, max - min)) * bins);

    cells[Math.max(0, Math.min(bins - 1, bin))]!++;
  }

  return cells.map((count) => (values.length ? (count / values.length) * 100 : 0));
}
