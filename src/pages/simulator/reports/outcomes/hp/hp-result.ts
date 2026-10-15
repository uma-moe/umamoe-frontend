import type { StaminaResult } from '../../../simulator-repository';
import { hpRaces } from './hp-needed';

export const whole = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString();

export const signed = (value: number) => {
  let sign = '';
  if (Math.round(value) > 0) sign = '+';
  else if (Math.round(value) < 0) sign = '−';
  return sign + whole(Math.abs(value));
};

/** The smallest of 1, 2, 5, 10, 20, 50 … that is at least `value`. */
const nice = (value: number) => {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value) ?? 10 * power;
};

// HP at the finish over every race, in about 40 bins of a round width, so a narrow spread still shows its shape:
// below zero is what she was short when it ran out. Round values along the bottom say where the bars are.
export function finishHistogram(result: StaminaResult | undefined) {
  if (!result?.distribution) return undefined;
  const values = hpRaces(result).map((race) => Math.round(race.finish));
  const low = Math.min(...values),
    high = Math.max(...values);

  const step = nice((high - low + 1) / 40),
    start = Math.floor(low / step) * step,
    end = (Math.floor(high / step) + 1) * step;

  const counts = Array.from({ length: (end - start) / step }, (_, index) => ({
    from: start + index * step,
    count: 0
  }));

  for (const value of values) counts[Math.floor((value - start) / step)]!.count++;
  const every = nice((end - start) / 5),
    ticks: number[] = [];

  for (let at = Math.ceil(start / every) * every; at <= end; at += every)
    // Clear of the lowest and highest values at the ends.
    if ((at - start) / (end - start) > 0.1 && (at - start) / (end - start) < 0.86)
      ticks.push(at || 0);
  return {
    counts,
    step,
    start,
    end,
    low,
    high,
    ticks,
    top: Math.max(...counts.map((bin) => bin.count)),
    races: values.length
  };
}
