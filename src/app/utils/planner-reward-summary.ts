import { PlannerRewardEntry, PlannerRewardResource } from '../models/carat-planner.model';
import { plannerRewardBundles } from './planner-reward-currencies';

export interface TimelineRewardSummary {
  eventId: string;
  carats: number;
  tickets: number;
  rainbowCrystals: number;
  goldCrystals: number;
  freePulls: number;
  selectors: number;
  label: string;
  items: TimelineRewardItem[];
  variable: boolean;
  variableOutcomeCount: number;
  variableRewardLabels: string[];
  variableOutcomes: TimelineRewardOutcome[];
  mode: TimelineRewardMode;
  previewLabel: string;
  previewItems: TimelineRewardPreviewItem[];
  outcomeHeading: string;
  outcomeDescription: string;
}

export type TimelineRewardMode = 'fixed' | 'placement' | 'cumulative' | 'per_opponent';

export interface TimelineRewardPreviewItem {
  key: string;
  label: string;
  countLabel: string;
  icon: string;
  iconPath?: string;
}

export interface TimelineRewardOutcome {
  key: string;
  label: string;
  items: TimelineRewardOutcomeItem[];
  description?: string;
}

export interface TimelineRewardOutcomeItem {
  key: string;
  label: string;
  countLabel: string;
  amount: number;
  icon: string;
  iconPath?: string;
}

export type TimelineRewardItemKind =
  | 'carats'
  | 'uma_ticket'
  | 'support_ticket'
  | 'rainbow_crystal'
  | 'gold_crystal'
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
  rainbowCrystals: number;
  goldCrystals: number;
  freePulls: number;
  selectorItems: Map<string, MutableSelectorReward>;
  variableOutcomeIds: Set<string>;
  variableRewardLabels: Set<string>;
  variableOutcomes: TimelineRewardOutcome[];
  variableOutcomeGroups: Map<string, MutableRewardOutcomeGroup>;
  competition: string | null;
  competitiveTotals: Map<string, MutableCompetitiveTotal>;
}

interface MutableCompetitiveTotal {
  label: string;
  amount: number;
  icon: string;
  iconPath?: string;
}

interface MutableRewardOutcomeGroup {
  outcome: TimelineRewardOutcome;
  wins: Set<number>;
  ranks: Set<number>;
}
interface MutableSelectorReward {
  kind: 'trainee_selector' | 'support_selector';
  itemId: number;
  amount: number;
}

export interface TimelineRewardFallbackEvent {
  id: string;
  type?: string;
  title?: string;
  globalReleaseDate?: Date | string;
  estimatedGlobalDate?: Date | string;
  estimatedEndDate?: Date | string;
  jpReleaseDate?: Date | string;
  pickupCardIds?: number[];
  relatedCharacters?: string[];
}

const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ITEM_ICON_ROOT = 'assets/images/item';
const REWARD_ITEM_IDS = {
  carats: 43,
  uma_ticket: 41,
  support_ticket: 111,
  dream_glimmer: 44,
  money: 59,
  support_points: 110,
  goddess_statues: 115,
  rainbow_crystal: 149,
  gold_crystal: 150,
  trainee_selector: 164,
  support_selector: 165,
} as const;
const PREPARED_REWARD_ITEM_IDS = new Set([41, 43, 111, 141, 144, 145, 164, 165, 178, 197, 205, 214, 255]);
const STANDARD_STORY_EVENT_CARATS = 2010;
const GLOBAL_LAUNCH_DATE = '2025-06-26';
const FIFTY_DAY_LOGIN_CARATS = 150;
const SEASONAL_GIFT_CARATS = 500;
const DAY_MS = 86_400_000;

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

export function withTimelineRewardFallbacks(
  resource: PlannerRewardResource,
  timelineEvents: readonly TimelineRewardFallbackEvent[],
): PlannerRewardResource {
  const eventsWithCarats = new Set<string>();
  for (const bundle of plannerRewardBundles(resource.rewards ?? [])) {
    if (!bundle.eventId) continue;
    const carats = (bundle.totals.get('free_jewels') ?? 0) + (bundle.totals.get('paid_jewels') ?? 0);
    if (carats > 0) eventsWithCarats.add(bundle.eventId);
  }

  const fallbackRewards = timelineEvents.flatMap(event => {
    if (!event.id || event.type !== 'story_event' || eventsWithCarats.has(event.id)) return [];
    const availableAt = rewardDateKey(
      event.estimatedEndDate ?? event.globalReleaseDate ?? event.estimatedGlobalDate ?? event.jpReleaseDate,
    );
    if (!availableAt) return [];
    eventsWithCarats.add(event.id);
    return [{
      id: `standard-story-event:${event.id}`,
      event_id: event.id,
      label: `${event.title?.trim() || 'Story event'} rewards`,
      currency: 'free_jewels' as const,
      amount: STANDARD_STORY_EVENT_CARATS,
      available_at: availableAt,
      category: 'story_event',
      default_enabled: true,
      full_completion: true,
      provenance: 'jp_fallback' as const,
      assumption: 'Uses the standard 2,010-Carat story-event total when no event-specific Carat reward is available.',
      confidence: 'historical_standard',
    }];
  });

  const recurringRewards = expectedRecurringRewards(
    [...(resource.rewards ?? []), ...fallbackRewards],
    timelineEvents,
  );

  return fallbackRewards.length || recurringRewards.length
    ? { ...resource, rewards: [...(resource.rewards ?? []), ...fallbackRewards, ...recurringRewards] }
    : resource;
}

function expectedRecurringRewards(
  existingRewards: readonly PlannerRewardEntry[],
  timelineEvents: readonly TimelineRewardFallbackEvent[],
): PlannerRewardEntry[] {
  const horizon = timelineEvents
    .flatMap(event => [
      event.estimatedEndDate,
      event.globalReleaseDate,
      event.estimatedGlobalDate,
      event.jpReleaseDate,
    ])
    .map(rewardDateKey)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  if (!horizon || horizon < GLOBAL_LAUNCH_DATE) return [];

  const candidates: PlannerRewardEntry[] = [];
  const launch = new Date(`${GLOBAL_LAUNCH_DATE}T00:00:00Z`);
  for (let milestone = 50; milestone <= 100_000; milestone += 50) {
    const date = new Date(launch.getTime() + (milestone - 1) * DAY_MS).toISOString().slice(0, 10);
    if (date > horizon) break;
    candidates.push({
      id: `expected-50-day-login-${milestone}`,
      label: `50-day login milestone (Day ${milestone})`,
      currency: 'free_jewels',
      amount: FIFTY_DAY_LOGIN_CARATS,
      available_at: date,
      category: 'login_milestone',
      default_enabled: true,
      provenance: 'configured',
      assumption: 'Estimated for a day-one Global account that logs in daily; missed login days move the reward date.',
      confidence: 'estimated_schedule',
    });
  }

  const firstYear = Number(GLOBAL_LAUNCH_DATE.slice(0, 4));
  const lastYear = Number(horizon.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year++) {
    candidates.push({
      id: `expected-valentines-gift-${year}`,
      label: `Expected Valentine's Day gift`,
      currency: 'free_jewels',
      amount: SEASONAL_GIFT_CARATS,
      available_at: `${year}-02-14`,
      category: 'seasonal_gift',
      default_enabled: true,
      provenance: 'jp_fallback',
      assumption: 'JP-parity estimate; replaced by an exact Global reward when one is available.',
      confidence: 'historical_standard',
      source_url: 'https://umamusume.jp/steam-news/detail?id=3036',
    }, {
      id: `expected-white-day-gift-${year}`,
      label: 'Expected White Day gift',
      currency: 'free_jewels',
      amount: SEASONAL_GIFT_CARATS,
      available_at: `${year}-03-14`,
      category: 'seasonal_gift',
      default_enabled: true,
      provenance: 'jp_fallback',
      assumption: 'JP-parity estimate; replaced by an exact Global reward when one is available.',
      confidence: 'historical_standard',
      source_url: 'https://umamusume.jp/steam-news/detail?id=3116',
    });
  }

  return candidates.filter(candidate =>
    candidate.available_at >= GLOBAL_LAUNCH_DATE
    && candidate.available_at <= horizon
    && !existingRewards.some(existing => equivalentRecurringReward(existing, candidate)));
}

function equivalentRecurringReward(
  existing: PlannerRewardEntry,
  candidate: PlannerRewardEntry,
): boolean {
  if (existing.id === candidate.id) return true;
  if (existing.currency !== 'free_jewels' || Number(existing.amount) <= 0) return false;
  const existingDate = rewardDateKey(existing.available_at);
  const candidateDate = rewardDateKey(candidate.available_at);
  if (!existingDate || !candidateDate) return false;
  const dayDifference = Math.abs(
    new Date(`${existingDate}T00:00:00Z`).getTime()
      - new Date(`${candidateDate}T00:00:00Z`).getTime(),
  ) / DAY_MS;
  if (dayDifference > 1) return false;

  const searchable = [existing.label, existing.category, existing.assumption, existing.evidence]
    .filter(Boolean)
    .join(' ');
  if (candidate.category === 'login_milestone') {
    return /(?:50.?day|total login|cumulative login|累計ログイン)/i.test(searchable);
  }
  if (candidate.id.includes('valentines')) {
    return /valentine|バレンタイン/i.test(searchable);
  }
  return /white\s*day|ホワイトデー/i.test(searchable);
}

function rewardDateKey(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function buildTimelineRewardSummaries(
  resource: Pick<PlannerRewardResource, 'rewards' | 'event_benefits' | 'free_pull_campaigns' | 'competitive_variants'>,
  timelineEvents: readonly TimelineRewardFallbackEvent[] = [],
): Map<string, TimelineRewardSummary> {
  resource = withTimelineRewardFallbacks(resource as PlannerRewardResource, timelineEvents);
  const totals = new Map<string, MutableRewardSummary>();
  const summaryFor = (eventId: string): MutableRewardSummary => {
    const existing = totals.get(eventId);
    if (existing) return existing;
    const created: MutableRewardSummary = {
      carats: 0,
      umaTickets: 0,
      supportTickets: 0,
      rainbowCrystals: 0,
      goldCrystals: 0,
      freePulls: 0,
      selectorItems: new Map(),
      variableOutcomeIds: new Set(),
      variableRewardLabels: new Set(),
      variableOutcomes: [],
      variableOutcomeGroups: new Map(),
      competition: null,
      competitiveTotals: new Map(),
    };
    totals.set(eventId, created);
    return created;
  };

  for (const bundle of plannerRewardBundles(resource.rewards ?? [])) {
    if (!bundle.eventId) continue;
    const summary = summaryFor(bundle.eventId);
    for (const [currency, amount] of bundle.totals) {
      if (currency === 'free_jewels' || currency === 'paid_jewels') summary.carats += amount;
      else if (currency === 'uma_ticket') summary.umaTickets += amount;
      else if (currency === 'support_ticket') summary.supportTickets += amount;
      else if (currency === 'rainbow_crystal') summary.rainbowCrystals += amount;
      else if (currency === 'gold_crystal') summary.goldCrystals += amount;
    }
  }

  for (const variant of resource.competitive_variants ?? []) {
    if (!variant.event_id) continue;
    const summary = summaryFor(variant.event_id);
    summary.competition ??= variant.competition;
    summary.variableOutcomeIds.add(variant.id);
    const outcomeItems = competitiveOutcomeItems(variant.source_items ?? []);
    const outcomeLabel = competitiveOutcomeLabel(variant.competition, variant.label);
    const grouped = variant.competition === 'champions_meeting'
      && !outcomeItems.length
      && groupChampionsOutcome(summary, variant.id, outcomeLabel);
    if (!grouped) {
      summary.variableOutcomes.push({
        key: variant.id,
        label: outcomeLabel,
        items: outcomeItems,
      });
    }
    if (variant.competition !== 'champions_meeting') {
      addCompetitiveTotals(summary.competitiveTotals, variant.source_items ?? []);
    }
    for (const item of variant.source_items ?? []) {
      if (item.item_category === 90 && item.item_id === 43) summary.variableRewardLabels.add('Carats');
      else if (item.item_category === 40 && item.item_id === 41) summary.variableRewardLabels.add('Trainee tickets');
      else if (item.item_category === 40 && item.item_id === 111) summary.variableRewardLabels.add('Support tickets');
      else if (item.item_category === 164 && item.item_id === 149) summary.variableRewardLabels.add('Rainbow Crystal Shards');
      else if (item.item_category === 164 && item.item_id === 150) summary.variableRewardLabels.add('Gold Crystal Shards');
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

  addStandardCompetitiveFallbacks(totals, summaryFor, timelineEvents);

  const summaries = new Map<string, TimelineRewardSummary>();
  for (const [eventId, total] of totals) {
    if (total.competition === 'champions_meeting') {
      // CM reward sets are server-authored and absent from most master snapshots.
      // Prefer the published Global finals table over empty master outcome rows.
      total.variableOutcomes = classicChampionsFinalOutcomes();
    }
    const tickets = total.umaTickets + total.supportTickets;
    const selectors = [...total.selectorItems.values()].reduce((sum, item) => sum + item.amount, 0);
    const parts: string[] = [];
    if (total.carats > 0) parts.push(`${INTEGER_FORMATTER.format(total.carats)} Carats`);
    if (tickets > 0) parts.push(`${INTEGER_FORMATTER.format(tickets)} ${tickets === 1 ? 'ticket' : 'tickets'}`);
    if (total.rainbowCrystals > 0) parts.push(`${INTEGER_FORMATTER.format(total.rainbowCrystals)} rainbow ${total.rainbowCrystals === 1 ? 'shard' : 'shards'}`);
    if (total.goldCrystals > 0) parts.push(`${INTEGER_FORMATTER.format(total.goldCrystals)} gold ${total.goldCrystals === 1 ? 'shard' : 'shards'}`);
    if (total.freePulls > 0) parts.push(`${INTEGER_FORMATTER.format(total.freePulls)} free pulls`);
    if (selectors > 0) parts.push(`${INTEGER_FORMATTER.format(selectors)} ${selectors === 1 ? 'selector' : 'selectors'}`);
    const variableOutcomeCount = total.variableOutcomes.length;
    if (variableOutcomeCount > 0) parts.push('Rewards vary by result');

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
    if (total.rainbowCrystals > 0) {
      items.push(rewardItem(
        'rainbow_crystal',
        total.rainbowCrystals,
        total.rainbowCrystals === 1 ? 'Rainbow Crystal Shard' : 'Rainbow Crystal Shards',
        REWARD_ITEM_IDS.rainbow_crystal,
      ));
    }
    if (total.goldCrystals > 0) {
      items.push(rewardItem(
        'gold_crystal',
        total.goldCrystals,
        total.goldCrystals === 1 ? 'Gold Crystal Shard' : 'Gold Crystal Shards',
        REWARD_ITEM_IDS.gold_crystal,
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
      const presentation = competitivePresentation(total);
      summaries.set(eventId, {
        eventId,
        carats: total.carats,
        tickets,
        rainbowCrystals: total.rainbowCrystals,
        goldCrystals: total.goldCrystals,
        freePulls: total.freePulls,
        selectors,
        label,
        items,
        variable: variableOutcomeCount > 0,
        variableOutcomeCount,
        variableRewardLabels: [...total.variableRewardLabels],
        variableOutcomes: total.variableOutcomes,
        ...presentation,
      });
    }
  }
  return summaries;
}

function addStandardCompetitiveFallbacks(
  totals: Map<string, MutableRewardSummary>,
  summaryFor: (eventId: string) => MutableRewardSummary,
  timelineEvents: readonly TimelineRewardFallbackEvent[],
): void {
  for (const event of timelineEvents) {
    if (!event.id) continue;
    if (event.type === 'champions_meeting') {
      const summary = summaryFor(event.id);
      summary.competition ??= 'champions_meeting';
      if (!summary.variableOutcomeIds.size) {
        summary.variableOutcomeIds.add(`standard-champions-meeting:${event.id}`);
      }
      continue;
    }
    if (event.type !== 'legend_race') continue;

    const summary = totals.get(event.id);
    if (summary?.competition === 'legend_race' && summary.variableOutcomeIds.size) continue;
    const participantIds = (event.pickupCardIds ?? [])
      .map(Number)
      .filter(participantId => Number.isSafeInteger(participantId) && participantId > 0);
    if (!participantIds.length) continue;

    const legendSummary = summaryFor(event.id);
    legendSummary.competition ??= 'legend_race';
    participantIds.forEach((participantId, index) => {
      const variantId = `standard-legend-race:${event.id}:${participantId}`;
      const sourceItems = [
        { item_category: 102, item_id: participantId, amount: 10 },
        { item_category: 90, item_id: REWARD_ITEM_IDS.carats, amount: 150 },
        { item_category: 91, item_id: REWARD_ITEM_IDS.money, amount: 10000 },
      ];
      const participantName = event.relatedCharacters?.[index]?.trim() || `Character ${participantId}`;
      legendSummary.variableOutcomeIds.add(variantId);
      legendSummary.variableOutcomes.push({
        key: variantId,
        label: `First clear vs ${participantName}`,
        items: competitiveOutcomeItems(sourceItems),
      });
      addCompetitiveTotals(legendSummary.competitiveTotals, sourceItems);
    });
  }
}
function competitivePresentation(total: MutableRewardSummary): Pick<
  TimelineRewardSummary,
  'mode' | 'previewLabel' | 'previewItems' | 'outcomeHeading' | 'outcomeDescription'
> {
  if (!total.competition) {
    return {
      mode: 'fixed',
      previewLabel: '',
      previewItems: [],
      outcomeHeading: '',
      outcomeDescription: '',
    };
  }

  if (total.competition === 'champions_meeting') {
    return {
      mode: 'placement',
      previewLabel: 'Finals',
      previewItems: [
        previewItem('carats', 'Carats', '500–2,500', 'diamond', itemIconPath(REWARD_ITEM_IDS.carats)),
        previewItem('uma-ticket', 'Trainee tickets', '1–5', 'confirmation_number', itemIconPath(REWARD_ITEM_IDS.uma_ticket)),
        previewItem('support-ticket', 'Support tickets', 'up to 5', 'confirmation_number', itemIconPath(REWARD_ITEM_IDS.support_ticket)),
      ],
      outcomeHeading: 'Final placement rewards',
      outcomeDescription: 'Final reward depends on league, group, and place. Round rewards are separate.',
    };
  }

  const previewItems = competitiveTotalsToPreview(total.competitiveTotals);
  if (total.competition === 'legend_race') {
    return {
      mode: 'per_opponent',
      previewLabel: 'All clears',
      previewItems,
      outcomeHeading: 'First-clear rewards',
      outcomeDescription: 'Each opponent grants this reward once; clearing all grants the combined card total.',
    };
  }
  if (total.competition === 'league_of_heroes') {
    return {
      mode: 'cumulative',
      previewLabel: 'Cumulative',
      previewItems,
      outcomeHeading: 'Cumulative rank rewards',
      outcomeDescription: 'Milestones stack. The card shows the total of every extracted tier.',
    };
  }
  return {
    mode: 'cumulative',
    previewLabel: 'All milestones',
    previewItems,
    outcomeHeading: 'Cumulative team rewards',
    outcomeDescription: 'Team-rank milestones stack. Event-mission rewards are additional.',
  };
}

function previewItem(key: string, label: string, countLabel: string, icon: string, iconPath?: string): TimelineRewardPreviewItem {
  return { key, label, countLabel, icon, iconPath };
}

function addCompetitiveTotals(
  totals: Map<string, MutableCompetitiveTotal>,
  sourceItems: Array<{ item_category: number; item_id: number; amount: number }>,
): void {
  for (const item of sourceItems) {
    const descriptor = competitiveItemDescriptor(item.item_category, item.item_id);
    if (!descriptor || !Number.isFinite(item.amount) || item.amount <= 0) continue;
    const existing = totals.get(descriptor.key);
    if (existing) existing.amount += item.amount;
    else totals.set(descriptor.key, { ...descriptor, amount: item.amount });
  }
}

function competitiveTotalsToPreview(totals: Map<string, MutableCompetitiveTotal>): TimelineRewardPreviewItem[] {
  const priority = ['carats', 'uma-ticket', 'support-ticket', 'rainbow-crystal', 'gold-crystal', 'character-pieces', 'money'];
  return [...totals.entries()]
    .sort(([left], [right]) => {
      const leftIndex = priority.indexOf(left);
      const rightIndex = priority.indexOf(right);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    })
    .slice(0, 3)
    .map(([key, item]) => previewItem(key, item.label, INTEGER_FORMATTER.format(item.amount), item.icon, item.iconPath));
}

export function classicChampionsFinalOutcomes(): TimelineRewardOutcome[] {
  return [
    championsFinalOutcome('Graded · Group A · 1st', 2500, 5, 5, 30, 100000, 25000),
    championsFinalOutcome('Graded · Group A · 2nd', 1800, 4, 4, 25, 70000, 20000),
    championsFinalOutcome('Graded · Group A · 3rd', 1200, 3, 3, 20, 50000, 15000),
    championsFinalOutcome('Graded · Group B · 1st', 1200, 3, 3, 20, 60000, 20000),
    championsFinalOutcome('Graded · Group B · 2nd', 900, 2, 2, 15, 50000, 15000),
    championsFinalOutcome('Graded · Group B · 3rd', 700, 1, 1, 10, 40000, 10000),
    championsFinalOutcome('Open · Group A · 1st', 1000, 3, 3, 20, 60000, 20000),
    championsFinalOutcome('Open · Group A · 2nd', 850, 2, 2, 15, 50000, 15000),
    championsFinalOutcome('Open · Group A · 3rd', 700, 1, 1, 10, 40000, 10000),
    championsFinalOutcome('Open · Group B · 1st', 700, 2, 1, 10, 40000, 15000),
    championsFinalOutcome('Open · Group B · 2nd', 600, 2, 0, 7, 30000, 10000),
    championsFinalOutcome('Open · Group B · 3rd', 500, 1, 0, 5, 20000, 5000),
  ];
}

function championsFinalOutcome(
  label: string,
  carats: number,
  umaTickets: number,
  supportTickets: number,
  goddessStatues: number,
  money: number,
  supportPoints: number,
): TimelineRewardOutcome {
  const items = [
    outcomeItem('carats', 'Carats', carats, 'diamond', itemIconPath(REWARD_ITEM_IDS.carats)),
    outcomeItem('uma-ticket', 'Trainee tickets', umaTickets, 'confirmation_number', itemIconPath(REWARD_ITEM_IDS.uma_ticket)),
  ];
  if (supportTickets > 0) {
    items.push(outcomeItem('support-ticket', 'Support tickets', supportTickets, 'confirmation_number', itemIconPath(REWARD_ITEM_IDS.support_ticket)));
  }
  items.push(
    outcomeItem('goddess-statues', 'Goddess statues', goddessStatues, 'favorite', itemIconPath(REWARD_ITEM_IDS.goddess_statues)),
    outcomeItem('money', 'Money', money, 'paid', itemIconPath(REWARD_ITEM_IDS.money)),
    outcomeItem('support-points', 'Support points', supportPoints, 'trending_up', itemIconPath(REWARD_ITEM_IDS.support_points)),
  );
  return { key: `cm-${label}`, label, items };
}
function outcomeItem(key: string, label: string, amount: number, icon: string, iconPath?: string): TimelineRewardOutcomeItem {
  return { key, label, amount, countLabel: INTEGER_FORMATTER.format(amount), icon, iconPath };
}
function groupChampionsOutcome(summary: MutableRewardSummary, variantId: string, label: string): boolean {
  const match = /^League\s+(\d+)\s*·\s*Round\s+(\d+)\s*·\s*(\d+)\s+wins(?:\s*·\s*Rank\s+(\d+))?$/i.exec(label);
  if (!match) return false;

  const league = Number(match[1]);
  const round = Number(match[2]);
  const wins = Number(match[3]);
  const rank = match[4] ? Number(match[4]) : 0;
  const key = 'champions-league-' + league + '-round-' + round;
  let group = summary.variableOutcomeGroups.get(key);
  if (!group) {
    const outcome: TimelineRewardOutcome = {
      key: variantId + '-group',
      label: 'League ' + league + ' · Round ' + round,
      items: [],
    };
    group = { outcome, wins: new Set(), ranks: new Set() };
    summary.variableOutcomeGroups.set(key, group);
    summary.variableOutcomes.push(outcome);
  }

  if (rank > 0) group.ranks.add(rank);
  else group.wins.add(wins);

  const details: string[] = [];
  if (group.wins.size) details.push(formatOutcomeRange(group.wins) + ' wins');
  if (group.ranks.size) details.push('Ranks ' + formatOutcomeRange(group.ranks));
  group.outcome.description = details.join(' · ');
  return true;
}

function formatOutcomeRange(values: Set<number>): string {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  return contiguous
    ? sorted[0] + '–' + sorted[sorted.length - 1]
    : sorted.join(', ');
}
function competitiveOutcomeLabel(competition: string, label: string): string {
  const champions = /League\s+(\d+),\s*round\s+(\d+),\s*(\d+)\s+wins?,\s*rank\s+(\d+)/i.exec(label);
  if (champions) {
    const rank = Number(champions[4]) > 0 ? ' · Rank ' + champions[4] : '';
    return 'League ' + champions[1] + ' · Round ' + champions[2] + ' · ' + champions[3] + ' wins' + rank;
  }

  const heroes = /League rank type\s+(\d+),\s*rank\s+(\d+)\s*\(([-\d]+)\)/i.exec(label);
  if (heroes) return 'League ' + heroes[1] + ' · Rank ' + heroes[2] + ' · ' + heroes[3] + ' pts';

  const teamRank = /Team rank\s+(\d+)\s*\(([-\d]+)\s+evaluation points\)/i.exec(label);
  if (teamRank) return 'Team rank ' + teamRank[1] + ' · ' + teamRank[2] + ' evaluation';
  if (/event missions/i.test(label)) return 'Event missions · Full completion';
  if (competition === 'legend_race') return label.replace(/^Legend race\s*[-:]\s*/i, '');
  return label.replace(/\s*\((?:rate|reward set)[^)]+\)\s*$/i, '').trim();
}

function competitiveOutcomeItems(
  sourceItems: Array<{ item_category: number; item_id: number; amount: number }>,
): TimelineRewardOutcomeItem[] {
  const totals = new Map<string, { label: string; amount: number; icon: string; iconPath?: string }>();
  for (const item of sourceItems) {
    const descriptor = competitiveItemDescriptor(item.item_category, item.item_id);
    if (!descriptor || !Number.isFinite(item.amount) || item.amount <= 0) continue;
    const existing = totals.get(descriptor.key);
    if (existing) existing.amount += item.amount;
    else totals.set(descriptor.key, { ...descriptor, amount: item.amount });
  }
  return [...totals.entries()].map(([key, item]) => ({
    key,
    label: item.label,
    amount: item.amount,
    countLabel: INTEGER_FORMATTER.format(item.amount),
    icon: item.icon,
    iconPath: item.iconPath,
  }));
}

function competitiveItemDescriptor(
  category: number,
  itemId: number,
): { key: string; label: string; icon: string; iconPath?: string } | null {
  if (category === 90 && itemId === 43) {
    return { key: 'carats', label: 'Carats', icon: 'diamond', iconPath: itemIconPath(REWARD_ITEM_IDS.carats) };
  }
  if (category === 40 && itemId === 41) {
    return { key: 'uma-ticket', label: 'Trainee ticket', icon: 'confirmation_number', iconPath: itemIconPath(REWARD_ITEM_IDS.uma_ticket) };
  }
  if (category === 40 && itemId === 111) {
    return { key: 'support-ticket', label: 'Support ticket', icon: 'confirmation_number', iconPath: itemIconPath(REWARD_ITEM_IDS.support_ticket) };
  }
  if (category === 164 && itemId === 149) {
    return { key: 'rainbow-crystal', label: 'Rainbow Crystal Shard', icon: 'auto_awesome', iconPath: itemIconPath(REWARD_ITEM_IDS.rainbow_crystal) };
  }
  if (category === 164 && itemId === 150) {
    return { key: 'gold-crystal', label: 'Gold Crystal Shard', icon: 'auto_awesome', iconPath: itemIconPath(REWARD_ITEM_IDS.gold_crystal) };
  }
  if (category === 102) return { key: 'character-pieces', label: 'Character pieces', icon: 'person' };
  if (category === 91 && itemId === 59) {
    return { key: 'money', label: 'Money', icon: 'paid', iconPath: itemIconPath(REWARD_ITEM_IDS.money) };
  }
  if (category === 93 && itemId === 44) {
    return { key: 'goddess-statues', label: 'Goddess statues', icon: 'favorite', iconPath: itemIconPath(REWARD_ITEM_IDS.goddess_statues) };
  }
  if (category === 103 && itemId === 98) {
    return { key: 'support-points', label: 'Support points', icon: 'trending_up', iconPath: itemIconPath(REWARD_ITEM_IDS.support_points) };
  }
  if (category === 97 && itemId === 115) {
    return { key: 'dream-glimmer', label: 'Dream Glimmer', icon: 'auto_awesome', iconPath: itemIconPath(REWARD_ITEM_IDS.dream_glimmer) };
  }
  return null;
}
