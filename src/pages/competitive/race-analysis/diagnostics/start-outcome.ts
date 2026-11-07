import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';

/** A start delay from this many seconds on counts as a late start. */
const lateStartDelay = 0.08;

export interface StartOutcome {
  label: 'Late' | 'Normal' | 'Not recorded';
  late: boolean;
  delayMs?: number;
  lostAccelerationFrame: boolean;
}

/** How a runner left the gate: late when it lost its start acceleration frame or reacted slowly. */
export function startOutcome(
  horse: Pick<HorseDiagnostics, 'lostStartAccelerationFrame'>,
  result: RaceRunner['result'] | undefined
): StartOutcome {
  const delay = result?.startDelayTime;
  const lostAccelerationFrame = horse.lostStartAccelerationFrame === true;
  const late = lostAccelerationFrame || (delay ?? 0) >= lateStartDelay;
  const delayMs = delay === undefined ? undefined : delay * 1000;

  if (late) return { label: 'Late', late, delayMs, lostAccelerationFrame };

  const recorded = horse.lostStartAccelerationFrame !== undefined || delay !== undefined;
  return { label: recorded ? 'Normal' : 'Not recorded', late, delayMs, lostAccelerationFrame };
}
