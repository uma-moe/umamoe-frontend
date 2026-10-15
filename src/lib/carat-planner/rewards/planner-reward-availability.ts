import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

// Timeline repositories replace immutable snapshots; release old indexes with the snapshot.
const eventIndexes = new WeakMap<readonly TimelineRecord[], ReadonlyMap<string, TimelineRecord>>();
export function timelineEventIndex(events: readonly TimelineRecord[]): ReadonlyMap<string, TimelineRecord> {
  let index = eventIndexes.get(events);
  if (!index) { const entries = new Map<string, TimelineRecord>(); for (const event of events) if (!entries.has(event.id)) entries.set(event.id, event); eventIndexes.set(events, index = entries); }
  return index;
}

/** A published collection window takes precedence over an inferred event-end
 * reward. A dated gift without either remains a one-day reward. */
export function plannerRewardAvailabilityWindow(eventId: string | undefined, availableAts: readonly (string | undefined)[], events: readonly TimelineRecord[], availableUntils: readonly (string | undefined)[] = []): { startsAt: string; endsAt: string } | undefined {
  const dates = availableAts.filter((date): date is string => Boolean(date)).map((date) => date.slice(0, 10)).sort();
  const ends = availableUntils.filter((date): date is string => Boolean(date)).map((date) => date.slice(0, 10)).sort();
  if (dates[0] && ends.at(-1) && ends.at(-1)! >= dates[0]) return { startsAt: dates[0], endsAt: ends.at(-1)! };
  const event = eventId ? timelineEventIndex(events).get(eventId) : undefined;
  const startsAt = event?.date.toISOString().slice(0, 10);
  const endsAt = event?.estimatedEndDate?.toISOString().slice(0, 10);
  return startsAt && endsAt && endsAt > startsAt && dates.includes(endsAt) ? { startsAt, endsAt } : undefined;
}
