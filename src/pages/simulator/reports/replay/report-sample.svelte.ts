import { tick, type Component } from 'svelte';
import { simulatorReplayCapture, simulatorSampleReplay } from '../../simulator-results';
import { simulatorRepository, type MonteCarloResult } from '../../simulator-repository';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { SimulatorUma } from '../../simulator-uma';
import type { MonteCarloInput } from '../../requests/race-sim-request';
import { applyResimulation, type ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';

type SampleContext = {
  result?: MonteCarloResult;
  input?: MonteCarloInput;
  umas: SimulatorUma[];
  course?: RaceCourse;
  track: ParsedRaceCapture['track'];
};

/** One sampled race from the batch, loaded on demand and replayed under the race browser. */
export class ReportSample {
  index = $state(0);
  open = $state(false);
  loading = $state(false);
  error = $state('');
  capture = $state.raw<ParsedRaceCapture>();
  Replay = $state.raw<Component<{ capture: ParsedRaceCapture; suspended?: boolean }> | undefined>();
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
  }

  async detailed(): Promise<void> {
    const { result, input } = this.context();
    if (!this.capture || !result || !input) return;
    const previous = this.capture,
      request = (this.#request = new AbortController());

    this.loading = true;
    this.error = '';
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
    } catch (error) {
      if (!request.signal.aborted)
        this.error = error instanceof Error ? error.message : 'Could not load replay diagnostics.';
    } finally {
      if (!request.signal.aborted) this.loading = false;
    }
  }
}
