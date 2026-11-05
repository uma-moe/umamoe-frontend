import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
import { raceFrameAtTime } from '@/lib/race/replay/race-replay';
import type { SkillEffectAlternative } from '@/lib/game-data/skills/skill-effects';

export interface AccelerationWindow {
  id: string;
  skillId: number;
  start: number;
  end: number;
}

export interface SpeedSample {
  time: number;
  distance: number;
  speed: number;
  target: number | null;
  acceleration: number | null;
  startDash?: boolean;
}

export function accelerationWindows(
  capture: ParsedRaceCapture,
  index: number,
  mechanics: ReadonlyMap<number, SkillEffectAlternative[]>
): AccelerationWindow[] {
  const horse = diagnosticHorse(capture, index);
  const runner = capture.runners.find((runner) => runner.index === index);
  const finish =
    runner?.result?.finishTimeRaw ?? runner?.result?.finishTime ?? capture.frames.at(-1)?.time ?? 0;
  const windows = new Map<string, AccelerationWindow>();
  for (const span of horse?.activeSkillSpans ?? []) {
    if (
      span.startTime >= finish ||
      !mechanics
        .get(span.skillId)
        ?.[span.detailIndex]?.effects.some(
          (effect) => effect.kind === 31 && effect.target === 1 && effect.value > 0
        )
    )
      continue;
    const key =
      span.skillId +
      ':' +
      (typeof span.eventOrder === 'number' ? span.eventOrder : span.startTime.toFixed(3));
    const previous = windows.get(key);
    const end = Math.min(finish, span.endTime);
    if (previous) previous.end = Math.max(previous.end, end);
    else windows.set(key, { id: key, skillId: span.skillId, start: span.startTime, end });
  }
  return [...windows.values()].sort((a, b) => a.start - b.start);
}

export function speedSamples(
  capture: ParsedRaceCapture,
  index: number,
  raceDistance = capture.raceDistance
): SpeedSample[] {
  const horse = diagnosticHorse(capture, index);
  const times =
    horse?.sampleTimes ??
    capture.detailed?.annotations.sampleTimes ??
    capture.frames.map((frame) => frame.time);
  const runner = capture.runners.find((runner) => runner.index === index);
  const finish = runner?.result?.finishTimeRaw ?? runner?.result?.finishTime ?? Infinity;
  const capturedBase = capture.original?.baseSpeed;
  const baseSpeed =
    typeof capturedBase === 'number' && capturedBase > 0
      ? capturedBase
      : raceDistance
        ? 20 - (raceDistance - 2000) / 1000
        : undefined;
  const dashThreshold = baseSpeed === undefined ? undefined : baseSpeed * 0.85;
  // Start dash ends at 85% of base speed. The next 66.6 ms tick raises the speed floor,
  // so its measured speed jump is part of the start-dash transition too.
  const dashEnd =
    dashThreshold !== undefined &&
    (capture.frames[0]?.horses[index]?.speed ?? Infinity) / 100 < dashThreshold
      ? (capture.frames.find((frame) => (frame.horses[index]?.speed ?? 0) / 100 >= dashThreshold)
          ?.time ?? Infinity)
      : -Infinity;
  return times.flatMap((time, i) => {
    if (time > finish) return [];
    const frame = raceFrameAtTime(capture.frames, time)?.horses[index];
    if (!frame) return [];
    return [
      {
        time,
        distance: frame.distance,
        speed: frame.speed / 100,
        target: horse?.targetSpeeds?.[i] ?? null,
        acceleration: horse?.accelerationRates?.[i] ?? null,
        startDash: time <= dashEnd + 0.0666 + 1e-5
      }
    ];
  });
}

export function sampleAt(
  samples: SpeedSample[],
  value: number,
  axis: 'time' | 'distance'
): SpeedSample | undefined {
  return samples.reduce<SpeedSample | undefined>(
    (nearest, sample) =>
      !nearest || Math.abs(sample[axis] - value) < Math.abs(nearest[axis] - value)
        ? sample
        : nearest,
    undefined
  );
}

export function distanceAtTime(capture: ParsedRaceCapture, index: number, time: number): number {
  return raceFrameAtTime(capture.frames, time)?.horses[index]?.distance ?? 0;
}

export function timeAtDistance(samples: SpeedSample[], distance: number): number | undefined {
  if (!samples.length) return undefined;
  const rightIndex = samples.findIndex((sample) => sample.distance >= distance);
  if (rightIndex <= 0) return rightIndex === 0 ? samples[0]?.time : samples.at(-1)?.time;
  const left = samples[rightIndex - 1]!,
    right = samples[rightIndex]!;
  const fraction =
    right.distance === left.distance
      ? 0
      : (distance - left.distance) / (right.distance - left.distance);
  return left.time + (right.time - left.time) * fraction;
}
