import type { RaceHorseFrame, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { placeTrackCaption } from '../replay-track';

type Point = { x: number; y: number };

export const dotRadius = 4;

export interface MapMarker {
  runner: RaceRunner;
  horse: RaceHorseFrame;
  lane: number;
  anchor: Point;
}

export type MapCallout<T extends MapMarker = MapMarker> = T & {
  x: number;
  y: number;
  telemetryY: number;
  connector: string;
};

export function placeCallouts<T extends MapMarker>(
  markers: T[],
  offsets: { dx: number; dy: number }[],
  labelSize: number,
  selected: number
): MapCallout<T>[] {
  return markers
    .map((marker) => {
      const current = offsets[marker.runner.index] ?? {
        dx: 0,
        dy: -labelSize / 2 - 10
      };

      // Keep the exact point exposed even while a collision offset is interpolating.
      const minimum = labelSize / 2 + 7,
        axis = Math.max(Math.abs(current.dx), Math.abs(current.dy));

      const scale = axis ? Math.max(1, minimum / axis) : 1;
      const offset = axis
        ? { dx: current.dx * scale, dy: current.dy * scale }
        : { dx: 0, dy: -minimum };

      const x = marker.anchor.x + offset.dx,
        y = marker.anchor.y + offset.dy;

      const length = Math.hypot(x - marker.anchor.x, y - marker.anchor.y) || 1,
        edge = Math.min(labelSize / 2 - 4, length);

      const end = {
        x: x - ((x - marker.anchor.x) * edge) / length,
        y: y - ((y - marker.anchor.y) * edge) / length
      };

      const tipWidth = labelSize * 0.12,
        side = {
          x: (-(y - marker.anchor.y) * tipWidth) / length,
          y: ((x - marker.anchor.x) * tipWidth) / length
        };

      return {
        ...marker,
        x,
        y,
        telemetryY: Math.max(y + labelSize / 2 + 12, marker.anchor.y + 20),
        connector: [
          marker.anchor,
          { x: end.x + side.x, y: end.y + side.y },
          { x: end.x - side.x, y: end.y - side.y }
        ]
          .map((p) => p.x + ',' + p.y)
          .join(' ')
      };
    })
    .sort((a, b) => Number(a.runner.index === selected) - Number(b.runner.index === selected));
}

export function placeCaptions(
  callouts: MapCallout[],
  labelSize: number,
  dotRadius: number,
  overlayHeight: number,
  flagged: (index: number) => boolean,
  bounds: { width: number; height: number }
) {
  const obstacles = callouts.flatMap((m) => [
    { x: m.x, y: m.y, radius: 0, width: labelSize + 4, height: labelSize + 4 },
    { ...m.anchor, radius: dotRadius + 4 }
  ]);

  return new Map(
    callouts.map((m) => {
      const candidates = (width: number, height: number, above: boolean) => [
        { x: m.x, y: above ? m.y - labelSize / 2 - height - 6 : m.telemetryY - 10 },
        { x: m.x + labelSize / 2 + width / 2 + 8, y: m.y - height / 2 },
        { x: m.x - labelSize / 2 - width / 2 - 8, y: m.y - height / 2 },
        { x: m.x, y: above ? m.telemetryY - 10 : m.y - labelSize / 2 - height - 6 },
        { x: m.x + labelSize / 2 + width / 2 + 8, y: m.y + labelSize / 2 + 8 },
        { x: m.x - labelSize / 2 - width / 2 - 8, y: m.y + labelSize / 2 + 8 },
        { x: m.x + labelSize / 2 + width / 2 + 8, y: m.y - labelSize / 2 - height - 6 },
        { x: m.x - labelSize / 2 - width / 2 - 8, y: m.y - labelSize / 2 - height - 6 },
        { x: m.x + labelSize / 2 + width / 2 + 40, y: m.y - height / 2 },
        { x: m.x - labelSize / 2 - width / 2 - 40, y: m.y - height / 2 },
        { x: m.x + labelSize / 2 + width / 2 + 40, y: m.y + labelSize / 2 + 8 },
        { x: m.x - labelSize / 2 - width / 2 - 40, y: m.y + labelSize / 2 + 8 }
      ];

      const nameWidth = Math.max(48, m.runner.name.length * 6 + 8);
      const name = placeTrackCaption(
        candidates(nameWidth, 14, true),
        nameWidth,
        14,
        obstacles,
        bounds
      );

      const height = Math.max(14, overlayHeight) + (flagged(m.runner.index) ? 12 : 0);
      const values = candidates(58, height, false);
      // In a tight pack, keep the values with the readable name rather than
      // forcing them into the space occupied by a neighbour's portrait.
      values.splice(1, 0, { x: name.x, y: name.y + 20 });
      const telemetry = placeTrackCaption(
        values,
        58,
        height,
        [...obstacles, { x: name.x, y: name.y + 7, radius: 0, width: nameWidth, height: 14 }],
        bounds
      );

      return [m.runner.index, { name, telemetry }] as const;
    })
  );
}

export function crowdedCallouts(callouts: MapCallout[], labelSize: number, overlayHeight: number) {
  return new Set(
    callouts
      .filter((a) =>
        callouts.some(
          (b) =>
            a.runner.index !== b.runner.index &&
            Math.abs(a.x - b.x) < 64 &&
            Math.abs(a.y - b.y) < labelSize + overlayHeight + 8
        )
      )
      .map((a) => a.runner.index)
  );
}

export function separatedCaptions<T extends { label: string; caption: Point }>(
  marks: T[],
  clear: (point: Point) => boolean
) {
  const accepted: T[] = [];
  // Keep every landmark interactive; only omit captions that would cover each other.
  for (const item of [...marks].sort(
    (a, b) => Number(b.label === 'Finish') - Number(a.label === 'Finish')
  )) {
    if (
      clear(item.caption) &&
      accepted.every(
        (p) =>
          Math.abs(p.caption.y - item.caption.y) > 14 ||
          Math.abs(p.caption.x - item.caption.x) > (p.label.length + item.label.length) * 2.6 + 12
      )
    )
      accepted.push(item);
  }

  return new Set(accepted);
}
