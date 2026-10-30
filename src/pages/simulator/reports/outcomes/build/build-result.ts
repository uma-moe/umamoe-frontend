import {
  isOptimizeTheory,
  isOptimizeModel,
  type OptimizeModel,
  type OptimizeEvaluation,
  type OptimizeScenarioResult,
  type V5PurchaseValue,
  type OptimizeFinalist,
  type OptimizeResult,
  type OptimizeTheory,
  type RacedWins,
  type TheoryFire,
  type TheoryOffer
} from '../../../simulator-repository';
import type { PricedOffer } from '../../../setup/build/skill-offers';

/** The first optimizer that theorizes builds: worth in lengths from where skills fire and how they combine. */
export const THEORY_SCHEMA = 8;
/** A length (bashin) is 2.5 m. */
export const LENGTH_M = 2.5;
/** Worth this close to nothing, in lengths, adds nothing a race would show. */
const NOTHING = 0.03;
/** A skill that fires in fewer races than this rarely helps her. */
const RARELY = 0.3;
/** First activations this early are at the gate. */
const GATE_M = 30;

/** Background bars are relative to the largest contribution in their own build or skill list. */
export function contributionScale(skills: readonly { value: number | undefined }[]): number {
  let scale = 0;
  for (const skill of skills) {
    scale = Math.max(scale, Math.abs(skill.value ?? 0));
  }

  return scale || 1;
}

/** `+5.6%`, estimated win points (0–1) as a share of races won; one decimal, two below a point. */
export function winText(win: number): string {
  const points = win * 100;
  const size = Math.abs(points).toFixed(Math.abs(points) < 1 ? 2 : 1);
  if (points > 0) return `+${size}%`;
  if (points < 0) return `−${size}%`;
  return `${size}%`;
}

/** `38.1%`, a win rate (0–1) measured in races. */
export function winRateText(rate: number): string {
  return (rate * 100).toFixed(1) + '%';
}

/** How far a build trails the pick in the races that ranked them: win points (0–1), and that gap's standard error. */
export interface RacedGap {
  behind: number;
  error: number;
}

/**
 * How far `build` trails `pick`, both raced beside the theory's pick. Each one's error is its gain's over that pick (0
 * for the theory's pick itself), so the gap's is at most the root of their squares: the rate they share drops out.
 */
export function racedGap(pick: RacedWins, build: RacedWins): RacedGap {
  return {
    behind: pick.win_rate - build.win_rate,
    error: Math.hypot(pick.error, build.error)
  };
}

/** `−0.6 ± 0.4 pts`, a build's standing against the pick with its error; two decimals while the error is under a tenth. */
export function gapText({ behind, error }: RacedGap): string {
  const digits = error * 100 < 0.1 ? 2 : 1;
  const points = -behind * 100;
  const sign = points < 0 ? '−' : '+';
  return sign + Math.abs(points).toFixed(digits) + ' ± ' + (error * 100).toFixed(digits) + ' pts';
}

/** `+0.62 L`, a skill's worth; builds read to one decimal, and a column that says its unit drops it. */
export function lengthsText(lengths: number, digits = 2, unit = true): string {
  const suffix = unit ? ' L' : '';
  const rounds = Math.abs(lengths) < 0.5 * 10 ** -digits;
  if (rounds) return (0).toFixed(digits) + suffix;

  return (lengths > 0 ? '+' : '−') + Math.abs(lengths).toFixed(digits) + suffix;
}

/** What a skill's worth means for her: it helps, adds nothing, or costs her. */
export type WorthState = 'helps' | 'nothing' | 'costs';

export function worthState(value: number, unit: 'lengths' | 'score' = 'lengths'): WorthState {
  const threshold = unit === 'score' ? 1e-8 : NOTHING;
  if (value > threshold) return 'helps';
  if (value < -threshold) return 'costs';
  return 'nothing';
}

/** Where on the course a first activation lands, in words: at the gate, or the phase it falls in. */
export function fireWhere(metres: number, phaseBounds: number[]): string {
  if (metres <= GATE_M) return 'at the gate';

  const phases = ['in the opening', 'mid race', 'in the late race', 'in the last spurt'];
  const phase = phaseBounds.findIndex((bound, index) => index > 0 && metres < bound) - 1;
  return phases[phase < 0 ? phases.length - 1 : phase] ?? 'in the last spurt';
}

/** How a skill fires, in a sentence: how often, where, and whether it waits for her other skills. */
export function fireText({
  fire,
  phaseBounds,
  countGated
}: {
  fire: TheoryFire & { races?: number };
  phaseBounds: number[];
  countGated: boolean;
}): string {
  if ('races' in fire && fire.races === 0) return 'No activation timing recorded';
  if (fire.rate <= 0 || fire.mean_m === null) {
    return countGated
      ? 'Never fires here: too few of her skills fire before it'
      : 'Never fires here';
  }

  const share = Math.round(fire.rate * 100) + '% of races';
  const at = Math.round(fire.mean_m / 10) * 10;
  const after = countGated ? ', once enough of her skills have fired' : '';
  const rarely = fire.rate < RARELY ? ' (rarely)' : '';
  return (
    'Fires in ' +
    share +
    rarely +
    ', first ' +
    fireWhere(fire.mean_m, phaseBounds) +
    ' (~' +
    at.toLocaleString('en-US') +
    ' m)' +
    after
  );
}

/**
 * One row of the build comparison: a skill and the skills it upgrades, bought as one chain (a gold on its ◎ on its ○).
 * `held` says, per build, which purchases of the chain it holds.
 */
export interface CompareRow {
  /** Purchase indices, the skill she ends up with first. */
  chain: number[];
  top: PricedOffer;
  /** The skills the top one builds on, down the chain. */
  base: PricedOffer[];
  cost: number;
  held: number[][];
}

/** The purchase an offer builds on, when that is on offer rather than owned. */
function lowerOf(offers: PricedOffer[], index: number) {
  const on = offers[index]?.buildsOn;
  if (!on || on.owned) return -1;
  return offers.findIndex((other) => other.skillId === on.skill.skill_id);
}

/**
 * Every skill the finalists buy, as chains, with which finalist holds what: the rows where they differ first, then
 * the rows every finalist shares, each the dearest first.
 */
export function compareRows(finalists: OptimizeFinalist[], offers: PricedOffer[]) {
  const builds = finalists.map((finalist) => new Set(finalist.build.purchases));
  const bought = new Set(builds.flatMap((build) => [...build]));
  const upgraded = new Set([...bought].map((index) => lowerOf(offers, index)));

  const rows: CompareRow[] = [];
  for (const top of bought) {
    // A chain starts at the skill nothing bought builds on.
    if (upgraded.has(top) || offers[top] === undefined) continue;

    const chain = [top];
    for (let lower = lowerOf(offers, top); lower >= 0 && bought.has(lower);) {
      chain.push(lower);
      lower = lowerOf(offers, lower);
    }

    rows.push({
      chain,
      top: offers[top]!,
      base: chain.slice(1).map((index) => offers[index]!),
      cost: chain.reduce((sum, index) => sum + offers[index]!.cost, 0),
      held: builds.map((build) => chain.filter((index) => build.has(index)))
    });
  }

  const differs = (row: CompareRow) => row.held.some((held) => held.length !== row.chain.length);
  const dearest = (a: CompareRow, b: CompareRow) => b.cost - a.cost;

  return {
    differ: rows.filter(differs).sort(dearest),
    shared: rows.filter((row) => !differs(row)).sort(dearest)
  };
}

/** A skill as one build holds it: the top skill of its chain that build bought, with the ones under it. */
export interface HeldSkill {
  /** The chain's first purchase, the same in every build. */
  key: number;
  offer: PricedOffer;
  /** What the skill builds on that this build also bought. */
  via: PricedOffer[];
  cost: number;
}

function heldSkill(offers: PricedOffer[], key: number, held: number[]): HeldSkill {
  return {
    key,
    offer: offers[held[0]!]!,
    via: held.slice(1).map((index) => offers[index]!),
    cost: held.reduce((sum, index) => sum + offers[index]!.cost, 0)
  };
}

/** How the theory values a skill: its source and whether it waits for her other skills. */
interface Valuation {
  source: TheoryOffer['source'] | V5PurchaseValue['source'] | 'unknown';
  countGated: boolean;
}

/** A build's card line: the part of a skill chain it holds, what that adds to the build and how it fires there. */
export interface BuildCell {
  skill: HeldSkill;
  /** Lengths it adds to this build: the build against the build without it. */
  value: number | undefined;
  /** The same as estimated win points (0–1), when the service sends them. */
  win?: number;
  fire: TheoryFire & { races?: number };
  measurement?: V5PurchaseValue['measured'];
  valuation: Valuation;
  locked: boolean;
  /** It holds other skills of the chain than the pick does, or the pick holds none of it. */
  differs: boolean;
}

/** A finalist with what the theory says it is worth, what races in her real fields won her with it, and its card. */
export interface TheorizedBuild {
  /** Whole-build gain is lengths for theory, measured seconds saved for V5. */
  unit?: 'seconds';
  winRate?: number;
  finalist: OptimizeFinalist;
  /** Lengths it gains her over her build as it is, its skills' synergies included. */
  value: number | undefined;
  /** Estimated win points (0–1) from its skills', when the service sends them. */
  win?: number;
  /** Her win rate with it in the races that ranked the finalists, when races ranked them; the builds are in its order. */
  raced?: RacedWins;
  /** HP she has left at the finish, below zero when she runs out. */
  hpLeft?: number;
  /** Skills it buys, a chain as one. */
  count: number;
  /** Its skills, the most worth first. */
  cells: BuildCell[];
  /** The pick's skills it does without. */
  skipped: string[];
}

/** A skill on offer in the list of every skill: what it is worth bought on her own, and whether the pick buys it. */
export interface ListedSkill {
  key: number;
  offer: PricedOffer;
  cost: number;
  value: number | undefined;
  win?: number;
  fire: TheoryFire & { races?: number };
  measurement?: V5PurchaseValue['measured'];
  valuation: Valuation;
  locked: boolean;
  bought: boolean;
}

/** The result as the page shows it: the theorized builds, the pick first, and every skill on offer. */
export interface TheorizedResult {
  builds: TheorizedBuild[];
  skills: ListedSkill[];
  /** The largest absolute contribution in the report. */
  scale: number;
  phaseBounds: number[];
  skillUnit: 'lengths' | 'score';
  theory?: OptimizeTheory;
  model?: OptimizeModel;
}

/**
 * How many builds the result compares: the service returns this many, its best by her win rate in races of her real CM
 * fields (or by theorized worth where it raced none), and the page keeps to it for a service that returns more.
 */
export const COMPARED_BUILDS = 3;

/** The response's theory, when it has one the page can read. */
export function theoryOf(result: OptimizeResult | undefined): OptimizeTheory | undefined {
  const theory = result?.theory;
  return isOptimizeTheory(theory) ? theory : undefined;
}

/**
 * The theorized result: each finalist with its worth, its win rate in races when races ranked it, and its skills'
 * parts, in the service's order, the pick first; every skill on offer by what it is worth on her own. A skill that needs
 * another on offer counts with it as one chain.
 */
export function theorizedResult({
  result,
  offers
}: {
  result: OptimizeResult;
  offers: PricedOffer[];
}): TheorizedResult | undefined {
  if (result.model !== undefined) return v5Result(result, offers);
  const theory = theoryOf(result);
  if (!theory) return undefined;

  const finalists = result.report.finalists.slice(
    0,
    Math.min(COMPARED_BUILDS, theory.finalists.length)
  );
  const { differ, shared } = compareRows(finalists, offers);
  const rows = [...shared, ...differ];
  const valuation = new Map(
    theory.offers.map((offer) => [
      offer.purchase,
      { source: offer.source, countGated: offer.count_gated }
    ])
  );
  const valuationOf = (purchase: number): Valuation =>
    valuation.get(purchase) ?? { source: 'physics', countGated: false };

  const builds = finalists.map((finalist, build): TheorizedBuild => {
    const theorized = theory.finalists[build]!;
    const worth = new Map(theorized.skills.map((skill) => [skill.purchase, skill]));
    const cells = rows
      .flatMap((row): BuildCell[] => {
        const held = row.held[build]!;
        if (!held.length) return [];

        const part = worth.get(held[0]!);
        const pick = row.held[0]!;
        return [
          {
            skill: heldSkill(offers, row.chain[0]!, held),
            value: part?.lengths ?? 0,
            win: part?.win,
            fire: part?.fire ?? { rate: 0, mean_m: null },
            valuation: valuationOf(held[0]!),
            locked: held.some((index) => offers[index]?.locked === true),
            differs: build > 0 && held.join() !== pick.join()
          }
        ];
      })
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    const skipped = rows.flatMap((row) =>
      build > 0 && row.held[0]!.length && !row.held[build]!.length ? [row.top.skill.name] : []
    );
    return {
      finalist,
      value: theorized.lengths,
      win: theorized.win,
      raced: theorized.raced,
      hpLeft: theorized.hp_left,
      count: cells.length,
      cells,
      skipped
    };
  });

  const picked = new Set(finalists[0]?.build.purchases ?? []);
  const skills = theory.offers
    .flatMap((offer): ListedSkill[] => {
      const priced = offers[offer.purchase];
      if (!priced) return [];

      return [
        {
          key: offer.purchase,
          offer: priced,
          cost: priced.cost,
          value: offer.lengths,
          win: offer.win,
          fire: offer.fire,
          valuation: { source: offer.source, countGated: offer.count_gated },
          locked: priced.locked === true,
          bought: picked.has(offer.purchase)
        }
      ];
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.key - b.key);

  const shown = [
    ...builds.flatMap((build) => build.cells.map((cell) => cell.value ?? 0)),
    ...skills.map((s) => s.value ?? 0)
  ];
  return {
    builds,
    skills,
    scale: Math.max(0, ...shown.map(Math.abs)) || 1,
    phaseBounds: theory.phase_bounds,
    theory,
    skillUnit: 'lengths'
  };
}

/** Skills on offer that can never fire for her here: the search leaves them out, and so does what SP is left for. */
export const inertPurchases = (inert: OptimizeResult['inert']) =>
  new Set((inert ?? []).map((item) => item.purchase));

/** What rules a skill out, in words: it needs another track, distance, running style and so on. */
const RULED_OUT: Record<string, string> = {
  track: 'another racecourse',
  distance: 'another distance',
  ground: 'another surface',
  going: 'other going',
  season: 'another season',
  weather: 'other weather',
  direction: 'the other direction',
  'race grade': 'another race grade',
  'running style': 'another running style',
  slope: 'a slope this course lacks',
  corners: 'corners this course lacks'
};

/** A skill on offer that can never fire for her here, and what it needs instead. */
export interface RuledOutSkill {
  purchase: number;
  offer: PricedOffer;
  /** `another racecourse`, `another distance and other weather`. */
  needs: string;
}

/** The skills on offer that can never fire for her here, with what each needs instead. */
export function ruledOutSkills(
  inert: OptimizeResult['inert'],
  offers: PricedOffer[]
): RuledOutSkill[] {
  return (inert ?? []).flatMap((item) => {
    const offer = offers[item.purchase];
    if (offer === undefined) return [];

    const needs = item.why.map((why) => RULED_OUT[why] ?? why).join(' and ');
    return [{ purchase: item.purchase, offer, needs }];
  });
}

/** What buying an offer costs on top of the pick: its price and every skill down its chain not bought yet. */
function chainCost(offers: PricedOffer[], bought: Set<number>, index: number): number {
  const offer = offers[index]!;
  const on = offer.buildsOn;
  const lower =
    on && !on.owned ? offers.findIndex((other) => other.skillId === on.skill.skill_id) : -1;

  return offer.cost + (lower >= 0 && !bought.has(lower) ? chainCost(offers, bought, lower) : 0);
}

/** SP the pick leaves, and the skills it could still afford that the theory says add nothing or cost her. */
export function leftoverSp({
  pick,
  budget,
  offers,
  inert,
  skills,
  skillUnit = 'lengths'
}: {
  pick: OptimizeFinalist | undefined;
  budget: number | undefined;
  offers: PricedOffer[];
  inert: Set<number>;
  skills: ListedSkill[];
  skillUnit?: 'lengths' | 'score';
}) {
  if (!pick || budget === undefined) return undefined;

  const bought = new Set(pick.build.purchases);
  const left = budget - pick.sp_cost;
  const affordable = offers
    .map((_, index) => index)
    .filter((index) => !bought.has(index) && !inert.has(index))
    .filter((index) => chainCost(offers, bought, index) <= left);
  const worth = new Map(skills.map((skill) => [skill.key, skill.value]));
  const useless = affordable.filter((index) => {
    const value = worth.get(index);
    return value !== undefined && value <= (skillUnit === 'score' ? 1e-8 : NOTHING);
  });

  return {
    left,
    all: bought.size >= offers.length,
    useless: useless.map((index) => offers[index]!.skill.name),
    unexplained: affordable.length > useless.length
  };
}

/**
 * How the theory got there, in a sentence: the builds it valued, the races of her real fields that ranked the best ones
 * by her win rate, and the races that checked the finalists.
 */
export function searchTally(result: OptimizeResult, theory: OptimizeTheory) {
  const valued =
    'The theory valued ' +
    theory.builds_valued.toLocaleString('en-US') +
    ' builds over ' +
    theory.search_draws.toLocaleString('en-US') +
    ' drawn races each';
  const ranking = theory.ranking_races ?? 0;
  const checked = result.report.validation_seeds.length;
  const steps: string[] = [];
  if (ranking > 0) {
    steps.push(
      'its best builds raced ' +
        ranking.toLocaleString('en-US') +
        ' races of her real CM fields, seed for seed beside its pick, and her win rate there ranks them'
    );
  }

  if (checked) {
    steps.push(
      'the best ones and her build as it is raced ' +
        checked.toLocaleString('en-US') +
        ' real races to check them'
    );
  }

  if (!steps.length) return valued + '.';

  return valued + ', then ' + steps.join(', and ') + '.';
}

/** What the races that checked a finalist say it gains her, in their unit: seconds, or runners beaten. */
export function checkText(finalist: OptimizeFinalist, field: boolean, races: number): string {
  const gain = finalist.validation_gain ?? finalist.gain;
  if (!gain) return '';

  const evaluated = finalist.validation ?? finalist.search;
  const hp = measuredMean(evaluated, 'hp_left');
  const spurt = measuredMean(evaluated, 'full_spurt');
  const survival = [
    hp === undefined ? '' : winRateText(hp) + ' HP left',
    spurt === undefined ? '' : winRateText(spurt) + ' full spurt'
  ].filter(Boolean);
  const unit = field ? ' runners beaten' : ' s';
  const sign = gain.mean >= 0 ? '+' : '−';
  return (
    'Checked in ' +
    races.toLocaleString('en-US') +
    ' races: ' +
    sign +
    Math.abs(gain.mean).toFixed(2) +
    unit +
    (survival.length ? ' · ' + survival.join(' · ') : '')
  );
}

/** Weighted by the actual number of races in each scenario, excluding missing metrics. */
function measuredMean(
  evaluation: OptimizeEvaluation | null | undefined,
  key: keyof OptimizeScenarioResult
): number | undefined {
  let total = 0,
    races = 0;
  for (const scenario of evaluation?.scenarios ?? []) {
    const metric = scenario[key];
    if (
      typeof metric !== 'object' ||
      !metric ||
      metric.samples <= 0 ||
      !Number.isFinite(metric.mean)
    )
      continue;
    total += metric.mean * metric.samples;
    races += metric.samples;
  }
  return races > 0 ? total / races : undefined;
}

/** Read V5's report into the existing comparison cards, matching builds by purchases rather than position. */
function v5Result(result: OptimizeResult, offers: PricedOffer[]): TheorizedResult | undefined {
  const model = result.model;
  if (!isOptimizeModel(model)) return undefined;
  const explanation = model.build!.explanation;
  // Without an explanation, skills carry the score V5 gave each purchase of its first build as it bought it.
  const firstSteps = model.build!.first_steps.map((step): V5PurchaseValue => ({
    purchase: step.add,
    held: true,
    score: step.predicted,
    source: 'v5',
    win: step.win,
    fire: { races: 0, rate: 0, mean_m: null }
  }));
  const finalists = result.report.finalists.slice(0, COMPARED_BUILDS);
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((p) => b.includes(p));
  const reports = finalists.map((f) =>
    explanation
      ? [explanation.optimized, explanation.initial].find((e) =>
          same(e.purchases, f.build.purchases)
        )
      : undefined
  );
  if (explanation && reports.some((r) => r === undefined)) return undefined;
  const rows = compareRows(finalists, offers);
  const baseline = measuredMean(result.report.baseline, 'finish_time_seconds');
  const builds = finalists.map((finalist, index): TheorizedBuild => {
    const worth = new Map(
      (reports[index]?.skills ?? firstSteps).filter((s) => s.held).map((s) => [s.purchase, s])
    );
    const cells = [...rows.shared, ...rows.differ]
      .flatMap((row): BuildCell[] => {
        const held = row.held[index]!;
        if (!held.length) return [];
        const part = worth.get(held[0]!);
        return [
          {
            skill: heldSkill(offers, row.chain[0]!, held),
            value: part?.score,
            win: part?.win,
            fire: part?.fire ?? { races: 0, rate: 0, mean_m: null },
            measurement: part?.measured,
            valuation: { source: part?.source ?? 'unknown', countGated: false },
            locked: held.some((p) => offers[p]?.locked === true),
            differs: index > 0 && held.join() !== row.held[0]!.join()
          }
        ];
      })
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    const evaluated = finalist.validation ?? finalist.search;
    const seconds = measuredMean(evaluated, 'finish_time_seconds');
    return {
      finalist,
      unit: 'seconds',
      value: baseline !== undefined && seconds !== undefined ? baseline - seconds : undefined,
      winRate: measuredMean(evaluated, 'win_rate'),
      count: cells.length,
      cells,
      skipped: [...rows.shared, ...rows.differ].flatMap((row) =>
        index > 0 && row.held[0]!.length && !row.held[index]!.length ? [row.top.skill.name] : []
      )
    };
  });
  const picked = new Set(finalists[0]?.build.purchases ?? []);
  const pickReport = reports[0];
  const skills: ListedSkill[] = (pickReport?.skills ?? firstSteps)
    .flatMap((part) => {
      const offer = offers[part.purchase];
      if (!offer) return [];
      return [
        {
          key: part.purchase,
          offer,
          cost: offer.cost,
          value: part.score,
          win: part.win,
          fire: part.fire,
          measurement: part.measured,
          valuation: { source: part.source, countGated: false },
          locked: offer.locked === true,
          bought: picked.has(part.purchase)
        }
      ];
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.key - b.key);
  return {
    builds,
    skills,
    skillUnit: 'score',
    model,
    phaseBounds: explanation?.phase_bounds ?? [],
    scale:
      Math.max(
        0,
        ...builds.flatMap((b) => b.cells.map((c) => Math.abs(c.value ?? 0))),
        ...skills.map((s) => Math.abs(s.value ?? 0))
      ) || 1
  };
}

/** Display the value in its actual unit, keeping unknown values distinct from zero. */
export function valueText(
  value: number | undefined,
  unit: 'lengths' | 'seconds' | 'score' = 'lengths',
  digits = 2,
  showUnit = true
): string {
  if (value === undefined) return '—';
  const text = lengthsText(value, digits, false);
  return text + (showUnit ? { lengths: ' L', seconds: ' s', score: ' score' }[unit] : '');
}

export function v5Tally(result: OptimizeResult, model: OptimizeModel): string {
  const build = model.build!;
  const rounds = build.rounds;
  const moves = rounds.reduce((n, r) => n + r.tested.length, 0);
  const checked = result.report.simulations;
  return (
    build.model +
    (build.ranker_sha256 ? ' with the trained move ranker' : '') +
    (build.course_prior ? ' and course skill weights' : '') +
    ' bought the initial build in ' +
    build.first_steps.length +
    ' steps, then tested ' +
    moves +
    ' moves over ' +
    rounds.length +
    ' optimization rounds. ' +
    model.races.toLocaleString('en-US') +
    ' search races + ' +
    checked.toLocaleString('en-US') +
    ' validation races = ' +
    (model.races + checked).toLocaleString('en-US') +
    ' races total. ' +
    'The search has a ' +
    model.budget.toLocaleString('en-US') +
    '-race budget and may finish earlier. ' +
    'Bars show V5 objective scores using the same model, ranker and paired race feedback as the search. ' +
    'A held skill is valued by removing it and dependent purchases; an unbought skill by adding it with prerequisites, SP aside. ' +
    'Model win-rate changes are internal comparisons from the V5 skill model. Card win rates and time differences come from internal validation races; they do not predict in-game results or reorder V5’s picks. ' +
    'Activation timing is observed during search, in course sections. A paired measurement is shown only when that exact change was raced against that exact build.'
  );
}
