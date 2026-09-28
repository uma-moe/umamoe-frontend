/**
 * Builds the `/api/sim/monte-carlo` body.
 *
 * Pure: no Svelte and no network. `buildFieldRunners` is shared with the
 * optimize request so every surface normalizes runners the same way:
 * `source_input_index` is the array index and `frame_order` is unique 1..N.
 * `output_format` is always `json` because the app decodes JSON only.
 */

import { buildRaceSetup, type RaceSetup, type RaceSetupInput, type TraineeStats } from './stamina-request';
import { traineeUma, type Trainee } from './trainee';

export type MonteCarloOutputMode = 'procs' | 'skills' | 'results';

/** At most 18 runners per field; a race needs at least 2. */
export const MIN_FIELD_RUNNERS = 2;
export const MAX_FIELD_RUNNERS = 18;
export const MAX_MONTE_CARLO_RUNS = 1000;

export interface MonteCarloSkillInput {
  skillId: number;
  /** 1 … 6, defaults to 1. */
  level?: number;
}

export interface MonteCarloSkill {
  skill_id: number;
  level: number;
}

/** A runner row as a form holds it; `buildFieldRunners` writes the body shape. */
export interface MonteCarloRunnerInput {
  trainee: Trainee;
  /** Unique 1..N; invalid or duplicate values are reassigned. */
  frameOrder?: number;
  /** 0 = unteamed. */
  teamId?: number;
  hasViewerId?: boolean;
  singleModeWinCount?: number;
  skills?: Array<MonteCarloSkillInput>;
}

export interface MonteCarloAptitudes {
  distance: Array<number>;
  running_style: Array<number>;
  ground: Array<number>;
}

export interface FieldRunner {
  stats: TraineeStats;
  running_style: string;
  motivation: number;
  aptitudes: MonteCarloAptitudes;
  single_mode_team_rank: number;
  source_input_index: number;
  frame_order: number;
  has_viewer_id: boolean;
  team_id: number;
  single_mode_win_count: number;
  skills: Array<MonteCarloSkill>;
}

export interface MonteCarloInput {
  course_id: number;
  seed: number;
  setup: RaceSetup;
  runners: Array<FieldRunner>;
}

export interface MonteCarloBody {
  input: MonteCarloInput;
  runs?: number;
  seeds?: Array<number>;
  output_mode: MonteCarloOutputMode;
  output_format: 'json';
}

export interface MonteCarloForm {
  courseId: number;
  seed: number;
  setup: RaceSetupInput;
  runners: Array<MonteCarloRunnerInput>;
  /** Used only when `seeds` is empty; clamped 1 … 1000. */
  runs?: number;
  /** Explicit seeds; when present, `runs` is omitted. */
  seeds?: Array<number>;
  outputMode?: MonteCarloOutputMode;
}

/** Writes the runner array, deriving `source_input_index` and a unique `frame_order`. */
export function buildFieldRunners(runners: Array<MonteCarloRunnerInput>): Array<FieldRunner> {
  // The simulator rejects a one-runner field, so fail loudly instead of building one.
  if (runners.length < MIN_FIELD_RUNNERS) {
    throw new Error(`A race field needs at least ${MIN_FIELD_RUNNERS} runners.`);
  }
  const normalized = runners.slice(0, MAX_FIELD_RUNNERS);
  const orders = assignFrameOrders(
    normalized.map((runner) => runner.frameOrder),
    normalized.length
  );

  return normalized.map((runner, index) => ({
    ...traineeUma(runner.trainee),
    source_input_index: index,
    frame_order: orders[index] ?? index + 1,
    has_viewer_id: runner.hasViewerId ?? false,
    team_id: clampInt(runner.teamId ?? 0, 0, 255, 0),
    single_mode_win_count: clampInt(runner.singleModeWinCount ?? 0, 0, Number.MAX_SAFE_INTEGER, 0),
    skills: buildSkills(runner.skills ?? [])
  }));
}

export function buildMonteCarloRequest(form: MonteCarloForm): MonteCarloBody {
  const body: MonteCarloBody = {
    input: {
      course_id: clampInt(form.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
      seed: toInt32(form.seed),
      setup: buildRaceSetup(form.setup),
      runners: buildFieldRunners(form.runners)
    },
    output_mode: form.outputMode ?? 'results',
    output_format: 'json'
  };

  const seeds = (form.seeds ?? []).filter((seed) => Number.isFinite(seed)).map((seed) => toInt32(seed));
  if (seeds.length > 0) body.seeds = seeds;
  else body.runs = clampInt(form.runs ?? 1, 1, MAX_MONTE_CARLO_RUNS, 1);

  return body;
}

/** Gives every runner a unique frame in 1..N, keeping valid requests where possible. */
function assignFrameOrders(requested: Array<number | undefined>, count: number): Array<number> {
  const used = new Set<number>();
  const orders = new Array<number>(count).fill(0);

  requested.forEach((candidate, index) => {
    if (index >= count || candidate === undefined) return;
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > count || used.has(candidate)) return;
    used.add(candidate);
    orders[index] = candidate;
  });

  let next = 1;
  for (let index = 0; index < count; index += 1) {
    if (orders[index] !== 0) continue;
    while (used.has(next)) next += 1;
    used.add(next);
    orders[index] = next;
  }

  return orders;
}

function buildSkills(skills: Array<MonteCarloSkillInput>): Array<MonteCarloSkill> {
  const built: Array<MonteCarloSkill> = [];
  for (const skill of skills) {
    if (!Number.isFinite(skill.skillId) || skill.skillId <= 0) continue;
    built.push({
      skill_id: Math.round(skill.skillId),
      level: clampInt(skill.level ?? 1, 1, 6, 1)
    });
  }
  return built;
}

function toInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) | 0;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
