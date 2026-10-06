/**
 * The backend calls the simulator page makes.
 *
 * uma.moe's backend already proxies the simulator (it holds the upstream key,
 * checks the caller's grant and records usage), so the page sends the user's
 * `X-API-Key` here and never talks to the simulator directly.
 *
 * `request` is injected so calls can be asserted without a network.
 */

import { appHttp } from '@/services/http/app-http';
import { HttpError, type HttpRequestOptions } from '@/services/http/http-client';

/** Monte Carlo response fields the debug view reads; the rest stays in `raw`. */
export interface MonteCarloResult {
  schema_version: number;
  engine_build: string;
  runs: number;
  seeds: number[];
  finish_order: number[][];
  finish_times: number[][];
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

/** A finalist's build, search estimate and optional validation estimate. */
export interface OptimizeFinalist {
  build: { purchases: Array<number>; stats: Array<number> };
  sp_cost: number;
  search: { fitness: OptimizeEstimate; scenarios: Array<OptimizeScenarioResult> };
  validation: { fitness: OptimizeEstimate; scenarios: Array<OptimizeScenarioResult> } | null;
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
}

/** `/api/sim/optimize` result. */
export interface OptimizeResult {
  schema_version: number;
  mode: string;
  runs_per_variation_per_scenario: number;
  validation_runs_per_finalist_per_scenario: number;
  report: OptimizeReport;
}

export interface SimulatorRun<T> {
  result: T;
  raw: string;
}

export interface SimulatorRunRequest {
  key: string;
  body: Record<string, unknown>;
}

export type SimulatorHttpRequest = (path: string, options?: HttpRequestOptions) => Promise<string>;

export function createSimulatorRepository(request: SimulatorHttpRequest) {
  async function post<T>(path: string, { key, body }: SimulatorRunRequest): Promise<SimulatorRun<T>> {
    let raw: string;
    try {
      raw = await request(path, {
        method: 'POST',
        headers: { 'x-api-key': key, accept: 'application/json' },
        body,
        responseType: 'text'
      });
    } catch (error) {
      // The simulator's own framework rejections are plain text, and HttpError
      // only reads a JSON body, so the reason would otherwise be lost behind
      // the status line. Fold the real message in and keep the error type, so
      // the pages can still branch on 401 and 403.
      if (error instanceof HttpError && typeof error.body === 'string' && error.body.trim() !== '') {
        error.message = `${error.status} ${error.statusText}: ${error.body.trim()}`;
      }
      throw error;
    }

    let result: T;
    try {
      result = JSON.parse(raw) as T;
    } catch {
      throw new Error(
        'The simulator returned a non-JSON body. Keep output_format set to "json".'
      );
    }

    return { result, raw };
  }

  return {
    monteCarlo: (run: SimulatorRunRequest) => post<MonteCarloResult>('/api/sim/monte-carlo', run),
    stamina: (run: SimulatorRunRequest) => post<StaminaResult>('/api/sim/stamina', run),
    optimize: (run: SimulatorRunRequest) => post<OptimizeResult>('/api/sim/optimize', run)
  };
}

export const simulatorRepository = createSimulatorRepository((path, options) =>
  appHttp.request<string>(path, options)
);
