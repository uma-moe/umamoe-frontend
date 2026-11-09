import type { ParsedRaceCapture } from './capture/race-capture-parser';

/** The game adds 24 m/s² out of the gate until a runner reaches this share of the race's base speed. */
const START_DASH_SPEED_SHARE = 0.85;

// The next 66.6 ms tick raises the speed floor, so its measured speed jump is part of the start-dash
// transition too; the extra 0.01 ms absorbs rounding in the recorded frame times.
const TRANSITION_SECONDS = 0.0666 + 1e-5;

/** The race's base speed in m/s: the capture's own when it records one, otherwise from the distance. */
function raceBaseSpeed(capture: ParsedRaceCapture, raceDistance: number | undefined) {
  const captured = capture.original?.baseSpeed;
  if (typeof captured === 'number' && captured > 0) return captured;
  if (raceDistance === undefined || raceDistance <= 0) return undefined;

  return 20 - (raceDistance - 2000) / 1000;
}

/**
 * The race time through which a runner's samples belong to the start dash: -Infinity when the base
 * speed is unknown or the runner starts above the dash speed, Infinity when it is never reached.
 */
export function startDashEnd(
  capture: ParsedRaceCapture,
  index: number,
  raceDistance = capture.raceDistance
): number {
  const baseSpeed = raceBaseSpeed(capture, raceDistance);
  const startSpeed = capture.frames[0]?.horses[index]?.speed;
  if (baseSpeed === undefined || startSpeed === undefined) return -Infinity;

  const dashSpeed = baseSpeed * START_DASH_SPEED_SHARE;
  if (startSpeed / 100 >= dashSpeed) return -Infinity;

  const reached = capture.frames.find(
    (frame) => (frame.horses[index]?.speed ?? 0) / 100 >= dashSpeed
  );

  return reached === undefined ? Infinity : reached.time + TRANSITION_SECONDS;
}
