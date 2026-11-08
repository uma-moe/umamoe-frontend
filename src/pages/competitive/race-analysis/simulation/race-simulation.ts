import {
  runnersInCaptureOrder,
  type ParsedRaceCapture,
  type RaceRunner
} from '@/lib/race/capture/race-capture-parser';
import { dealsCmMoods, seededCmMoods, seededGates } from '@/lib/race/seating/game-seating';
import {
  captureRaceRequest,
  resimulateRace,
  type CaptureRaceSettings
} from '@/services/race/race-resimulation';
import type { MonteCarloGateOrder } from '@/pages/simulator/requests/race-sim-request';
import type { SimulatorHandoff } from '@/pages/simulator/simulator-handoff';
import { simulatorRepository, type MonteCarloResult } from '@/pages/simulator/simulator-repository';
import { simulatorUmasFromCapture } from '@/pages/simulator/simulator-uma';

export const WIN_RATE_RACES = 100;

/** New gates, and new moods for a race dealt Champions Meeting's moods, by capture order. */
export type RaceSeating = Pick<CaptureRaceSettings, 'gates' | 'moods'>;

/** The seed a simulated race runs on, and new gates and moods when it does not keep the recorded ones. */
export type RaceSettings = Required<Pick<CaptureRaceSettings, 'seed'>> & RaceSeating;

/** A race run again from its capture, shown in place of the recording. */
export interface RaceRerun extends RaceSettings {
  capture: ParsedRaceCapture;
}

/** How an estimate seats its races: the gates, and whether each race's seed deals Champions Meeting's moods. */
export interface EstimateSeating {
  gateOrder: MonteCarloGateOrder;
  cmMoods: boolean;
}

export interface WinRateEstimate extends EstimateSeating {
  /** The seed the simulator derives every race's own seed from. */
  seed: number;
  result: MonteCarloResult;
}

export function randomRaceSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The runner's team; undefined outside team races. */
export function runnerTeam(runner: RaceRunner): number | undefined {
  const team = Number(runner.raw.team_id);

  return Number.isInteger(team) && team !== 0 ? team : undefined;
}

function captureTeams(capture: ParsedRaceCapture): number[] {
  return runnersInCaptureOrder(capture.runners).map((runner) => runnerTeam(runner) ?? 0);
}

/**
 * Whether the recorded race is a Champions Meeting race whose moods its seed dealt, so another seed deals new ones.
 * Only Champions Meeting deals moods: a race of another named type, or a field that is not three teams of three, keeps
 * its moods.
 */
export function dealtCmMoods(recorded: ParsedRaceCapture): boolean {
  const { raceType, randomSeed } = recorded;
  if (randomSeed === undefined) return false;

  // The game's "None" names no race type, which leaves the decision to the moods.
  const namesOtherRace = raceType !== undefined && raceType !== 'Champions' && raceType !== 'None';
  if (namesOtherRace) return false;

  if (seededCmMoods(captureTeams(recorded), randomSeed) === undefined) return false;

  const runners = recorded.runners.map((runner) => ({
    gate: Number(runner.raw.frame_order),
    mood: Number(runner.raw.motivation)
  }));
  return dealsCmMoods(randomSeed, runners);
}

/** The recorded field as the game seats it on `seed`: new gates, and new moods when the race was dealt CM moods. */
export function seatingOnSeed(recorded: ParsedRaceCapture, seed: number): RaceSeating {
  const gates = seededGates(seed, recorded.runners.length);
  if (!dealtCmMoods(recorded)) return { gates };

  const moods = seededCmMoods(captureTeams(recorded), seed);
  return moods ? { gates, moods } : { gates };
}

/** The runner the simulator reports as `source`: its position in the capture's own runner list. */
export function runnerAtSource(capture: ParsedRaceCapture, source: number): RaceRunner | undefined {
  return runnersInCaptureOrder(capture.runners)[source];
}

/**
 * The race seated in new gates and moods, given by capture order. The simulator replays runners by gate, so the
 * runners are listed by their new gate, as a capture recorded with those gates lists them.
 */
export function seatedCapture(capture: ParsedRaceCapture, seating: RaceSeating): ParsedRaceCapture {
  const { gates, moods } = seating;
  if (!gates && !moods) return capture;

  const seated = runnersInCaptureOrder(capture.runners)
    .map((runner, source) => {
      const gate = gates?.[source] ?? runner.index + 1;
      const mood = moods?.[source] ?? runner.raw.motivation;

      return {
        ...runner,
        index: gate - 1,
        raw: { ...runner.raw, frame_order: gate, motivation: mood }
      };
    })
    .sort((a, b) => a.index - b.index);

  return { ...capture, runners: seated };
}

export async function rerunRace(
  recorded: ParsedRaceCapture,
  settings: RaceSettings,
  signal?: AbortSignal
): Promise<RaceRerun> {
  const seated = seatedCapture(recorded, settings);
  const capture = await resimulateRace(seated, recorded.courseId ?? 0, { ...settings, signal });

  return { ...settings, capture };
}

/** How an estimate seats the recorded race: CM moods come with new gates, for a race that was dealt them. */
export function estimateSeating(
  recorded: ParsedRaceCapture,
  randomGates: boolean
): EstimateSeating {
  if (!randomGates) return { gateOrder: 'sent', cmMoods: false };

  return { gateOrder: 'randomized', cmMoods: dealtCmMoods(recorded) };
}

export async function estimateWinRates(
  recorded: ParsedRaceCapture,
  seating: EstimateSeating,
  signal?: AbortSignal
): Promise<WinRateEstimate> {
  const seed = randomRaceSeed();
  const { result } = await simulatorRepository.monteCarlo({
    body: {
      capture: captureRaceRequest(recorded, recorded.courseId ?? 0, { seed }),
      runs: WIN_RATE_RACES,
      gateOrder: seating.gateOrder,
      ...(seating.cmMoods ? { cmMoods: true } : {}),
      output_mode: 'report',
      report_version: 2,
      output_format: 'msgpack'
    },
    signal
  });

  return { ...seating, seed, result };
}

/** The settings that race one of an estimate's races again; gates and moods only when it dealt new ones. */
export function estimatedRace(estimate: WinRateEstimate, run: number): RaceSettings {
  const seed = estimate.result.seeds[run]!;
  const gates = estimate.gateOrder === 'randomized' ? estimate.result.gates?.[run] : undefined;
  const moods = estimate.cmMoods ? estimate.result.moods?.[run] : undefined;

  return { seed, ...(gates ? { gates } : {}), ...(moods ? { moods } : {}) };
}

/** The race simulator's copy of this race: its field, course and conditions, with the estimate when there is one. */
export function raceHandoff(
  recorded: ParsedRaceCapture,
  options: { origin: string; gateOrder: MonteCarloGateOrder; estimate?: WinRateEstimate }
): SimulatorHandoff {
  const { origin, gateOrder, estimate } = options;
  const handoff: SimulatorHandoff = {
    version: 1,
    umas: simulatorUmasFromCapture(recorded),
    courseId: recorded.courseId ?? 0,
    raceInstanceId: recorded.raceInstanceId,
    conditions: {
      ground: recorded.track.condition,
      weather: recorded.track.weather,
      season: recorded.track.season
    },
    seed: estimate?.seed ?? recorded.randomSeed ?? randomRaceSeed(),
    gateOrder: estimate?.gateOrder ?? gateOrder,
    origin
  };

  if (estimate) handoff.run = estimate.result;
  return handoff;
}
