import { simulatorRepository, type MonteCarloResult } from '../../../simulator-repository';
import { compareOutcomes } from '../../simulation-report';
import type { MonteCarloInput } from '../../../requests/race-sim-request';

export type SkillImpact = ReturnType<typeof compareOutcomes>;
/** Races used for a first, preliminary measurement before a full refine. */
export const PRELIMINARY_RACES = 32;
/** The comparison endpoint accepts at most four alternatives per request. */
const BATCH = 4;

/**
 * Effect-suppression measurements shared by every view of one simulation batch.
 * Each measurement keeps the skill's checks and RNG draws but disables its gameplay effects.
 */
export class SkillImpactStore {
  impacts = $state.raw(new Map<string, SkillImpact>());
  busy = $state(false);
  error = $state('');
  /** Skills queued in the current request run, and how many have finished. */
  queued = $state(0);
  finished = $state(0);
  #request?: AbortController;

  constructor(readonly result: MonteCarloResult, readonly input?: MonteCarloInput) {}

  get(source: number, id: number): SkillImpact | undefined { return this.impacts.get(source + ':' + id); }
  get available(): boolean { return !!this.input && !!this.result.report; }

  /** Records results from a comparison response; used by callers that manage their own requests. */
  record(source: number, alternatives: [string, MonteCarloResult][]): void {
    const next = new Map(this.impacts);
    for (const [id, value] of alternatives) next.set(source + ':' + id, compareOutcomes(this.result, value, source));
    this.impacts = next;
  }

  /** Measures every listed skill not already measured at this sample size or better. */
  async measure(jobs: { source: number; ids: number[] }[], races = PRELIMINARY_RACES, signal?: AbortSignal): Promise<void> {
    if (!this.input || this.busy) return;
    const count = Math.min(races, this.result.runs);
    const work = jobs.flatMap(({ source, ids }) => ids.filter(id => (this.get(source, id)?.count ?? 0) < count).map(id => ({ source, id })));
    if (!work.length) return;
    this.#request?.abort();
    const request = this.#request = new AbortController();
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    this.busy = true; this.error = ''; this.queued = work.length; this.finished = 0;
    try {
      for (const source of new Set(work.map(item => item.source))) {
        const ids = work.filter(item => item.source === source).map(item => item.id);
        for (let start = 0; start < ids.length; start += BATCH) {
          const batch = ids.slice(start, start + BATCH);
          const response = await simulatorRepository.comparison({
            body: { input: this.input, seeds: this.result.seeds.slice(0, count), source_input_index: source, alternatives: batch.map(id => ({ name: String(id), suppress_skill: id })) },
            signal: request.signal
          });
          if (request.signal.aborted) return;
          this.record(source, response.result.alternatives);
          this.finished += batch.length;
        }
      }
    } catch (reason) {
      if (!request.signal.aborted) this.error = reason instanceof Error ? reason.message : 'Could not measure skill impact.';
    } finally {
      if (this.#request === request) { this.busy = false; this.#request = undefined; }
    }
  }

  cancel(): void { this.#request?.abort(); this.busy = false; }
}
