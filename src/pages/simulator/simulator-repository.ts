/**
 * The backend calls the simulator page makes.
 *
 * Requests use the shared browser-verification pipeline. Local development
 * credentials are injected by Vite's proxy and never enter browser code.
 *
 * `request` is injected so calls can be asserted without a network.
 */

import { appHttp } from '@/services/http/app-http';
import { HttpError, type HttpRequestOptions } from '@/services/http/http-client';
import type { SimulatorReplay } from './simulator-results';
import {
  normalizeReportResponse,
  expandReportTraces,
  type SimulationReport,
  type BuildComparison
} from './reports/simulation-report';
import type { DetailedReplay } from '@/lib/race/capture/race-diagnostics';
import { validateSimulatorResponse } from './simulator-response';
const workerValidated = new WeakSet<object>();

/** Monte Carlo response fields the debug view reads; the rest stays in `raw`. */
export interface MonteCarloResult {
  schema_version: number;
  engine_build: string;
  runs: number;
  seeds: number[];
  /** Each run's gates by source input. Under randomized gates they differ from the sent `frame_order`. */
  gates?: number[][];
  finish_order: number[][];
  finish_times: number[][];
  final_hp?: number[][];
  last_spurt_decisions?: number[][];
  hp_deficit?: number[][];
  max_hp?: number[][];
  spurt_calculation_times?: number[][][];
  spurt_calculation_distances?: number[][][];
  check_hp?: number[][][];
  full_spurt_need_hp?: number[][][];
  spurt_calculation_results?: number[][][];
  /** Recovery minus drain each runner received, as a share of her maximum HP: over the race, and before her first spurt check. */
  hp_effect_rate?: number[][];
  hp_effect_rate_before_first_spurt?: (number | null)[][];
  report?: SimulationReport;
  first_replay?: SimulatorReplay;
  skill_procs?: SimulatorProcTrace[];
  skills?: {
    source_input_index: number;
    skill_id: number;
    runs_triggered: number;
    trigger_probability: number;
    total_activations: number;
    mean_activation_distance_m: number | null;
  }[];
}

/** Source, skill, alternative, tick, elapsed seconds, metres, duration, flags, effect offset/count. */
export type SimulatorProc = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];
export interface SimulatorProcTrace {
  activations: SimulatorProc[];
  effects: [number, number, number, number][];
}

/** `/api/sim/stamina` result. Every field is present in a successful response. */
export interface StaminaResult {
  model: string;
  course_id: number;
  seed: number;
  survived: boolean;
  full_spurt: boolean;
  max_hp: number;
  remaining_hp: number;
  hp_deficit: number;
  minimum_hp: number;
  consumed_hp: number;
  recovered_hp: number;
  debuff_hp_loss: number;
  wasted_recovery_hp: number;
  effects_applied: number;
  exhausted_at: { time_seconds: number; distance_m: number } | null;
  finish_time_seconds: number;
  last_spurt_start_distance_m: number | null;
  last_spurt_decision: number;
  spurt_calculation_times: number[];
  spurt_calculation_distances: number[];
  check_hp: number[];
  full_spurt_need_hp: number[];
  spurt_calculation_results: number[];
  /** Every sampled race, when several were asked for; the fields above are then its median race. */
  distribution?: StaminaDistribution;
}

/** Sampled HP races side by side, one entry per race in seed order. */
export interface StaminaDistribution {
  seeds: number[];
  /** From the first spurt check; null when she never reached one. */
  check_hp: Array<number | null>;
  full_spurt_need_hp: Array<number | null>;
  check_distance_m: Array<number | null>;
  first_spurt_result: Array<number | null>;
  last_spurt_decision: number[];
  remaining_hp: number[];
  hp_deficit: number[];
  exhausted_distance_m: Array<number | null>;
  finish_time_seconds: number[];
  recovered_hp: number[];
  debuff_hp_loss: number[];
  wasted_recovery_hp: number[];
  /** HP used running, recovered and lost to debuffs by the first spurt check. */
  consumed_before_check_hp: Array<number | null>;
  recovered_before_check_hp: Array<number | null>;
  debuff_before_check_hp: Array<number | null>;
  /** Scheduled HP changes as a share of maximum HP: by the first check, and all of them. */
  effect_rate_before_check: number[];
  effect_rate: number[];
  rushed: boolean[];
  /** HP across the course: percentiles of the races at evenly spaced distances. */
  hp_band: { distance_m: number[]; p10: number[]; p50: number[]; p90: number[] };
  /** Index of the median race, whose fields the result carries. */
  median: number;
}

/** One estimated metric from the optimize report or a validation pass. */
export interface OptimizeEstimate {
  samples: number;
  mean: number;
  standard_error: number;
}

/** Per-scenario metrics for a finalist. */
export interface OptimizeScenarioResult {
  name: string;
  fitness: OptimizeEstimate;
  win_rate: OptimizeEstimate;
  team_win_rate: OptimizeEstimate;
  finish_time_seconds: OptimizeEstimate;
  skill_activations: OptimizeEstimate;
  /** Her finishing place, 1 for a win. Newer services only. */
  place?: OptimizeEstimate;
  /** Her HP at the finish as a share of her maximum; 0 when she ran out. Newer services only. */
  hp_left?: OptimizeEstimate;
  /** How often she had the HP for her fastest last spurt, 0 to 1. Newer services only. */
  full_spurt?: OptimizeEstimate;
}

/** How a build did over every race: overall fitness and each scenario's metrics. */
export interface OptimizeEvaluation {
  fitness: OptimizeEstimate;
  scenarios: Array<OptimizeScenarioResult>;
}

/** One step of the order the tree search bought a build in. */
export interface OptimizeLineStep {
  /** Indices into the request's purchases: a skill and the prerequisites it pulled in. */
  purchases: Array<number>;
  /** Fitness this step added; seconds saved when the objective is finish time. */
  gain: number;
}

/** A finalist's build, search estimate and optional validation estimate. */
export interface OptimizeFinalist {
  build: { purchases: Array<number>; stats: Array<number> };
  sp_cost: number;
  search: OptimizeEvaluation;
  validation: OptimizeEvaluation | null;
  /** Fitness over her build as it is, seed by seed on the search seeds; seconds saved per race. Tree search only. */
  gain?: OptimizeEstimate;
  /** The same on the fresh validation seeds. */
  validation_gain?: OptimizeEstimate;
  /** The order the tree bought it in. */
  line?: Array<OptimizeLineStep>;
  /** What each purchase adds to the best build on its own (what builds on it left out). Most first. */
  contributions?: Array<OptimizeContribution>;
}

export interface OptimizeContribution {
  /** Index into the request's purchases, as a one-item list. */
  purchases: Array<number>;
  gain: OptimizeEstimate;
}

/** One purchase, screened: what it saves bought alone, and as the last one in with everything else on offer. */
export interface OptimizeImpact {
  purchase: number;
  alone: OptimizeEstimate;
  together?: OptimizeEstimate;
  /** What real CM races say it adds, in the same unit, before any race of the search. */
  evidence?: { mean: number; error: number };
  /** What the search values it at, weighed against the evidence. Newer services only. */
  value?: OptimizeEstimate;
  /**
   * `best_build`: what it adds to the best build, or would add on top of it, SP aside. `screening`: the mean of
   * alone and together, when it could not join the best build or the race cap left it unraced there.
   */
  valued_at?: 'best_build' | 'screening';
}

export interface OptimizeScreenStats {
  builds: number;
  combinations: number;
  /** Her time saved with everything on offer, SP aside. */
  full: OptimizeEstimate;
  full_cost: number;
}

/** How far the tree search went. */
export interface OptimizeTreeStats {
  depth: number;
  nodes: number;
  expanded: number;
  /** Branches dropped because even their best case could not catch the leader. */
  cut: number;
  /** Builds reached again in another buying order. */
  transpositions: number;
}

export interface OptimizeReport {
  schema_version: number;
  backend: string;
  candidates_evaluated: number;
  fully_evaluated_candidates: number;
  simulations: number;
  exhaustive: boolean;
  search_seeds: Array<number>;
  validation_seeds: Array<number>;
  finalists: Array<OptimizeFinalist>;
  /** Her build as it is, on the search seeds. */
  baseline?: OptimizeEvaluation;
  tree?: OptimizeTreeStats;
  /** Every purchase's screened impact. Screen search only. */
  impacts?: Array<OptimizeImpact>;
  screen?: OptimizeScreenStats;
}

/** Where a search's real CM fields came from, and how well the model behind its evidence picks CM winners. */
export interface OptimizeFields {
  /** The CM course the fields were taken from. */
  course_id: number;
  fields: number;
  held_out_races: number;
  winner_accuracy: number;
  winner_accuracy_without_skills: number;
}

/** `/api/sim/optimize` result. */
/** A skill on offer that can never fire for her here, and what rules it out. */
export interface OptimizeInert {
  /** Index into the request's purchases. */
  purchase: number;
  /** track, distance, ground, going, season, weather, direction, race grade, running style, slope or corners. */
  why: string[];
}

/** How often a skill fired over the theory's draws, and where it first fired on average, in metres. */
export interface TheoryFire {
  rate: number;
  mean_m: number | null;
}

/** What a skill of a theorized build adds to it: the build against the build without it and what needs it. */
export interface TheorySkillWorth {
  /** Index into the request's purchases, at the top of its chain. */
  purchase: number;
  lengths: number;
  /** Win points (0–1) it adds, by the model learned from real CM fields (schema 9 on). */
  win?: number;
  fire: TheoryFire;
}

/**
 * A finalist raced beside the theory's pick in her real CM fields, seed for seed: her win rate with it (0–1), what it
 * won over the pick per race (0 for the pick), and that gain's standard error.
 */
export interface RacedWins {
  win_rate: number;
  over_pick: number;
  error: number;
}

/** A finalist as the theory values it: lengths gained over her build as it is, and each skill's part. */
export interface TheoryBuild {
  purchases: number[];
  lengths: number;
  /** Win points (0–1) it gains her by the model learned from real CM fields (schema 9 on); schema 10 searches by it. */
  win?: number;
  /** HP she has left at the finish, below zero when she runs out. */
  hp_left: number;
  skills: TheorySkillWorth[];
  /** What it won in the races of her real CM fields that ranked the finalists, when races ranked them. */
  raced?: RacedWins;
}

/** A purchase bought on her own, with what it needs, as the theory values it. */
export interface TheoryOffer {
  purchase: number;
  lengths: number;
  /** Win points (0–1) it gains her on her own, by the model learned from real CM fields (schema 9 on). */
  win?: number;
  fire: TheoryFire;
  /** `physics`: what the solo race values; `prior`: what acts on the field, from recorded CM races. */
  source: 'physics' | 'prior';
  effect: string;
  /** It fires only after enough of her other skills have. */
  count_gated: boolean;
}

/** What the theory assumes of her race beyond her own skills. */
export interface TheoryField {
  position_fight_seconds: number;
  rushed_chance: number;
  /** HP a real field takes from her beyond the solo race, as a share of her max HP. */
  drain_mean: number;
  drain_spread: number;
  base_hp_left: number;
}

/**
 * The theory's answer: worth of the finalists, in their order, and of every purchase alone, in lengths (2.5 m) and,
 * from schema 9, win points. `unit` names what the search maximised: lengths, or from schema 10 win points.
 */
export interface OptimizeTheory {
  unit: 'lengths' | 'win';
  search_draws: number;
  report_draws: number;
  builds_valued: number;
  lengths_per_second: number;
  runners_per_length: number;
  /** The race's phases in metres: opening, middle, late, last spurt. */
  phase_bounds: number[];
  field: TheoryField;
  /** The most worth first: in her real CM fields, by her win rate in the ranking races. */
  finalists: TheoryBuild[];
  offers: TheoryOffer[];
  /** Races of her real CM fields that ranked the finalists by her win rate; 0 or absent when none did. */
  ranking_races?: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isFire(value: unknown): value is TheoryFire {
  return (
    isRecord(value) && isNumber(value.rate) && (value.mean_m === null || isNumber(value.mean_m))
  );
}

function isRacedWins(value: unknown): value is RacedWins {
  return (
    isRecord(value) &&
    isNumber(value.win_rate) &&
    isNumber(value.over_pick) &&
    isNumber(value.error)
  );
}

/** Whether a response's `theory` has the shape the page reads, so a partial or older one is not read as an answer. */
export function isOptimizeTheory(value: unknown): value is OptimizeTheory {
  if (!isRecord(value) || !Array.isArray(value.finalists) || !Array.isArray(value.offers))
    return false;
  if (!Array.isArray(value.phase_bounds) || !value.phase_bounds.every(isNumber)) return false;

  const builds = value.finalists.every(
    (build) =>
      isRecord(build) &&
      isNumber(build.lengths) &&
      isNumber(build.hp_left) &&
      (build.raced === undefined || isRacedWins(build.raced)) &&
      Array.isArray(build.skills) &&
      build.skills.every(
        (skill) =>
          isRecord(skill) &&
          isNumber(skill.purchase) &&
          isNumber(skill.lengths) &&
          isFire(skill.fire)
      )
  );
  const offers = value.offers.every(
    (offer) =>
      isRecord(offer) &&
      isNumber(offer.purchase) &&
      isNumber(offer.lengths) &&
      isFire(offer.fire) &&
      (offer.source === 'physics' || offer.source === 'prior')
  );
  return builds && offers && isRecord(value.field) && isNumber(value.builds_valued);
}

/** V5's own move scores, timing observations and exact paired measurements. Scores are not lengths. */
export interface V5PurchaseValue {
  purchase: number;
  held: boolean;
  score: number;
  source: 'v5' | 'ranker' | 'posterior' | 'recovery_races';
  seconds?: number;
  win?: number;
  fire: TheoryFire & { races: number };
  measured?: { gain: number; standard_error: number };
}

export interface V5BuildValues {
  purchases: number[];
  timing_races: number;
  skills: V5PurchaseValue[];
}

export interface OptimizeModel {
  model: string;
  error?: string;
  races: number;
  budget: number;
  lobbies: number;
  rooms: number;
  build?: {
    model: string;
    model_sha256: string;
    ranker_sha256?: string;
    course_prior: boolean;
    seconds: number;
    /** What each skill is worth in V5's two end builds: its optimized build and its runner-up, when it had one. */
    explanation: {
      phase_bounds: number[];
      optimized: V5BuildValues;
      runner_up?: V5BuildValues;
    };
  };
}

/** Validate the V5 report before reading it into the optimizer. */
export function isOptimizeModel(value: unknown): value is OptimizeModel {
  const index = (v: unknown) => isNumber(v) && Number.isSafeInteger(v) && v >= 0;
  const optionalNumber = (v: unknown) => v === undefined || isNumber(v);
  const values = (v: unknown): boolean =>
    isRecord(v) &&
    Array.isArray(v.purchases) &&
    v.purchases.every(index) &&
    index(v.timing_races) &&
    Array.isArray(v.skills) &&
    v.skills.every(
      (s) =>
        isRecord(s) &&
        index(s.purchase) &&
        typeof s.held === 'boolean' &&
        isNumber(s.score) &&
        ['v5', 'ranker', 'posterior', 'recovery_races'].includes(String(s.source)) &&
        optionalNumber(s.seconds) &&
        optionalNumber(s.win) &&
        isFire(s.fire) &&
        isRecord(s.fire) &&
        index(s.fire.races) &&
        s.fire.rate >= 0 &&
        s.fire.rate <= 1 &&
        (s.measured === undefined ||
          (isRecord(s.measured) &&
            isNumber(s.measured.gain) &&
            isNumber(s.measured.standard_error) &&
            s.measured.standard_error >= 0))
    );
  if (
    !isRecord(value) ||
    typeof value.model !== 'string' ||
    !index(value.races) ||
    !index(value.budget) ||
    !index(value.lobbies) ||
    !index(value.rooms)
  )
    return false;
  const b = value.build;
  if (
    !isRecord(b) ||
    typeof b.model !== 'string' ||
    typeof b.model_sha256 !== 'string' ||
    (b.ranker_sha256 !== undefined && typeof b.ranker_sha256 !== 'string') ||
    typeof b.course_prior !== 'boolean' ||
    !isNumber(b.seconds)
  )
    return false;
  const e = b.explanation;
  return (
    isRecord(e) &&
    Array.isArray(e.phase_bounds) &&
    e.phase_bounds.length === 5 &&
    e.phase_bounds.every((n, i, a) => isNumber(n) && (i === 0 || n > a[i - 1])) &&
    values(e.optimized) &&
    (e.runner_up === undefined || values(e.runner_up))
  );
}

export interface OptimizeResult {
  schema_version: number;
  mode: string;
  /** The theory's worth of the finalists and of every purchase, when the theory searched (schema 8). */
  theory?: OptimizeTheory;
  model?: OptimizeModel;
  /**
   * What gains measure: seconds she saves (`finish_time`, and older services that do not say), or how many more
   * runners she beats in real CM fields (`field_place`).
   */
  objective?: 'finish_time' | 'field_place';
  fields?: OptimizeFields;
  /** Skills on offer that can never fire for her in these races, left out of the search. */
  inert?: Array<OptimizeInert>;
  /**
   * Skills on offer the simulator cannot race, left out instead of failing the search; `why` is `unknown skill`,
   * `unsupported skill` or `needs a skill it cannot process`.
   */
  cant_process?: Array<OptimizeInert>;
  runs_per_variation_per_scenario: number;
  validation_runs_per_finalist_per_scenario: number;
  report: OptimizeReport;
}

export interface SimulatorRun<T> {
  result: T;
  raw: string;
}

export interface SimulatorRunRequest {
  body: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SimulatorBatchResult {
  schema_version: number;
  engine_builds: Record<string, string>;
  results: { seed: number; finish_order?: number[]; error?: string }[];
}

export type SimulatorHttpRequest = (
  path: string,
  options?: HttpRequestOptions
) => Promise<string | ArrayBuffer>;

export async function decodeSimulatorBody(
  bytes: string | ArrayBuffer,
  signal?: AbortSignal,
  validation?: { path: string; body: Record<string, unknown> }
): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (typeof Worker === 'undefined') {
    if (typeof bytes === 'string') return normalizeReportResponse(JSON.parse(bytes));
    return normalizeReportResponse(
      (await import('@msgpack/msgpack')).decode(new Uint8Array(bytes))
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reports/simulation-report.worker.ts', import.meta.url), {
      type: 'module'
    });

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };

    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };

    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = async (e) => {
      try {
        const message = e.data;
        worker.terminate();
        if (message.error) throw new Error(message.error);
        await expandReportTraces(message.value);
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (message.validated && message.value && typeof message.value === 'object')
          workerValidated.add(message.value);
        cleanup();
        resolve(message.value);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    worker.onerror = () => {
      cleanup();
      reject(new Error('Could not decode the simulation response.'));
    };

    worker.postMessage({ bytes, validation }, typeof bytes === 'string' ? [] : [bytes]);
  });
}

export function createSimulatorRepository(request: SimulatorHttpRequest) {
  async function post<T>(
    path: string,
    { body, signal }: SimulatorRunRequest
  ): Promise<SimulatorRun<T>> {
    let bytes: string | ArrayBuffer;
    const binary = body.output_format === 'msgpack' || path.endsWith('/comparison');
    try {
      bytes = await request(path, {
        method: 'POST',
        headers: { accept: binary ? 'application/msgpack' : 'application/json' },
        browserProof: !import.meta.env.DEV,
        body,
        ...(signal ? { signal } : {}),
        responseType: binary ? 'arrayBuffer' : 'text'
      });
    } catch (error) {
      // Keep framework rejection details and explain authentication at the shared boundary.
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        error.message =
          import.meta.env.DEV || import.meta.env.MODE === 'development'
            ? 'Local simulator authentication failed. Configure an authorized SIMULATOR_API_KEY in .env.development.local and restart the local server.'
            : 'Simulator access could not be confirmed. Retry browser verification or sign in again.';
      } else if (error instanceof HttpError && error.status === 404) {
        error.message =
          'The configured backend does not provide the simulator API. Check the local simulator proxy target.';
      } else if (
        error instanceof HttpError &&
        typeof error.body === 'string' &&
        error.body.trim() !== ''
      ) {
        error.message = `${error.status} ${error.statusText}: ${error.body.trim()}`;
      } else if (
        error instanceof HttpError &&
        error.body &&
        typeof error.body === 'object' &&
        'error' in error.body &&
        typeof error.body.error === 'string'
      ) {
        error.message = error.body.error;
      }

      throw error;
    }

    let result: T;
    try {
      result = (await decodeSimulatorBody(bytes, signal, { path, body })) as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('The simulator returned an incompatible response body.');
    }

    if (typeof result !== 'object' || result === null || !workerValidated.has(result))
      validateSimulatorResponse(path, body, result);
    return { result, raw: typeof bytes === 'string' ? bytes : '' };
  }

  return {
    batch: (run: SimulatorRunRequest) => post<SimulatorBatchResult>('/api/sim/batch', run),
    monteCarlo: (run: SimulatorRunRequest) => post<MonteCarloResult>('/api/sim/monte-carlo', run),
    comparison: (run: SimulatorRunRequest) => post<BuildComparison>('/api/sim/comparison', run),
    // One race with full diagnostics; `/race` takes the normalized race as `input`.
    detailedReplay: (run: SimulatorRunRequest) =>
      post<DetailedReplay>('/api/sim/race', { ...run, body: { input: run.body } }),
    stamina: (run: SimulatorRunRequest) => post<StaminaResult>('/api/sim/stamina', run),
    optimize: (run: SimulatorRunRequest) => post<OptimizeResult>('/api/sim/optimize', run)
  };
}

export const simulatorRepository = createSimulatorRepository((path, options) =>
  appHttp.request<string | ArrayBuffer>(path, options)
);
