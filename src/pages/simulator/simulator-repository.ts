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

export interface OptimizeResult {
  schema_version: number;
  mode: string;
  /**
   * What gains measure: seconds she saves (`finish_time`, and older services that do not say), or how many more
   * runners she beats in real CM fields (`field_place`).
   */
  objective?: 'finish_time' | 'field_place';
  fields?: OptimizeFields;
  /** Skills on offer that can never fire for her in these races, left out of the search. */
  inert?: Array<OptimizeInert>;
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
    detailedReplay: (run: SimulatorRunRequest) =>
      post<DetailedReplay>('/api/sim/replay/detailed', run),
    stamina: (run: SimulatorRunRequest) => post<StaminaResult>('/api/sim/stamina', run),
    optimize: (run: SimulatorRunRequest) => post<OptimizeResult>('/api/sim/optimize', run)
  };
}

export const simulatorRepository = createSimulatorRepository((path, options) =>
  appHttp.request<string | ArrayBuffer>(path, options)
);
