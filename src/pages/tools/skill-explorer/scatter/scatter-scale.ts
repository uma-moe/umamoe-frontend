/** A linear axis over a domain, positioned in percent of the plot. */
export interface LinearAxis {
  min: number;
  max: number;
}

/**
 * Values spread on a signed square root: most skills add little, a few add a lot, and a linear axis would pile the
 * many onto one line.
 */
export function signedRoot(value: number): number {
  return Math.sign(value) * Math.sqrt(Math.abs(value));
}

export interface ValueAxis {
  /** Domain in root space. */
  low: number;
  high: number;
  ticks: number[];
}

/** Round values ticks are drawn at; zoomed in, the finer ones come into reach. */
const VALUE_TICKS = [
  -8, -6, -4, -3, -2, -1.5, -1, -0.75, -0.5, -0.4, -0.3, -0.25, -0.2, -0.15, -0.1, -0.05, -0.02, 0,
  0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.9,
  1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30
];

/** Ticks keep at least this share of the axis apart, so about six show at any zoom. */
const TICK_SPACING = 1 / 7;

/** Narrowest span of the axis, in root space, so a few close values do not fill the plot. */
const MIN_ROOT_SPAN = 0.3;

/** Win points every track's value axis reaches down to, so the weakest skills sit clear of the axis. */
const VALUE_FLOOR = 1;

/** Room above the highest value and below the lowest, as shares of the values' span: the top is barely padded, as the
 * icon layout keeps the extreme icons inside the plot; skills below the floor keep the bottom room under them. */
const TOP_ROOM = 0.03;
const BOTTOM_ROOM = 0.08;

/** The value axis spanning `values`, from the floor or a little below the lowest, whichever is lower. */
export function valueAxis(values: number[]): ValueAxis {
  if (values.length === 0) return { low: -MIN_ROOT_SPAN, high: MIN_ROOT_SPAN, ticks: [0] };

  const lowestRoot = signedRoot(Math.min(...values));
  const highestRoot = signedRoot(Math.max(...values));
  const centre = (lowestRoot + highestRoot) / 2;
  const span = Math.max(highestRoot - lowestRoot, MIN_ROOT_SPAN);
  const low = Math.min(signedRoot(VALUE_FLOOR), centre - span / 2 - span * BOTTOM_ROOM);
  const high = centre + span / 2 + span * TOP_ROOM;
  return { low, high, ticks: valueTicks(low, high) };
}

/** Round values between two points of root space, about six of them, always including zero when in reach. */
export function valueTicks(low: number, high: number): number[] {
  const ticks: number[] = [];
  let lastRoot = -Infinity;
  for (const tick of VALUE_TICKS) {
    const root = signedRoot(tick);
    const inside = root >= low && root <= high;
    const spaced = root - lastRoot >= (high - low) * TICK_SPACING;
    if (inside && (spaced || tick === 0)) {
      if (tick === 0 && !spaced) ticks.pop();
      ticks.push(tick);
      lastRoot = root;
    }
  }

  return ticks;
}

/** The root-space value at `share` of the plot's height from its top. */
export function rootAt(share: number, axis: ValueAxis): number {
  return axis.high - share * (axis.high - axis.low);
}

/** Distance from the top of the plot, in percent. */
export function valuePercent(value: number, axis: ValueAxis): number {
  return ((axis.high - signedRoot(value)) / (axis.high - axis.low)) * 100;
}

/** Distance from the left of the plot, in percent: the axis spans its full width (icons at the ends are kept inside
 * by the icon layout). */
export function linearPercent(value: number, axis: LinearAxis): number {
  const share = axis.max > axis.min ? (value - axis.min) / (axis.max - axis.min) : 0.5;
  return share * 100;
}

/** The value at `share` of the plot's width from its left: `linearPercent` turned around. */
export function linearValueAt(share: number, axis: LinearAxis): number {
  return axis.min + share * (axis.max - axis.min);
}

/** About `count` round ticks across a domain. */
export function niceTicks(axis: LinearAxis, count = 6): number[] {
  const span = axis.max - axis.min;
  if (span <= 0) return [axis.min];

  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * magnitude)
    .find((size) => size >= rough)!;
  const first = Math.ceil(axis.min / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick <= axis.max + step * 1e-9; tick += step)
    ticks.push(Number(tick.toFixed(6)));

  return ticks;
}

/** Win points as a signed percentage, two decimals below one point. */
export function formatWinPoints(value: number): string {
  const size = `${Math.abs(value).toFixed(Math.abs(value) < 1 ? 2 : 1)}%`;
  if (value > 0) return `+${size}`;
  if (value < 0) return `−${size}`;
  return size;
}
