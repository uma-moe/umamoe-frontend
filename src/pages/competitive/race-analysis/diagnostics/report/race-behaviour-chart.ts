import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { raceTimeAtDistance } from '@/lib/race/replay/race-replay';
import { racePhaseBands } from '../../race-phase-bands';

const tickSteps = [1, 2, 5, 10, 15, 20, 30, 60, 120];

/** Round race times across a visible range, no more than `maxTicks` of them. */
export function timeTicks(min: number, max: number, maxTicks = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [];

  const step = tickSteps.find((candidate) => span / candidate <= maxTicks) ?? 120;
  const ticks: number[] = [];

  for (let tick = Math.ceil(min / step) * step; tick <= max + 1e-9; tick += step) ticks.push(tick);

  return ticks;
}

export interface PhaseSpan {
  label: string;
  color: string;
  start: number;
  end: number;
}

/** The race phases in the runner's own race time, from when it reached the start of each. */
export function phaseSpans({
  capture,
  index,
  distance,
  raceEnd
}: {
  capture: ParsedRaceCapture;
  index: number;
  distance: number;
  raceEnd: number;
}): PhaseSpan[] {
  const starts = racePhaseBands.map((phase) =>
    phase.start === 0 ? 0 : raceTimeAtDistance(capture.frames, distance * phase.start, index)
  );

  return racePhaseBands.flatMap((phase, position) => {
    const start = starts[position];
    if (start === undefined) return [];

    const end = starts.slice(position + 1).find((time) => time !== undefined) ?? raceEnd;
    return [{ label: phase.name.replace(' race', ''), color: phase.color, start, end }];
  });
}

/** Where a time range sits in the visible window, in percent of the plot width, or undefined out of view. */
export function placement(
  start: number,
  end: number,
  view: { min: number; max: number }
): { left: number; width: number } | undefined {
  const span = view.max - view.min;
  if (!(span > 0) || end < view.min || start > view.max) return undefined;

  const from = Math.max(start, view.min);
  const to = Math.min(end, view.max);

  return { left: ((from - view.min) / span) * 100, width: ((to - from) / span) * 100 };
}
