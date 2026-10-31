import { createSimulatorUma, restoreSimulatorUma, type SimulatorUma } from '../../simulator-uma';

/**
 * The runner the HP calculator and the Build optimizer share: her Uma, stats, aptitudes and skills, so picking her on
 * one tab picks her on the other. Saved in this browser, so a reload keeps her.
 */
export interface SimulatorRunnerState {
  uma: SimulatorUma;
}

const STORAGE_KEY = 'uma.simulator-runner.v1';

/** Each tab used to save its own runner inside its setup; these are read once, until the shared runner is saved. */
const TAB_STORAGE_KEYS = ['uma.build-search.v1', 'uma.hp-calculator.v1'];

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;

function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    /* Storage can be unavailable or hold something else. */
    return null;
  }
}

/** The runner a tab's setup carries, from a whole-tab code or an older save, when it has a valid one. */
export function runnerFromSetup(setup: unknown): SimulatorUma | undefined {
  const fallback = createSimulatorUma('Your runner');
  const uma = restoreSimulatorUma(record(setup)?.uma, fallback);
  return uma === fallback ? undefined : uma;
}

/**
 * The tabs' older runners, preferring the first one with an Uma picked: the Build optimizer's, then the HP
 * calculator's. Without a pick, the first saved runner keeps the stats typed in.
 */
export function migrateTabRunners(setups: unknown[]): SimulatorUma | undefined {
  const runners = setups.flatMap((setup) => runnerFromSetup(setup) ?? []);
  return runners.find((uma) => uma.cardId !== undefined) ?? runners[0];
}

function restore(): SimulatorUma {
  const saved = runnerFromSetup({ uma: readStored(STORAGE_KEY) });
  if (saved) return saved;

  return migrateTabRunners(TAB_STORAGE_KEYS.map(readStored)) ?? createSimulatorUma('Your runner');
}

export const simulatorRunner = $state<SimulatorRunnerState>({ uma: restore() });

/** Saves the runner in this browser; call it from an effect so every change is kept. */
export function saveSimulatorRunner(): void {
  const data = JSON.stringify(simulatorRunner.uma);
  try {
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    /* Storage can be full or disabled; the runner still works for this visit. */
  }
}
