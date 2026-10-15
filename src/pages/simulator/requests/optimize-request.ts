/**
 * Builds the `/api/sim/optimize` body.
 *
 * Pure: no Svelte and no network. Purchase prerequisites (`requires`,
 * `excludes`) are indices into this request's `purchases` array, so every
 * index is validated against that array and dropped when out of range;
 * `replaces` lists the skill IDs an upgrade removes, and `locked` the purchases every build buys. `sp_budget`, candidate
 * counts and skill ids are clamped, too.
 */

import { buildRaceSetup, type RaceSetup, type RaceSetupInput } from './stamina-request';
import {
  buildFieldRunners,
  type FieldRunner,
  type MonteCarloRunnerInput
} from './race-sim-request';

export type OptimizeMode = 'cm' | 'tt_sprint' | 'tt_mile' | 'tt_medium' | 'tt_long' | 'tt_dirt';

export const OPTIMIZE_MODES: ReadonlyArray<OptimizeMode> = [
  'cm',
  'tt_sprint',
  'tt_mile',
  'tt_medium',
  'tt_long',
  'tt_dirt'
];

/** A CM search races up to eight scenarios on its one course, each on every seed. */
export const MAX_SCENARIOS = 8;
/**
 * Team Trials draws its track per match, so its scenarios are the distance's pool of tracks; the server deals one
 * track to each seed, so a pool costs no more races than one track.
 */
export const MAX_TRACKS = 32;
export const MAX_CANDIDATES = 1024;
export const MAX_FINALISTS = 10;

export interface OptimizePurchaseInput {
  name: string;
  cost: number;
  skills: Array<number>;
  /** Indices into this request's `purchases`. */
  requires?: Array<number>;
  excludes?: Array<number>;
  /** Skill IDs the purchase removes, as an upgrade removes the skill it upgrades. */
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
  /** Indices into `purchases` every build buys, with what they require. */
  locked?: Array<number>;
  scenarios: Array<OptimizeScenario>;
  seed: number;
  max_candidates?: number;
  finalists?: number;
  hp_changes?: Array<OptimizeHpChange>;
}

/** HP she gains or loses from outside her build, `count` times at random points of a stretch of the race. */
export interface OptimizeHpChange {
  count: number;
  /** Signed percent of max HP per trigger. */
  hp_percent: number;
  /** The stretch, as shares of the race distance (0 to below 1). */
  from: number;
  to: number;
}

export interface OptimizeForm {
  mode: OptimizeMode;
  targetSourceInputIndex: number;
  spBudget: number;
  purchases: Array<OptimizePurchaseInput>;
  /** Indices into `purchases` every build must buy: the non-negotiables. */
  locked?: Array<number>;
  scenarios: Array<OptimizeScenarioInput>;
  seed: number;
  /** 1 … 1024, omitted when missing. */
  maxCandidates?: number;
  /** 1 … 10, omitted when missing. */
  finalists?: number;
  /** HP debuffs taken in mid race in every race: how many, and percent of max HP each. */
  debuffs?: { count: number; percent: number };
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
    scenarios: buildScenarios(form.scenarios, form.mode === 'cm' ? MAX_SCENARIOS : MAX_TRACKS),
    seed: toInt32(form.seed)
  };

  const locked = validPurchaseIndices(form.locked, form.purchases.length);
  if (locked.length > 0) body.locked = locked;

  if (form.maxCandidates !== undefined) {
    body.max_candidates = clampInt(form.maxCandidates, 1, MAX_CANDIDATES, 1);
  }

  if (form.finalists !== undefined) {
    body.finalists = clampInt(form.finalists, 1, MAX_FINALISTS, 1);
  }

  const debuffs = form.debuffs;
  if (
    debuffs &&
    Number.isFinite(debuffs.count) &&
    debuffs.count >= 1 &&
    Number.isFinite(debuffs.percent) &&
    debuffs.percent > 0
  ) {
    // Debuffs land in mid race, between the end of the early race and the spurt decision, as on the HP calculator.
    body.hp_changes = [
      {
        count: clampInt(debuffs.count, 1, 256, 1),
        hp_percent: -Math.min(100, debuffs.percent),
        from: 1 / 6,
        to: 2 / 3
      }
    ];
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
    const replaces = validSkillIds(purchase.replaces);
    if (replaces.length > 0) built.replaces = replaces;

    return built;
  });
}

function buildScenarios(
  scenarios: Array<OptimizeScenarioInput>,
  limit: number
): Array<OptimizeScenario> {
  return scenarios.slice(0, limit).map((scenario) => {
    const built: OptimizeScenario = {
      name: scenario.name,
      weight: Number.isFinite(scenario.weight) && scenario.weight > 0 ? scenario.weight : 1,
      input: {
        course_id: clampInt(scenario.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
        seed: toInt32(scenario.seed),
        setup: buildRaceSetup(scenario.setup),
        // The optimizer races her alone.
        runners: buildFieldRunners(scenario.runners, 1)
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

/** Keeps unique positive skill IDs; drops the rest. */
function validSkillIds(ids: Array<number> | undefined): Array<number> {
  const valid: Array<number> = [];
  for (const id of ids ?? []) {
    if (Number.isInteger(id) && id > 0 && id <= 0xffffffff && !valid.includes(id)) valid.push(id);
  }

  return valid;
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
