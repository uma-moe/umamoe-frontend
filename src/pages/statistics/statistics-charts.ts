import type { EChartsCoreOption } from 'echarts/core';
import { histogram, type ChartDatum } from '@/lib/statistics/statistics';
import type { StatDistribution } from './statistics-repository';
import { compact, statColors } from './statistics-format';
import { insideZoom } from '@/components/charts/echarts-zoom';

export interface StatisticsChartStyle {
  text: { color: string; fontFamily: string };
  grid: string;
  tooltip: string;
}

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export function statisticsChartStyle(theme: string): StatisticsChartStyle {
  return {
    text: {
      color: theme === 'light' ? '#4b5563' : '#bdbdbd',
      fontFamily: 'Arial, sans-serif'
    },
    grid: theme === 'light' ? '#e5e7eb' : '#363636',
    tooltip: theme === 'light' ? '#fff' : '#1e1e1e'
  };
}

function baseChart(style: StatisticsChartStyle): EChartsCoreOption {
  return {
    animationDuration: 250,
    aria: { enabled: true },
    textStyle: style.text,
    tooltip: {
      trigger: 'axis',
      backgroundColor: style.tooltip,
      borderColor: style.grid,
      textStyle: style.text
    }
  };
}

export function barChart(
  style: StatisticsChartStyle,
  items: ChartDatum[],
  color = '#64b5f6'
): EChartsCoreOption {
  return {
    ...baseChart(style),
    grid: { left: 48, right: 18, top: 32, bottom: 52 },
    dataZoom: insideZoom(),
    xAxis: {
      type: 'category',
      data: items.map((item) => item.name),
      axisLine: { lineStyle: { color: style.grid } },
      axisLabel: {
        ...style.text,
        rotate: items.length > 7 ? 35 : 0,
        hideOverlap: true
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...style.text, formatter: (value: number) => compact(value) },
      splitLine: { lineStyle: { color: style.grid } }
    },
    series: [
      {
        type: 'bar',
        data: items.map((item) => ({
          value: item.value,
          itemStyle: { color: statColors[item.id] ?? color }
        })),
        barMaxWidth: 40
      }
    ]
  };
}

export function pieChart(
  style: StatisticsChartStyle,
  items: ChartDatum[],
  colors = statColors
): EChartsCoreOption {
  const values = items.filter((item) => item.value > 0);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return {
    ...baseChart(style),
    tooltip: { ...(baseChart(style).tooltip as object), trigger: 'item' },
    legend: {
      bottom: 0,
      left: 'center',
      icon: 'circle',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: style.text
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '43%'],
        labelLine: { show: false },
        data: values.map((item, index) => ({
          name: item.name,
          value: item.value,
          itemStyle: { color: colors[item.id] ?? '#64b5f6' },
          label: {
            show: index === 0,
            position: 'center',
            formatter: compact(total),
            fontSize: 32,
            fontWeight: 700,
            color: style.text.color
          }
        })),
        emphasis: { scale: false },
        itemStyle: { borderWidth: 0 }
      }
    ]
  };
}

export function histogramChart(
  style: StatisticsChartStyle,
  value: StatDistribution | undefined,
  stat: string,
  percentage: boolean
): EChartsCoreOption {
  const items = histogram(value);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const option = barChart(
    style,
    percentage
      ? items.map((item) => ({
          ...item,
          value: total ? Number(((item.value / total) * 100).toFixed(2)) : 0
        }))
      : items,
    statColors[stat] ?? '#64b5f6'
  );

  return {
    ...option,
    yAxis: {
      type: 'value',
      name: percentage ? 'Share (%)' : 'Samples',
      nameTextStyle: style.text,
      axisLabel: {
        ...style.text,
        formatter: (value: number) => (percentage ? value + '%' : compact(value))
      },
      splitLine: { lineStyle: { color: style.grid } }
    }
  };
}

export function groupedChart(
  style: StatisticsChartStyle,
  categories: string[],
  chartSeries: ChartSeries[]
): EChartsCoreOption {
  return {
    ...baseChart(style),
    legend: { top: 0, textStyle: style.text },
    grid: { left: 48, right: 18, top: 48, bottom: 24 },
    dataZoom: insideZoom(),
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { ...style.text, fontSize: 10, interval: 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: style.text,
      splitLine: { lineStyle: { color: style.grid } }
    },
    series: chartSeries.map((entry) => ({
      name: entry.name,
      type: 'bar',
      data: entry.values,
      itemStyle: { color: entry.color },
      barMaxWidth: 26
    }))
  };
}
