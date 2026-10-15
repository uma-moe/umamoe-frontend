import { itemIconPath } from '@/lib/game-assets/item-icons';
import { activePlan, type CaratPlanCollection } from '@/lib/carat-planner/carat-planner';
import type { TimelineEventData } from '@/components/cards/timeline-types';
import { timelineDisplayTitle } from '@/lib/timeline/events/timeline-pickups';
import {
  timelineCardContext,
  timelineCardRaceLines
} from '@/lib/timeline/events/timeline-race-facts';
import type { TimelineRewardSummary } from '@/lib/timeline/events/timeline-reward-summary';
import { searchKey } from '@/lib/timeline/board/timeline-search';
import { filterOptions, type FilterType } from './timeline-controls';
import type { TimelineRecord } from './timeline-repository';

export function plannedEventIds(collection: CaratPlanCollection): string[] {
  return [
    ...new Set([
      ...activePlan(collection).targets.map((target) => target.eventId),
      ...activePlan(collection).enabledRewardEventIds
    ])
  ].filter((id) => !activePlan(collection).disabledEventIds.includes(id));
}

export function filterTimelineEvents(
  events: TimelineRecord[],
  visibleTypes: FilterType[],
  searchTerm: string
): TimelineRecord[] {
  return events.filter((event) => {
    const knownType = filterOptions.some((option) => option.type === event.eventType);
    if (knownType && !visibleTypes.includes(event.eventType as FilterType)) return false;
    return (
      !searchTerm ||
      [
        event.title,
        event.context ?? '',
        event.typeLabel,
        event.gachaLabel ?? '',
        event.gachaTypeName ?? '',
        ...event.tags,
        ...(event.pickups ?? []).flatMap((pickup) => [
          pickup.name,
          pickup.subLabel ?? '',
          ...(pickup.searchTerms ?? [])
        ])
      ].some((value) => searchKey(value).includes(searchTerm))
    );
  });
}

export function timelineCardView(
  event: TimelineRecord,
  summary: TimelineRewardSummary | undefined
): TimelineEventData {
  const pickups = event.pickups ?? [];
  const visible = event.eventType === 'legend_race' ? pickups : pickups.slice(0, 2);
  const title = timelineDisplayTitle(event);
  return {
    ...event,
    title:
      event.eventType === 'champions_meeting' && !/^champions meeting\b/i.test(title)
        ? `Champions Meeting: ${title}`
        : title,
    context: timelineCardContext(event),
    pickups: visible,
    overflowPickups: pickups.length - visible.length,
    raceLines:
      event.eventType === 'legend_race' || !pickups.length ? timelineCardRaceLines(event) : [],
    rewardLabel: summary?.label,
    rewardContext: summary?.variable ? summary.previewLabel : undefined,
    rewards: summary?.variable
      ? summary.previewItems.map((item) => ({
          id: item.key,
          label: `${item.countLabel} ${item.label}`,
          amount: item.countLabel,
          icon: item.iconPath,
          fallbackIcon: item.icon === 'person' ? 'user' : 'gift'
        }))
      : summary?.items.map((item) => ({
          id: item.key,
          label: item.label,
          amount: item.kind === 'free_pulls' ? `${item.amount}×` : item.countLabel,
          freePulls: item.kind === 'free_pulls',
          icon:
            item.kind === 'free_pulls' && event.eventType === 'support_card_banner'
              ? itemIconPath(111)
              : item.iconPath
        }))
  };
}
