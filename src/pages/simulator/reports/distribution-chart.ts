import type { EChartsCoreOption } from 'echarts/core';
import { hakuBarChartOption } from '@/components/charts/haku-chart-options';
import { baseChartOption, chartTheme } from '@/components/charts/chart-theme';

/** `flip` labels the axis with the opposite sign, e.g. seconds ahead read as a finish-time difference. */
export function distributionChart(
  series: { name: string; color: string; values: number[]; mean?: number }[],
  min: number,
  max: number,
  unit: string,
  dark: boolean,
  discrete = false,
  flip = false
): EChartsCoreOption {
  const theme = chartTheme(dark),
    color = theme.text.color,
    grid = theme.grid,
    shown = (value: number) => (flip ? -value : value) || 0;

  return {
    ...hakuBarChartOption('', [], [], '#69b7ee'),
    ...baseChartOption(dark),
    grid: { left: 46, right: 20, top: 22, bottom: 44 },
    tooltip: {
      trigger: 'axis',
      ...theme.tooltip,
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? value.toFixed(1) + '%' : String(value),
      axisPointer: {
        type: discrete ? 'shadow' : 'line',
        label: {
          formatter: (params: { value: unknown }) => {
            if (discrete) return Number(params.value).toFixed(0) + (unit ? ' ' + unit : '');
            const count = series[0]?.values.length ?? 1,
              width = (max - min) / count,
              index = Math.max(
                0,
                Math.min(count - 1, Math.floor((Number(params.value) - min) / width))
              );

            const from = shown(min + index * width),
              to = shown(min + (index + 1) * width);

            return (
              Math.min(from, to).toFixed(2) +
              '–' +
              Math.max(from, to).toFixed(2) +
              (unit ? ' ' + unit : '')
            );
          }
        }
      }
    },
    xAxis: {
      type: 'value',
      min: discrete ? min - 0.5 : min,
      max: discrete ? max + 0.5 : max,
      minInterval: discrete ? 1 : undefined,
      splitNumber: 4,
      axisLabel: {
        color,
        fontSize: 11,
        hideOverlap: true,
        showMinLabel: false,
        showMaxLabel: false,
        formatter: (value: number) =>
          Number(shown(value).toFixed(discrete ? 0 : 2)) + (unit ? ' ' + unit : '')
      },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (extent: { max: number }) => Math.min(100, Math.max(5, Math.ceil(extent.max / 5) * 5)),
      axisLabel: { color, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: grid } }
    },
    series: series.map((row) => ({
      name: row.name,
      type: discrete ? 'bar' : 'line',
      showSymbol: false,
      smooth: discrete ? false : 0.2,
      smoothMonotone: 'x',
      barMaxWidth: 32,
      itemStyle: {
        color: row.color,
        opacity: discrete ? 0.85 : 1,
        borderRadius: discrete ? [3, 3, 0, 0] : 0
      },
      lineStyle: { color: row.color, width: 2 },
      areaStyle: discrete ? undefined : { opacity: 0.09 },
      data: row.values.map((value, index) => [
        discrete
          ? min + index
          : Number((min + ((index + 0.5) / row.values.length) * (max - min)).toFixed(5)),
        Number(value.toFixed(3))
      ]),
      markLine:
        row.mean === undefined
          ? undefined
          : {
              silent: true,
              symbol: ['none', 'none'],
              label: { show: false },
              lineStyle: { color: row.color, type: 'dashed', width: 1, opacity: 0.6 },
              data: [{ xAxis: row.mean }]
            }
    }))
  };
}
