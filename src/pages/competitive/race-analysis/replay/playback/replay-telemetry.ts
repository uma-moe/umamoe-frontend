import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts';
import type {
  ParsedRaceCapture,
  RaceEvent,
  RaceRunner
} from '@/lib/race/capture/race-capture-parser';
import { raceTimeAtDistance } from '@/lib/race/replay/race-replay';
import { hpRemainingColor } from '@/lib/race/replay/race-display';
import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
import {
  meanTrajectorySignal,
  trajectorySeries,
  type RaceTrajectory
} from '@/lib/race/replay/race-ensemble';

export interface TelemetrySignal {
  value: string;
  label: string;
  unit: string;
  color: string;
}

type MarkArea = [Record<string, unknown>, { xAxis: number }];

export interface TelemetryChart {
  capture: ParsedRaceCapture;
  ensemble?: RaceTrajectory[];
  runner?: RaceRunner;
  chartRunners: RaceRunner[];
  signals: TelemetrySignal[];
  startTime: number;
  endTime: number;
  telemetryEnd: number;
  finishTimes: Map<number, number | undefined>;
  selectedFinish?: number;
  chartEvents: boolean;
  markers: { name: string; xAxis: number; lineStyle: Record<string, unknown> }[];
  phases: MarkArea[];
  blocking: MarkArea[];
  dark: boolean;
}

export function telemetrySignals(dark: boolean, ensemble: boolean): TelemetrySignal[] {
  return [
    {
      value: 'speed',
      label: 'Speed',
      unit: 'm/s',
      color: dark ? '#69b7ee' : '#176ba0'
    },
    {
      value: 'hp',
      label: 'HP remaining',
      unit: '%',
      color: dark ? '#70c4a0' : '#247653'
    },
    {
      value: 'gap',
      label: ensemble ? 'Mean gap to leader' : 'To leader',
      unit: 'm',
      color: dark ? '#e3b56f' : '#986514'
    },
    {
      value: 'target',
      label: 'Target speed',
      unit: 'm/s',
      color: dark ? '#bb9be6' : '#7243a1'
    },
    {
      value: 'acceleration',
      label: 'Acceleration',
      unit: 'm/s²',
      color: dark ? '#df8ca1' : '#b33f61'
    }
  ];
}

export function telemetryPhases(
  capture: ParsedRaceCapture,
  distanceMax: number,
  telemetryEnd: number,
  dark: boolean
): MarkArea[] {
  return [
    { name: 'Early race', start: 0, end: 1 / 6, color: '#b5b9c2' },
    { name: 'Mid race', start: 1 / 6, end: 2 / 3, color: '#6ab7ee' },
    { name: 'Late race', start: 2 / 3, end: 5 / 6, color: '#dfba72' },
    { name: 'Final leg', start: 5 / 6, end: 1, color: '#bd91d1' }
  ].flatMap((phase) => {
    const start = raceTimeAtDistance(capture.frames, distanceMax * phase.start),
      end =
        phase.end === 1
          ? telemetryEnd
          : (raceTimeAtDistance(capture.frames, distanceMax * phase.end) ?? telemetryEnd);

    return start === undefined
      ? []
      : [
          [
            {
              name: phase.name,
              xAxis: start,
              itemStyle: { color: phase.color, opacity: 0.07 },
              label: {
                show: true,
                position: 'insideTop',
                fontSize: 9,
                color: dark ? '#abb4c3' : '#566071',
                formatter: phase.name.replace(' race', '')
              }
            },
            { xAxis: end }
          ] satisfies MarkArea
        ];
  });
}

export function telemetryMarkers(
  activations: RaceEvent[],
  skillNames: Map<number, string>,
  runner: RaceRunner | undefined,
  timeAt: (distance: number) => number | undefined
) {
  return [
    ...activations.map((event) => ({
      name: skillNames.get(event.params[1]!) ?? 'Skill ' + event.params[1],
      xAxis: event.frameTime,
      lineStyle: { color: '#e8ad63', opacity: 0.5 }
    })),
    ...[
      runner?.result?.lastSpurtStartDistance
        ? { name: 'Last spurt', distance: runner.result.lastSpurtStartDistance }
        : undefined
    ].flatMap((event) => {
      const time = event && timeAt(event.distance);
      return time === undefined || !event
        ? []
        : [{ name: event.name, xAxis: time, lineStyle: { color: '#abb4c3', opacity: 0.7 } }];
    })
  ];
}

export function telemetryBlocking(
  spans: { horseIndex: number; blockerHorseIndex: number; startTime: number; endTime: number }[],
  runner: RaceRunner | undefined,
  runners: RaceRunner[]
): MarkArea[] {
  return spans
    .filter((span) => span.horseIndex === runner?.index)
    .map((span) => [
      {
        name:
          'Blocked by ' +
          (runners.find((r) => r.index === span.blockerHorseIndex)?.name ?? 'runner'),
        xAxis: span.startTime,
        itemStyle: { color: '#f07777', opacity: 0.12 }
      },
      { xAxis: span.endTime }
    ]);
}

function chartData(chart: TelemetryChart, r: RaceRunner, signal: string) {
  const { capture, ensemble } = chart;
  const finish = chart.finishTimes.get(r.index);
  let data: (number | null)[][];
  if (ensemble && (signal === 'hp' || signal === 'gap')) {
    data = capture.frames.map((frame) => [
      frame.time,
      meanTrajectorySignal(ensemble, frame.time, r.index, signal)
    ]);
  } else if (signal === 'target' || signal === 'acceleration') {
    const h = diagnosticHorse(capture, r.index),
      samples = h?.sampleTimes ?? capture.detailed?.annotations.sampleTimes ?? [];

    data = samples.map((t, i) => [
      t,
      (signal === 'target' ? h?.targetSpeeds : h?.accelerationRates)?.[i] ?? null
    ]);
  } else {
    data = capture.frames.map((f) => [
      f.time,
      signal === 'speed'
        ? (f.horses[r.index]?.speed ?? 0) / 100
        : signal === 'hp'
          ? ((f.horses[r.index]?.hp ?? 0) /
              Math.max(1, capture.frames[0]?.horses[r.index]?.hp ?? 1)) *
            100
          : Math.max(...f.horses.map((h) => h.distance)) - (f.horses[r.index]?.distance ?? 0)
    ]);
  }

  if (ensemble || finish === undefined || finish > chart.endTime) return data;
  data = data.filter((point) => point[0]! < finish);
  // Hold the last racing sample at the line; later frames include deceleration.
  if (data.length) data.push([finish, data.at(-1)![1]!]);
  return data;
}

const finishLine: CustomSeriesRenderItem = (params, api) => {
  const area = params.coordSys as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    position = api.coord?.([api.value(0), 0]);

  if (!position || position[0]! < area.x || position[0]! > area.x + area.width) return;
  const x = Math.min(position[0]!, area.x + area.width - 8);
  return {
    type: 'group',
    children: Array.from({ length: Math.ceil(area.height / 4) * 2 }, (_, i) => ({
      type: 'rect',
      shape: {
        x: x + (i % 2) * 4,
        y: area.y + Math.floor(i / 2) * 4,
        width: 4,
        height: Math.min(4, area.height - Math.floor(i / 2) * 4)
      },
      style: { fill: (Math.floor(i / 2) + (i % 2)) % 2 ? '#17191d' : '#f5f5f5' }
    }))
  };
};

export function telemetryOption(chart: TelemetryChart, expanded: boolean): EChartsCoreOption {
  const { ensemble, runner, chartRunners, signals: chartSignals, dark } = chart;
  const multiple = chartSignals.length > 1,
    color = dark ? '#abb4c3' : '#566071';

  const hpColor = (value?: number) => hpRemainingColor(value, dark);
  return {
    animation: false,
    textStyle: { color },
    tooltip: {
      trigger: 'axis',
      order: 'seriesAsc',
      backgroundColor: dark ? '#202226' : '#fff',
      borderColor: dark ? '#42464c' : '#d2d5da',
      textStyle: { color: dark ? '#e8edf4' : '#202226' },
      axisPointer: { type: 'line', lineStyle: { color, opacity: 0.45 } }
    },
    // Axis labels use the reserved side columns, keeping the plot aligned with the timeline.
    grid: { left: 0, right: 0, top: 8, bottom: expanded ? 56 : 8, outerBoundsMode: 'none' },
    xAxis: {
      type: 'value',
      min: chart.startTime,
      max: Math.max(chart.startTime + 0.001, chart.telemetryEnd),
      show: expanded,
      name: 'Time (s)',
      nameLocation: 'middle',
      nameGap: 24,
      axisLabel: {
        fontSize: 10,
        color,
        formatter: (value: number) => Number(value.toFixed(1)).toString(),
        hideOverlap: true
      },
      nameTextStyle: { fontSize: 10, color },
      splitLine: { lineStyle: { opacity: 0.08 } }
    },
    yAxis: chartSignals.map((signal, i) => ({
      type: 'value',
      position: multiple && signal.value !== 'speed' ? 'right' : 'left',
      offset: multiple && signal.value === 'gap' ? 26 : 0,
      min: signal.value === 'acceleration' ? undefined : 0,
      max: signal.value === 'hp' ? 100 : undefined,
      interval: signal.value === 'hp' ? 25 : undefined,
      splitNumber: 4,
      axisLabel: { fontSize: 10, color: signal.color, margin: 8, hideOverlap: true },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: i === 0, lineStyle: { color, opacity: 0.12 } }
    })),
    dataZoom: expanded
      ? [
          { type: 'inside', xAxisIndex: 0 },
          { type: 'slider', xAxisIndex: 0, height: 14, bottom: 5 }
        ]
      : [],
    visualMap: ensemble
      ? []
      : chartSignals.flatMap((signal, i) =>
          signal.value === 'hp'
            ? [
                {
                  type: 'continuous',
                  show: false,
                  min: 0,
                  max: 100,
                  dimension: 1,
                  seriesIndex: chartRunners.map((_, index) => i * chartRunners.length + index),
                  inRange: { color: Array.from({ length: 9 }, (_, step) => hpColor(step * 12.5)) }
                }
              ]
            : []
        ),
    series: [
      ...(ensemble ?? []).flatMap((trajectory) =>
        chartSignals.map((signal, i) => ({
          name: 'Race ' + (trajectory.sample + 1) + ', ' + signal.label,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: i,
          showSymbol: false,
          silent: true,
          lineStyle: {
            width: 1,
            opacity: Math.max(0.025, Math.min(0.15, 1 / Math.sqrt(ensemble!.length)))
          },
          itemStyle: { color: signal.color },
          z: 0,
          tooltip: { show: false },
          data: trajectorySeries(trajectory, runner?.index ?? 0, signal.value)
        }))
      ),
      ...chartSignals.flatMap((signal, i) =>
        chartRunners.map((r) => ({
          name:
            (ensemble ? 'Mean · ' : '') +
            (multiple ? signal.label + ', ' : '') +
            'Gate ' +
            (r.index + 1) +
            ', ' +
            r.name,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: i,
          showSymbol: false,
          lineStyle: {
            width: r.index === runner?.index ? 2.5 : 1,
            opacity: r.index === runner?.index ? 1 : 0.18,
            type: r.index === runner?.index ? 'solid' : 'dotted'
          },
          itemStyle: { color: signal.color },
          z: r.index === runner?.index ? 3 : 1,
          tooltip: {
            valueFormatter: (value: unknown) =>
              typeof value === 'number'
                ? value.toFixed(signal.value === 'hp' ? 1 : 2) + ' ' + signal.unit
                : String(value)
          },
          data: chartData(chart, r, signal.value),
          ...(i === 0 && r.index === runner?.index && chart.chartEvents
            ? {
                markLine: {
                  silent: false,
                  symbol: ['none', 'none'],
                  label: { show: false },
                  lineStyle: { type: 'dashed', width: 1 },
                  data: chart.markers.filter((marker) => marker.xAxis <= chart.telemetryEnd)
                },
                markArea: {
                  silent: false,
                  label: { show: false },
                  data: [...chart.phases, ...chart.blocking]
                }
              }
            : {})
        }))
      ),
      ...(chart.selectedFinish === undefined
        ? []
        : [
            {
              id: 'finish-line',
              name: 'Finish',
              type: 'custom',
              renderItem: finishLine,
              data: [[chart.selectedFinish]],
              encode: { x: 0, y: -1 },
              silent: true,
              tooltip: { show: false },
              z: 5
            }
          ])
    ]
  };
}
