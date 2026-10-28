import { tick, type Component } from 'svelte';
import { simulatorReplayCapture, simulatorSampleReplay } from '../../simulator-results';
import { simulatorRepository, type MonteCarloResult } from '../../simulator-repository';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { SimulatorUma } from '../../simulator-uma';
import type { MonteCarloInput } from '../../requests/race-sim-request';
import { applyResimulation, type ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { DetailedSimulation } from '@/pages/competitive/race-analysis/detailed-simulation';

type SampleContext = {
  result?: MonteCarloResult;
  input?: MonteCarloInput;
  umas: SimulatorUma[];
  course?: RaceCourse;
  track: ParsedRaceCapture['track'];
};

type ReplayProps = {
  capture: ParsedRaceCapture;
  suspended?: boolean;
  simulation?: DetailedSimulation;
  onretrysimulation?: () => void;
};

/**
 * One sampled race from the batch, loaded on demand and replayed under the race browser.
 * Its detailed simulation follows automatically; the recorded replay stays on screen meanwhile.
 */
export class ReportSample {
  index = $state(0);
  open = $state(false);
  loading = $state(false);
  error = $state('');
  capture = $state.raw<ParsedRaceCapture>();
  simulation = $state.raw<DetailedSimulation>({ status: 'queued' });
  Replay = $state.raw<Component<ReplayProps> | undefined>();
  #request: AbortController | undefined;

  constructor(readonly context: () => SampleContext) {}

  abort(): void {
    this.#request?.abort();
  }

  close(): void {
    this.#request?.abort();
    this.loading = false;
    this.open = false;
  }

  async replay(index: number): Promise<void> {
    const { result, input, umas, course, track } = this.context();
    if (!result || !input || !course) return;
    this.#request?.abort();
    const request = (this.#request = new AbortController());
    this.index = index;
    this.open = true;
    this.loading = true;
    this.error = '';
    this.capture = undefined;
    this.simulation = { status: 'queued' };
    await tick();
    document
      .getElementById('report-replays')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });

    try {
      const data =
        index === 0 && result.first_replay
          ? result.first_replay
          : simulatorSampleReplay(
              result,
              (
                await simulatorRepository.monteCarlo({
                  body: {
                    input,
                    seeds: [result.seeds[index]],
                    output_mode: 'skills',
                    output_format: 'msgpack'
                  },
                  signal: request.signal
                })
              ).result,
              index
            );

      if (request.signal.aborted) return;
      this.capture = simulatorReplayCapture(data, umas, course, track);
      this.Replay = (
        await import('@/pages/competitive/race-analysis/replay/RaceReplay.svelte')
      ).default;
    } catch (error) {
      if (!request.signal.aborted)
        this.error = error instanceof Error ? error.message : 'Could not load the sample.';
    } finally {
      if (!request.signal.aborted) this.loading = false;
    }

    if (this.capture && !request.signal.aborted) await this.#simulate(request);
  }

  retrySimulation(): void {
    this.#request?.abort();
    void this.#simulate((this.#request = new AbortController()));
  }

  async #simulate(request: AbortController): Promise<void> {
    const { result, input } = this.context();
    const previous = this.capture;
    if (!previous || !result || !input) return;

    if (previous.detailed) {
      this.simulation = { status: 'ready' };
      return;
    }

    this.simulation = { status: 'running' };
    try {
      const response = await simulatorRepository.detailedReplay({
        body: { ...input, seed: result.seeds[this.index] },
        signal: request.signal
      });

      if (request.signal.aborted) return;
      if (
        response.result.engineBuild !== result.engine_build ||
        response.result.seed !== result.seeds[this.index]
      )
        throw new Error(
          'These diagnostics do not match the sampled engine and seed. Run the simulation again.'
        );
      const next = applyResimulation(previous, response.result);
      const sources = input.runners
        .toSorted((a, b) => a.frame_order - b.frame_order)
        .map((r) => r.source_input_index);

      if (
        next.runners.some(
          (r, gate) =>
            r.result?.finishOrder !==
              result.finish_order[this.index]!.indexOf(sources[gate]!) + 1 ||
            Math.abs(r.result!.finishTime - result.finish_times[this.index]![sources[gate]!]!) >
              0.001
        )
      )
        throw new Error(
          'These diagnostic outcomes no longer match this sampled race. Run the simulation again.'
        );
      this.capture = next;
      this.simulation = { status: 'ready' };
    } catch (error) {
      if (request.signal.aborted) return;

      this.simulation = {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Could not load replay diagnostics.'
      };
    }
  }
}
