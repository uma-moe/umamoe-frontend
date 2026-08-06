import {
  PlannerEventBenefit,
  PlannerFreePullCampaign,
  PlannerRewardEntry,
  PlannerRewardResource,
} from '../models/carat-planner.model';

type ProvenancedPlannerEntry = { provenance?: string };

function isGlobal(entry: ProvenancedPlannerEntry): boolean {
  return entry.provenance?.startsWith('global_') === true;
}

function isJp(entry: ProvenancedPlannerEntry): boolean {
  return entry.provenance?.startsWith('jp_') === true;
}

function rewardScope(reward: PlannerRewardEntry): string | null {
  if (reward.event_id) return `event:${reward.event_id}`;
  if (Number.isFinite(reward.gacha_id)) return `gacha:${reward.gacha_id}`;
  return null;
}

function rewardSlot(reward: PlannerRewardEntry): string | null {
  const scope = rewardScope(reward);
  return scope ? `${scope}|${reward.currency}` : null;
}

function benefitSlot(benefit: PlannerEventBenefit): string {
  return `event:${benefit.event_id}|${benefit.kind}`;
}

function campaignEventIds(campaign: PlannerFreePullCampaign): string[] {
  return (campaign.default_allocations ?? [])
    .map(allocation => allocation.event_id)
    .filter(Boolean);
}

function campaignGachaIds(campaign: PlannerFreePullCampaign): number[] {
  return [
    ...(campaign.eligible_gacha_ids ?? []),
    ...(campaign.default_allocations ?? []).map(allocation => allocation.gacha_id),
  ].filter((gachaId): gachaId is number => Number.isFinite(gachaId));
}

/**
 * Makes published Global data authoritative when the reward resource also
 * contains a JP-derived prediction for the same event reward slot.
 */
export function applyGlobalRewardPrecedence(resource: PlannerRewardResource): PlannerRewardResource {
  const rewards = resource.rewards ?? [];
  const eventBenefits = resource.event_benefits ?? [];
  const freePullCampaigns = resource.free_pull_campaigns ?? [];

  const globalRewardSlots = new Set(
    rewards
      .filter(isGlobal)
      .map(rewardSlot)
      .filter((slot): slot is string => slot !== null),
  );
  const preferredRewards = rewards.filter(reward => {
    const slot = rewardSlot(reward);
    return !isJp(reward) || slot === null || !globalRewardSlots.has(slot);
  });

  const globalBenefitSlots = new Set(eventBenefits.filter(isGlobal).map(benefitSlot));
  const preferredBenefits = eventBenefits.filter(benefit => (
    !isJp(benefit) || !globalBenefitSlots.has(benefitSlot(benefit))
  ));

  const globalCampaigns = freePullCampaigns.filter(isGlobal);
  const globalCampaignEventIds = new Set(globalCampaigns.flatMap(campaignEventIds));
  const globalCampaignGachaIds = new Set(globalCampaigns.flatMap(campaignGachaIds));
  const preferredCampaigns = freePullCampaigns.filter(campaign => {
    if (!isJp(campaign)) return true;
    return !campaignEventIds(campaign).some(eventId => globalCampaignEventIds.has(eventId))
      && !campaignGachaIds(campaign).some(gachaId => globalCampaignGachaIds.has(gachaId));
  });

  if (
    preferredRewards.length === rewards.length
    && preferredBenefits.length === eventBenefits.length
    && preferredCampaigns.length === freePullCampaigns.length
  ) {
    return resource;
  }

  return {
    ...resource,
    rewards: preferredRewards,
    event_benefits: preferredBenefits,
    free_pull_campaigns: preferredCampaigns,
  };
}
