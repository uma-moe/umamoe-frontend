import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { InterpolatedRaceFrame } from '@/lib/race/replay/race-replay';
import { trackPointAtDistance, trackSectionPoints, type TrackPoint } from '../replay-track';
import type { DistanceWindow, StageSize } from './position-scene';

const PADDING = 14;
const WIDE = { width: 168, inset: 8 };
const COMPACT = { width: 112, inset: 4 };
// The panel's padding and border around the drawing.
const FRAME = 5;

export interface TrackBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The course overview in the stage's lower right corner, in stage pixels and track units. */
export interface MinimapScene {
  box: { x: number; y: number; width: number; height: number };
  bounds: TrackBounds;
  course: TrackPoint[];
  inView: TrackPoint[];
  dots: { x: number; y: number; color: string; selected: boolean }[];
}

export function trackBounds(points: TrackPoint[]): TrackBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - PADDING;
  const minY = Math.min(...ys) - PADDING;

  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) + PADDING - minX,
    height: Math.max(...ys) + PADDING - minY
  };
}

export function minimapScene({
  points,
  bounds,
  stage,
  compact,
  frame,
  runners,
  viewport,
  selected,
  visibility,
  teamColor
}: {
  points: TrackPoint[];
  bounds: TrackBounds;
  stage: StageSize;
  /** Phone widths draw the overview smaller and closer to the corner. */
  compact: boolean;
  frame: InterpolatedRaceFrame | undefined;
  runners: RaceRunner[];
  viewport: DistanceWindow;
  selected: number;
  visibility: Record<number, number>;
  teamColor: (runner: RaceRunner) => string;
}): MinimapScene | undefined {
  if (!points.length) return undefined;

  const { width, inset } = compact ? COMPACT : WIDE;
  const height = ((width - FRAME * 2) * bounds.height) / bounds.width + FRAME * 2;
  const dots = runners.flatMap((runner) => {
    const horse = frame?.horses[runner.index];
    if (!horse || visibility[runner.index] === 2) return [];

    const point = trackPointAtDistance(points, horse.distance);
    return [
      { x: point.x, y: point.y, color: teamColor(runner), selected: runner.index === selected }
    ];
  });

  return {
    box: { x: stage.width - inset - width, y: stage.height - inset - height, width, height },
    bounds,
    course: points,
    inView: trackSectionPoints(points, Math.max(0, viewport.min), viewport.max),
    dots
  };
}
