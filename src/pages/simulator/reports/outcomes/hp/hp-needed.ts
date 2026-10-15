import { RECOVERY_PERCENT } from '../../../setup/hp/hp-plan';
import type { StaminaResult } from '../../../simulator-repository';
import { effectiveStamina, hpPerStamina, neededStamina } from '../stamina-report';

/** The stamina, style and motivation an HP calculation ran with. */
export interface HpRunner {
  stamina: number;
  style: string;
  motivation: number;
}

/** The spurt decision's codes, as the simulator reports them. */
const FULL_SPURT = 1,
  REDUCED_SPURT = 2;

/** One race of a calculation, from its distribution or, for a single race, from the result itself. */
export interface HpRace {
  /** HP and what a full spurt needs at the first spurt check, and where it was. */
  check?: number;
  need?: number;
  at?: number;
  decision: number;
  /** HP at the finish; below zero by what she was short when it ran out. */
  finish: number;
  exhaustedAt?: number;
  time: number;
  /** Scheduled HP changes as a share of maximum HP: by the first check, and all of them. */
  rateBefore: number;
  rate: number;
  rushed: boolean;
}

/** Every race of a calculation, in seed order. */
export function hpRaces(result: StaminaResult): HpRace[] {
  const d = result.distribution;
  if (!d)
    return [
      {
        check: result.check_hp[0],
        need: result.full_spurt_need_hp[0],
        at: result.spurt_calculation_distances[0],
        decision: result.last_spurt_decision,
        finish: result.exhausted_at ? -result.hp_deficit : result.remaining_hp,
        exhaustedAt: result.exhausted_at?.distance_m,
        time: result.finish_time_seconds,
        rateBefore: 0,
        rate: 0,
        rushed: false
      }
    ];
  return d.seeds.map((_, index) => ({
    check: d.check_hp[index] ?? undefined,
    need: d.full_spurt_need_hp[index] ?? undefined,
    at: d.check_distance_m[index] ?? undefined,
    decision: d.last_spurt_decision[index]!,
    finish: d.exhausted_distance_m[index] != null ? -d.hp_deficit[index]! : d.remaining_hp[index]!,
    exhaustedAt: d.exhausted_distance_m[index] ?? undefined,
    time: d.finish_time_seconds[index]!,
    rateBefore: d.effect_rate_before_check[index] ?? 0,
    rate: d.effect_rate[index] ?? 0,
    rushed: d.rushed[index] ?? false
  }));
}

/** The `q` quantile of sorted values, between neighbours. */
export function quantile(sorted: number[], q: number): number | undefined {
  if (!sorted.length) return undefined;
  const at = Math.min(1, Math.max(0, q)) * (sorted.length - 1),
    low = Math.floor(at),
    high = Math.ceil(at);

  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}

export interface HpQuantiles {
  p10: number;
  p50: number;
  p90: number;
}

function quantiles(values: Array<number | undefined>): HpQuantiles | undefined {
  const sorted = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!sorted.length) return undefined;
  return { p10: quantile(sorted, 0.1)!, p50: quantile(sorted, 0.5)!, p90: quantile(sorted, 0.9)! };
}

/** What the races of a calculation add up to. */
export interface HpSpread {
  races: number;
  /** Races by how she spurted: full speed from the decision, slower or later, or not at all. */
  full: number;
  reduced: number;
  none: number;
  /** Races in which her HP ran out. */
  out: number;
  rushed: number;
  /**
   * Stamina, green skills included, at which each race's spurt check passes and she still reaches the finish with HP
   * left; the same formula as the race simulator's stamina table.
   */
  needed?: HpQuantiles;
  /** HP over (or under) a full spurt's need at the decision, and at the finish. */
  spare?: HpQuantiles;
  finish: HpQuantiles;
  time: number;
}

export function hpSpread(result: StaminaResult, runner: HpRunner, forced: boolean): HpSpread {
  const races = hpRaces(result);
  const stamina = effectiveStamina(runner.stamina),
    perPoint = hpPerStamina(runner.style, runner.motivation);

  const out = races.filter((race) => race.exhaustedAt != null).length;
  const decided = (code: number) => races.filter((race) => race.decision === code).length;
  const full = forced ? races.length - out : decided(FULL_SPURT),
    reduced = forced ? 0 : decided(REDUCED_SPURT);

  return {
    races: races.length,
    full,
    reduced,
    none: races.length - full - reduced,
    out,
    rushed: races.filter((race) => race.rushed).length,
    needed: quantiles(
      races.map((race) =>
        race.check == null || race.need == null
          ? undefined
          : neededStamina(
              {
                check: race.check,
                need: race.need,
                finalHp: Math.max(0, race.finish),
                deficit: Math.max(0, -race.finish),
                before: race.rateBefore,
                total: race.rate
              },
              stamina,
              perPoint
            )
      )
    ),
    spare: quantiles(
      races.map((race) =>
        race.check == null || race.need == null ? undefined : race.check - race.need
      )
    ),
    finish: quantiles(races.map((race) => race.finish))!,
    time: quantiles(races.map((race) => race.time))!.p50
  };
}

export interface HpVerdict {
  tone: 'good' | 'warn' | 'bad';
  /** The answer, short: for the result's heading and the bar that keeps it in reach. */
  title: string;
  /** Why, in a sentence. */
  detail: string;
}

/**
 * What a calculation says about her last spurt, from how she actually spurted in each race; `forced` is the request's
 * "always full" setting, which makes every race spurt at full speed whatever her HP.
 */
export function hpVerdict(spread: HpSpread, forced: boolean): HpVerdict {
  const of = (count: number) => {
    if (spread.races === 1) {
      return '';
    }

    if (count === spread.races) {
      return ' in all ' + spread.races + ' races';
    }

    return ' in ' + count + ' of ' + spread.races + ' races';
  };

  const out = spread.out
    ? 'Her HP runs out' + of(spread.out) + '.'
    : 'Her HP lasts to the finish' + of(spread.races) + '.';

  if (forced)
    return spread.out
      ? {
          tone: spread.out > spread.races / 10 ? 'bad' : 'warn',
          title: 'Runs out of HP on a full spurt',
          detail: out
        }
      : { tone: 'good', title: 'Holds a full spurt to the finish', detail: out };

  const share = spread.full / spread.races;
  if (share >= 0.95)
    return {
      tone: 'good',
      title: 'Holds a full last spurt',
      detail: 'Full speed' + of(spread.full) + '. ' + out
    };

  if (!spread.full)
    return {
      tone: 'bad',
      title: 'No full last spurt',
      detail: (spread.reduced ? 'A slower or later spurt' + of(spread.reduced) + '. ' : '') + out
    };

  return {
    tone: share >= 0.5 ? 'warn' : 'bad',
    title: 'Full spurt in ' + Math.round(share * 100) + '% of races',
    detail:
      'Full speed' +
      of(spread.full) +
      (spread.reduced ? ', slower or later' + of(spread.reduced).replace(' races', '') : '') +
      '. ' +
      out
  };
}

/** Gold recovery skills in mid race that would make up `short` HP; `undefined` when she is not short. */
export function goldRecoveryNeeded(short: number, maxHp: number): number | undefined {
  if (!(short > 0) || !(maxHp > 0)) return undefined;
  return Math.ceil(short / ((RECOVERY_PERCENT.gold / 100) * maxHp));
}

export interface HpBillLine {
  label: string;
  /** HP: positive adds, negative takes away; a start or total line is the HP she has there. */
  hp: number;
  /** The HP she starts the part with. */
  start?: boolean;
  /** The HP she ends the part with. */
  total?: boolean;
}

/**
 * Where her HP goes in the result's own race (the median one when it sampled several): up to the spurt decision, then
 * the last spurt. HP used running is what is left over once recovery and debuffs are counted, so every part adds up
 * to the HP the simulator reports at each point.
 */
export function hpBill(result: StaminaResult): {
  before: HpBillLine[];
  after: HpBillLine[];
  decision?: { at: number; need: number };
} {
  const d = result.distribution,
    index = d?.median ?? 0;

  const end = result.exhausted_at ? -result.hp_deficit : result.remaining_hp;
  const check = result.check_hp[0],
    need = result.full_spurt_need_hp[0],
    at = result.spurt_calculation_distances[0];

  const lines = (from: HpBillLine, recovery: number, debuffs: number, to: number, label: string) =>
    [
      from,
      { label: 'Running', hp: -(from.hp + recovery - debuffs - to) },
      ...(recovery > 0 ? [{ label: 'Recovery skills', hp: recovery }] : []),
      ...(debuffs > 0 ? [{ label: 'HP debuffs', hp: -debuffs }] : []),
      { label, hp: to, total: true }
    ] as HpBillLine[];

  const start = { label: 'Max HP', hp: result.max_hp, start: true };

  const finish = result.exhausted_at ? 'Short at the finish' : 'Left at the finish';
  const recovered = d?.recovered_before_check_hp[index],
    drained = d?.debuff_before_check_hp[index];

  if (check == null || at == null || recovered == null || drained == null)
    return {
      before: lines(start, result.recovered_hp, result.debuff_hp_loss, end, finish),
      after: []
    };

  return {
    before: lines(start, recovered, drained, check, 'At the spurt decision'),
    after: lines(
      { label: 'At the spurt decision', hp: check, start: true },
      result.recovered_hp - recovered,
      result.debuff_hp_loss - drained,
      end,
      finish
    ),
    ...(need != null ? { decision: { at, need } } : {})
  };
}
