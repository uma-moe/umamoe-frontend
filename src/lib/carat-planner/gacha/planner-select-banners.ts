import type { PlannerGachaEntry, PlannerPickupGoal } from '../carat-planner';

export function selectBannerPickLimit(gacha?: PlannerGachaEntry): number | undefined {
  const count = gacha?.select_count;
  if (count === undefined || !Number.isInteger(count) || count < 1) return undefined;

  return count;
}

/** Only the player's picks are rate-ups, so goals past a select banner's limit cannot count. */
export function selectBannerGoals(
  goals: PlannerPickupGoal[],
  gacha?: PlannerGachaEntry
): PlannerPickupGoal[] {
  const limit = selectBannerPickLimit(gacha);
  return limit === undefined ? goals : goals.slice(0, limit);
}

/** A select banner's rate-ups are the picked cards plus any slots still unpicked, not every candidate. */
export function rateUpPoolRates(
  gacha: PlannerGachaEntry | undefined,
  pickedIds: readonly number[]
): number[] {
  const candidates = gacha?.pickups ?? gacha?.featured_pickups ?? [];
  const limit = selectBannerPickLimit(gacha);
  if (limit === undefined) return candidates.map((pickup) => pickup.rate);

  const picked = candidates.filter((pickup) => pickedIds.includes(pickup.pickup_id));
  const openSlots = candidates
    .filter((pickup) => !pickedIds.includes(pickup.pickup_id))
    .slice(0, Math.max(0, limit - picked.length));

  return [...picked, ...openSlots].map((pickup) => pickup.rate);
}
