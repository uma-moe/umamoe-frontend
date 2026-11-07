export type GateStall = { gate: number; centre: number; from: number; to: number };

// Front doors swing forwards once the race starts.
export const OPEN_DOOR_RADIANS = (70 * Math.PI) / 180;

/**
 * Equal stalls in lane order, spread from the innermost to the outermost runner's starting lane,
 * given in any lateral unit. Starting lanes are unevenly spaced, so a runner may stand slightly
 * off its stall's centre, as in a real gate.
 */
export function gateStalls(startLanes: number[], loneHalfWidth: number): GateStall[] {
  const ordered = startLanes
    .map((lane, index) => ({ gate: index + 1, lane }))
    .sort((a, b) => a.lane - b.lane);

  const first = ordered[0]?.lane ?? 0,
    spread = (ordered.at(-1)?.lane ?? 0) - first;

  const width =
    ordered.length > 1 && spread > 0 ? spread / (ordered.length - 1) : loneHalfWidth * 2;

  return ordered.map((stall, index) => {
    const centre = first + index * width;
    return { gate: stall.gate, centre, from: centre - width / 2, to: centre + width / 2 };
  });
}
