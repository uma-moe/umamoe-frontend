// Measured in race windows: the camera starts leaving the leader one window before the finish.
const APPROACH_WINDOWS = 1;

function approachProgress(leader: number, finish: number, window: number) {
  const length = APPROACH_WINDOWS * window;
  return Math.min(1, Math.max(0, (leader - finish + length) / length));
}

/** How far the camera has turned from following the leader to resting on the finish: 0 to 1. */
export function finishFocus(leader: number, finish: number, window: number): number {
  const progress = approachProgress(leader, finish, window);
  return progress * progress * (3 - 2 * progress);
}

/**
 * Moves a followed camera centre onto the finish line as the leader approaches it. The camera
 * leaves at the leader's speed, runs ahead of it, and eases out to rest on the line just as the
 * leader crosses, so the finish ends up centred.
 */
export function finishCentre(
  centre: number,
  { leader, finish, window }: { leader: number; finish: number; window: number }
): number {
  const progress = approachProgress(leader, finish, window);
  if (progress === 0) return centre;
  if (progress === 1) return finish;

  // A Hermite curve from the followed camera, moving with the leader, to rest on the finish.
  const length = APPROACH_WINDOWS * window,
    gapAtApproach = finish - centre + progress * length;

  const startWeight = 2 * progress ** 3 - 3 * progress ** 2 + 1,
    startSpeedWeight = progress ** 3 - 2 * progress ** 2 + progress;

  return finish - gapAtApproach * startWeight + startSpeedWeight * length;
}
