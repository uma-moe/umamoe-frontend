import type { TeamDistributionResponse, TeamRate } from '../../hakuraku-types';
import { insideZoom } from '@/components/charts/echarts-zoom';

export function fieldChart(
  distribution: TeamDistributionResponse | undefined,
  population: TeamRate | undefined,
  dark: boolean,
  mobile: boolean
) {
  const ink = dark ? '#aebdd0' : '#526178';
  return {
    animationDuration: 350,
    backgroundColor: 'transparent',
    textStyle: { color: ink },
    grid: { top: 38, right: 12, bottom: 42, left: 46 },
    tooltip: { trigger: 'axis' },
    dataZoom: insideZoom(),
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: mobile ? 20 : 10,
      name: 'Lower estimate of team win rate',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: { formatter: '{value}%', color: ink },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: 'Teams',
      axisLabel: { color: ink },
      splitLine: { lineStyle: { opacity: 0.12 } }
    },
    series: [
      {
        name: 'Teams',
        type: 'bar',
        barCategoryGap: '12%',
        data: Array.from({ length: 33 }, (_, i) => {
          const bin = distribution?.bins.find((b) => b.index === i);
          return {
            value: [((i + 0.5) * 100) / 33, bin?.count ?? 0],
            itemStyle: {
              color:
                (i + 0.5) / 33 >= Math.max(population?.team ?? 1 / 3, 1 / 3)
                  ? '#65c18c'
                  : '#4d6685',
              borderRadius: [2, 2, 0, 0]
            }
          };
        }),
        markLine: {
          symbol: 'none',
          label: { show: false },
          data: [
            {
              name: 'Equal teams: one win in three',
              xAxis: 100 / 3,
              lineStyle: { type: 'dashed', color: '#9aa8ba' },
              label: {
                show: true,
                formatter: 'Equal teams at 33.3%',
                position: 'insideEndTop',
                rotate: 0,
                color: ink,
                fontSize: 10
              }
            },
            ...(population
              ? [
                  {
                    name: 'Owner-latest average',
                    xAxis: population.team * 100,
                    lineStyle: { color: '#f2bf66', width: 2 }
                  }
                ]
              : [])
          ]
        }
      }
    ]
  };
}

export function inlineFieldChart(chart: ReturnType<typeof fieldChart>) {
  return {
    ...chart,
    grid: { top: 22, right: 8, bottom: 32, left: 38 },
    dataZoom: insideZoom(),
    xAxis: {
      ...chart.xAxis,
      interval: 20,
      name: 'Lower win estimate',
      nameGap: 22,
      nameTextStyle: { fontSize: 10 },
      axisLabel: { ...chart.xAxis.axisLabel, fontSize: 10 }
    },
    yAxis: {
      ...chart.yAxis,
      splitNumber: 3,
      nameTextStyle: { fontSize: 10 },
      axisLabel: { ...chart.yAxis.axisLabel, fontSize: 10 }
    }
  };
}
