import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { MonteCarloGateOrder } from '@/pages/simulator/requests/race-sim-request';
import { openSimulatorHandoff } from '@/pages/simulator/simulator-handoff';
import {
  estimatedRace,
  estimateSeating,
  estimateWinRates,
  raceHandoff,
  randomRaceSeed,
  rerunRace,
  seatingOnSeed,
  type EstimateSeating,
  type RaceRerun,
  type RaceSettings,
  type WinRateEstimate
} from './race-simulation';

/** The recorded input a capture keeps through resimulation, which ties simulated races to their recording. */
type RaceSource = ParsedRaceCapture['original'];

export type EstimateState =
  | ({ status: 'running'; source: RaceSource } & EstimateSeating)
  | { status: 'ready'; source: RaceSource; estimate: WinRateEstimate };

export interface SimulationFailure {
  title: string;
  message: string;
}

const RANDOM_GATES_KEY = 'race-analysis.random-gates';

function readRandomGates() {
  try {
    return localStorage.getItem(RANDOM_GATES_KEY) === 'true';
  } catch {
    return false;
  }
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Races the reader simulates from a capture: reruns shown in place of the recording, and win-rate estimates. */
export class RaceSimulation {
  randomGates = $state(readRandomGates());
  rerun = $state.raw<RaceRerun & { source: RaceSource }>();
  pendingRerun = $state.raw<RaceSettings & { source: RaceSource }>();
  estimate = $state.raw<EstimateState>();
  failure = $state.raw<SimulationFailure>();

  #rerunController?: AbortController;
  #estimateController?: AbortController;

  get gateOrder(): MonteCarloGateOrder {
    return this.randomGates ? 'randomized' : 'sent';
  }

  setRandomGates(value: boolean) {
    this.randomGates = value;
    try {
      localStorage.setItem(RANDOM_GATES_KEY, String(value));
    } catch {
      /* The choice still holds for this visit. */
    }
  }

  rerunOnNewSeed(recorded: ParsedRaceCapture) {
    const seed = randomRaceSeed();
    const settings = this.randomGates ? { seed, ...seatingOnSeed(recorded, seed) } : { seed };

    return this.#rerun(recorded, settings);
  }

  /** Races one of the estimate's races again to show it; resolves whether it is now on screen. */
  watchEstimatedRace(recorded: ParsedRaceCapture, run: number) {
    if (this.estimate?.status !== 'ready') return Promise.resolve(false);

    return this.#rerun(recorded, estimatedRace(this.estimate.estimate, run));
  }

  backToRecording() {
    this.#rerunController?.abort();
    this.pendingRerun = undefined;
    this.rerun = undefined;
  }

  async estimateWinRates(recorded: ParsedRaceCapture) {
    this.#estimateController?.abort();
    const controller = new AbortController();
    this.#estimateController = controller;

    const source = recorded.original;
    const seating = estimateSeating(recorded, this.randomGates);
    this.estimate = { status: 'running', source, ...seating };
    this.failure = undefined;

    try {
      const estimate = await estimateWinRates(recorded, seating, controller.signal);
      if (!controller.signal.aborted) this.estimate = { status: 'ready', source, estimate };
    } catch (error) {
      if (controller.signal.aborted) return;

      this.estimate = undefined;
      this.failure = {
        title: 'The win rates could not be estimated',
        message: failureMessage(error, 'The simulator did not finish the races.')
      };
    } finally {
      if (this.#estimateController === controller) this.#estimateController = undefined;
    }
  }

  closeEstimate() {
    this.#estimateController?.abort();
    this.estimate = undefined;
  }

  /**
   * Opens the race simulator in a new tab on this race's field, with its win rates when they are ready. Call it
   * straight from a click, so the browser lets the tab open.
   */
  openInSimulator(recorded: ParsedRaceCapture, origin: string) {
    const estimate =
      this.estimate?.status === 'ready' && this.estimate.source === recorded.original
        ? this.estimate.estimate
        : undefined;

    const failed = (error: unknown) =>
      (this.failure = {
        title: 'The race simulator could not be opened',
        message: failureMessage(error, 'The race field could not be handed over.')
      });

    try {
      const handoff = raceHandoff(recorded, { origin, gateOrder: this.gateOrder, estimate });

      openSimulatorHandoff(handoff).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  dismissFailure() {
    this.failure = undefined;
  }

  reset() {
    this.backToRecording();
    this.closeEstimate();
    this.failure = undefined;
  }

  async #rerun(recorded: ParsedRaceCapture, settings: RaceSettings) {
    this.#rerunController?.abort();
    const controller = new AbortController();
    this.#rerunController = controller;

    const source = recorded.original;
    this.pendingRerun = { ...settings, source };
    this.failure = undefined;

    try {
      const rerun = await rerunRace(recorded, settings, controller.signal);
      if (controller.signal.aborted) return false;

      this.rerun = { ...rerun, source };
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;

      this.failure = {
        title: 'The rerun failed, so the race on screen was kept',
        message: failureMessage(error, 'The race could not be run again.')
      };
      return false;
    } finally {
      if (this.#rerunController === controller) {
        this.#rerunController = undefined;
        this.pendingRerun = undefined;
      }
    }
  }
}
