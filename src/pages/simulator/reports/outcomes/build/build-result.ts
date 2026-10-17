import type {
  OptimizeEstimate,
  OptimizeFinalist,
  OptimizeImpact,
  OptimizeResult,
  OptimizeScenarioResult
} from '../../../simulator-repository';
import type { PricedOffer } from '../../../setup/build/skill-offers';

/** The first optimizer that races her alone and screens every skill. */
export const SCREEN_SCHEMA = 5;
/** Optimize responses from schema 7 leave out skills that can never fire for her. */
export const INERT_SCHEMA = 7;
/** How sure a skill must be to cost time before the search leaves SP unspent on it (the server's rule). */
const SURE = 3;

/** Seconds a build saves her a race: the fresh races' estimate when there is one. */
export const gainOf = (finalist: OptimizeFinalist): OptimizeEstimate | undefined =>
  finalist.validation_gain ?? finalist.gain;

/** Rounds to nothing at two decimals, so it shows without a sign rather than as `−0.00`. */
const roundsToZero = (value: number) => Math.abs(value) < 0.005;

/** `+0.42`, for columns that say their unit once. */
export const signed = (value: number) => {
  if (roundsToZero(value)) return '0.00';

  return (value < 0 ? '−' : '+') + Math.abs(value).toFixed(2);
};

/** `0.42 s`, signed when it costs time; in real fields `+0.42`, runners beaten. */
export const amount = (value: number, field: boolean) => {
  if (field) return signed(value);
  if (roundsToZero(value)) return '0.00 s';

  return (value < 0 ? '−' : '') + Math.abs(value).toFixed(2) + ' s';
};

/** Surely costs her: time with the pack, places in real fields. */
export const surelyWorse = (estimate: OptimizeEstimate) =>
  estimate.mean + SURE * estimate.standard_error < 0;

/** Sure enough of a value's sign to show it: two standard errors clear of nothing. */
export const clearOfZero = (estimate: OptimizeEstimate) =>
  Math.abs(estimate.mean) > 2 * estimate.standard_error;

/** Where the search valued a skill: in the best build, or only from the screening. */
export type ValuedAt = NonNullable<OptimizeImpact['valued_at']>;

/** What the search values a skill at, weighed against CM evidence. An older service sends only the screening. */
export function skillValue(impact: OptimizeImpact): { estimate: OptimizeEstimate; at: ValuedAt } {
  if (impact.value !== undefined) {
    return { estimate: impact.value, at: impact.valued_at ?? 'screening' };
  }

  return { estimate: impact.together ?? impact.alone, at: 'screening' };
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

/** What finalist `build` buys that the best build does not, and what it leaves out that the best build buys. */
export function changesFromBest(rows: CompareRow[], build: number, offers: PricedOffer[]) {
  const added: HeldSkill[] = [];
  const dropped: HeldSkill[] = [];
  for (const row of rows) {
    const best = new Set(row.held[0]);
    const own = new Set(row.held[build]);
    const gained = row.chain.filter((index) => own.has(index) && !best.has(index));
    const lost = row.chain.filter((index) => best.has(index) && !own.has(index));

    if (gained.length) added.push(heldSkill(offers, row.chain[0]!, gained));
    if (lost.length) dropped.push(heldSkill(offers, row.chain[0]!, lost));
  }

  return { added, dropped };
}

/**
 * What each skill adds to the best build, raced there: the search's value, weighed against the evidence. An older
 * service sends only what the races measured for the best build's own skills.
 */
export function valuesInBest(best: OptimizeFinalist | undefined, impacts: ScreenedImpact[]) {
  const values = new Map<number, OptimizeEstimate>();
  for (const contribution of best?.contributions ?? []) {
    const index = contribution.purchases[0];
    if (index !== undefined) values.set(index, contribution.gain);
  }

  for (const impact of impacts) {
    if (impact.worth.at === 'best_build') values.set(impact.purchase, impact.worth.estimate);
  }

  return values;
}

/** The sum of independent estimates; undefined for none. */
function total(estimates: OptimizeEstimate[]): OptimizeEstimate | undefined {
  if (!estimates.length) return undefined;

  return {
    mean: estimates.reduce((sum, estimate) => sum + estimate.mean, 0),
    standard_error: Math.hypot(...estimates.map((estimate) => estimate.standard_error)),
    samples: Math.min(...estimates.map((estimate) => estimate.samples))
  };
}

/** A skill of the skill lists: what it costs and what it adds to the best build. */
export interface SkillRow {
  /** Its first purchase. */
  key: number;
  offer: PricedOffer;
  /** In the best build, the skills it builds on that are bought with it. */
  via: PricedOffer[];
  cost: number;
  value?: OptimizeEstimate;
  /** Valued only by the screening: it cannot join the best build, or the race cap ran out there. */
  screened: boolean;
  locked: boolean;
  /** How the screening raced it: alone, with everything, and what CM records say. */
  impact?: ScreenedImpact;
}

const byValue = (a: SkillRow, b: SkillRow) =>
  (b.value?.mean ?? Number.NEGATIVE_INFINITY) - (a.value?.mean ?? Number.NEGATIVE_INFINITY);

/** The best build's skills, a chain as one, and the skills it leaves out; each list the most useful first. */
export function skillLists(
  best: OptimizeFinalist | undefined,
  offers: PricedOffer[],
  impacts: ScreenedImpact[]
) {
  const screening = new Map(impacts.map((impact) => [impact.purchase, impact]));
  const values = valuesInBest(best, impacts);
  const valueOf = (index: number) => values.get(index) ?? screening.get(index)?.worth.estimate;

  const buy: SkillRow[] = (best ? compareRows([best], offers).shared : []).map((row) => ({
    key: row.chain[0]!,
    offer: row.top,
    via: row.base,
    cost: row.cost,
    value: total(row.chain.flatMap((index) => valueOf(index) ?? [])),
    screened: row.chain.some((index) => !values.has(index)),
    locked: row.chain.some((index) => offers[index]?.locked === true),
    impact: screening.get(row.chain[0]!)
  }));

  const bought = new Set(best?.build.purchases ?? []);
  const left: SkillRow[] = impacts
    .filter((impact) => !bought.has(impact.purchase))
    .map((impact) => ({
      key: impact.purchase,
      offer: impact.offer,
      via: [],
      cost: impact.offer.cost,
      value: impact.worth.estimate,
      screened: impact.worth.at === 'screening',
      locked: false,
      impact
    }));

  return { buy: buy.sort(byValue), left: left.sort(byValue) };
}

/** How a build raced on average: wins, place, finish time and HP, from the fresh races when there are some. */
export interface RaceStats {
  win: number;
  time: number;
  place?: number;
  hpLeft?: number;
  fullSpurt?: number;
}

/** A finalist's race stats, each scenario counted by its races; fields an older service leaves out stay undefined. */
export function raceStats(finalist: OptimizeFinalist): RaceStats | undefined {
  const scenarios = (finalist.validation ?? finalist.search)?.scenarios ?? [];
  const races = scenarios.reduce((sum, scenario) => sum + scenario.win_rate.samples, 0);
  if (!races) return undefined;

  const average = (pick: (scenario: OptimizeScenarioResult) => OptimizeEstimate | undefined) => {
    let total = 0;
    for (const scenario of scenarios) {
      const estimate = pick(scenario);
      if (estimate === undefined) return undefined;
      total += estimate.mean * scenario.win_rate.samples;
    }

    return total / races;
  };

  return {
    win: average((scenario) => scenario.win_rate)!,
    time: average((scenario) => scenario.finish_time_seconds)!,
    place: average((scenario) => scenario.place),
    hpLeft: average((scenario) => scenario.hp_left),
    fullSpurt: average((scenario) => scenario.full_spurt)
  };
}

/** One race stat of a build as shown, and whether it is the best of the finalists. */
export interface StatCell {
  label: string;
  text: string;
  top: boolean;
}

/** `68%`. */
export const percent = (share: number) => Math.round(share * 100) + '%';

/** A finish time as the game shows it: `2:31.42`. */
export function raceTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes + ':' + (seconds - minutes * 60).toFixed(2).padStart(5, '0');
}

/** The race stats a build shows, each with which way is better. */
const STATS: {
  label: string;
  pick: (stats: RaceStats) => number | undefined;
  show: (value: number) => string;
  better: 'higher' | 'lower';
}[] = [
  { label: 'Wins', pick: (stats) => stats.win, show: percent, better: 'higher' },
  {
    label: 'Avg place',
    pick: (stats) => stats.place,
    show: (value) => value.toFixed(2),
    better: 'lower'
  },
  { label: 'Avg time', pick: (stats) => stats.time, show: raceTime, better: 'lower' },
  { label: 'HP left', pick: (stats) => stats.hpLeft, show: percent, better: 'higher' },
  { label: 'Full spurt', pick: (stats) => stats.fullSpurt, show: percent, better: 'higher' }
];

/**
 * Each finalist's race stats as shown, a stat an older service leaves out skipped for all of them. With more than one
 * finalist, the best value of each stat across them is marked.
 */
export function statCells(finalists: OptimizeFinalist[]): StatCell[][] {
  const stats = finalists.map(raceStats);
  const cells: StatCell[][] = finalists.map(() => []);
  for (const stat of STATS) {
    const picked = stats.map((raced) => (raced ? stat.pick(raced) : undefined));
    const known = picked.filter((value): value is number => value !== undefined);
    if (!known.length) continue;

    const top = stat.better === 'higher' ? Math.max(...known) : Math.min(...known);
    picked.forEach((value, index) => {
      if (value === undefined) return;

      cells[index]!.push({
        label: stat.label,
        text: stat.show(value),
        top: finalists.length > 1 && value === top
      });
    });
  }

  return cells;
}

/** One scale for the value bars of every skill row, from below zero to the largest value. */
export interface ValueScale {
  from: number;
  span: number;
}

/** A scale that fits every row's value, with a little room left of zero so a bar that costs her shows. */
export function valueScale(rows: SkillRow[]): ValueScale {
  const means = rows.flatMap((row) => (row.value ? [row.value.mean] : []));
  const high = Math.max(0, ...means);
  const low = Math.min(0, ...means);
  const from = Math.min(low, -0.08 * (high - low || 1));

  return { from, span: high - from || 1 };
}

/** Where a bar starts and how wide it is on the scale, in percent: from zero to the value, either way. */
export function barShape(scale: ValueScale, mean: number) {
  const at = (value: number) =>
    Math.min(100, Math.max(0, ((value - scale.from) / scale.span) * 100));
  const zero = at(0);
  const end = at(mean);

  return { zero, left: Math.min(zero, end), width: Math.abs(end - zero) };
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

/** Every skill on offer as screened, with what the search values it at, the most useful first. */
export const screenedImpacts = (
  impacts: OptimizeResult['report']['impacts'],
  offers: PricedOffer[]
) =>
  (impacts ?? [])
    .flatMap((impact) => {
      const offer = offers[impact.purchase];
      if (offer === undefined) return [];
      return [{ ...impact, offer, worth: skillValue(impact) }];
    })
    .sort((a, b) => b.worth.estimate.mean - a.worth.estimate.mean || a.purchase - b.purchase);

export type ScreenedImpact = ReturnType<typeof screenedImpacts>[number];

/** What buying an offer costs on top of the best build: its price and every skill down its chain not bought yet. */
function chainCost(offers: PricedOffer[], bought: Set<number>, index: number): number {
  const offer = offers[index]!;
  const on = offer.buildsOn;
  const lower =
    on && !on.owned ? offers.findIndex((other) => other.skillId === on.skill.skill_id) : -1;

  return offer.cost + (lower >= 0 && !bought.has(lower) ? chainCost(offers, bought, lower) : 0);
}

/** SP the best build leaves, and the skills it could still afford: the search only skips one that surely costs. */
export function leftoverSp(
  best: OptimizeFinalist | undefined,
  budget: number | undefined,
  offers: PricedOffer[],
  bought: Set<number>,
  inertSet: Set<number>,
  impacts: ScreenedImpact[]
) {
  if (!best || budget === undefined) return undefined;
  const left = budget - best.sp_cost;
  const affordable = offers
    .map((_, index) => {
      if (bought.has(index) || inertSet.has(index)) return undefined;
      return chainCost(offers, bought, index) <= left ? index : undefined;
    })
    .filter((index): index is number => index !== undefined);

  const screened = new Map(impacts.map((impact) => [impact.purchase, impact]));
  const slower = affordable.filter((index) => {
    const impact = screened.get(index);
    return impact !== undefined && surelyWorse(impact.worth.estimate);
  });

  return {
    left,
    all: bought.size >= offers.length,
    slower: slower.map((index) => offers[index]!.skill.name),
    unexplained: affordable.length > slower.length
  };
}

/** How sure a raced value is, on hover. */
export const spread = (estimate: OptimizeEstimate) =>
  '± ' +
  estimate.standard_error.toFixed(2) +
  ' over ' +
  estimate.samples.toLocaleString('en-US') +
  (estimate.samples === 1 ? ' race' : ' races');

/** How much racing it took, in a sentence. */
export function searchTally(result: OptimizeResult) {
  const report = result.report;
  const builds = (report.screen?.builds ?? report.candidates_evaluated).toLocaleString('en-US');
  const searched =
    'The search tried ' +
    builds +
    ' builds over ' +
    report.simulations.toLocaleString('en-US') +
    ' races';
  const fresh = report.validation_seeds.length;
  if (!fresh) return searched + '.';

  return (
    searched +
    ', then raced the best ones again on ' +
    fresh.toLocaleString('en-US') +
    ' new races to check them.'
  );
}
