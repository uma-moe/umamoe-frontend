import type { RaceFrame } from '@/lib/race/race-capture-parser';
import { raceTimeAtDistance } from '@/lib/race/race-replay';
import type { Course } from './replay-course';

export type TimedSection<T> = T & { time: number; left: number; width: number };

export function replayTimeTicks(start: number, end: number, maxIntervals = 6) {
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find(value => (end - start) / value <= maxIntervals) ?? Math.ceil((end - start) / maxIntervals);
  const ticks = [start];
  for (let value = Math.ceil(start / step) * step; value < end; value += step) if (value - start >= step * .4) ticks.push(value);
  // Keep the exact finish without crowding it with a nearby regular tick.
  if (ticks.length > 1 && end - ticks.at(-1)! < step * .4) ticks.pop();
  if (end > start) ticks.push(end);
  return ticks;
}

export function courseTerrain(course: Course) {
  const distances = [...new Set([0, course.distance, ...course.slopes.flatMap(slope => [slope.start, slope.start + slope.length])])]
    .filter(distance => distance >= 0 && distance <= course.distance).sort((a, b) => a - b);
  return {
    elevation: distances.map(distance => ({ distance, height: course.slopes.reduce((height, slope) => height + slope.slope * Math.max(0, Math.min(slope.length, distance - slope.start)) / 1_000_000, 0) })),
    slopes: distances.slice(0, -1).map((start, index) => ({ start, end: distances[index + 1]!, slope: course.slopes.find(slope => start >= slope.start && start < slope.start + slope.length)?.slope ?? 0 }))
  };
}

export function timedSection<T extends { start: number; end: number }>(section: T, frames: RaceFrame[], distanceMax: number, endTime: number, percent: (value: number) => number): TimedSection<T>[] {
  const start = raceTimeAtDistance(frames, section.start),
    end = section.end >= distanceMax ? endTime : (raceTimeAtDistance(frames, section.end) ?? endTime);
  return start === undefined ? [] : [{ ...section, time: start, left: percent(start), width: Math.max(0, percent(end) - percent(start)) }];
}

export const slopeLabel = (value: number) => value === 0 ? 'Level' : (value > 0 ? 'Uphill +' : 'Downhill ') + (value / 10000).toFixed(1) + '%';
