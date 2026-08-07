import {
  PlannerEventBenefit,
  PlannerFreePullCampaign,
  PlannerRewardEntry,
  PlannerRewardResource,
} from '../models/carat-planner.model';

type ProvenancedPlannerEntry = { provenance?: string };

const LOGIN_MATCH_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

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
  return scope ? `${scope}|${reward.currency}|${rewardComponent(reward)}` : null;
}

function rewardComponent(reward: PlannerRewardEntry): string {
  const text = [reward.id, reward.label, reward.assumption, reward.evidence]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/login[-_ ]?bonus|ログインボーナス/.test(text)) return 'login_bonus';
  if (/mission|ミッション/.test(text)) return 'missions';
  if (/story[-_ ]?event|story event/.test(text)) return 'story_event';
  if (/gift|present|プレゼント/.test(text)) return 'gift';
  return 'other';
}

function newsPostId(reward: PlannerRewardEntry): string | null {
  return reward.id.match(/^news-(\d+)-/)?.[1] ?? null;
}

function isGiftContents(reward: PlannerRewardEntry): boolean {
  return /gift contents|contents of the gift|プレゼントの内容/i.test(
    `${reward.label} ${reward.evidence ?? ''}`,
  );
}

function isGiftClaimDisclaimer(reward: PlannerRewardEntry): boolean {
  return /30 days after|30日間|受け取り期限/i.test(
    `${reward.label} ${reward.evidence ?? ''}`,
  );
}

function redundantJpGiftDisclaimerIds(rewards: readonly PlannerRewardEntry[]): Set<string> {
  const redundant = new Set<string>();
  for (const reward of rewards) {
    const postId = newsPostId(reward);
    if (!postId || !isJp(reward) || rewardComponent(reward) !== 'gift' || !isGiftClaimDisclaimer(reward)) {
      continue;
    }
    const hasDetailedSibling = rewards.some(candidate =>
      candidate.id !== reward.id
      && newsPostId(candidate) === postId
      && isJp(candidate)
      && rewardComponent(candidate) === 'gift'
      && isGiftContents(candidate)
      && candidate.currency === reward.currency
      && candidate.amount === reward.amount);
    if (hasDetailedSibling) redundant.add(reward.id);
  }
  return redundant;
}

function isMatchingUnlinkedGlobalLogin(
  jpReward: PlannerRewardEntry,
  globalReward: PlannerRewardEntry,
): boolean {
  if (rewardScope(globalReward) !== null
    || rewardComponent(jpReward) !== 'login_bonus'
    || rewardComponent(globalReward) !== 'login_bonus'
    || jpReward.currency !== globalReward.currency
    || jpReward.amount !== globalReward.amount) return false;
  const jpDate = Date.parse(jpReward.available_at);
  const globalDate = Date.parse(globalReward.available_at);
  return Number.isFinite(jpDate)
    && Number.isFinite(globalDate)
    && Math.abs(jpDate - globalDate) <= LOGIN_MATCH_WINDOW_MS;
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

  const redundantGiftIds = redundantJpGiftDisclaimerIds(rewards);
  const deduplicatedRewards = rewards.filter(reward => !redundantGiftIds.has(reward.id));

  const globalRewardSlots = new Set(
    deduplicatedRewards
      .filter(isGlobal)
      .map(rewardSlot)
      .filter((slot): slot is string => slot !== null),
  );
  const unlinkedGlobalLogins = deduplicatedRewards.filter(reward =>
    isGlobal(reward) && rewardScope(reward) === null && rewardComponent(reward) === 'login_bonus');
  const preferredRewards = deduplicatedRewards.filter(reward => {
    const slot = rewardSlot(reward);
    return !isJp(reward)
      || (
        (slot === null || !globalRewardSlots.has(slot))
        && !unlinkedGlobalLogins.some(globalReward => isMatchingUnlinkedGlobalLogin(reward, globalReward))
      );
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
