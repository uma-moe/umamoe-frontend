type MarkerPoint = { index: number; x: number; y: number };

// Portraits closer than this to a neighbour overlap it.
const CROWDED_X = 74;
const CROWDED_Y = 58;

/** Runners whose portraits overlap a neighbour hide their telemetry until selected or hovered. */
export function crowdedRunners(points: MarkerPoint[]): Set<number> {
  const crowded = points.filter((a) =>
    points.some(
      (b) =>
        a.index !== b.index && Math.abs(a.x - b.x) < CROWDED_X && Math.abs(a.y - b.y) < CROWDED_Y
    )
  );

  return new Set(crowded.map((point) => point.index));
}
