import type { RaceFrame, RaceHorseFrame } from '../capture/race-capture-parser';

export interface InterpolatedRaceFrame extends RaceFrame {
  sourceIndex: number;
}

export interface ReplayBounds {
  startTime: number;
  endTime: number;
  duration: number;
  distanceMax: number;
  laneMax: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function interpolateHorse(
  left: RaceHorseFrame,
  right: RaceHorseFrame,
  alpha: number
): RaceHorseFrame {
  const mix = (a: number, b: number) => finite(a) + (finite(b, finite(a)) - finite(a)) * alpha;
  return {
    distance: mix(left.distance, right.distance),
    lanePosition: mix(left.lanePosition, right.lanePosition),
    speed: mix(left.speed, right.speed),
    hp: mix(left.hp, right.hp),
    temptationMode: left.temptationMode,
    blockFrontHorseIndex: left.blockFrontHorseIndex
  };
}

export function raceReplayBounds(frames: RaceFrame[], explicitDistance?: number): ReplayBounds {
  const first = frames[0];
  const last = frames.at(-1);
  const startTime = finite(first?.time ?? 0);
  const endTime = Math.max(startTime, finite(last?.time ?? startTime, startTime));
  let observedDistance = 0;
  let laneMax = 0;
  for (const frame of frames) {
    for (const horse of frame.horses) {
      observedDistance = Math.max(observedDistance, finite(horse.distance));
      laneMax = Math.max(laneMax, finite(horse.lanePosition));
    }
  }

  return {
    startTime,
    endTime,
    duration: endTime - startTime,
    distanceMax: Math.max(
      1,
      finite(explicitDistance ?? 0) > 0 ? explicitDistance! : observedDistance
    ),
    laneMax: Math.max(1, laneMax)
  };
}

type HorseInterpolation = (
  frames: RaceFrame[],
  span: { low: number; index: number; alpha: number }
) => RaceHorseFrame;

function frameAtTime(
  frames: RaceFrame[],
  requestedTime: number,
  horseAt: HorseInterpolation
): InterpolatedRaceFrame | undefined {
  if (!frames.length) return undefined;
  if (frames.length === 1 || requestedTime <= frames[0]!.time)
    return { ...frames[0]!, sourceIndex: 0 };

  const lastIndex = frames.length - 1;
  if (requestedTime >= frames[lastIndex]!.time)
    return { ...frames[lastIndex]!, sourceIndex: lastIndex };

  let low = 0;
  let high = lastIndex;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle]!.time <= requestedTime) low = middle;
    else high = middle;
  }

  const left = frames[low]!;
  const right = frames[high]!;
  const interval = right.time - left.time;
  const alpha = interval > 0 ? clamp((requestedTime - left.time) / interval, 0, 1) : 0;
  const horseCount = Math.min(left.horses.length, right.horses.length);
  return {
    time: left.time + interval * alpha,
    horses: Array.from({ length: horseCount }, (_, index) =>
      horseAt(frames, { low, index, alpha })
    ),
    sourceIndex: low
  };
}

export function raceFrameAtTime(
  frames: RaceFrame[],
  requestedTime: number
): InterpolatedRaceFrame | undefined {
  return frameAtTime(frames, requestedTime, (source, { low, index, alpha }) =>
    interpolateHorse(source[low]!.horses[index]!, source[low + 1]!.horses[index]!, alpha)
  );
}

type Sample = { time: number; value: number };

function hermite(from: number, to: number, fromTangent: number, toTangent: number, t: number) {
  const t2 = t * t,
    t3 = t2 * t;

  return (
    (2 * t3 - 3 * t2 + 1) * from +
    (t3 - 2 * t2 + t) * fromTangent +
    (3 * t2 - 2 * t3) * to +
    (t3 - t2) * toTangent
  );
}

// Fritsch–Carlson limit: the curve stays between its two samples, so runners never step back.
function monotoneTangent(tangent: number, change: number) {
  if (change === 0 || Math.sign(tangent) !== Math.sign(change)) return 0;
  return Math.sign(change) * Math.min(Math.abs(tangent), 3 * Math.abs(change));
}

// Slope through a sample from its neighbours, flat where the value turns back.
function sampleSlope(previous: Sample | undefined, sample: Sample, next: Sample | undefined) {
  const slope = (a: Sample, b: Sample) =>
    b.time > a.time ? (b.value - a.value) / (b.time - a.time) : 0;

  if (previous && next) {
    const turns = (sample.value - previous.value) * (next.value - sample.value) <= 0;
    return turns ? 0 : slope(previous, next);
  }

  if (next) return slope(sample, next);
  if (previous) return slope(previous, sample);
  return 0;
}

function smoothHorse(
  frames: RaceFrame[],
  { low, index, alpha }: { low: number; index: number; alpha: number }
): RaceHorseFrame {
  const leftFrame = frames[low]!,
    rightFrame = frames[low + 1]!;

  const left = leftFrame.horses[index]!,
    right = rightFrame.horses[index]!;

  const interval = rightFrame.time - leftFrame.time;
  const linear = interpolateHorse(left, right, alpha);

  // Recorded speeds are centimetres per second and give the distance curve its slope.
  const distanceChange = finite(right.distance) - finite(left.distance);
  const distance = hermite(
    finite(left.distance),
    finite(right.distance),
    monotoneTangent((finite(left.speed) / 100) * interval, distanceChange),
    monotoneTangent((finite(right.speed) / 100) * interval, distanceChange),
    alpha
  );

  const lane = (frame: RaceFrame | undefined): Sample | undefined => {
    const horse = frame?.horses[index];
    return frame && horse ? { time: frame.time, value: finite(horse.lanePosition) } : undefined;
  };

  const leftLane = { time: leftFrame.time, value: finite(left.lanePosition) },
    rightLane = { time: rightFrame.time, value: finite(right.lanePosition) },
    laneChange = rightLane.value - leftLane.value;

  const lanePosition = hermite(
    leftLane.value,
    rightLane.value,
    monotoneTangent(sampleSlope(lane(frames[low - 1]), leftLane, rightLane) * interval, laneChange),
    monotoneTangent(sampleSlope(leftLane, rightLane, lane(frames[low + 2])) * interval, laneChange),
    alpha
  );

  return { ...linear, distance, lanePosition };
}

/**
 * Like raceFrameAtTime, for playback: captures are sampled about once a second, so runners follow
 * their recorded speeds and curve through lane changes instead of turning at every sample.
 * Measurements keep the linear raceFrameAtTime.
 */
export function smoothRaceFrameAtTime(
  frames: RaceFrame[],
  requestedTime: number
): InterpolatedRaceFrame | undefined {
  return frameAtTime(frames, requestedTime, smoothHorse);
}

export function replayProgress(time: number, bounds: ReplayBounds): number {
  return bounds.duration > 0 ? clamp((time - bounds.startTime) / bounds.duration, 0, 1) : 0;
}

// Leave a little course ahead without expanding the lead-in with wider view windows.
export function replayViewport(
  leader: number,
  distance: number,
  windowMeters: number,
  laneMax: number
) {
  const width = clamp(finite(windowMeters, 80), 20, 400);
  const ahead = Math.min(16, width * 0.2);
  const max = Math.max(width, Math.min(leader, Math.max(0, distance - ahead)) + ahead);
  return { min: Math.max(0, max - width), max, laneMax: Math.max(500, finite(laneMax) * 1.2) };
}

// First crossing, interpolated from captured positions. Without a runner index,
// use the leader so course features and the scrubber share the same time axis.
export function raceTimeAtDistance(
  frames: RaceFrame[],
  distance: number,
  runnerIndex?: number
): number | undefined {
  if (!frames.length) return undefined;
  const leading = (index: number) =>
    runnerIndex === undefined
      ? Math.max(...frames[index]!.horses.map((h) => finite(h.distance)))
      : (frames[index]!.horses[runnerIndex]?.distance ?? -Infinity);

  if (distance <= leading(0)) return frames[0]!.time;
  let low = 0,
    high = frames.length - 1;

  if (distance > leading(high)) return undefined;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (leading(middle) < distance) low = middle;
    else high = middle;
  }

  const left = frames[low]!,
    right = frames[high]!;

  let fraction = 1;
  right.horses.forEach((horse, i) => {
    if (runnerIndex !== undefined && i !== runnerIndex) return;
    const start = left.horses[i]?.distance;
    if (start !== undefined && horse.distance >= distance && horse.distance > start)
      fraction = Math.min(fraction, clamp((distance - start) / (horse.distance - start), 0, 1));
  });

  return left.time + (right.time - left.time) * fraction;
}

export function replayLaneMetres(position: number, width: number): number {
  return (finite(position) / 9999) * width;
}
