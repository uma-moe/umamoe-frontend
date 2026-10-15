import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export const TIMELINE_LAUNCH = new Date('2025-06-26T22:00:00Z');
export const LANE_WIDTH = 285;
export const LANE_STEP = LANE_WIDTH + 16;
const DAY = 86_400_000;
export interface TimelineAnniversary {
  date: Date;
  label: string;
  image?: string;
  predicted: boolean;
}

export interface TimelineMarker {
  type: 'launch' | 'anniversary' | 'today' | 'year';
  label: string;
  image?: string;
  predicted?: boolean;
}

export interface TimelineLane {
  key: string;
  date: Date;
  label: string;
  position: number;
  gapDays: number;
  events: TimelineRecord[];
  markers: TimelineMarker[];
}

export interface TimelineFeedRow {
  key: string;
  date: Date;
  label: string;
  days: number;
  events: TimelineRecord[];
  marker?: TimelineMarker;
  adIndex?: number;
}

export const timelineDateKey = (date: Date): string => date.toISOString().slice(0, 10);
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const laneDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

const feedDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

const monthLabel = (date: Date) => monthFormatter.format(date);
const utcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const rank = (type: string) =>
  ({ character_banner: 0, support_card_banner: 1, paid_banner: 2, campaign: 4 })[type] ?? 3;

export function compareTimelineEvents(a: TimelineRecord, b: TimelineRecord): number {
  return (
    utcDay(a.date) - utcDay(b.date) ||
    rank(a.eventType) - rank(b.eventType) ||
    a.date.getTime() - b.date.getTime()
  );
}

export function timelineEndDate(events: TimelineRecord[], mobile = false): Date {
  return events.length
    ? new Date(
        events.reduce(
          (latest, event) => Math.max(latest, event.date.getTime()),
          TIMELINE_LAUNCH.getTime()
        ) +
          14 * DAY
      )
    : mobile
      ? TIMELINE_LAUNCH
      : new Date('2027-06-26');
}

function groupEvents(events: TimelineRecord[]): TimelineLane[] {
  const groups = new Map<string, TimelineLane>();
  for (const event of events) {
    const key = timelineDateKey(event.date);
    if (!groups.has(key))
      groups.set(key, {
        key,
        date: event.date,
        label: '',
        position: 0,
        gapDays: 0,
        events: [],
        markers: []
      });
    groups.get(key)!.events.push(event);
  }

  return [...groups.values()]
    .map((lane) => ({ ...lane, events: lane.events.toSorted(compareTimelineEvents) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function buildTimelineLanes(
  events: TimelineRecord[],
  anniversaries: TimelineAnniversary[],
  end: Date,
  compact: boolean,
  searching: boolean
): TimelineLane[] {
  const lanes = groupEvents(events);
  if (!searching) {
    for (const { date, ...marker } of [
      { date: TIMELINE_LAUNCH, type: 'launch' as const, label: 'Global launch' },
      ...anniversaries.map((item) => ({ ...item, type: 'anniversary' as const }))
    ]) {
      if (date > end || date < TIMELINE_LAUNCH) continue;
      const key = timelineDateKey(date);
      let lane = lanes.find((item) => item.key === key);
      if (!lane) {
        lane = { key, date, label: '', position: 0, gapDays: 0, events: [], markers: [] };

        lanes.push(lane);
      }

      lane.markers.push(marker);
    }
  }

  const sorted = lanes
    .filter((lane) => lane.date >= TIMELINE_LAUNCH)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const [index, lane] of sorted.entries()) {
    const previous = sorted[index - 1];
    lane.label =
      weekdayFormatter.format(lane.date).replace(/[.,]+$/u, '') +
      '\u2003' +
      laneDateFormatter.format(lane.date).replace(/,/gu, '');
    lane.gapDays = previous
      ? Math.max(0, Math.round((lane.date.getTime() - previous.date.getTime()) / DAY))
      : 0;
    lane.position = previous
      ? previous.position + LANE_STEP + (compact ? 0 : Math.max(0, lane.gapDays - 1) * 14)
      : 24;
  }

  return sorted;
}

export function timelinePosition(lanes: TimelineLane[], date: Date): number {
  if (!lanes.length) return 0;
  if (date <= lanes[0]!.date) return lanes[0]!.position;
  for (let i = 1; i < lanes.length; i++) {
    const next = lanes[i]!,
      previous = lanes[i - 1]!;

    if (date <= next.date)
      return (
        previous.position +
        ((date.getTime() - previous.date.getTime()) /
          (next.date.getTime() - previous.date.getTime())) *
          (next.position - previous.position)
      );
  }

  return lanes.at(-1)!.position;
}

export function timelineMonths(lanes: TimelineLane[], compact = false) {
  const spans: { key: string; label: string; position: number; width: number }[] = [];
  const groups: { key: string; label: string; lanes: TimelineLane[]; count: number }[] = [];
  for (const lane of lanes) {
    const key = lane.key.slice(0, 7);
    if (groups.at(-1)?.key !== key)
      groups.push({ key, label: monthLabel(lane.date), lanes: [], count: 0 });
    groups.at(-1)!.lanes.push(lane);
    groups.at(-1)!.count += lane.events.length;
  }

  if (compact) {
    for (const [index, group] of groups.entries()) {
      const position = index ? group.lanes[0]!.position : 0;
      const end =
        groups[index + 1]?.lanes[0]?.position ?? (lanes.at(-1)?.position ?? 0) + LANE_WIDTH + 48;

      spans.push({ key: group.key, label: group.label, position, width: end - position });
    }
  } else if (lanes.length) {
    const first = lanes[0]!.date,
      last = lanes.at(-1)!;

    for (
      let month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
      month <= last.date;
    ) {
      const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
      const position = spans.length ? timelinePosition(lanes, month) : 0;
      const end =
        next <= last.date ? timelinePosition(lanes, next) : last.position + LANE_WIDTH + 48;

      spans.push({
        key: timelineDateKey(month).slice(0, 7),
        label: monthLabel(month),
        position,
        width: Math.max(1, end - position)
      });

      month = next;
    }
  }

  return { spans, groups };
}

export function buildTimelineFeed(
  events: TimelineRecord[],
  anniversaries: TimelineAnniversary[],
  end: Date,
  now: Date
): TimelineFeedRow[] {
  const rows: TimelineFeedRow[] = [];
  const referenceDay = utcDay(now) - (now.getUTCHours() < 22 ? DAY : 0);
  const row = (date: Date, events: TimelineRecord[], marker?: TimelineMarker): TimelineFeedRow => ({
    key: `${timelineDateKey(date)}-${marker?.type ?? 'event'}`,
    date,
    events,
    marker,
    label:
      (marker?.predicted || events.some((event) => event.predicted) ? '~' : '') +
      feedDateFormatter.format(date),
    days: marker?.type === 'today' ? 0 : Math.floor((utcDay(date) - referenceDay) / DAY)
  });

  rows.push(row(TIMELINE_LAUNCH, [], { type: 'launch', label: 'Global Launch' }));
  if (now >= TIMELINE_LAUNCH && now <= end)
    rows.push(row(now, [], { type: 'today', label: 'Today' }));
  for (const anniversary of anniversaries)
    if (anniversary.date >= TIMELINE_LAUNCH && anniversary.date <= end)
      rows.push(row(anniversary.date, [], { ...anniversary, type: 'anniversary' }));
  for (const lane of groupEvents(events)) rows.push(row(new Date(lane.key), lane.events));
  for (let year = 2026; year <= 2035; year++) {
    const date = new Date(Date.UTC(year, 0, 1, 22));
    if (date > end) break;
    rows.push(row(date, [], { type: 'year', label: String(year) }));
  }

  const rowRank = (row: TimelineFeedRow) => {
    if (row.marker?.type === 'anniversary') {
      return 2;
    }

    if (row.marker) {
      return 0;
    }

    return 1;
  };

  rows.sort(
    (a, b) =>
      utcDay(a.date) - utcDay(b.date) ||
      rowRank(a) - rowRank(b) ||
      a.date.getTime() - b.date.getTime()
  );
  let eventsSeen = 0;
  const adRows: TimelineFeedRow[] = [];
  for (const item of rows) {
    if (item.marker) continue;
    eventsSeen++;
    if (eventsSeen >= 5 && (eventsSeen - 5) % 8 === 0) adRows.push(item);
  }

  // Keep the four configured placements near Today; never cycle the same slot IDs.
  adRows
    .sort(
      (a, b) =>
        Math.abs(a.date.getTime() - now.getTime()) - Math.abs(b.date.getTime() - now.getTime())
    )
    .slice(0, 4)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .forEach((item, index) => {
      item.adIndex = index + 1;
    });

  return rows;
}
