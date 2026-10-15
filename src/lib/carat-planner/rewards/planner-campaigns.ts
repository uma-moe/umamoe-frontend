import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import {
  activePlan,
  findPlannerEvent,
  resolvePlannerPullDate,
  setTimelineEvent,
  type CaratPlan,
  type PlannerFreePullCampaign,
  type PlannerFreePullCampaignAllocation,
  type PlannerRewardResource
} from '../carat-planner';

export const DEFAULT_CAMPAIGN = '__default_schedule__';
export const EXCLUDED_CAMPAIGN = '__excluded__';
export interface CampaignAllocation extends PlannerFreePullCampaignAllocation {
  title: string;
  imagePath?: string;
  event?: TimelineRecord;
}

export interface PlannerCampaign {
  id: string;
  label: string;
  totalPulls: number;
  pullsPerDay?: number;
  allocations: CampaignAllocation[];
  stockDestination?: CampaignAllocation;
  sourceUrl?: string;
  availableAt: string;
  searchText: string;
  isPast: boolean;
}

export function cleanRewardLabel(value: string): string {
  return value
    .replace(/(\bVol\.\s*\d+)["'\u201c\u201d\u2018\u2019]+/giu, '$1')
    .replace(/["'\u201c\u201d\u2018\u2019]+([!?]+)["'\u201c\u201d\u2018\u2019]*$/u, '$1')
    .replace(/["'\u201c\u201d\u2018\u2019]+$/u, '')
    .trim();
}

export function rewardEventTitle(event: TimelineRecord): string {
  const title = (event.title?.trim() || 'Event rewards').replace(/["'”](?=[!?.,]+$)/g, '');
  if (!/\+\s*\d+\s*more\b/i.test(title)) return title;
  const names =
    [event.relatedCharacters, event.relatedSupportCardNames, event.relatedSupportCards].find(
      (values) => values?.some((name) => name.trim())
    ) ?? [];

  return (
    [...new Set(names.map((name) => name.trim()).filter(Boolean))].join(', ') ||
    title.replace(/\s*\+\s*\d+\s*more\b/gi, '').trim()
  );
}

export function buildPlannerCampaigns(
  campaigns: readonly PlannerFreePullCampaign[],
  events: readonly TimelineRecord[],
  start: string,
  today = new Date().toISOString().slice(0, 10)
): PlannerCampaign[] {
  return campaigns
    .filter((campaign) => campaign.id && Number(campaign.total_pulls) > 0)
    .map((campaign) => {
      const allocations = (campaign.default_allocations ?? [])
        .filter((item) => item.event_id && Number(item.pulls) > 0)
        .map((item) => {
          const event =
            findPlannerEvent(item.event_id, events) ??
            events.find(
              (event) =>
                item.gacha_id !== undefined &&
                (event.gachaId === item.gacha_id || event.gachaIds?.includes(item.gacha_id))
            );

          return {
            ...item,
            pulls: Math.max(0, Math.trunc(Number(item.pulls) || 0)),
            title: event ? rewardEventTitle(event) : 'Gacha ' + (item.gacha_id ?? item.event_id),
            imagePath: event?.image,
            event
          };
        });

      const dates = allocations
        .map((item) => item.event?.date?.toISOString().slice(0, 10))
        .filter((date): date is string => Boolean(date))
        .sort();

      const isPast =
        dates.length > 0 && dates.every((date) => date < (start > today ? start : today));

      const totalPulls = Math.max(0, Math.trunc(Number(campaign.total_pulls) || 0));
      const raw = campaign.label?.trim() ?? '',
        clean = cleanRewardLabel(raw);

      const label =
        !clean || clean.length > 64 || /free\s+(?:gacha|pull)/i.test(clean)
          ? totalPulls.toLocaleString('en-US') + ' free-pull campaign'
          : clean;

      const stockDestination =
        allocations.length > 1 &&
        (campaign.stockable === true || campaign.allocation_mode === 'daily_with_one_time_stock')
          ? allocations.at(-1)
          : undefined;

      return {
        id: campaign.id,
        label,
        totalPulls,
        allocations,
        stockDestination,
        pullsPerDay:
          Number(campaign.pulls_per_day) > 0
            ? Math.trunc(Number(campaign.pulls_per_day))
            : undefined,
        availableAt:
          (isPast ? dates.at(-1) : (dates.find((date) => date >= start) ?? dates[0])) ?? '',
        sourceUrl: /^https?:\/\//i.test(campaign.source_url?.trim() ?? '')
          ? campaign.source_url!.trim()
          : undefined,
        searchText: [
          label,
          raw,
          'free pulls',
          stockDestination ? 'gacha stock' : '',
          ...allocations.flatMap((item) => [item.title, String(item.pulls)])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        isPast
      };
    })
    .filter((campaign) => campaign.allocations.length);
}

function allocationPlanned(plan: CaratPlan, allocation: CampaignAllocation): boolean {
  if (allocation.event)
    return (
      !plan.disabledEventIds.includes(allocation.event.id) &&
      plan.targets.some(
        (target) =>
          target.eventId === allocation.event!.id &&
          resolvePlannerPullDate(target) >= plan.projectionStartDate
      )
    );
  return (
    !plan.disabledEventIds.includes(allocation.event_id) &&
    plan.targets.some(
      (target) =>
        target.eventId === allocation.event_id ||
        (allocation.gacha_id !== undefined &&
          (target.gachaId === allocation.gacha_id ||
            target.gachaIds?.includes(allocation.gacha_id)))
    )
  );
}

export function campaignState(plan: CaratPlan, campaign: PlannerCampaign) {
  const stored = plan.freePullCampaignSelections[campaign.id];
  const stock = Boolean(campaign.stockDestination && stored === campaign.stockDestination.event_id);
  const allocations = stock ? [campaign.stockDestination!] : campaign.allocations;
  const schedule =
    stored === DEFAULT_CAMPAIGN ||
    (!stored && campaign.allocations.every((item) => allocationPlanned(plan, item)));

  return {
    stock,
    ready:
      (stock || schedule) &&
      allocations.length > 0 &&
      allocations.every((item) => allocationPlanned(plan, item)),
    linked:
      stored === EXCLUDED_CAMPAIGN
        ? false
        : Boolean(stored) || campaign.allocations.some((item) => allocationPlanned(plan, item)),
    canSelect: allocations.length > 0 && allocations.every((item) => item.event),
    canSwitch: (stock ? campaign.allocations : [campaign.stockDestination]).every(
      (item) => item?.event
    )
  };
}

/** Reuse Timeline activation so newly added banners keep identical defaults and saved target identity. */
export function activateRewardEvents(
  plan: CaratPlan,
  events: readonly TimelineRecord[],
  enabled: boolean,
  resources: PlannerRewardResource
): void {
  let collection = { version: 1 as const, activePlanId: plan.id, plans: [plan] };

  for (const event of [...new Map(events.map((event) => [event.id, event])).values()])
    collection = setTimelineEvent(collection, event, enabled, resources);
  Object.assign(plan, activePlan(collection));
}

export function selectPlannerCampaign(
  plan: CaratPlan,
  campaign: PlannerCampaign,
  stock: boolean,
  resources: PlannerRewardResource
): void {
  const state = campaignState(plan, campaign);
  if (state.ready && state.stock === stock) {
    plan.freePullCampaignSelections[campaign.id] = EXCLUDED_CAMPAIGN;
    return;
  }

  const allocations =
    stock && campaign.stockDestination ? [campaign.stockDestination] : campaign.allocations;

  if (!allocations.length || allocations.some((item) => !item.event)) return;
  activateRewardEvents(
    plan,
    allocations.map((item) => item.event!),
    true,
    resources
  );
  plan.freePullCampaignSelections[campaign.id] =
    stock && campaign.stockDestination ? campaign.stockDestination.event_id : DEFAULT_CAMPAIGN;
}
