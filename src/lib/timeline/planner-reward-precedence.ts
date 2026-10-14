import type { PlannerEventBenefit, PlannerFreePullCampaign, PlannerRewardEntry, PlannerRewardResource } from './carat-planner';

type Provenanced = { provenance?: string };
const LOGIN_MATCH_WINDOW_MS = 45 * 86_400_000;
const global = (entry: Provenanced) => entry.provenance?.startsWith('global_') === true;
const jp = (entry: Provenanced) => entry.provenance?.startsWith('jp_') === true;

function projectable(reward: PlannerRewardEntry): boolean {
  if (reward.provenance !== 'jp_news') return true;
  if (/ぱかライブ|paka\s*live/i.test(`${reward.label} ${reward.evidence ?? ''}`)) return false;
  return Boolean(reward.event_id) || Number.isFinite(reward.gacha_id);
}
function scope(reward: PlannerRewardEntry): string | null { return reward.event_id ? `event:${reward.event_id}` : Number.isFinite(reward.gacha_id) ? `gacha:${reward.gacha_id}` : null; }
function component(reward: PlannerRewardEntry): string { const value = [reward.id,reward.label,reward.assumption,reward.evidence].filter(Boolean).join(' ').toLowerCase(); if (/login[-_ ]?bonus|ログインボーナス/.test(value)) return 'login_bonus'; if (/mission|ミッション/.test(value)) return 'missions'; if (/story[-_ ]?event|story event/.test(value)) return 'story_event'; if (/gift|present|プレゼント/.test(value)) return 'gift'; return 'other'; }
function slot(reward: PlannerRewardEntry): string | null { const base = scope(reward); return base ? `${base}|${reward.currency}|${component(reward)}` : null; }
function postId(reward: PlannerRewardEntry): string | null { return reward.id.match(/^news-(\d+)-/)?.[1] ?? null; }
function redundantGiftIds(rewards: readonly PlannerRewardEntry[]): Set<string> {
  const redundant = new Set<string>();
  for (const reward of rewards) {
    const id = postId(reward);
    if (!id || !jp(reward) || component(reward) !== 'gift' || !/30 days after|30日間|受け取り期限/i.test(`${reward.label} ${reward.evidence ?? ''}`)) continue;
    if (rewards.some((candidate) => candidate.id !== reward.id && postId(candidate) === id && jp(candidate) && component(candidate) === 'gift' && /gift contents|contents of the gift|プレゼントの内容/i.test(`${candidate.label} ${candidate.evidence ?? ''}`) && candidate.currency === reward.currency && candidate.amount === reward.amount)) redundant.add(reward.id);
  }
  return redundant;
}
const benefitSlot = (benefit: PlannerEventBenefit) => `event:${benefit.event_id}|${benefit.kind}`;
const campaignEvents = (campaign: PlannerFreePullCampaign) => (campaign.default_allocations ?? []).map((item) => item.event_id).filter(Boolean);
const campaignGachas = (campaign: PlannerFreePullCampaign) => [...(campaign.eligible_gacha_ids ?? []), ...(campaign.default_allocations ?? []).map((item) => item.gacha_id)].filter((value): value is number => Number.isFinite(value));

/** Global rows replace matched JP predictions while unrelated future JP data
 * remains available. This runs once at the catalog boundary. */
export function applyGlobalRewardPrecedence(resource: PlannerRewardResource): PlannerRewardResource {
  const rewards = (resource.rewards ?? []).filter(projectable);
  const redundant = redundantGiftIds(rewards);
  const deduplicated = rewards.filter((reward) => !redundant.has(reward.id));
  const globalSlots = new Set(deduplicated.filter(global).map(slot).filter((value): value is string => value !== null));
  const globalLogins = deduplicated.filter((reward) => global(reward) && scope(reward) === null && component(reward) === 'login_bonus')
    .map(reward => ({ currency: reward.currency, amount: reward.amount, date: Date.parse(reward.available_at) }));
  const preferredRewards = deduplicated.filter(reward => {
    if (!jp(reward)) return true;
    const rewardSlot = slot(reward);
    if (rewardSlot !== null && globalSlots.has(rewardSlot)) return false;
    if (component(reward) !== 'login_bonus') return true;
    const date = Date.parse(reward.available_at);
    return !globalLogins.some(candidate => candidate.currency === reward.currency && candidate.amount === reward.amount && Math.abs(date - candidate.date) <= LOGIN_MATCH_WINDOW_MS);
  });
  const benefits = resource.event_benefits ?? [];
  const globalBenefitSlots = new Set(benefits.filter(global).map(benefitSlot));
  const preferredBenefits = benefits.filter((benefit) => !jp(benefit) || !globalBenefitSlots.has(benefitSlot(benefit)));
  const campaigns = resource.free_pull_campaigns ?? [];
  const globalCampaigns = campaigns.filter(global);
  const globalEventIds = new Set(globalCampaigns.flatMap(campaignEvents));
  const globalGachaIds = new Set(globalCampaigns.flatMap(campaignGachas));
  const preferredCampaigns = campaigns.filter((campaign) => !jp(campaign) || !campaignEvents(campaign).some((id) => globalEventIds.has(id)) && !campaignGachas(campaign).some((id) => globalGachaIds.has(id)));
  return { ...resource, rewards: preferredRewards, event_benefits: preferredBenefits, free_pull_campaigns: preferredCampaigns };
}
