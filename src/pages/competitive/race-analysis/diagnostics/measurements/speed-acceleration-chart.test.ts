import { describe, expect, it } from 'vitest';
import type { AccelerationWindow, SpeedSample } from './acceleration-activations';
import {
  speedAccelerationChart,
  speedLineReading,
  speedLines,
  type SpeedLineId
} from './speed-acceleration-chart';

interface SeriesOption {
  id: string;
  data: unknown[];
  markArea?: {
    data: [{ name: string; xAxis: number; label: { show: boolean } }, { xAxis: number }][];
  };
}

interface BarItem {
  value: number;
  label: { position: string; formatter: string };
}

const samples: SpeedSample[] = [
  { time: 0.5, distance: 5, speed: 10, target: 22, acceleration: 24, startDash: true },
  { time: 1, distance: 20, speed: 20, target: 22, acceleration: 0.5 },
  { time: 2, distance: 40, speed: 21, target: 22, acceleration: 1 }
];
const windows: AccelerationWindow[] = [{ id: '1', skillId: 1, start: 1, end: 2 }];

function chart({
  windowList = windows,
  raceDistance = 1200,
  names = new Map([[1, 'Groundwork']]),
  hidden
}: {
  windowList?: AccelerationWindow[];
  raceDistance?: number;
  names?: Map<number, string>;
  hidden?: SpeedLineId[];
} = {}) {
  return speedAccelerationChart({
    samples,
    windows: windowList,
    raceDistance,
    dark: true,
    names,
    toDistance: (time) => time * 20,
    hidden
  });
}

const seriesById = (option: Record<string, unknown>) =>
  new Map((option.series as SeriesOption[]).map((series) => [series.id, series]));

describe('speed and acceleration chart', () => {
  it('plots each line against distance from the first second on', () => {
    const series = seriesById(chart().option);

    expect(series.get('speed')?.data).toEqual([
      [20, 20],
      [40, 21]
    ]);
    expect(series.get('target')?.data).toEqual([
      [20, 22],
      [40, 22]
    ]);
    expect(series.get('acceleration')?.data).toEqual([
      [20, 0.5],
      [40, 1]
    ]);
  });

  it('leaves hidden lines out of the plot', () => {
    const series = seriesById(chart({ hidden: ['target', 'acceleration'] }).option);

    expect([...series.keys()]).toEqual(['phases', 'speed', 'activation-offset', 'activation']);
  });

  it('draws skill windows as bars that start at their activation distance', () => {
    const series = seriesById(chart().option);
    const bars = series.get('activation')?.data as BarItem[];

    expect(series.get('activation-offset')?.data).toEqual([20]);
    expect(bars[0]?.value).toBe(20);
  });

  it('names each skill beside its bar on the side with more room', () => {
    const lateWindow = { id: '2', skillId: 2, start: 50, end: 55 };
    const names = new Map([
      [1, 'Groundwork'],
      [2, 'Final Push']
    ]);
    const series = seriesById(chart({ windowList: [...windows, lateWindow], names }).option);
    const labels = (series.get('activation')?.data as BarItem[]).map((bar) => bar.label);

    expect(labels).toMatchObject([
      { position: 'right', formatter: 'Groundwork' },
      { position: 'left', formatter: 'Final Push' }
    ]);
  });

  it('tints the four race phases behind the plot from the course distance', () => {
    const phases = seriesById(chart({ raceDistance: 2400 }).option).get('phases');
    const bands = phases?.markArea?.data.map(([start, end]) => [
      start.name,
      start.xAxis,
      end.xAxis
    ]);

    expect(bands).toEqual([
      ['Early race', 0, 400],
      ['Mid race', 400, 1600],
      ['Late race', 1600, 2000],
      ['Final leg', 2000, 2400]
    ]);
  });

  it('repeats the phase bands behind the skill lanes without their names', () => {
    const offset = seriesById(chart().option).get('activation-offset');
    const labelsShown = offset?.markArea?.data.map(([start]) => start.label.show);

    expect(labelsShown).toEqual([false, false, false, false]);
  });

  it('numbers 24 sections along the top using the course distance', () => {
    const axes = chart().option.xAxis as {
      max: number;
      interval: number;
      axisLabel: { formatter: (value: number) => string };
    }[];
    const sectionAxis = axes[2];

    expect(axes.every((axis) => axis.max === 1200 && axis.interval === 50)).toBe(true);
    expect(sectionAxis?.axisLabel.formatter(0)).toBe('1');
    expect(sectionAxis?.axisLabel.formatter(200)).toBe('5');
    expect(sectionAxis?.axisLabel.formatter(1150)).toBe('24');
    expect(sectionAxis?.axisLabel.formatter(1200)).toBe('');
  });

  it('drops the skill lanes when no acceleration skills activated', () => {
    const { option, height } = chart({ windowList: [], raceDistance: 2200 });
    const axes = option.xAxis as { max: number; interval: number }[];

    expect(axes).toHaveLength(2);
    expect(axes[0]).toMatchObject({ max: 2200, interval: 2200 / 24 });
    expect(height).toBeLessThan(chart().height);
  });

  it('reads out the shown lines and the active skills at the hovered distance, escaping skill names', () => {
    const tooltip = chart({
      windowList: [...windows, { id: '2', skillId: 2, start: 1, end: 2 }],
      names: new Map([
        [1, '<skill>'],
        [2, 'Groundwork']
      ]),
      hidden: ['target']
    }).option.tooltip as { formatter: (value: unknown) => string };

    const atFirstSecond = tooltip.formatter([{ axisValue: 20 }]);
    const afterTheSkills = tooltip.formatter([{ axisValue: 40 }]);

    expect(atFirstSecond).toContain('0:01.000 · 20.0 m');
    expect(atFirstSecond).toContain(
      'Acceleration</span><span style="float:right;margin-left:20px;font-weight:900">0.50 m/s²'
    );
    expect(atFirstSecond).not.toContain('Target speed');
    expect(atFirstSecond).toContain('&lt;skill&gt;');
    expect(atFirstSecond).toContain('Groundwork');
    expect(atFirstSecond).not.toContain('<skill>');
    expect(afterTheSkills).not.toContain('Groundwork');
  });
});

describe('speed line readings', () => {
  function line(id: SpeedLineId) {
    const found = speedLines.find((candidate) => candidate.id === id);
    if (!found) throw new Error('No speed line ' + id);

    return found;
  }

  it('formats a value with its unit', () => {
    expect(speedLineReading(samples[1], line('speed'))).toBe('20.00 m/s');
    expect(speedLineReading(samples[2], line('acceleration'))).toBe('1.00 m/s²');
  });

  it('shows a dash with no sample under the pointer', () => {
    expect(speedLineReading(undefined, line('speed'))).toBe('—');
  });
});
