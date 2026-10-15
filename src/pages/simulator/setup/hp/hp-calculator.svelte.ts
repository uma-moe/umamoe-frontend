import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import type { SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
import { createSimulatorUma, type SimulatorUma } from '../../simulator-uma';
import { countSkills, createHpPlan, STAT_KEYS, type HpPlan } from './hp-plan';
import { createTrainee, RUNNING_STYLES } from '../trainee';

/**
 * The HP calculator's own runner, skill counts and race options, kept apart from the race field so nothing here
 * changes the race simulator's field. Saved in this browser, so a reload or a discarded tab keeps the setup.
 */
export interface HpCalculatorState {
  uma: SimulatorUma;
  plan: HpPlan;
  /** Which build the skill counts were last taken from, for the note beside them. */
  counted: string;
  raceType: string;
  fullSpurt: string;
}

const STORAGE_KEY = 'uma.hp-calculator.v1';

function defaults(): HpCalculatorState {
  return {
    uma: createSimulatorUma('Your runner'),
    plan: createHpPlan(),
    counted: '',
    raceType: '0',
    fullSpurt: 'false'
  };
}

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;
const count = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** Reads a saved plan over the defaults, keeping only fields of the right type. */
export function restorePlan(saved: unknown): HpPlan {
  const plan = createHpPlan(),
    data = record(saved);
  if (!data) return plan;
  for (const kind of ['recovery', 'speed', 'accel', 'debuffs'] as const) {
    const group = record(data[kind]),
      target = plan[kind] as unknown as Record<string, number>;
    if (group) for (const field of Object.keys(target)) target[field] = count(group[field], target[field]!);
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

function restore(): HpCalculatorState {
  const state = defaults();
  try {
    const data = record(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    if (!data) return state;
    const uma = record(data.uma),
      trainee = record(uma?.trainee);
    if (uma && trainee && typeof uma.name === 'string')
      state.uma = {
        ...state.uma,
        ...(uma as Partial<SimulatorUma>),
        trainee: { ...createTrainee(), ...(trainee as Partial<SimulatorUma['trainee']>) },
        skills: Array.isArray(uma.skills) ? (uma.skills as SimulatorUma['skills']) : []
      };
    state.plan = restorePlan(data.plan);
    if (typeof data.counted === 'string') state.counted = data.counted;
    if (typeof data.raceType === 'string') state.raceType = data.raceType;
    if (data.fullSpurt === 'true' || data.fullSpurt === 'false') state.fullSpurt = data.fullSpurt;
  } catch {
    /* Storage can be unavailable or hold something else; start fresh then. */
  }
  return state;
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

/** Counts her learned skills into the skill counts, for this course and her running style. */
export function countHpSkills(
  uma: SimulatorUma,
  skills: Map<number, SkillCatalogEntry>,
  course: CourseCatalogEntry | undefined
): void {
  if (!uma.skills.length || !skills.size) return;
  const style = RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]);
  Object.assign(
    hpCalculator.plan,
    countSkills(uma.skills, skills, {
      distance: course?.distance,
      distanceType: course?.distance_type,
      surface: course?.surface,
      turn: course?.turn,
      style: style === 4 ? 1 : style + 1
    })
  );
  hpCalculator.counted = 'Counted from ' + uma.name + '’s ' + uma.skills.length + ' skills';
}
