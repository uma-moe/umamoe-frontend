import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { hpPerStamina, staminaForMaxHp } from '@/pages/simulator/reports/outcomes/stamina-report';
import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';

export type HpCheck = 'spurt' | 'survival';

interface RaceRunnerRef {
  result: MonteCarloResult;
  run: number;
  source: number;
}

export interface HpMilestone {
  /** The share of races to pass the check, from 0 to 1. */
  rate: number;
  /** The extra HP at the check that passes it in that share of the races. */
  extraHp: number;
  /** The extra maximum HP that does, once recovery and drain that scale with it are counted. */
  extraMaxHp?: number;
}

export interface HpCheckSummary {
  races: number;
  /** The share of races that passed the check, from 0 to 1. */
  passRate: number;
  /** The pass rates above the current one, in steps up to every race. Empty when every race passed. */
  milestones: HpMilestone[];
}

const MILESTONE_STEP = 0.05;
const MILESTONE_LIMIT = 7;
const RUNNING_STYLES: Record<number, string> = { 1: 'Nige', 2: 'Senko', 3: 'Sashi', 4: 'Oikomi' };

const finite = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

/** HP to spare over the full spurt's cost at the first spurt check; negative when HP was short. */
export function spurtMargin({ result, run, source }: RaceRunnerRef): number | undefined {
  const check = result.check_hp?.[run]?.[source]?.[0];
  const need = result.full_spurt_need_hp?.[run]?.[source]?.[0];

  return finite(check) && finite(need) ? check - need : undefined;
}

/** HP left at the finish, or as a negative the HP the runner ran out by. */
export function survivalMargin({ result, run, source }: RaceRunnerRef): number | undefined {
  const finalHp = result.final_hp?.[run]?.[source];
  const deficit = result.hp_deficit?.[run]?.[source];

  if (finite(finalHp) && finalHp > 0) return finalHp;
  if (finite(deficit) && deficit > 0) return -deficit;
  return finite(finalHp) ? finalHp : undefined;
}

export function hpMargin(check: HpCheck, race: RaceRunnerRef): number | undefined {
  return check === 'spurt' ? spurtMargin(race) : survivalMargin(race);
}

/** A spurt check passes with exactly the HP it needs; a finish only counts as survived with HP left. */
export function passesHpCheck(check: HpCheck, margin: number): boolean {
  return check === 'spurt' ? margin >= 0 : margin > 0;
}

/**
 * The extra maximum HP that covers a race's shortfall. Skill recovery and drain scale with maximum HP, so a point of
 * it is worth more or less than a point at the check.
 */
function extraMaxHpNeeded(check: HpCheck, race: RaceRunnerRef): number | undefined {
  const margin = hpMargin(check, race);
  if (margin === undefined) return undefined;
  if (margin >= 0) return 0;

  const { result, run, source } = race;
  const effectRate =
    check === 'spurt'
      ? result.hp_effect_rate_before_first_spurt?.[run]?.[source]
      : result.hp_effect_rate?.[run]?.[source];

  const perMaxHp = 1 + (effectRate ?? 0);
  return perMaxHp > 0 ? -margin / perMaxHp : undefined;
}

/** The smallest amount that covers `rate` of the shortfalls, which are sorted ascending. */
function coveringShortfall(sortedShortfalls: number[], rate: number): number {
  const index = Math.max(0, Math.ceil(sortedShortfalls.length * rate - 1e-9) - 1);

  return sortedShortfalls[index] ?? 0;
}

/** The pass rates above `passRate`, in steps up to every race; only the last few when there are many. */
function milestoneRates(passRate: number): number[] {
  const rates: number[] = [];
  const firstStep = Math.floor(passRate / MILESTONE_STEP + 1e-9) + 1;

  for (let step = firstStep; step * MILESTONE_STEP < 1 - 1e-9; step++) {
    rates.push(Math.round(step * MILESTONE_STEP * 100) / 100);
  }

  rates.push(1);
  return rates.slice(-MILESTONE_LIMIT);
}

/** How often a runner passed an HP check over the estimate's races, and the HP that would pass it more often. */
export function hpCheckSummary(
  check: HpCheck,
  result: MonteCarloResult,
  source: number
): HpCheckSummary | undefined {
  const shortfalls: number[] = [];
  const maxHpShortfalls: number[] = [];
  let passed = 0;

  for (let run = 0; run < result.runs; run++) {
    const race = { result, run, source };
    const margin = hpMargin(check, race);
    if (margin === undefined) continue;

    if (passesHpCheck(check, margin)) passed++;
    shortfalls.push(Math.max(0, -margin));

    const extraMaxHp = extraMaxHpNeeded(check, race);
    if (extraMaxHp !== undefined) maxHpShortfalls.push(extraMaxHp);
  }

  if (shortfalls.length === 0) return undefined;

  shortfalls.sort((a, b) => a - b);
  maxHpShortfalls.sort((a, b) => a - b);

  const races = shortfalls.length;
  const passRate = passed / races;
  const everyRaceHasMaxHp = maxHpShortfalls.length === races;
  const milestones =
    passed === races
      ? []
      : milestoneRates(passRate).map((rate): HpMilestone => ({
          rate,
          extraHp: coveringShortfall(shortfalls, rate),
          ...(everyRaceHasMaxHp ? { extraMaxHp: coveringShortfall(maxHpShortfalls, rate) } : {})
        }));

  return { races, passRate, milestones };
}

/** The raw stamina that adds `extraMaxHp` for this runner, or undefined when her style, mood or stamina is unknown. */
export function staminaForExtraMaxHp(runner: RaceRunner, extraMaxHp: number): number | undefined {
  const style = RUNNING_STYLES[Number(runner.raw.running_style)];
  const stamina = runner.stats.stamina;
  if (style === undefined || stamina === undefined) return undefined;

  return staminaForMaxHp({
    extraMaxHp,
    rawStamina: stamina,
    hpPerPoint: hpPerStamina(style, Number(runner.raw.motivation))
  });
}

/** An HP margin as the race history prints it: signed and whole. */
export function formatHpMargin(margin: number): string {
  const rounded = Math.round(margin);
  if (rounded > 0) return '+' + rounded;
  if (rounded < 0) return '−' + Math.abs(rounded);
  return '0';
}
