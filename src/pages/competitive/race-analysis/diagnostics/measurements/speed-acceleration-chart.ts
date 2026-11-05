import type { EChartsCoreOption } from 'echarts/core';
import { insideZoom } from '@/components/charts/echarts-zoom';
import { sampleAt, type AccelerationWindow, type SpeedSample } from './acceleration-activations';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character
  );

export function speedAccelerationChart({
  samples,
  windows,
  raceDistance,
  dark,
  names,
  toDistance
}: {
  samples: SpeedSample[];
  windows: AccelerationWindow[];
  raceDistance: number;
  dark: boolean;
  names: ReadonlyMap<number, string>;
  toDistance: (time: number) => number;
}): { option: EChartsCoreOption; height: number } {
  const text = dark ? '#a6afbd' : '#596477';
  const grid = dark ? '#ffffff12' : '#00000012';
  const midColor = dark ? '#c4a7e7' : '#7955aa';
  const lateColor = dark ? '#ee9aab' : '#b85070';
  const skillsHeight = windows.length * 22;
  const height = windows.length ? 310 + skillsHeight : 310;
  const max = Math.max(1, raceDistance);
  const sectionLength = max / 24;
  const x = toDistance;
  const phases = [
    {
      name: 'Mid race',
      xAxis: max / 6,
      lineStyle: { color: midColor, width: 2 },
      label: { color: midColor }
    },
    {
      name: 'Late race',
      xAxis: (max * 2) / 3,
      lineStyle: { color: lateColor, width: 2 },
      label: { color: lateColor }
    }
  ];
  const phaseLines = {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed' },
    label: {
      formatter: '{b}',
      position: 'insideEndTop',
      rotate: 0,
      align: 'left',
      offset: [8, 20],
      padding: [4, 4]
    },
    data: phases
  };
  const label = (skillId: number) => names.get(skillId) ?? 'Skill ' + skillId;
  const measure = (value: number | null, unit: string) =>
    value === null ? 'Not recorded' : value.toFixed(2) + ' ' + unit;
  const tooltip = (value: number) => {
    const sample = sampleAt(samples, value, 'distance');
    if (!sample) return '';
    const active = windows.filter(
      (window) => sample.time >= window.start && sample.time < window.end
    );
    return `${sample.time.toFixed(2)} s - ${sample.distance.toFixed(1)} m<br>Current speed: ${measure(sample.speed, 'm/s')}<br>Target speed: ${measure(sample.target, 'm/s')}<br>Acceleration: ${measure(sample.acceleration, 'm/s²')}<br>Active acceleration skills: ${active.length ? '<br>' + active.map((window) => escape(label(window.skillId))).join('<br>') : 'None'}`;
  };
  const axisBase = {
    type: 'value',
    min: 0,
    max,
    interval: sectionLength,
    axisLine: { onZero: false, lineStyle: { color: grid } },
    axisTick: { show: true, lineStyle: { color: grid } },
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
  return {
    height,
    option: {
      animation: false,
      aria: { enabled: true },
      legend: {
        data: ['Current speed', 'Target speed', 'Acceleration'],
        top: 0,
        left: 0,
        textStyle: { color: text, fontSize: 11 },
        itemWidth: 18,
        itemHeight: 8
      },
      grid: [
        { left: windows.length ? 112 : 48, right: 48, top: 72, height: 170 },
        ...(windows.length ? [{ left: 112, right: 48, top: 266, height: skillsHeight }] : [])
      ],
      xAxis: [
        { ...axisBase, axisLabel: { ...axisBase.axisLabel, show: !windows.length } },
        ...(windows.length ? [{ ...axisBase, gridIndex: 1 }] : []),
        {
          ...axisBase,
          position: 'top',
          name: 'Section',
          nameLocation: 'start',
          nameTextStyle: {
            color: text,
            fontSize: 10,
            verticalAlign: 'bottom',
            padding: [0, 8, 8, 0]
          },
          axisTick: { show: false },
          axisPointer: { show: false },
          axisLabel: {
            color: text,
            fontSize: 9,
            hideOverlap: true,
            formatter: (value: number) => {
              const section = Math.round(value / sectionLength) + 1;
              return section <= 24 ? String(section) : '';
            }
          },
          splitLine: { show: false }
        }
      ],
      yAxis: [
        {
          type: 'value',
          name: 'Speed (m/s)',
          nameGap: 34,
          axisLine: { onZero: false },
          nameTextStyle: { color: text, fontSize: 10 },
          axisLabel: { color: text, fontSize: 10 },
          splitLine: { lineStyle: { color: grid } },
          min: 0
        },
        {
          type: 'value',
          position: 'right',
          name: 'Acceleration (m/s²)',
          nameGap: 34,
          axisLine: { onZero: false },
          nameTextStyle: { color: '#87ceab', fontSize: 10, align: 'right' },
          axisLabel: { color: '#87ceab', fontSize: 10 },
          splitLine: { show: false },
          scale: true
        },
        ...(windows.length
          ? [
              {
                type: 'category',
                gridIndex: 1,
                data: windows.map((window) => label(window.skillId)),
                inverse: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: text, fontSize: 10, width: 100, overflow: 'truncate' },
                splitLine: { show: false }
              }
            ]
          : [])
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: dark ? '#1a1f28' : '#fff',
        borderColor: grid,
        textStyle: { fontSize: 12, color: text },
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
          bottom: 0,
          height: 16,
          showDetail: false,
          textStyle: { color: text }
        }
      ],
      series: [
        {
          name: 'Current speed',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: '#69b7ee' },
          itemStyle: { color: '#69b7ee' },
          data: samples.map((sample) => [sample.distance, sample.speed]),
          markLine: phaseLines
        },
        {
          name: 'Target speed',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1.5, type: 'dashed', color: '#e3b35f' },
          itemStyle: { color: '#e3b35f' },
          data: samples.map((sample) => [sample.distance, sample.target])
        },
        {
          name: 'Acceleration',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#87ceab' },
          itemStyle: { color: '#87ceab' },
          data: samples.map((sample) => [
            sample.distance,
            sample.startDash ? null : sample.acceleration
          ])
        },
        ...(windows.length
          ? [
              {
                name: 'Activation offset',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 2,
                stack: 'skills',
                silent: true,
                markLine: {
                  ...phaseLines,
                  label: { show: false },
                  data: phases.map((phase) => ({ ...phase, label: { show: false } }))
                },
                itemStyle: { color: 'transparent' },
                data: windows.map((window) => x(window.start)),
                tooltip: { show: false }
              },
              {
                name: 'Acceleration active',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 2,
                stack: 'skills',
                barWidth: 10,
                barMinHeight: 3,
                itemStyle: { color: '#b49bdd', borderRadius: 2 },
                data: windows.map((window) => Math.max(0, x(window.end) - x(window.start))),
                tooltip: {
                  trigger: 'item',
                  formatter: (params: unknown) => {
                    if (!params || typeof params !== 'object' || !('dataIndex' in params))
                      return '';
                    const window = windows[Number(params.dataIndex)];
                    return window
                      ? `${escape(label(window.skillId))}<br>${window.start.toFixed(3)} s - ${window.end.toFixed(3)} s<br>${toDistance(window.start).toFixed(1)} m - ${toDistance(window.end).toFixed(1)} m<br>${tooltip(x(window.start))}`
                      : '';
                  }
                }
              }
            ]
          : [])
      ]
    }
  };
}
