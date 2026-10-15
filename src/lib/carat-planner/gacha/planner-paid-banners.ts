import type { PlannerGachaEntry, PlannerTarget } from '../carat-planner';

export function paidBannerType(type?: number): boolean {
  return [5, 10, 14, 15].includes(type ?? 0);
}

export function isPaidBanner(target: PlannerTarget, gacha?: PlannerGachaEntry): boolean {
  return (
    target.bannerKind === 'paid' ||
    Boolean(gacha?.paid_draw || gacha?.step_up) ||
    paidBannerType(gacha?.gacha_type)
  );
}

export function plannerCardKind(
  target: PlannerTarget,
  gacha?: PlannerGachaEntry
): 'support' | 'character' {
  return (gacha?.banner_kind ?? target.bannerKind) === 'support' ? 'support' : 'character';
}

export function paidBannerSteps(gacha?: PlannerGachaEntry) {
  if (gacha?.step_up)
    return Array.from(
      { length: Math.min(100, Math.max(0, gacha.step_up.rounds)) },
      () => gacha.step_up!.steps
    ).flat();
  if (!gacha?.paid_draw || !(gacha.jewel_cost_per_pull! > 0)) return [];
  return Array.from({ length: Math.min(500, gacha.paid_draw.limit || 500) }, () => ({
    pulls: 10,
    cost: gacha.jewel_cost_per_pull! * 10,
    guaranteed_rarity: gacha.paid_draw!.guaranteed_rarity,
    selectable: false
  }));
}

/** Each ten-pull's last slots have the master-data guarantee; a selected final card is certain. */
export function paidBannerDrawRates(
  gacha: PlannerGachaEntry | undefined,
  pulls: number,
  rates: readonly number[]
): number[][] {
  const result: number[][] = [];
  const topRate = gacha?.rarity_rates?.find((rate) => rate.rarity === 3)?.rate;
  for (const step of paidBannerSteps(gacha)) {
    if (result.length + step.pulls > pulls) break;
    const guaranteedCount = gacha?.step_up ? 1 : (gacha?.paid_draw?.guaranteed_count ?? 0);
    for (let index = 0; index < step.pulls; index++) {
      const guaranteed = index >= step.pulls - guaranteedCount;
      result.push(
        rates.map((rate) => {
          if (!guaranteed) {
            return rate;
          }

          if (step.selectable) {
            return 1;
          }

          if (step.guaranteed_rarity !== 3) {
            return rate;
          }

          if (gacha?.step_up) {
            if (gacha.step_up.selection_pool_size) {
              return 1 / gacha.step_up.selection_pool_size;
            }

            return Number.NaN;
          }

          if (topRate) {
            return rate / topRate;
          }

          return Number.NaN;
        })
      );
    }
  }

  return result;
}
