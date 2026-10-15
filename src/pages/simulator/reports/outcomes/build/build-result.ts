import type {
  OptimizeEstimate,
  OptimizeFinalist,
  OptimizeResult
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
/** `+0.42`, for columns that say their unit once. */
export const signed = (value: number) =>
  (value < 0 ? '−' : '+') + (Math.abs(value) < 0.005 ? '0.00' : Math.abs(value).toFixed(2));
/** `0.42 s`, signed when it costs time; in real fields `+0.42`, runners beaten. */
export const amount = (value: number, field: boolean) =>
  field
    ? signed(value)
    : (value < 0 ? '−' : '') +
      (Math.abs(value) < 0.005 ? '0.00' : Math.abs(value).toFixed(2)) +
      ' s';
/** Surely costs her: time with the pack, places in real fields. */
export const surelyWorse = (estimate: OptimizeEstimate) =>
  estimate.mean + SURE * estimate.standard_error < 0;

/** What a runner-up buys that the best does not, and the other way round. */
export function difference(
  finalist: OptimizeFinalist,
  best: OptimizeFinalist | undefined,
  offers: PricedOffer[]
) {
  const mine = new Set(finalist.build.purchases),
    top = new Set(best?.build.purchases ?? []);
  return {
    adds: [...mine].filter((index) => !top.has(index)).map((index) => offers[index]?.skill.name),
    drops: [...top].filter((index) => !mine.has(index)).map((index) => offers[index]?.skill.name)
  };
}

/**
 * The best build's skills, each with the time it adds on its own. An upgrade replaces the skill it builds on, so the
 * two are one row: the skill she ends up with, both costs, and both gains.
 */
export function buildAdds(best: OptimizeFinalist | undefined, offers: PricedOffer[]) {
  const steps = (best?.contributions ?? [])
    .map((step) => ({
      offers: step.purchases.map((index) => offers[index]).filter((offer) => !!offer),
      base: [] as PricedOffer[],
      gain: { ...step.gain }
    }))
    .filter((step) => step.offers.length);
  // Down each chain (a gold on its ◎ on its ○) until every skill she builds on is in the row of what replaces it.
  let merged: boolean;
  do {
    merged = false;
    for (const step of steps) {
      for (const offer of [...step.offers, ...step.base]) {
        const on = offer.buildsOn;
        if (!on || on.owned) continue;
        const lower = steps.find(
          (other) =>
            other !== step && other.offers.some((item) => item.skillId === on.skill.skill_id)
        );
        if (!lower) continue;
        step.base.push(...lower.offers, ...lower.base);
        step.gain = {
          ...step.gain,
          mean: step.gain.mean + lower.gain.mean,
          standard_error: Math.hypot(step.gain.standard_error, lower.gain.standard_error)
        };
        lower.offers = [];
        lower.base = [];
        merged = true;
      }
    }
  } while (merged);
  return steps.filter((step) => step.offers.length);
}

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
/** Skills on offer that can never fire for her here, left out of the search. */
export const inertOffers = (inert: OptimizeResult['inert'], offers: PricedOffer[]) =>
  (inert ?? [])
    .map((item) => ({
      ...item,
      offer: offers[item.purchase],
      reason: item.why.map((why) => RULED_OUT[why] ?? why).join(' and ')
    }))
    .filter((item) => !!item.offer);
export type InertOffer = ReturnType<typeof inertOffers>[number];
/** The inert skills grouped by what rules them out. */
export function inertGroups(inert: InertOffer[]) {
  const groups = new Map<string, string[]>();
  for (const item of inert) {
    groups.set(item.reason, [...(groups.get(item.reason) ?? []), item.offer!.skill.name]);
  }
  return [...groups].map(
    ([reason, names]) => names.join(', ') + (names.length === 1 ? ' needs ' : ' need ') + reason
  );
}

/** Every skill on offer as screened, the most useful first. */
export const screenedImpacts = (
  impacts: OptimizeResult['report']['impacts'],
  offers: PricedOffer[]
) =>
  (impacts ?? [])
    .map((impact) => ({ ...impact, offer: offers[impact.purchase] }))
    .filter((impact) => !!impact.offer)
    .sort(
      (a, b) =>
        (b.together ?? b.alone).mean - (a.together ?? a.alone).mean || a.purchase - b.purchase
    );
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
    return !!impact && surelyWorse(impact.together ?? impact.alone);
  });
  return {
    left,
    all: bought.size >= offers.length,
    slower: slower.map((index) => offers[index]!.skill.name),
    unexplained: affordable.length > slower.length
  };
}

/** A value raced on fewer than every search seed stopped once more races could not change the pick. */
export const stoppedShort = (estimate: OptimizeEstimate, seeds: number) => estimate.samples < seeds;
/** How sure a raced value is, on hover. */
export const spread = (estimate: OptimizeEstimate) =>
  '± ' +
  estimate.standard_error.toFixed(2) +
  ' over ' +
  estimate.samples.toLocaleString() +
  (estimate.samples === 1 ? ' race' : ' races');

/** How much racing it took, in one line. */
export function searchTally(result: OptimizeResult) {
  const report = result.report;
  const fresh = report.validation_seeds.length;
  return [
    (report.screen?.builds ?? report.candidates_evaluated).toLocaleString() + ' builds raced',
    report.simulations.toLocaleString() + ' races',
    fresh ? 'checked on ' + fresh + ' fresh races' : ''
  ]
    .filter(Boolean)
    .join(' · ');
}
