/**
 * Builds the `/api/sim/optimize` body.
 *
 * Pure: no Svelte and no network. Purchase prerequisites (`requires`,
 * `excludes`, `replaces`) are indices into this request's `purchases` array,
 * so every index is validated against that array and dropped when out of
 * range. `sp_budget`, candidate counts and skill ids are clamped, too.
 */

import { buildRaceSetup, type RaceSetup, type RaceSetupInput } from './stamina-request';
import { buildFieldRunners, type FieldRunner, type MonteCarloRunnerInput } from './race-sim-request';

export type OptimizeMode = 'cm' | 'tt_sprint' | 'tt_mile' | 'tt_medium' | 'tt_long' | 'tt_dirt';

export const OPTIMIZE_MODES: ReadonlyArray<OptimizeMode> = [
  'cm',
  'tt_sprint',
  'tt_mile',
  'tt_medium',
  'tt_long',
  'tt_dirt'
];

/** The server evaluates 1 … 4 scenarios. */
export const MAX_SCENARIOS = 4;
export const MAX_CANDIDATES = 1024;
export const MAX_FINALISTS = 10;

export interface OptimizePurchaseInput {
  name: string;
  cost: number;
  skills: Array<number>;
  /** Indices into this request's `purchases`. */
  requires?: Array<number>;
  excludes?: Array<number>;
  replaces?: Array<number>;
}

/** The API takes skills as objects at the boundary, not bare ids. */
export interface OptimizeSkill {
  skill_id: number;
  level: number;
}

export interface OptimizePurchase {
  name: string;
  cost: number;
  skills: Array<OptimizeSkill>;
  requires?: Array<number>;
  excludes?: Array<number>;
  replaces?: Array<number>;
}

/** Required only for the `tt_*` modes. */
export interface OptimizeScoreContextInput {
  selfEvaluate: number;
  opponentEvaluate: number;
  supportCardBonus: number;
  winsBefore: number;
}

export interface OptimizeScoreContext {
  self_evaluate: number;
  opponent_evaluate: number;
  support_card_bonus: number;
  wins_before: number;
}

export interface OptimizeScenarioInput {
  name: string;
  /** Relative weight, must be > 0; defaults to 1. */
  weight: number;
  courseId: number;
  seed: number;
  setup: RaceSetupInput;
  runners: Array<MonteCarloRunnerInput>;
  scoreContext?: OptimizeScoreContextInput;
}

export interface OptimizeScenarioInputBody {
  course_id: number;
  seed: number;
  setup: RaceSetup;
  runners: Array<FieldRunner>;
}

export interface OptimizeScenario {
  name: string;
  weight: number;
  input: OptimizeScenarioInputBody;
  score_context?: OptimizeScoreContext;
}

export interface OptimizeBody {
  mode: OptimizeMode;
  target_source_input_index: number;
  sp_budget: number;
  purchases: Array<OptimizePurchase>;
  scenarios: Array<OptimizeScenario>;
  seed: number;
  max_candidates?: number;
  finalists?: number;
}

export interface OptimizeForm {
  mode: OptimizeMode;
  targetSourceInputIndex: number;
  spBudget: number;
  purchases: Array<OptimizePurchaseInput>;
  scenarios: Array<OptimizeScenarioInput>;
  seed: number;
  /** 1 … 1024, omitted when missing. */
  maxCandidates?: number;
  /** 1 … 10, omitted when missing. */
  finalists?: number;
}

/**
 * Writes the optimize body. For `cm` the caller must keep every scenario's
 * `course_id` and `setup` identical; this builder does not rewrite them.
 */
export function buildOptimizeRequest(form: OptimizeForm): OptimizeBody {
  const body: OptimizeBody = {
    mode: form.mode,
    target_source_input_index: clampInt(form.targetSourceInputIndex, 0, Number.MAX_SAFE_INTEGER, 0),
    sp_budget: clampInt(form.spBudget, 0, Number.MAX_SAFE_INTEGER, 0),
    purchases: buildPurchases(form.purchases),
    scenarios: buildScenarios(form.scenarios),
    seed: toInt32(form.seed)
  };

  if (form.maxCandidates !== undefined) {
    body.max_candidates = clampInt(form.maxCandidates, 1, MAX_CANDIDATES, 1);
  }
  if (form.finalists !== undefined) {
    body.finalists = clampInt(form.finalists, 1, MAX_FINALISTS, 1);
  }
  // The contract keeps the finalist count inside the candidate count.
  if (body.max_candidates !== undefined && body.finalists !== undefined) {
    body.finalists = Math.min(body.finalists, body.max_candidates);
  }

  return body;
}

/** Validates purchase prerequisites against the whole purchase array. */
function buildPurchases(purchases: Array<OptimizePurchaseInput>): Array<OptimizePurchase> {
  const count = purchases.length;
  return purchases.map((purchase) => {
    const built: OptimizePurchase = {
      name: purchase.name,
      cost: clampInt(purchase.cost, 0, Number.MAX_SAFE_INTEGER, 0),
      skills: buildOwnedSkills(purchase.skills ?? [])
    };

    const requires = validPurchaseIndices(purchase.requires, count);
    if (requires.length > 0) built.requires = requires;
    const excludes = validPurchaseIndices(purchase.excludes, count);
    if (excludes.length > 0) built.excludes = excludes;
    const replaces = validPurchaseIndices(purchase.replaces, count);
    if (replaces.length > 0) built.replaces = replaces;

    return built;
  });
}

function buildScenarios(scenarios: Array<OptimizeScenarioInput>): Array<OptimizeScenario> {
  return scenarios.slice(0, MAX_SCENARIOS).map((scenario) => {
    const built: OptimizeScenario = {
      name: scenario.name,
      weight: Number.isFinite(scenario.weight) && scenario.weight > 0 ? scenario.weight : 1,
      input: {
        course_id: clampInt(scenario.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
        seed: toInt32(scenario.seed),
        setup: buildRaceSetup(scenario.setup),
        runners: buildFieldRunners(scenario.runners)
      }
    };

    if (scenario.scoreContext) {
      const context = scenario.scoreContext;
      built.score_context = {
        self_evaluate: finiteNumber(context.selfEvaluate),
        opponent_evaluate: finiteNumber(context.opponentEvaluate),
        support_card_bonus: finiteNumber(context.supportCardBonus),
        wins_before: finiteNumber(context.winsBefore)
      };
    }

    return built;
  });
}

/** Keeps in-range, unique indices; drops the rest. */
function validPurchaseIndices(indices: Array<number> | undefined, count: number): Array<number> {
  if (!indices) return [];
  const valid: Array<number> = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (!valid.includes(index)) valid.push(index);
  }
  return valid;
}

/**
 * Purchases carry skill objects, the same shape runners use. The editor only
 * collects ids, so every purchased skill is taken at level 1.
 */
function buildOwnedSkills(skills: Array<number>): Array<OptimizeSkill> {
  return buildSkillIds(skills).map((skillId) => ({ skill_id: skillId, level: 1 }));
}

function buildSkillIds(skills: Array<number>): Array<number> {
  const built: Array<number> = [];
  for (const skillId of skills) {
    if (!Number.isFinite(skillId) || skillId <= 0) continue;
    built.push(Math.round(skillId));
  }
  return built;
}

function toInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) | 0;
}

/** Score-context numbers may be fractional, so keep them as-is. */
function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
