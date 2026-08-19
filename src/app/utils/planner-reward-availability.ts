import { CaratPlannerTimelineEvent } from '../models/carat-planner.model';

export interface PlannerRewardAvailabilityWindow {
  startsAt: string;
  endsAt: string;
}

/**
 * Treat an event-end reward date as the end of a collection window. Exact
 * dated gifts and reward rows that do not match the event end stay one-day
 * rewards and continue to use their published available_at value.
 */
export function plannerRewardAvailabilityWindow(
  eventId: string | undefined,
  availableAts: readonly (Date | string | undefined)[],
  events: readonly CaratPlannerTimelineEvent[],
): PlannerRewardAvailabilityWindow | undefined {
  if (!eventId) return undefined;
  const event = events.find(candidate => candidate.id === eventId);
  if (!event) return undefined;

  const startsAt = plannerRewardDateKey(
    event.globalReleaseDate ?? event.estimatedGlobalDate ?? event.jpReleaseDate,
  );
  const endsAt = plannerRewardDateKey(event.estimatedEndDate);
  if (!startsAt || !endsAt || endsAt <= startsAt) return undefined;

  const sourcedDates = availableAts
    .map(plannerRewardDateKey)
    .filter((date): date is string => Boolean(date));
  if (!sourcedDates.includes(endsAt)) return undefined;

  return { startsAt, endsAt };
}

export function plannerRewardDateKey(value: Date | string | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (isoDate) return isoDate;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
