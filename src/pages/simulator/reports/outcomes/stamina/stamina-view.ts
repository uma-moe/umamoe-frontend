import { runningStyleName } from '@/lib/race/replay/race-display';
import { RUNNING_STYLES } from '../../../setup/trainee';
import type { MonteCarloInput } from '../../../requests/race-sim-request';
import type { SimulatorUma } from '../../../simulator-uma';

// The stamina estimate needs the stat, style and motivation the batch ran with.
export function staminaInput(
  input: MonteCarloInput | undefined,
  umas: SimulatorUma[],
  source: number
) {
  const runner = input?.runners.find((row) => row.source_input_index === source);
  if (runner) return runner;
  const trainee = umas[source]?.trainee;
  return trainee
    ? ({
        stats: { stamina: Number(trainee.stamina) },
        running_style: trainee.runningStyle,
        motivation: Number(trainee.motivation)
      } as Pick<MonteCarloInput['runners'][number], 'stats' | 'running_style' | 'motivation'>)
    : undefined;
}

export const runnerStyle = (uma: SimulatorUma) =>
  runningStyleName(RUNNING_STYLES.findIndex((value) => value === uma.trainee.runningStyle) + 1);

export const whole = (value: number | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('en-US');

export const percent = (value: number | undefined) =>
  value == null ? '—' : (value > 0 && value < 1 ? '<1' : Math.round(value)) + '%';
