import { EventType, TimelineEvent } from '../models/timeline.model';

export function timelineEventDisplayRank(type: EventType): number {
  switch (type) {
    case EventType.CHARACTER_BANNER:
      return 0;
    case EventType.SUPPORT_CARD_BANNER:
      return 1;
    case EventType.PAID_BANNER:
      return 2;
    case EventType.CAMPAIGN:
      return 4;
    default:
      return 3;
  }
}

export function compareTimelineEventsForDisplay(a: TimelineEvent, b: TimelineEvent): number {
  const dateA = a.globalReleaseDate || a.estimatedGlobalDate || a.jpReleaseDate;
  const dateB = b.globalReleaseDate || b.estimatedGlobalDate || b.jpReleaseDate;
  const dayDifference = utcDay(dateA) - utcDay(dateB);
  if (dayDifference !== 0) return dayDifference;

  const rankDifference = timelineEventDisplayRank(a.type) - timelineEventDisplayRank(b.type);
  if (rankDifference !== 0) return rankDifference;

  const timeDifference = dateA.getTime() - dateB.getTime();
  if (timeDifference !== 0) return timeDifference;
  // Preserve the resource's canonical order for otherwise equivalent events.
  return 0;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
