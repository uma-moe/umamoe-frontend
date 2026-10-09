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
import { normalizeReportResponse, expandReportTraces, type SimulationReport, type BuildComparison } from './simulation-report';
import type {DetailedReplay} from '@/lib/race/race-diagnostics';
import {validateSimulatorResponse} from './simulator-response';
const workerValidated=new WeakSet<object>();

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
  report?: SimulationReport;
  first_replay?: SimulatorReplay;
  skill_procs?: SimulatorProcTrace[];
  skills?: { source_input_index: number; skill_id: number; runs_triggered: number; trigger_probability: number; total_activations: number; mean_activation_distance_m: number | null }[];
}

/** Source, skill, alternative, tick, elapsed seconds, metres, duration, flags, effect offset/count. */
export type SimulatorProc = [number,number,number,number,number,number,number,number,number,number];
export interface SimulatorProcTrace { activations:SimulatorProc[]; effects:[number,number,number,number][]; }

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
  body: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SimulatorBatchResult {
  schema_version: number;
  engine_builds: Record<string, string>;
  results: { seed: number; finish_order?: number[]; error?: string }[];
}

export type SimulatorHttpRequest = (path: string, options?: HttpRequestOptions) => Promise<string | ArrayBuffer>;

export async function decodeSimulatorBody(bytes:string|ArrayBuffer,signal?:AbortSignal,validation?:{path:string;body:Record<string,unknown>}):Promise<unknown> {
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(typeof Worker==='undefined') {
    if(typeof bytes==='string')return normalizeReportResponse(JSON.parse(bytes));
    return normalizeReportResponse((await import('@msgpack/msgpack')).decode(new Uint8Array(bytes)));
  }
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./simulation-report.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=async e=>{
      try {
        const message=e.data;
        worker.terminate();
        if(message.error)throw new Error(message.error);
        await expandReportTraces(message.value);
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
        if(message.validated&&message.value&&typeof message.value==='object')workerValidated.add(message.value);
        cleanup();resolve(message.value);
      } catch(error){cleanup();reject(error);}
    };
    worker.onerror=()=>{cleanup();reject(new Error('Could not decode the simulation response.'));};
    worker.postMessage({bytes,validation},typeof bytes==='string'?[]:[bytes]);
  });
}

export function createSimulatorRepository(request: SimulatorHttpRequest) {
  async function post<T>(path: string, { body, signal }: SimulatorRunRequest): Promise<SimulatorRun<T>> {
    let bytes: string|ArrayBuffer;
    const binary=body.output_format==='msgpack'||path.endsWith('/comparison');
    try {
      bytes = await request(path, {
        method: 'POST',
        headers: { accept: binary?'application/msgpack':'application/json' },
        browserProof: !import.meta.env.DEV,
        body,
        ...(signal ? { signal } : {}),
        responseType: binary?'arrayBuffer':'text'
      });
    } catch (error) {
      // Keep framework rejection details and explain authentication at the shared boundary.
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        error.message = import.meta.env.DEV || import.meta.env.MODE === 'development'
          ? 'Local simulator authentication failed. Configure an authorized SIMULATOR_API_KEY in .env.development.local and restart the local server.'
          : 'Simulator access could not be confirmed. Retry browser verification or sign in again.';
      } else if (error instanceof HttpError && error.status === 404) {
        error.message = 'The configured backend does not provide the simulator API. Check the local simulator proxy target.';
      } else if (error instanceof HttpError && typeof error.body === 'string' && error.body.trim() !== '') {
        error.message = `${error.status} ${error.statusText}: ${error.body.trim()}`;
      } else if (error instanceof HttpError && error.body && typeof error.body==='object' && 'error' in error.body && typeof error.body.error==='string') {
        error.message=error.body.error;
      }
      throw error;
    }

    let result: T;
    try {
      result = await decodeSimulatorBody(bytes,signal,{path,body}) as T;
    } catch(error) {
      if(signal?.aborted)throw error;
      throw new Error(
        'The simulator returned an incompatible response body.'
      );
    }

    if(typeof result!=='object'||result===null||!workerValidated.has(result))validateSimulatorResponse(path,body,result);
    return { result, raw:typeof bytes==='string'?bytes:'' };
  }

  return {
    batch: (run: SimulatorRunRequest) => post<SimulatorBatchResult>('/api/sim/batch', run),
    monteCarlo: (run: SimulatorRunRequest) => post<MonteCarloResult>('/api/sim/monte-carlo', run),
    comparison: (run: SimulatorRunRequest) => post<BuildComparison>('/api/sim/comparison',run),
    detailedReplay: (run:SimulatorRunRequest)=>post<DetailedReplay>('/api/sim/replay/detailed',run),
    stamina: (run: SimulatorRunRequest) => post<StaminaResult>('/api/sim/stamina', run),
    optimize: (run: SimulatorRunRequest) => post<OptimizeResult>('/api/sim/optimize', run)
  };
}

export const simulatorRepository = createSimulatorRepository((path, options) =>
  appHttp.request<string|ArrayBuffer>(path, options)
);
