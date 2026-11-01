import type { EChartsCoreOption } from 'echarts/core';
import { runnerColor, type ReportBand } from './simulation-report';
import { baseChartOption, chartTheme } from '@/components/charts/chart-theme';
import { finalSpurtSection } from '@/lib/race/final-spurt';

export interface CourseChartOptions {
  /** Formats a y value for the axis and tooltip. */
  format: (value: number) => string;
  min?: number;
  max?: number;
  interval?: number;
  /** Draw a zero line, for values measured against a baseline. */
  zero?: boolean;
  /** Which band value is the line: 0 mean, 2 median. */
  centre?: 0 | 2;
  /** Shaded band for the focused runner: [low, high] band indexes (p10, p90 by default). */
  range?: [number, number];
}

/**
 * One value along the course for every runner, over the replay's race phases: each runner's typical race as a line,
 * the focused runner's middle 80% shaded. Shared by HP, time gained and the speed and position views.
 */
export function courseChart(
  x: number[],
  rows: { source: number; name: string; bands: ReportBand[] }[],
  phases: readonly { name: string; start: number; color: string }[],
  dark: boolean,
  focus: number | undefined,
  options: CourseChartOptions
): EChartsCoreOption {
  const theme = chartTheme(dark),
    color = theme.text.color,
    distance = x.at(-1) ?? 1,
    centre = options.centre ?? 2,
    [lowIndex, highIndex] = options.range ?? [1, 3];

  const areas = phases.map((phase, index) => [
    {
      name: phase.name,
      xAxis: distance * phase.start,
      itemStyle: { color: phase.color, opacity: 0.07 },
      label: {
        show: true,
        position: 'top',
        distance: 3,
        fontSize: 9,
        color: theme.muted,
        formatter: phase.name
      }
    },
    { xAxis: distance * (phases[index + 1]?.start ?? 1) }
  ]);

  const series = rows.flatMap((row) => {
    const colour = runnerColor(row.source),
      line = {
        name: row.name,
        type: 'line',
        showSymbol: false,
        z: row.source === focus ? 3 : 2,
        lineStyle: {
          color: colour,
          width: row.source === focus ? 2.5 : 1.5,
          opacity: focus === undefined || row.source === focus ? 1 : 0.6
        },
        itemStyle: { color: colour },
        data: x.map((v, i) => [v, row.bands[i]?.[4] ? row.bands[i]![centre] : null])
      };

    if (row.source !== focus) return [line];
    return [
      {
        name: row.name + ' low',
        type: 'line',
        stack: 'range-' + row.source,
        stackStrategy: 'all',
        silent: true,
        tooltip: { show: false },
        showSymbol: false,
        lineStyle: { opacity: 0 },
        data: x.map((v, i) => [v, row.bands[i]?.[4] ? row.bands[i]![lowIndex]! : null])
      },
      {
        name: row.name + ' middle 80%',
        type: 'line',
        stack: 'range-' + row.source,
        stackStrategy: 'all',
        silent: true,
        tooltip: { show: false },
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: colour, opacity: 0.16 },
        data: x.map((v, i) => [
          v,
          row.bands[i]?.[4] ? row.bands[i]![highIndex]! - row.bands[i]![lowIndex]! : null
        ])
      },
      line
    ];
  });

  if (series[0])
    Object.assign(series[0], {
      markArea: { silent: true, data: areas },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: finalSpurtSection(distance).color, type: 'dashed', opacity: 0.8 },
        data: [
          {
            name: 'Final spurt window',
            xAxis: finalSpurtSection(distance).start,
            label: {
              show: true,
              formatter: 'Final spurt window',
              position: 'insideEndTop',
              color,
              fontSize: 9
            }
          },
          ...(options.zero
            ? [
                {
                  yAxis: 0,
                  label: { show: false },
                  lineStyle: { color: theme.muted, type: 'solid' }
                }
              ]
            : [])
        ]
      }
    });
  return {
    ...baseChartOption(dark),
    animation: false,
    // The runners' legend is RunnerLegend under the chart, so the plot keeps only the axis labels' space.
    grid: { left: 48, right: 12, top: 18, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      ...theme.tooltip,
      axisPointer: { type: 'line', lineStyle: { color, opacity: 0.45 } },
      formatter: (items: unknown) => {
        const list = (
          items as { seriesName: string; value: [number, number | null]; color: string }[]
        ).filter(
          (item) =>
            item.value[1] != null &&
            !item.seriesName.endsWith(' low') &&
            !item.seriesName.endsWith(' middle 80%')
        );

        if (!list.length) return '';
        return (
          '<b>' +
          Math.round(list[0]!.value[0]).toLocaleString('en-US') +
          ' m</b>' +
          list
            .sort((a, b) => (b.value[1] ?? 0) - (a.value[1] ?? 0))
            .map(
              (item) =>
                '<br><span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:' +
                item.color +
                '"></span>' +
                item.seriesName +
                ' <b>' +
                options.format(item.value[1]!) +
                '</b>'
            )
            .join('')
        );
      }
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: distance,
      axisLabel: {
        color,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) => value.toLocaleString('en-US') + ' m'
      },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: theme.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: options.min === undefined && options.max === undefined,
      min: options.min,
      max: options.max,
      interval: options.interval,
      splitNumber: 4,
      axisLabel: { color, fontSize: 10, formatter: options.format, hideOverlap: true },
      splitLine: { lineStyle: { color: theme.grid, opacity: 0.6 } }
    },
    series
  };
}

/** HP left by course distance, as a share of maximum HP. */
export function hpCourseChart(
  x: number[],
  rows: { source: number; name: string; bands: ReportBand[] }[],
  phases: readonly { name: string; start: number; color: string }[],
  dark: boolean,
  focus?: number
): EChartsCoreOption {
  return courseChart(x, rows, phases, dark, focus, {
    format: (value) => Math.round(value) + '%',
    min: 0,
    max: 100,
    interval: 25
  });
}
