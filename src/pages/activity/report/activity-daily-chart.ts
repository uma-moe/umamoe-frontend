import type { EChartsCoreOption } from 'echarts/core';
import type { ActivityReport } from '@/lib/activity/activity-types';
import { compactNumber, formatDuration } from '@/lib/activity/activity';
import { insideZoom } from '@/components/charts/echarts-zoom';

export function activityDailyChartOption(
  daily: NonNullable<ActivityReport['daily']>
): EChartsCoreOption {
  const tokens = getComputedStyle(document.documentElement);
  const color = (token: string) => tokens.getPropertyValue(token).trim();
  const points = [...daily].reverse().slice(-45);
  const maxFans = Math.max(1, ...points.map((point) => point.fan_gain));
  const maxActive = Math.max(1, ...points.map((point) => point.active_seconds));
  return {
    animation: false,
    grid: { left: 48, right: 18, top: 18, bottom: 34 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: color('--surface-overlay'),
      borderColor: color('--border-primary'),
      textStyle: { color: color('--text-primary') }
    },
    dataZoom: insideZoom(),
    xAxis: {
      type: 'category',
      data: points.map((point) =>
        new Date(`${point.day}T00:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })
      ),
      axisLabel: { color: color('--text-secondary'), hideOverlap: true },
      axisLine: { lineStyle: { color: color('--border-primary') } }
    },
    yAxis: {
      type: 'value',
      min: -100,
      max: 100,
      axisLabel: {
        color: color('--text-secondary'),
        formatter: (value: number) =>
          value > 0
            ? compactNumber((maxFans * value) / 100)
            : value < 0
              ? formatDuration((maxActive * -value) / 100)
              : 'balance'
      },
      splitLine: { lineStyle: { color: color('--border-subtle') } }
    },
    series: [
      {
        name: 'Fan gain',
        type: 'line',
        data: points.map((point) => (point.fan_gain / maxFans) * 100),
        smooth: 0.25,
        symbol: 'none',
        lineStyle: { color: color('--accent-warning'), width: 2 },
        areaStyle: { color: 'rgba(255,196,128,.14)' }
      },
      {
        name: 'Bias',
        type: 'line',
        data: points.map(
          (point) => (point.fan_gain / maxFans - point.active_seconds / maxActive) * 34
        ),
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: color('--text-primary'), width: 1.5 }
      },
      {
        name: 'Active time',
        type: 'line',
        data: points.map((point) => (-point.active_seconds / maxActive) * 100),
        smooth: 0.22,
        symbol: 'none',
        lineStyle: { color: color('--accent-primary'), width: 2, type: 'dashed' },
        areaStyle: { color: 'rgba(106,164,221,.12)' }
      }
    ]
  };
}
