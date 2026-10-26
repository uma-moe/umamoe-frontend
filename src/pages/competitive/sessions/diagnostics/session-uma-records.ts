import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import {
  diagnosticHorse,
  lastSpurtResult,
  modeDuration,
  runnerHpResult
} from '@/lib/race/capture/race-diagnostics';
import { raceRunnerKey } from '@/lib/race/multi-race-analysis';
import { rate, score } from '../../analysis-view';

/** Race event types the recorded replay marks for a runner, with the runner's index in params[0]. */
const SPOT_STRUGGLE_EVENT = 4;
const DUEL_EVENT = 5;

/** A spurt that started within this many metres of the first check counts as on time. */
const ON_TIME_SPURT = 3;

/** How a run's last spurt went: in full, late or slowed, or not at all. Unmeasured runs stay undefined. */
export type SpurtOutcome = 'full' | 'short' | 'none';

/** One race of one of the player's runners. */
export interface UmaRun {
  race: number;
  runner: RaceRunner;
  finishOrder: number;
  /** Finish time in seconds. */
  finishTime?: number;
  /** The game's motivation, 1 (awful) to 5 (great). */
  mood?: number;
  finishHp?: number;
  finishHpPercent?: number;
  spurt?: SpurtOutcome;
  spurtDelay?: number;
  rushed: boolean;
  dueled: boolean;
  spotStruggle: boolean;
}

/** A player Uma across the session, in Hakuraku's personal Uma analysis. */
export interface UmaRecord {
  key: string;
  name: string;
  cardId?: number;
  score?: number;
  runs: UmaRun[];
}

/** Wins and races of the runs where a condition held, and of the runs where it did not. */
export interface ConditionSplit {
  with: { runs: number; wins: number };
  without: { runs: number; wins: number };
}

/** The runners each race marked as rushed, dueling or in a spot struggle, read once per race. */
interface RaceMarks {
  rushed: Set<number>;
  duels: Set<number>;
  spotStruggles: Set<number>;
}

function runnersWithEvent(capture: ParsedRaceCapture, type: number) {
  const runners = new Set<number>();

  for (const event of capture.events) {
    const runner = event.params[0];
    if (event.type === type && runner !== undefined) runners.add(runner);
  }

  return runners;
}

function raceMarks(capture: ParsedRaceCapture): RaceMarks {
  const rushed = new Set<number>();

  for (const frame of capture.frames)
    frame.horses.forEach((horse, index) => {
      if (horse.temptationMode > 0) rushed.add(index);
    });

  return {
    rushed,
    duels: runnersWithEvent(capture, DUEL_EVENT),
    spotStruggles: runnersWithEvent(capture, SPOT_STRUGGLE_EVENT)
  };
}

function spurtOutcome(capture: ParsedRaceCapture, index: number) {
  const spurt = lastSpurtResult(capture, index);
  if (spurt.noSpurt) return { outcome: 'none' as const, delay: undefined };
  if (spurt.delay === undefined) return { outcome: undefined, delay: undefined };

  const onTime = spurt.delay < ON_TIME_SPURT && !spurt.speedPenalty;
  return { outcome: onTime ? ('full' as const) : ('short' as const), delay: spurt.delay };
}

function finishSeconds(runner: RaceRunner) {
  const raw = runner.result?.finishTimeRaw;
  const time = raw !== undefined && raw > 0 ? raw : runner.result?.finishTime;

  return time !== undefined && time > 0 ? time : undefined;
}

function playerRun(
  capture: ParsedRaceCapture,
  race: number,
  runner: RaceRunner,
  marks: RaceMarks
): UmaRun {
  const horse = diagnosticHorse(capture, runner.index);
  const flags = capture.detailed?.annotations.flags;
  const hp = runnerHpResult(capture, runner.index);
  const spurt = spurtOutcome(capture, runner.index);
  const mood = Number(runner.raw.motivation);

  const duelSeconds = modeDuration(horse, flags, ['dueling']) ?? 0;
  const temptationSpans = horse?.temptationSpans?.length ?? 0;

  return {
    race,
    runner,
    finishOrder: runner.result?.finishOrder ?? capture.runners.length,
    finishTime: finishSeconds(runner),
    mood: mood >= 1 && mood <= 5 ? mood : undefined,
    finishHp: hp.finish,
    finishHpPercent: hp.percent,
    spurt: spurt.outcome,
    spurtDelay: spurt.delay,
    rushed: marks.rushed.has(runner.index) || temptationSpans > 0,
    dueled: marks.duels.has(runner.index) || duelSeconds > 0,
    spotStruggle: marks.spotStruggles.has(runner.index)
  };
}

/** The player's Umas, most raced first; each run keeps what decided its result. */
export function playerUmaRecords(captures: ParsedRaceCapture[]): UmaRecord[] {
  const records = new Map<string, UmaRecord>();

  captures.forEach((capture, race) => {
    const players = capture.runners.filter((runner) => runner.isPlayer);
    if (players.length === 0) return;

    const marks = raceMarks(capture);
    for (const runner of players) {
      const key = raceRunnerKey(runner);
      const rankScore = score(runner);
      const record = records.get(key) ?? {
        key,
        name: runner.name,
        cardId: runner.cardId,
        score: rankScore > 0 ? rankScore : undefined,
        runs: []
      };

      record.runs.push(playerRun(capture, race, runner, marks));
      records.set(key, record);
    }
  });

  return [...records.values()].sort((a, b) => b.runs.length - a.runs.length);
}

/** What can decide a run, as Hakuraku's spot struggle and recovery analyses split them. */
export interface RunCondition {
  id: string;
  label: string;
  /** Whether the run carries the data to tell; unmeasured runs stay out of both groups. */
  measured: (run: UmaRun) => boolean;
  holds: (run: UmaRun) => boolean;
}

export const RUN_CONDITIONS: RunCondition[] = [
  {
    id: 'spurt',
    label: 'Full last spurt',
    measured: (run) => run.spurt !== undefined,
    holds: (run) => run.spurt === 'full'
  },
  {
    id: 'survived',
    label: 'Finished with HP',
    measured: (run) => run.finishHp !== undefined,
    holds: (run) => run.finishHp !== undefined && run.finishHp > 0
  },
  { id: 'rushed', label: 'Rushed', measured: () => true, holds: (run) => run.rushed },
  { id: 'dueled', label: 'Dueled', measured: () => true, holds: (run) => run.dueled },
  {
    id: 'spot',
    label: 'Spot struggle',
    measured: () => true,
    holds: (run) => run.spotStruggle
  },
  {
    id: 'mood',
    label: 'Great mood',
    measured: (run) => run.mood !== undefined,
    holds: (run) => run.mood === 5
  }
];

export function splitBy(runs: UmaRun[], condition: RunCondition): ConditionSplit {
  const split: ConditionSplit = { with: { runs: 0, wins: 0 }, without: { runs: 0, wins: 0 } };

  for (const run of runs) {
    if (!condition.measured(run)) continue;

    const group = condition.holds(run) ? split.with : split.without;
    group.runs++;
    group.wins += Number(run.finishOrder === 1);
  }

  return split;
}

/** The share of runs where a condition held, among the runs where it could be measured. */
export function shareOf(runs: UmaRun[], condition: RunCondition) {
  const split = splitBy(runs, condition);
  const measured = split.with.runs + split.without.runs;
  if (measured === 0) return undefined;

  return { rate: rate(split.with.runs, measured), held: split.with.runs, measured };
}

/** The condition whose runs won most differently from the rest; both sides need a few runs. */
export function largestSwing(runs: UmaRun[], minimumRuns: number) {
  let largest: { condition: RunCondition; split: ConditionSplit; gap: number } | undefined;

  for (const condition of RUN_CONDITIONS) {
    const split = splitBy(runs, condition);
    if (split.with.runs < minimumRuns || split.without.runs < minimumRuns) continue;

    const gap =
      rate(split.with.wins, split.with.runs) - rate(split.without.wins, split.without.runs);
    if (!largest || Math.abs(gap) > Math.abs(largest.gap)) largest = { condition, split, gap };
  }

  return largest;
}

export function average(values: (number | undefined)[]) {
  const known = values.filter((value): value is number => value !== undefined);
  if (known.length === 0) return undefined;

  return known.reduce((total, value) => total + value, 0) / known.length;
}
