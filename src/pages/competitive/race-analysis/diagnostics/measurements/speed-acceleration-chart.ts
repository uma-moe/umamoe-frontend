import type { EChartsCoreOption } from 'echarts/core';
import {
  chartTooltipContent,
  chartTooltipStyle,
  type TooltipRow
} from '@/components/charts/chart-tooltip';
import { insideZoom } from '@/components/charts/echarts-zoom';
import { phaseBandArea, racePhaseBands } from '../../race-phase-bands';
import { seekTimeLabel } from '../diagnostics-format';
import { sampleAt, type AccelerationWindow, type SpeedSample } from './acceleration-activations';

export type SpeedLineId = 'speed' | 'target' | 'acceleration';

export interface SpeedLine {
  id: SpeedLineId;
  label: string;
  unit: string;
  color: string;
}

const accelerationColor = '#87ceab';
const activationColor = '#b49bdd';

export const speedLines: SpeedLine[] = [
  { id: 'speed', label: 'Current speed', unit: 'm/s', color: '#69b7ee' },
  { id: 'target', label: 'Target speed', unit: 'm/s', color: '#e3b35f' },
  { id: 'acceleration', label: 'Acceleration', unit: 'm/s²', color: accelerationColor }
];

/** The start dash's speed and acceleration dwarf the rest of the race, so the plot begins after it. */
export const plottedFromSeconds = 1;

const sectionsPerRace = 24;
const plotTop = 22;
const speedPlotHeight = 190;
const laneHeight = 20;
const axisLabelsHeight = 22;
const sliderHeight = 24;

export function plottedSamples(samples: SpeedSample[]): SpeedSample[] {
  return samples.filter((sample) => sample.time >= plottedFromSeconds);
}

/** A line's value at one sample with its unit, for the tooltip. */
export function speedLineReading(sample: SpeedSample | undefined, line: SpeedLine): string {
  const value = sample?.[line.id];
  if (value === null || value === undefined) return '—';

  return value.toFixed(2) + ' ' + line.unit;
}

export function speedAccelerationChart({
  samples,
  windows,
  raceDistance,
  dark,
  names,
  toDistance,
  hidden = []
}: {
  samples: SpeedSample[];
  windows: AccelerationWindow[];
  raceDistance: number;
  dark: boolean;
  names: ReadonlyMap<number, string>;
  toDistance: (time: number) => number;
  hidden?: readonly SpeedLineId[];
}): { option: EChartsCoreOption; height: number } {
  const text = dark ? '#a6afbd' : '#596477';
  const grid = dark ? '#ffffff12' : '#00000012';
  const plotted = plottedSamples(samples);
  const hasLanes = windows.length > 0;
  const lanesHeight = windows.length * laneHeight;
  const height = plotTop + speedPlotHeight + lanesHeight + axisLabelsHeight + sliderHeight;
  const max = Math.max(1, raceDistance);
  const sectionLength = max / sectionsPerRace;
  const shownLines = speedLines.filter((line) => !hidden.includes(line.id));
  const label = (skillId: number) => names.get(skillId) ?? 'Skill ' + skillId;

  const phaseBands = (labelled: boolean) =>
    racePhaseBands.map((phase) =>
      phaseBandArea({ phase, start: max * phase.start, end: max * phase.end, dark, labelled })
    );

  const readings = (sample: SpeedSample | undefined): TooltipRow[] =>
    shownLines.map((line) => ({
      label: line.label,
      value: speedLineReading(sample, line),
      color: line.color
    }));

  const tooltip = (value: number) => {
    const sample = sampleAt(samples, value, 'distance');
    if (!sample) return '';

    const activeSkills = windows
      .filter((window) => sample.time >= window.start && sample.time < window.end)
      .map((window) => ({ label: label(window.skillId), color: activationColor }));

    return chartTooltipContent(`${seekTimeLabel(sample.time)} · ${sample.distance.toFixed(1)} m`, [
      ...readings(sample),
      ...activeSkills
    ]);
  };

  const activationTooltip = (window: AccelerationWindow) => {
    const start = toDistance(window.start),
      end = toDistance(window.end);

    return chartTooltipContent(label(window.skillId), [
      { label: 'Active', value: `${seekTimeLabel(window.start)} – ${seekTimeLabel(window.end)}` },
      { label: 'Distance', value: `${start.toFixed(1)} – ${end.toFixed(1)} m` },
      ...readings(sampleAt(samples, start, 'distance'))
    ]);
  };

  const lineSeries = (line: SpeedLine) => ({
    id: line.id,
    name: line.label,
    type: 'line',
    yAxisIndex: line.id === 'acceleration' ? 1 : 0,
    showSymbol: false,
    lineStyle: {
      width: line.id === 'speed' ? 2 : 1.5,
      type: line.id === 'target' ? 'dashed' : 'solid',
      color: line.color
    },
    itemStyle: { color: line.color },
    data: plotted.map((sample) => [
      sample.distance,
      line.id === 'acceleration' && sample.startDash ? null : sample[line.id]
    ])
  });

  // A skill's name sits beside its bar, on whichever side leaves it more of the plot.
  const activationBar = (window: AccelerationWindow) => {
    const start = toDistance(window.start),
      end = toDistance(window.end);
    const roomAfter = max - end;

    return {
      value: Math.max(0, end - start),
      label: {
        show: true,
        position: roomAfter >= start ? 'right' : 'left',
        distance: 6,
        color: text,
        fontSize: 10,
        formatter: label(window.skillId)
      }
    };
  };

  const distanceAxis = {
    type: 'value',
    min: 0,
    max,
    interval: sectionLength,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: text,
      fontSize: 10,
      hideOverlap: true,
      showMinLabel: true,
      showMaxLabel: true,
      formatter: (value: number) =>
        Math.round(value / sectionLength) % 4 === 0 ? value.toFixed(0) + 'm' : ''
    },
    splitLine: { show: true, lineStyle: { color: grid } }
  };

  const plotSides = { left: 34, right: 40 };

  return {
    height,
    option: {
      animation: false,
      aria: { enabled: true },
      grid: [
        { ...plotSides, top: plotTop, height: speedPlotHeight },
        ...(hasLanes ? [{ ...plotSides, top: plotTop + speedPlotHeight, height: lanesHeight }] : [])
      ],
      xAxis: [
        { ...distanceAxis, axisLabel: { ...distanceAxis.axisLabel, show: !hasLanes } },
        ...(hasLanes ? [{ ...distanceAxis, gridIndex: 1 }] : []),
        {
          ...distanceAxis,
          position: 'top',
          axisPointer: { show: false },
          axisLabel: {
            color: text,
            fontSize: 9,
            hideOverlap: true,
            formatter: (value: number) => {
              const section = Math.round(value / sectionLength) + 1;
              return section <= sectionsPerRace ? String(section) : '';
            }
          },
          splitLine: { show: false }
        }
      ],
      yAxis: [
        {
          type: 'value',
          scale: true,
          axisLine: { show: false },
          axisLabel: { color: text, fontSize: 10 },
          splitLine: { lineStyle: { color: grid } }
        },
        {
          type: 'value',
          position: 'right',
          scale: true,
          axisLine: { show: false },
          axisLabel: {
            show: !hidden.includes('acceleration'),
            color: accelerationColor,
            fontSize: 10
          },
          splitLine: { show: false }
        },
        ...(hasLanes
          ? [
              {
                type: 'category',
                gridIndex: 1,
                data: windows.map((window) => window.id),
                inverse: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false }
              }
            ]
          : [])
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        ...chartTooltipStyle(dark),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'line' },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] : params;
          if (!first || typeof first !== 'object' || !('axisValue' in first)) return '';
          return tooltip(Number(first.axisValue));
        }
      },
      dataZoom: [
        ...insideZoom(),
        {
          type: 'slider',
          xAxisIndex: 'all',
          bottom: 4,
          height: 14,
          showDetail: false,
          textStyle: { color: text }
        }
      ],
      series: [
        {
          id: 'phases',
          type: 'line',
          silent: true,
          data: [],
          tooltip: { show: false },
          markArea: { silent: true, data: phaseBands(true) }
        },
        ...shownLines.map(lineSeries),
        ...(hasLanes
          ? [
              {
                id: 'activation-offset',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 2,
                stack: 'skills',
                silent: true,
                itemStyle: { color: 'transparent' },
                data: windows.map((window) => toDistance(window.start)),
                tooltip: { show: false },
                markArea: { silent: true, data: phaseBands(false) }
              },
              {
                id: 'activation',
                name: 'Acceleration active',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 2,
                stack: 'skills',
                barWidth: 10,
                barMinHeight: 3,
                itemStyle: { color: activationColor, borderRadius: 2 },
                data: windows.map(activationBar),
                tooltip: {
                  trigger: 'item',
                  formatter: (params: unknown) => {
                    if (!params || typeof params !== 'object' || !('dataIndex' in params))
                      return '';
                    const window = windows[Number(params.dataIndex)];
                    return window ? activationTooltip(window) : '';
                  }
                }
              }
            ]
          : [])
      ]
    }
  };
}
