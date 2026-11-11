import type { EChartsCoreOption } from 'echarts/core';
import { insideZoom } from '@/components/charts/echarts-zoom';
import { baseChartOption, chartTheme } from '@/components/charts/chart-theme';
import {
  distanceName,
  POINT_SOURCES,
  type PointSourceId,
  type RunnerPoints,
  type TeamTrialPoints
} from './team-trial-points';

const ROW_HEIGHT = 48;
/** A narrow chart prints each name over its bar, which needs a taller row. */
const COMPACT_ROW_HEIGHT = 56;
const AXIS_ROOM = 56;
const BAR_SHARE = 0.42;
/** The spread sits under its bar, in the lower part of the row. */
const SPREAD_OFFSET = 0.32;
const SPREAD_HEIGHT = 7;

function points(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

export function runnerLabel(entry: RunnerPoints) {
  const distances = entry.distanceTypes.map(distanceName).filter(Boolean).join(', ');
  const races = entry.races + (entry.races === 1 ? ' race' : ' races');

  return { name: entry.runner.name, detail: distances ? distances + ' · ' + races : races };
}

function positiveTotal(entry: RunnerPoints, shown: PointSourceId[]) {
  return shown.reduce((total, id) => total + Math.max(0, entry.meanBySource[id]), 0);
}

function tooltip(entry: RunnerPoints, shown: PointSourceId[]) {
  const { name, detail } = runnerLabel(entry);
  const lines = POINT_SOURCES.filter(
    (source) => (shown.includes(source.id) || source.penalty) && entry.meanBySource[source.id] !== 0
  ).map(
    (source) =>
      `<span style="color:${source.color}">●</span> ${source.label}: ${points(entry.meanBySource[source.id])}`
  );
  const spread = entry.spread
    ? [
        `Median ${points(entry.spread.median)} · ${points(entry.spread.min)}–${points(entry.spread.max)}`
      ]
    : [];

  return [
    `<b>${name}</b> · ${detail}`,
    `Mean ${points(entry.meanTotal)} points a race`,
    ...spread,
    ...lines
  ].join('<br>');
}

export function teamTrialPointsChart(options: {
  data: TeamTrialPoints;
  hidden: PointSourceId[];
  dark: boolean;
  /** A phone-width chart: names over the bars and fewer ticks. */
  compact: boolean;
}): { option: EChartsCoreOption; height: number } {
  const { data, hidden, dark, compact } = options;
  const theme = chartTheme(dark);
  const rowHeight = compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT;
  const shown = POINT_SOURCES.filter(
    (source) => !source.penalty && !hidden.includes(source.id)
  ).map((source) => source.id);
  // ECharts lists categories bottom up; reversing keeps the best runner on top.
  const rows = data.runners.toReversed();

  const bars = POINT_SOURCES.filter((source) => shown.includes(source.id)).map((source, index) => ({
    name: source.label,
    type: 'bar',
    stack: 'points',
    barWidth: BAR_SHARE * 100 + '%',
    itemStyle: { color: source.color, borderRadius: 2 },
    emphasis: { disabled: true },
    data: rows.map((entry) => Math.round(entry.meanBySource[source.id])),
    ...(index === 0
      ? {
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: theme.muted, type: 'dashed' },
            label: {
              position: 'end',
              color: theme.muted,
              formatter: 'avg ' + points(data.runnerAverage)
            },
            data: [{ xAxis: data.runnerAverage }]
          }
        }
      : {})
  }));

  const totals = {
    type: 'custom',
    silent: true,
    data: rows.map((entry, row) => [positiveTotal(entry, shown), row, entry.meanTotal]),
    renderItem: (_: unknown, api: CustomApi) => {
      const [x, y] = api.coord([api.value(0), api.value(1)]);
      return {
        type: 'text',
        style: {
          x: x + 6,
          y,
          text: points(api.value(2)),
          fill: theme.strong,
          font: '600 12px Arial, sans-serif',
          verticalAlign: 'middle'
        }
      };
    }
  };

  const spreads = {
    type: 'custom',
    silent: true,
    data: rows.flatMap((entry, row) => {
      const spread = entry.spread;
      return spread
        ? [[row, spread.min, spread.lowerQuartile, spread.median, spread.upperQuartile, spread.max]]
        : [];
    }),
    renderItem: (_: unknown, api: CustomApi) => {
      const row = api.value(0);
      const band = api.size([0, 1])[1];
      const [, center] = api.coord([0, row]);
      const y = center + band * SPREAD_OFFSET;
      const x = (value: number) => api.coord([value, row])[0];
      const min = x(api.value(1));
      const lower = x(api.value(2));
      const median = x(api.value(3));
      const upper = x(api.value(4));
      const max = x(api.value(5));
      const stroke = { stroke: theme.muted, lineWidth: 1 };

      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: min, y1: y, x2: max, y2: y }, style: stroke },
          {
            type: 'rect',
            shape: {
              x: lower,
              y: y - SPREAD_HEIGHT / 2,
              width: upper - lower,
              height: SPREAD_HEIGHT
            },
            style: { ...stroke, fill: theme.grid }
          },
          {
            type: 'line',
            shape: { x1: median, y1: y - SPREAD_HEIGHT / 2, x2: median, y2: y + SPREAD_HEIGHT / 2 },
            style: { stroke: theme.strong, lineWidth: 1.5 }
          }
        ]
      };
    }
  };

  return {
    height: rows.length * rowHeight + AXIS_ROOM,
    option: {
      ...baseChartOption(dark),
      grid: { left: compact ? 4 : 8, right: 56, top: 24, bottom: 28, containLabel: !compact },
      dataZoom: insideZoom(0),
      tooltip: {
        ...theme.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: theme.shade } },
        formatter: (params: { dataIndex: number }[]) => {
          const entry = rows[params[0]?.dataIndex ?? -1];
          return entry ? tooltip(entry, shown) : '';
        }
      },
      xAxis: {
        type: 'value',
        min: 0,
        splitNumber: compact ? 3 : 5,
        axisLabel: {
          color: theme.muted,
          formatter: (value: number) => (value === 0 ? '0' : value / 1000 + 'k')
        },
        splitLine: { lineStyle: { color: theme.grid } }
      },
      yAxis: {
        type: 'category',
        data: rows.map((entry) => entry.key),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: compact ? compactLabel(rows, rowHeight, theme) : sideLabel(rows, theme)
      },
      series: [...bars, totals, spreads]
    }
  };
}

interface CustomApi {
  value: (dimension: number) => number;
  coord: (point: number[]) => [number, number];
  size: (point: number[]) => [number, number];
}

type ChartTheme = ReturnType<typeof chartTheme>;

function richStyles(theme: ChartTheme) {
  return {
    name: { color: theme.strong, fontSize: 12, fontWeight: 600, lineHeight: 16 },
    detail: { color: theme.muted, fontSize: 11, lineHeight: 14 }
  };
}

/** Name over details beside the bar, as a wide chart has room for. */
function sideLabel(rows: RunnerPoints[], theme: ChartTheme) {
  return {
    align: 'left',
    margin: 150,
    width: 140,
    overflow: 'truncate',
    formatter: (_: string, index: number) => {
      const entry = rows[index];
      if (!entry) return '';

      const label = runnerLabel(entry);
      return `{name|${label.name}}
{detail|${label.detail}}`;
    },
    rich: richStyles(theme)
  };
}

/** One line over the bar, so the bars keep the chart's full width. */
function compactLabel(rows: RunnerPoints[], rowHeight: number, theme: ChartTheme) {
  const barHalf = (rowHeight * BAR_SHARE) / 2;

  return {
    inside: true,
    align: 'left',
    verticalAlign: 'bottom',
    padding: [0, 0, barHalf + 2, 0],
    formatter: (_: string, index: number) => {
      const entry = rows[index];
      if (!entry) return '';

      const label = runnerLabel(entry);
      return `{name|${label.name}}  {detail|${label.detail}}`;
    },
    rich: richStyles(theme)
  };
}
