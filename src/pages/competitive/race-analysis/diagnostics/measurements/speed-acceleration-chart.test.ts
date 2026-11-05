import { expect, it } from 'vitest';
import { speedAccelerationChart } from './speed-acceleration-chart';

const samples = [
  { time: 1, distance: 20, speed: 20, target: 22, acceleration: 0.5 },
  { time: 2, distance: 40, speed: 21, target: 22, acceleration: 1 }
];
const windows = [{ id: '1', skillId: 1, start: 1, end: 2 }];

it('plots speed, acceleration and skill windows against distance', () => {
  const { option } = speedAccelerationChart({
    samples,
    windows,
    raceDistance: 1200,
    dark: true,
    names: new Map([[1, 'Groundwork']]),
    toDistance: (time) => time * 20
  });
  const series = option.series as { data: unknown[] }[];
  expect(series[0]?.data).toEqual([
    [20, 20],
    [40, 21]
  ]);
  expect(series[1]?.data).toEqual([
    [20, 22],
    [40, 22]
  ]);
  expect(series[2]?.data).toEqual([
    [20, 0.5],
    [40, 1]
  ]);
  expect(series[3]?.data).toEqual([20]);
  expect(series[4]?.data).toEqual([20]);
});

it('marks 24 sections and phase boundaries using course distance, not the final sample', () => {
  const { option } = speedAccelerationChart({
    samples,
    windows,
    raceDistance: 1200,
    dark: true,
    names: new Map(),
    toDistance: (time) => time * 20
  });
  const axes = option.xAxis as {
    max: number;
    interval: number;
    axisLabel: { formatter: (value: number) => string };
  }[];
  expect(axes.every((axis) => axis.max === 1200 && axis.interval === 50)).toBe(true);
  expect(axes[2]?.axisLabel.formatter(0)).toBe('1');
  expect(axes[2]?.axisLabel.formatter(200)).toBe('5');
  expect(axes[2]?.axisLabel.formatter(1150)).toBe('24');
  expect(axes[2]?.axisLabel.formatter(1200)).toBe('');
  const series = option.series as {
    markLine?: { data: { name: string; xAxis: number; lineStyle: { width: number } }[] };
  }[];
  expect(series[0]?.markLine?.data).toMatchObject([
    { name: 'Mid race', xAxis: 200, lineStyle: { width: 2 } },
    { name: 'Late race', xAxis: 800, lineStyle: { width: 2 } }
  ]);
  expect(series[3]?.markLine?.data).toEqual(
    series[0]?.markLine?.data.map((phase) => ({ ...phase, label: { show: false } }))
  );
});

it('keeps phase boundaries and fractional sections when no acceleration skills activated', () => {
  const { option } = speedAccelerationChart({
    samples,
    windows: [],
    raceDistance: 2200,
    dark: false,
    names: new Map(),
    toDistance: (time) => time * 20
  });
  const axes = option.xAxis as { max: number; interval: number }[];
  expect(axes).toHaveLength(2);
  expect(axes[0]).toMatchObject({ max: 2200, interval: 2200 / 24 });
  const series = option.series as { markLine?: { data: { xAxis: number }[] } }[];
  expect(series[0]?.markLine?.data.map((phase) => phase.xAxis)).toEqual([2200 / 6, (2200 * 2) / 3]);
});

it('shows measured acceleration and active skills on separate lines while escaping resource names', () => {
  const { option } = speedAccelerationChart({
    samples,
    windows: [...windows, { id: '2', skillId: 2, start: 1, end: 2 }],
    raceDistance: 1200,
    dark: true,
    names: new Map([
      [1, '<skill>'],
      [2, 'Groundwork']
    ]),
    toDistance: (time) => time * 20
  });
  const tooltip = option.tooltip as { formatter: (value: unknown) => string };
  const text = tooltip.formatter([{ axisValue: 20 }]);

  expect(text).toContain('Acceleration: 0.50 m/s²');
  expect(text).toContain('Active acceleration skills: <br>&lt;skill&gt;<br>Groundwork');
  expect(text).not.toContain('<skill>');
  expect(tooltip.formatter([{ axisValue: 40 }])).toContain('Active acceleration skills: None');
});

it('excludes start-dash acceleration from the plotted range while retaining speed', () => {
  const { option } = speedAccelerationChart({
    samples: [{ ...samples[0]!, acceleration: 25, startDash: true }, samples[1]!],
    windows,
    raceDistance: 1200,
    dark: true,
    names: new Map(),
    toDistance: (time) => time * 20
  });
  const series = option.series as { data: unknown[] }[];
  expect(series[2]?.data).toEqual([
    [20, null],
    [40, 1]
  ]);
  expect(series[0]?.data).toEqual([
    [20, 20],
    [40, 21]
  ]);
  const tooltip = option.tooltip as { formatter: (value: unknown) => string };
  expect(tooltip.formatter([{ axisValue: 20 }])).toContain('Acceleration: 25.00 m/s²');
});
