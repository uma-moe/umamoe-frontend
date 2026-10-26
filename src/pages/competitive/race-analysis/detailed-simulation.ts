import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';

/** Where a replay's detailed simulation stands; views show recorded data until it is ready. */
export type DetailedSimulation =
  | { status: 'ready' }
  | { status: 'queued' }
  | { status: 'running' }
  | { status: 'failed'; reason: string }
  | { status: 'unavailable'; reason: string };

export const missingSimulationInput =
  'This replay has no recorded race input, so it cannot be resimulated.';

/** The state a replay shows when nothing is loading it: either it carries the simulation or it never will. */
export function recordedSimulation(capture: ParsedRaceCapture): DetailedSimulation {
  return capture.detailed
    ? { status: 'ready' }
    : { status: 'unavailable', reason: missingSimulationInput };
}
