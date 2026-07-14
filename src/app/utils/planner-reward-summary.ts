import { PlannerRewardResource } from '../models/carat-planner.model';

export interface TimelineRewardSummary {
  eventId: string;
  carats: number;
  tickets: number;
  freePulls: number;
  selectors: number;
  label: string;
  items: TimelineRewardItem[];
}

export type TimelineRewardItemKind =
  | 'carats'
  | 'uma_ticket'
  | 'support_ticket'
  | 'free_pulls'
  | 'trainee_selector'
  | 'support_selector';

export interface TimelineRewardItem {
  key: string;
  kind: TimelineRewardItemKind;
  amount: number;
  label: string;
  countLabel: string;
  iconPath: string;
}

interface MutableRewardSummary {
  carats: number;
  umaTickets: number;
  supportTickets: number;
  freePulls: number;
  selectorItems: Map<string, MutableSelectorReward>;
}

interface MutableSelectorReward {
  kind: 'trainee_selector' | 'support_selector';
  itemId: number;
  amount: number;
}

const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ITEM_ICON_ROOT = 'assets/images/item';
const REWARD_ITEM_IDS = {
  carats: 43,
  uma_ticket: 41,
  support_ticket: 111,
  trainee_selector: 164,
  support_selector: 165,
} as const;
const PREPARED_REWARD_ITEM_IDS = new Set([41, 43, 111, 141, 164, 165, 178, 197, 205, 214, 255]);

function itemIconPath(itemId: number): string {
  return `${ITEM_ICON_ROOT}/item_icon_${itemId.toString().padStart(5, '0')}.webp`;
}

function rewardItem(
  kind: TimelineRewardItemKind,
  amount: number,
  name: string,
  iconItemId: number,
  visibleSuffix = '',
): TimelineRewardItem {
  const countLabel = `${INTEGER_FORMATTER.format(amount)}${visibleSuffix}`;
  return {
    key: `${kind}:${iconItemId}`,
    kind,
    amount,
    label: `${INTEGER_FORMATTER.format(amount)} ${name}`,
    countLabel,
    iconPath: itemIconPath(iconItemId),
  };
}

export function buildTimelineRewardSummaries(
  resource: Pick<PlannerRewardResource, 'rewards' | 'event_benefits' | 'free_pull_campaigns'>,
): Map<string, TimelineRewardSummary> {
  const totals = new Map<string, MutableRewardSummary>();
  const summaryFor = (eventId: string): MutableRewardSummary => {
    const existing = totals.get(eventId);
    if (existing) return existing;
    const created: MutableRewardSummary = {
      carats: 0,
      umaTickets: 0,
      supportTickets: 0,
      freePulls: 0,
      selectorItems: new Map(),
    };
    totals.set(eventId, created);
    return created;
  };

  for (const reward of resource.rewards ?? []) {
    if (!reward.event_id || !Number.isFinite(reward.amount) || Number(reward.amount) <= 0) continue;
    const summary = summaryFor(reward.event_id);
    if (reward.currency === 'free_jewels' || reward.currency === 'paid_jewels') {
      summary.carats += Number(reward.amount);
    } else if (reward.currency === 'uma_ticket') {
      summary.umaTickets += Number(reward.amount);
    } else if (reward.currency === 'support_ticket') {
      summary.supportTickets += Number(reward.amount);
    }
  }

  const managedCampaignIds = new Set((resource.free_pull_campaigns ?? []).map(campaign => campaign.id));
  for (const benefit of resource.event_benefits ?? []) {
    if (!benefit.event_id || !Number.isFinite(benefit.amount) || Number(benefit.amount) <= 0) continue;
    if (benefit.kind === 'free_pulls' && benefit.campaign_id && managedCampaignIds.has(benefit.campaign_id)) {
      continue;
    }
    const summary = summaryFor(benefit.event_id);
    if (benefit.kind === 'free_pulls') summary.freePulls += Number(benefit.amount);
    if (benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector') {
      const fallbackItemId = REWARD_ITEM_IDS[benefit.kind];
      const requestedItemId = Number(benefit.item_id);
      const itemId = Number.isInteger(requestedItemId) && PREPARED_REWARD_ITEM_IDS.has(requestedItemId)
        ? requestedItemId
        : fallbackItemId;
      const key = `${benefit.kind}:${itemId}`;
      const existing = summary.selectorItems.get(key);
      if (existing) {
        existing.amount += Number(benefit.amount) || 1;
      } else {
        summary.selectorItems.set(key, {
          kind: benefit.kind,
          itemId,
          amount: Number(benefit.amount) || 1,
        });
      }
    }
  }

  for (const campaign of resource.free_pull_campaigns ?? []) {
    for (const allocation of campaign.default_allocations ?? []) {
      if (!allocation.event_id || !Number.isFinite(allocation.pulls) || Number(allocation.pulls) <= 0) continue;
      summaryFor(allocation.event_id).freePulls += Number(allocation.pulls);
    }
  }

  const summaries = new Map<string, TimelineRewardSummary>();
  for (const [eventId, total] of totals) {
    const tickets = total.umaTickets + total.supportTickets;
    const selectors = [...total.selectorItems.values()].reduce((sum, item) => sum + item.amount, 0);
    const parts: string[] = [];
    if (total.carats > 0) parts.push(`${INTEGER_FORMATTER.format(total.carats)} Carats`);
    if (tickets > 0) parts.push(`${INTEGER_FORMATTER.format(tickets)} ${tickets === 1 ? 'ticket' : 'tickets'}`);
    if (total.freePulls > 0) parts.push(`${INTEGER_FORMATTER.format(total.freePulls)} free pulls`);
    if (selectors > 0) parts.push(`${INTEGER_FORMATTER.format(selectors)} ${selectors === 1 ? 'selector' : 'selectors'}`);

    const items: TimelineRewardItem[] = [];
    if (total.carats > 0) {
      items.push(rewardItem('carats', total.carats, 'Carats', REWARD_ITEM_IDS.carats));
    }
    if (total.umaTickets > 0) {
      items.push(rewardItem(
        'uma_ticket',
        total.umaTickets,
        total.umaTickets === 1 ? 'trainee scout ticket' : 'trainee scout tickets',
        REWARD_ITEM_IDS.uma_ticket,
      ));
    }
    if (total.supportTickets > 0) {
      items.push(rewardItem(
        'support_ticket',
        total.supportTickets,
        total.supportTickets === 1 ? 'support card scout ticket' : 'support card scout tickets',
        REWARD_ITEM_IDS.support_ticket,
      ));
    }
    if (total.freePulls > 0) {
      // The event card swaps this to the support ticket asset for support banners.
      items.push(rewardItem('free_pulls', total.freePulls, 'free pulls', REWARD_ITEM_IDS.uma_ticket, ' pulls'));
    }
    for (const selector of total.selectorItems.values()) {
      const selectorName = selector.kind === 'trainee_selector' ? 'trainee selector' : 'support card selector';
      items.push(rewardItem(
        selector.kind,
        selector.amount,
        selector.amount === 1 ? selectorName : `${selectorName}s`,
        selector.itemId,
      ));
    }

    const label = parts.join(' \u00b7 ');
    if (label) {
      summaries.set(eventId, {
        eventId,
        carats: total.carats,
        tickets,
        freePulls: total.freePulls,
        selectors,
        label,
        items,
      });
    }
  }
  return summaries;
}
