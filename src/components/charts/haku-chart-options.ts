import type { EChartsCoreOption } from 'echarts/core';

export function hakuBarChartOption(
  name: string,
  labels: string[],
  values: number[],
  color: string,
  max = 100
): EChartsCoreOption {
  return {
    animationDuration: 220,
    textStyle: { fontFamily: 'inherit', color: '#b6bac3' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e1e1e',
      borderColor: '#3a3a3a',
      textStyle: { color: '#fff' }
    },
    grid: { left: 44, right: 18, top: 22, bottom: labels.length > 6 ? 76 : 42 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        color: '#a5a9b2',
        interval: 0,
        rotate: labels.length > 6 ? 28 : 0,
        overflow: 'truncate',
        width: 90
      },
      axisLine: { lineStyle: { color: '#3a3a3a' } }
    },
    yAxis: {
      type: 'value',
      max,
      axisLabel: { formatter: '{value}%', color: '#8d929d' },
      splitLine: { lineStyle: { color: '#292929' } }
    },
    series: [
      {
        name,
        type: 'bar',
        data: values.map((value) => Number(value.toFixed(2))),
        itemStyle: { color },
        emphasis: { itemStyle: { color: '#ffb74d' } },
        barMaxWidth: 42
      }
    ]
  };
}
