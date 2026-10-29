import type { MonteCarloResult } from '../../simulator-repository';
import type { FieldRunner } from '../../requests/race-sim-request';
import type { ReportBand } from '../simulation-report';
import { exhaustionDistance } from '../simulation-comparison';
import { telemetrySample } from '../telemetry/report-telemetry';
import { simulatorSampleSummary } from '../../simulator-results';

/** Maximum HP = stamina × 0.8 × style coefficient + course metres, with stamina adjusted for motivation. */
const HP_PER_STAMINA = 0.8;
const STYLE_HP: Record<string, number> = {
  Nige: 0.95,
  Senko: 0.89,
  Sashi: 1,
  Oikomi: 0.995,
  Oonige: 0.86
};

const MOTIVATION: Record<number, number> = { 1: 0.96, 2: 0.98, 3: 1, 4: 1.02, 5: 1.04 };

/** Raw stats above 1200 count half. */
const compress = (raw: number) => (raw > 1200 ? 1200 + (raw - 1200) / 2 : raw);
const expand = (value: number) => (value > 1200 ? 1200 + (value - 1200) * 2 : value);

/** The replay's race phases; the last spurt is decided when the late race starts. */
export const RACE_PHASES = [
  { name: 'Early race', start: 0, color: '#b5b9c2' },
  { name: 'Mid race', start: 1 / 6, color: '#6ab7ee' },
  { name: 'Late race', start: 2 / 3, color: '#dfba72' },
  { name: 'Final leg', start: 5 / 6, color: '#bd91d1' }
] as const;

type Summary = NonNullable<ReturnType<typeof simulatorSampleSummary>>;
export type SpurtKind = 'full' | 'late' | 'none';
export interface StaminaRace {
  run: number;
  /** HP when the late race starts, and what the full spurt from there costs. */
  check?: number;
  need?: number;
  /** Final decision: full from the late-race start, a slower or later spurt, or none. */
  spurt?: SpurtKind;
  /** Upgraded to the full spurt by recovery after a short first check. */
  recovered: boolean;
  speedLoss?: number;
  delay?: number;
  received: number;
  drained: number;
  finalHp?: number;
  maxHp?: number;
  exhaustedAt?: number;
  /** Raw stamina that would have allowed the full spurt and still reached the finish with HP. */
  needed?: number;
}

export interface StaminaRunner {
  source: number;
  runs: number;
  /** Raw stamina as entered, when the input is known. */
  stamina?: number;
  maxHp?: Summary;
  needed?: Summary;
  /** Share of races her stamina covers: the full spurt from the late-race start, and HP left at the finish. */
  covered?: number;
  /** Spare (or, when negative, missing) HP for the full spurt when the late race starts. */
  spare?: Summary;
  /** Shares of races in percent; undefined when the batch has no spurt decisions. */
  spurt?: Record<SpurtKind, number> & { recovered: number };
  /** In races with a slower or later spurt: how much slower than her full spurt, and how far after the late-race start it began. */
  speedLoss?: number;
  delay?: number;
  /** Full spurt speed, m/s. */
  fullSpeed?: number;
  /** Mean target speed of the spurts she actually ran, m/s: below the full spurt speed when HP was short. */
  spurtSpeed?: number;
  finishHp?: Summary;
  finishPercent?: Summary;
  exhausted?: { rate: number; at?: number };
  /** Mean HP used in each of RACE_PHASES, and the mean HP received from recovery, lost to debuffs and left at the finish. */
  phases?: number[];
  received?: number;
  drained?: number;
  left?: number;
  /** Mean recovery minus drain from skills as a share of maximum HP. */
  effect?: number;
  /** Races with a rushed stretch, and its mean length in them. */
  rushed: { rate: number; seconds?: number };
}

const finite = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const diagnosticsOf = (result: MonteCarloResult, source: number) =>
  result.report?.runners.find((row) => row.source_input_index === source)?.diagnostics;

const telemetryOf = (result: MonteCarloResult) =>
  result.report?.telemetry && result.report.samples === result.runs
    ? result.report.telemetry
    : undefined;

function spurtKind(decision: number | undefined, first: number | undefined): SpurtKind | undefined {
  if (!finite(decision)) return undefined;
  if (decision === 1 && (first ?? 1) === 1) return 'full';
  if (decision === 1 || decision === 2) return 'late';
  return 'none';
}

/** Elapsed seconds at which a telemetry curve reaches `distance`, interpolating the per-second samples. */
function timeAt(result: MonteCarloResult, curve: number, distance: number) {
  const t = telemetryOf(result)!,
    finish = t.finish_seconds[curve]!;

  if (distance <= 0) return 0;
  let previous = 0,
    before = telemetrySample(t, curve, 0, 0);

  for (let time = 1; time < finish + 1; time++) {
    const at = Math.min(time, finish),
      after = telemetrySample(t, curve, at, 0);

    if (after >= distance)
      return (
        previous +
        ((at - previous) * (distance - before)) / Math.max(Number.EPSILON, after - before)
      );
    previous = at;
    before = after;
  }

  return finish;
}

/** Every race for one runner. `runner` supplies the stamina stat for the stamina estimate. */
/** One race's spurt check and finish, with skill HP effects as a share of maximum HP before the check and in total. */
export interface SpurtBalance {
  check: number;
  need: number;
  finalHp?: number;
  deficit?: number;
  before?: number;
  total?: number;
}

/** HP per raw stamina point for a running style and motivation, before stats above 1200 count half. */
export function hpPerStamina(style: string, motivation: number) {
  return HP_PER_STAMINA * (STYLE_HP[style] ?? 0) * (MOTIVATION[motivation] ?? 0);
}

/**
 * Raw stamina that would have allowed the full spurt from the spurt check and still reached the finish with HP left.
 * `stamina` is the effective (compressed) stat the race ran with; `perPoint` comes from `hpPerStamina`.
 */
export function neededStamina(
  race: SpurtBalance,
  stamina: number,
  perPoint: number
): number | undefined {
  if (!(perPoint > 0) || !finite(race.check) || !finite(race.need)) return undefined;
  // Extra maximum HP reaches the spurt check unchanged, plus the recovery that scales with it.
  const before = race.before ?? 0,
    total = race.total ?? before;

  const atCheck = stamina + (race.need - race.check) / (perPoint * Math.max(0.1, 1 + before));
  const shortAtFinish = (race.deficit ?? 0) - (race.finalHp ?? 0),
    toFinish = shortAtFinish / (perPoint * Math.max(0.1, 1 + total));

  // A full spurt only needs the larger of the two; a short check needs the full spurt first, then whatever ran out after it.
  return Math.max(
    1,
    expand(
      race.check >= race.need
        ? Math.max(atCheck, stamina + toFinish)
        : atCheck + Math.max(0, toFinish)
    )
  );
}

/** The effective stamina a raw stat runs with: above 1200 counts half. */
export const effectiveStamina = (raw: number) => compress(raw);

export function staminaRaces(
  result: MonteCarloResult,
  source: number,
  runner?: Pick<FieldRunner, 'stats' | 'running_style' | 'motivation'>,
  distance = result.report?.distance_m.at(-1)
): StaminaRace[] {
  const diagnostics = diagnosticsOf(result, source);
  const style = runner ? STYLE_HP[runner.running_style] : undefined,
    motivation = runner ? MOTIVATION[runner.motivation] : undefined;

  const base = runner ? compress(runner.stats.stamina) : 0,
    perPoint = HP_PER_STAMINA * (style ?? 0) * (motivation ?? 0);

  return Array.from({ length: result.runs }, (_, run) => {
    const check = result.check_hp?.[run]?.[source]?.[0],
      need = result.full_spurt_need_hp?.[run]?.[source]?.[0];

    const decision = result.last_spurt_decisions?.[run]?.[source],
      first = result.spurt_calculation_results?.[run]?.[source]?.[0];

    const row = diagnostics?.[run],
      applications = row?.hp_applications ?? [];

    const spurt = spurtKind(decision, first);
    const finalHp = result.final_hp?.[run]?.[source],
      maxHp = result.max_hp?.[run]?.[source],
      deficit = result.hp_deficit?.[run]?.[source] ?? 0;

    const checkDistance = result.spurt_calculation_distances?.[run]?.[source]?.[0];
    const late = spurt === 'late' && row;
    const before = result.hp_effect_rate_before_first_spurt?.[run]?.[source] ?? 0;
    const needed =
      finite(check) && finite(need)
        ? neededStamina(
            {
              check,
              need,
              finalHp,
              deficit,
              before,
              total: result.hp_effect_rate?.[run]?.[source] ?? before
            },
            base,
            perPoint
          )
        : undefined;

    return {
      run,
      check,
      need,
      spurt,
      recovered: decision === 1 && first != null && first !== 1,
      speedLoss:
        late && finite(row.spurt_target_speed_mps) && finite(row.full_spurt_target_speed_mps)
          ? Math.max(0, row.full_spurt_target_speed_mps - row.spurt_target_speed_mps)
          : undefined,
      delay:
        late && finite(row.spurt_start_m) && finite(checkDistance)
          ? Math.max(0, row.spurt_start_m - checkDistance)
          : undefined,
      received: applications.reduce((sum, a) => sum + Math.max(0, a.appliedHpDelta), 0),
      drained: applications.reduce((sum, a) => sum - Math.min(0, a.appliedHpDelta), 0),
      finalHp,
      maxHp,
      exhaustedAt: exhaustionDistance(row?.exhausted_at, distance) ?? undefined,
      needed
    };
  });
}

/** Stamina and last-spurt figures for one runner across the batch. */
export function staminaReport(
  result: MonteCarloResult,
  source: number,
  runner?: Pick<FieldRunner, 'stats' | 'running_style' | 'motivation'>,
  distance?: number
): StaminaRunner {
  const runs = result.runs,
    races = staminaRaces(result, source, runner, distance),
    diagnostics = diagnosticsOf(result, source);

  const needed = races.map((race) => race.needed).filter(finite);
  const stamina = needed.length ? runner?.stats.stamina : undefined;
  const decided = races.filter((race) => race.spurt);
  const share = (test: (race: StaminaRace) => boolean) =>
    (decided.filter(test).length / runs) * 100;

  const late = races.filter((race) => race.spurt === 'late');
  const finish = races.map((race) => race.finalHp).filter(finite);
  const finishPercent = races.flatMap((race) =>
    finite(race.finalHp) && finite(race.maxHp) && race.maxHp > 0
      ? [(race.finalHp / race.maxHp) * 100]
      : []
  );

  let exhausted: StaminaRunner['exhausted'];
  if (diagnostics?.length) {
    const points = races.map((race) => race.exhaustedAt).filter(finite);
    exhausted = { rate: (points.length / runs) * 100, at: simulatorSampleSummary(points)?.median };
  } else if (finish.length)
    exhausted = { rate: (finish.filter((hp) => hp <= 0).length / finish.length) * 100 };

  // HP used in each phase: the drop across it, with the recovery and drain received in it taken back out.
  let phases: number[] | undefined;
  const t = telemetryOf(result),
    course = distance ?? result.report?.distance_m.at(-1);

  if (t && course && diagnostics?.length === runs) {
    const sums = [0, 0, 0, 0];
    for (let run = 0; run < runs; run++) {
      const curve = source * runs + run,
        times = [
          ...RACE_PHASES.map((phase) => timeAt(result, curve, course * phase.start)),
          t.finish_seconds[curve]!
        ];

      const hp = times.map((time) => telemetrySample(t, curve, time, 3));
      for (let phase = 0; phase < 4; phase++) {
        const changes = diagnostics[run]!.hp_applications.filter(
          (a) =>
            a.time >= times[phase]! &&
            (phase === 3 ? a.time <= times[4]! : a.time < times[phase + 1]!)
        ).reduce((sum, a) => sum + a.appliedHpDelta, 0);

        sums[phase]! += hp[phase]! - hp[phase + 1]! + changes;
      }
    }

    phases = sums.map((sum) => sum / runs);
  }

  const rushed = diagnostics?.filter((row) => row.rushed_seconds > 0) ?? [];
  const effects = (result.hp_effect_rate ?? []).map((row) => row[source]).filter(finite);
  return {
    source,
    runs,
    stamina,
    maxHp: simulatorSampleSummary(races.map((race) => race.maxHp).filter(finite)),
    needed: simulatorSampleSummary(needed),
    covered:
      stamina === undefined
        ? undefined
        : (needed.filter((value) => value <= stamina).length / needed.length) * 100,
    spare: simulatorSampleSummary(
      races.flatMap((race) =>
        finite(race.check) && finite(race.need) ? [race.check - race.need] : []
      )
    ),
    spurt: decided.length
      ? {
          full: share((race) => race.spurt === 'full'),
          late: share((race) => race.spurt === 'late'),
          none: share((race) => race.spurt === 'none'),
          recovered: share((race) => race.recovered)
        }
      : undefined,
    speedLoss: mean(late.map((race) => race.speedLoss).filter(finite)),
    delay: mean(late.map((race) => race.delay).filter(finite)),
    fullSpeed: mean(
      diagnostics?.map((row) => row.full_spurt_target_speed_mps).filter(finite) ?? []
    ),
    spurtSpeed: mean(diagnostics?.map((row) => row.spurt_target_speed_mps).filter(finite) ?? []),
    finishHp: simulatorSampleSummary(finish),
    finishPercent: simulatorSampleSummary(finishPercent),
    exhausted,
    phases,
    received: diagnostics?.length ? mean(races.map((race) => race.received)) : undefined,
    drained: diagnostics?.length ? mean(races.map((race) => race.drained)) : undefined,
    left: mean(finish),
    effect: mean(effects),
    rushed: {
      rate: diagnostics?.length ? (rushed.length / diagnostics.length) * 100 : 0,
      seconds: mean(rushed.map((row) => row.rushed_seconds))
    }
  };
}

/** HP as a share of maximum HP at evenly spaced course distances, across every race. */
export function hpByDistance(
  result: MonteCarloResult,
  source: number,
  distance: number,
  points = 101
): { x: number[]; bands: ReportBand[] } | undefined {
  const t = telemetryOf(result);
  if (!t) return undefined;
  const runs = result.runs,
    x = Array.from({ length: points }, (_, index) => (distance * index) / (points - 1));

  const values: number[][] = x.map(() => []);
  for (let run = 0; run < runs; run++) {
    const curve = source * runs + run,
      finish = t.finish_seconds[curve]!,
      max = result.max_hp?.[run]?.[source] ?? telemetrySample(t, curve, 0, 3);

    if (!(max > 0)) continue;
    let time = 0,
      before = telemetrySample(t, curve, 0, 0),
      beforeHp = telemetrySample(t, curve, 0, 3);

    let next = time + 1 > finish ? finish : time + 1,
      after = telemetrySample(t, curve, next, 0),
      afterHp = telemetrySample(t, curve, next, 3);

    for (let point = 0; point < points; point++) {
      const target = x[point]!;
      while (after < target && next < finish) {
        time = next;
        before = after;
        beforeHp = afterHp;
        next = Math.min(finish, time + 1);
        after = telemetrySample(t, curve, next, 0);
        afterHp = telemetrySample(t, curve, next, 3);
      }

      const hp =
        after <= before
          ? afterHp
          : beforeHp +
            (afterHp - beforeHp) * Math.max(0, Math.min(1, (target - before) / (after - before)));

      values[point]!.push(Math.max(0, Math.min(100, (hp / max) * 100)));
    }
  }

  return {
    x,
    bands: values.map((list) => {
      const s = simulatorSampleSummary(list);
      return s
        ? ([s.mean, s.p10, s.median, s.p90, s.count] as ReportBand)
        : ([0, 0, 0, 0, 0] as ReportBand);
    })
  };
}
