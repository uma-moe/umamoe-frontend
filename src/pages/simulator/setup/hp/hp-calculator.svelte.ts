import { RACE_TYPES } from '../../requests/stamina-request';
import { createHpPlan, STAT_KEYS, type HpPlan } from './hp-plan';

/**
 * The HP calculator's own skill counts and race options, kept apart from the race field so nothing here changes the
 * race simulator's field. The runner, whose own skills race as she has them, is shared with the Build optimizer
 * (simulator-runner). Saved in this browser, so a reload or a discarded tab keeps the setup.
 */
export interface HpCalculatorState {
  plan: HpPlan;
  raceType: string;
  fullSpurt: string;
}

const STORAGE_KEY = 'uma.hp-calculator.v1';

function defaults(): HpCalculatorState {
  return {
    plan: createHpPlan(),
    raceType: '0',
    fullSpurt: 'false'
  };
}

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;

const count = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** Formats the picker used to list, read as the format that simulates the same race. */
const RETIRED_RACE_TYPES = new Map([
  ['5', '0'],
  ['7', '6'],
  ['8', '0']
]);

/** A saved race format the picker still lists, or Champions Meeting. */
function restoreRaceType(saved: string): string {
  const replacement = RETIRED_RACE_TYPES.get(saved);
  if (replacement !== undefined) return replacement;

  const listed = RACE_TYPES.some((raceType) => String(raceType) === saved);
  return listed ? saved : '0';
}

/** Reads a saved plan over the defaults, keeping only fields of the right type. */
export function restorePlan(saved: unknown): HpPlan {
  const plan = createHpPlan(),
    data = record(saved);

  if (!data) return plan;
  for (const kind of ['recovery', 'speed', 'accel', 'debuffs'] as const) {
    const group = record(data[kind]);
    if (!group) continue;
    for (const field of ['gold', 'white', 'unique'] as const)
      plan[kind][field] = count(group[field], plan[kind][field]);
  }

  const recovery = record(data.recovery);
  if (recovery) {
    plan.recovery.uniquePercent = count(recovery.uniquePercent, plan.recovery.uniquePercent);
    plan.recovery.uniqueLevel = count(recovery.uniqueLevel, plan.recovery.uniqueLevel);
  }

  const green = record(data.green);
  for (const stat of STAT_KEYS) {
    const item = record(green?.[stat]);
    if (item)
      plan.green[stat] = {
        gold: count(item.gold, 0),
        white: count(item.white, 0)
      };
  }

  for (const key of ['positionFight', 'rushed', 'paceDown', 'duel'] as const) {
    const item = record(data[key]);
    if (item)
      plan[key] = {
        on: item.on === true,
        seconds: typeof item.seconds === 'number' && item.seconds > 0 ? item.seconds : null
      };
  }

  plan.downhill = data.downhill === true;
  // Debuffs used to be one count of a chosen percent; keep them as white or gold, whichever is nearer.
  const debuffs = record(data.debuffs);
  if (debuffs && 'count' in debuffs) {
    const percent = count(debuffs.percent, 1);
    plan.debuffs[percent >= 2 ? 'gold' : 'white'] = count(debuffs.count, 0);
  }

  return plan;
}

/** A saved or imported setup over the defaults, keeping only fields of the right type. */
export function restoreHpCalculator(saved: unknown): HpCalculatorState {
  const state = defaults();
  const data = record(saved);
  if (!data) return state;

  state.plan = restorePlan(data.plan);
  if (typeof data.raceType === 'string') state.raceType = restoreRaceType(data.raceType);
  if (data.fullSpurt === 'true' || data.fullSpurt === 'false') state.fullSpurt = data.fullSpurt;

  return state;
}

function restore(): HpCalculatorState {
  try {
    return restoreHpCalculator(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    /* Storage can be unavailable or hold something else; start fresh then. */
    return defaults();
  }
}

export const hpCalculator = $state<HpCalculatorState>(restore());

/** Saves the setup in this browser; call it from an effect so every change is kept. */
export function saveHpCalculator(): void {
  const data = JSON.stringify(hpCalculator);
  try {
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    /* Storage can be full or disabled; the setup still works for this visit. */
  }
}
