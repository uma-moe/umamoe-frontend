import {
  LANE_WIDTH,
  type timelineMonths,
  type TimelineFeedRow,
  type TimelineLane
} from '@/lib/timeline/board/timeline-layout';

export type TimelineMonths = ReturnType<typeof timelineMonths>;

export function laneColumns(viewportWidth: number): number {
  return Math.max(1, Math.floor((viewportWidth - 160 + 12) / (LANE_WIDTH + 12)));
}

export function laneHeight(lane: TimelineLane, columns: number): number {
  return 32 + Math.ceil((lane.events.length + lane.markers.length) / columns) * 195;
}

export function buildMonthLaneOffsets(
  months: TimelineMonths,
  measured: Record<string, number>,
  viewportWidth: number
): number[][] {
  const columns = laneColumns(viewportWidth);
  return months.groups.map((month) => {
    const offsets = [0];
    for (const lane of month.lanes)
      offsets.push(
        offsets.at(-1)! + (measured[`d:${viewportWidth}:${lane.key}`] ?? laneHeight(lane, columns))
      );
    return offsets;
  });
}

export function buildMonthOffsets(laneOffsets: number[][]): number[] {
  const result = [0];
  for (const offsets of laneOffsets) result.push(result.at(-1)! + 68 + offsets.at(-1)!);
  return result;
}

export function estimatedTrackHeight(lanes: TimelineLane[], measuredLaneHeight: number): number {
  return Math.max(
    360,
    measuredLaneHeight,
    ...lanes.map((lane) => {
      const count = lane.events.length;
      return (
        96 +
        lane.markers.reduce((sum, marker) => sum + (marker.image ? 108 : 42), 0) +
        count * 220 +
        Math.max(0, count - 1) * 9 +
        (lane.events.length > 3 ? 38 : 0)
      );
    })
  );
}

export function buildFeedOffsets(
  rows: TimelineFeedRow[],
  measured: Record<string, number>
): number[] {
  const result = [0];
  for (const row of rows)
    result.push(
      result.at(-1)! +
        (measured[row.key] ??
          (row.marker
            ? row.marker.image
              ? 164
              : 98
            : 49 +
              row.events.reduce((sum, event) => sum + (event.image ? 195 : 111), 0) +
              Math.max(0, row.events.length - 1) * 7) + (row.adIndex ? 86 : 0))
    );
  return result;
}

export function indexAt(offset: number, positions: number[]): number {
  let low = 0,
    high = Math.max(0, positions.length - 2);

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (positions[mid + 1]! <= offset) low = mid + 1;
    else high = mid;
  }

  return low;
}

export function nearestLane(lanes: TimelineLane[], date: Date): TimelineLane | undefined {
  return lanes.reduce<TimelineLane | undefined>(
    (best, lane) =>
      !best ||
      Math.abs(lane.date.getTime() - date.getTime()) <
        Math.abs(best.date.getTime() - date.getTime())
        ? lane
        : best,
    undefined
  );
}

export function nearestEventRow(rows: TimelineFeedRow[], date: Date): TimelineFeedRow | undefined {
  return rows
    .filter((row) => !row.marker)
    .reduce<TimelineFeedRow | undefined>(
      (best, row) =>
        !best ||
        Math.abs(row.date.getTime() - date.getTime()) <
          Math.abs(best.date.getTime() - date.getTime())
          ? row
          : best,
      undefined
    );
}

export function centeredLane(
  lanes: TimelineLane[],
  scrollLeft: number,
  viewportWidth: number
): TimelineLane | undefined {
  return lanes.reduce<TimelineLane | undefined>(
    (best, lane) =>
      !best ||
      Math.abs(lane.position + LANE_WIDTH / 2 - scrollLeft - viewportWidth / 2) <
        Math.abs(best.position + LANE_WIDTH / 2 - scrollLeft - viewportWidth / 2)
        ? lane
        : best,
    undefined
  );
}

export function scrollBehavior(): ScrollBehavior {
  return matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches
    ? 'instant'
    : 'smooth';
}
