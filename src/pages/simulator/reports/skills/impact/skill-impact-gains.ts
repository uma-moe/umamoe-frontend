import { formatMarginValue, type MarginUnit, type SkillValue } from '../../simulation-comparison';

export type SkillImpactRow = {
  id: number;
  rate: number;
  triggered: number;
  value: number;
  measured: number;
  per100: number;
  per100Seconds: number;
  sp: number;
  win: number;
  level: number;
};

export type SortDirection = 'ascending' | 'descending';

// A gain axis with round steps covering every bar and 95% range in a list, always including zero.
export type Scale = { min: number; max: number; ticks: number[] };

export const makeScale = (
  points: { gain: number; low?: number; high?: number }[],
  unit: MarginUnit
): Scale => {
  const low = Math.min(0, ...points.map((row) => row.low ?? row.gain)),
    high = Math.max(0, ...points.map((row) => row.high ?? row.gain)),
    span = Math.max(high - low, unit === 'seconds' ? 0.05 : 0.5);

  const step =
    (unit === 'seconds'
      ? [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]
      : [0.1, 0.2, 0.25, 0.5, 1, 2, 5]
    ).find((value) => span / value <= 6) ?? 5;

  const min = Math.floor(low / step) * step,
    max = Math.ceil(high / step) * step;

  return {
    min,
    max,
    ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) =>
      Number((min + index * step).toFixed(4))
    )
  };
};

export const place = (axis: Scale, gain: number) =>
  ((gain - axis.min) / Math.max(Number.EPSILON, axis.max - axis.min)) * 100;

export const gainOf = (measured: SkillValue, unit: MarginUnit) => ({
  gain: unit === 'seconds' ? measured.seconds : measured.lengths,
  low: (unit === 'seconds' ? measured.lowSeconds : measured.low) ?? undefined,
  high: (unit === 'seconds' ? measured.highSeconds : measured.high) ?? undefined
});

// The selected runner's learned skills: measured ones sorted by the chosen column, unmeasured ones after them.
export const sortRows = (
  rows: SkillImpactRow[],
  sortKey: string,
  sortDirection: SortDirection,
  name: (id: number) => string
) => {
  const direction = sortDirection === 'ascending' ? 1 : -1;
  const key = (row: SkillImpactRow) => {
    if (sortKey === 'id') {
      return name(row.id);
    }

    if (sortKey === 'per100') {
      return row.per100;
    }

    if (sortKey === 'win') {
      return row.win;
    }

    return row.value;
  };

  const measured = rows.filter((row) => row.measured),
    pending = rows.filter((row) => !row.measured);

  measured.sort((a, b) => {
    const x = key(a),
      y = key(b);

    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) * direction;
  });

  return [...measured, ...pending.sort((a, b) => name(a.id).localeCompare(name(b.id)))];
};

export const range = (measured: SkillValue, unit: MarginUnit) =>
  measured.low != null
    ? '95% interval ' +
      (unit === 'seconds'
        ? formatMarginValue(0, measured.highSeconds!, unit) +
          ' to ' +
          formatMarginValue(0, measured.lowSeconds!, unit)
        : formatMarginValue(measured.low, 0, unit, 2) +
          ' to ' +
          formatMarginValue(measured.high!, 0, unit, 2)) +
      ' over ' +
      measured.count +
      ' races'
    : measured.count + ' races';

export const tickLabel = (gain: number, unit: MarginUnit) => {
  if (Math.abs(gain) < 1e-9) {
    return '0';
  }

  if (unit === 'seconds') {
    return (gain > 0 ? '−' : '+') + Math.abs(gain).toFixed(2) + ' s';
  }

  return (gain > 0 ? '+' : '−') + Math.abs(gain) + ' L';
};

export const help = {
  Gain: 'What this skill’s effects are worth at the finish, measured against matched runs with those effects suppressed: lengths (1 L = 2.5 m) and seconds, where negative seconds means she finishes earlier. The small range is the 95% interval. Values are not additive across skills.',
  'Gain / 100 SP': 'Gain divided by the base SP cost before hints. Owned uniques have no SP cost.',
  'Win rate change': 'Change in win rate, in percentage points, from having the skill.'
};
