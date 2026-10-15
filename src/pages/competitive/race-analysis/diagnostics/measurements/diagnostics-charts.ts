import type { EChartsCoreOption } from 'echarts/core';
import {
  number,
  signed,
  timeLabel,
  type DiagnosticsSampleRow,
  type DiagnosticsSectionRow
} from '../diagnostics-format';

export function sectionChartOption(
  sectionRows: DiagnosticsSectionRow[],
  rngLimit: number,
  dark: boolean
): EChartsCoreOption {
  const text = dark ? '#a6afbd' : '#596477';
  const grid = dark ? '#ffffff12' : '#00000012';
  const speedMin = Math.floor(Math.min(...sectionRows.map((row) => row.speed)) * 2) / 2;
  const speedMax = Math.max(
    speedMin + 0.5,
    Math.ceil(Math.max(...sectionRows.map((row) => row.speed)) * 2) / 2
  );
  const xAxis = {
    type: 'category' as const,
    data: sectionRows.map((row) => row.section),
    axisLine: { lineStyle: { color: grid } },
    axisTick: { show: false },
    axisLabel: { show: false },
    axisPointer: { type: 'line' as const, lineStyle: { color: text, type: 'dashed' as const } },
    splitLine: { show: false }
  };
  const rngPoints = sectionRows.map((row) => ({
    value: row.rng,
    itemStyle: { color: row.rng > 0 ? '#87ceab' : row.rng < 0 ? '#ed8d8d' : text }
  }));
  return {
    animation: false,
    aria: { enabled: true },
    grid: [
      { left: 48, right: 12, top: 20, height: 64 },
      { left: 48, right: 12, top: 116, height: 60 }
    ],
    axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 11 },
      formatter: (params: unknown) => {
        const point = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
        const row = sectionRows[point.dataIndex];
        return row
          ? `<strong>Section ${row.section}</strong><br>${row.phase}<br>${number(row.start)}–${number(row.end)} m<br>Target speed: ${row.speed.toFixed(2)} m/s<br>RNG: ${signed(row.rng)}%${row.rng === 0 ? '' : row.rng > 0 ? ' (faster)' : ' (slower)'}`
          : '';
      }
    },
    xAxis: [
      xAxis,
      {
        ...xAxis,
        gridIndex: 1,
        axisTick: {
          show: true,
          alignWithLabel: true,
          interval: (i: number) =>
            i === 0 || i === sectionRows.length - 1 || sectionRows[i]!.section % 4 === 0
        },
        axisLabel: {
          show: true,
          color: text,
          fontSize: 10,
          margin: 8,
          interval: (i: number) =>
            i === 0 || i === sectionRows.length - 1 || sectionRows[i]!.section % 4 === 0
        }
      }
    ],
    yAxis: [
      {
        type: 'value',
        min: speedMin,
        max: speedMax,
        splitNumber: 2,
        axisLabel: { color: text, fontSize: 10, formatter: (value: number) => number(value, 1) },
        splitLine: { lineStyle: { color: grid } }
      },
      {
        type: 'value',
        gridIndex: 1,
        min: -rngLimit,
        max: rngLimit,
        interval: rngLimit,
        axisLabel: {
          color: text,
          fontSize: 10,
          formatter: (value: number) => signed(value, 1) + '%'
        },
        splitLine: { lineStyle: { color: grid, type: 'dashed' } }
      }
    ],
    series: [
      {
        name: 'Base target speed',
        type: 'line',
        step: 'middle',
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2, color: '#69b7ee' },
        itemStyle: { color: '#69b7ee' },
        data: sectionRows.map((row) => row.speed)
      },
      {
        name: 'RNG stems',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        barWidth: 2,
        silent: true,
        data: rngPoints,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: text, width: 1, type: 'solid', opacity: 0.5 },
          data: [{ yAxis: 0 }]
        }
      },
      {
        name: 'RNG adjustment',
        type: 'scatter',
        xAxisIndex: 1,
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 6,
        data: rngPoints
      }
    ]
  };
}

export function paceChartOption(
  sampleRows: DiagnosticsSampleRow[],
  dark: boolean
): EChartsCoreOption {
  const text = dark ? '#a6afbd' : '#596477';
  const grid = dark ? '#ffffff12' : '#00000012';
  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: 42, right: 46, top: 22, bottom: 25 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => (typeof value === 'number' ? value.toFixed(2) : '—')
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: sampleRows.at(-1)?.time ?? 1,
      axisLabel: { color: text, fontSize: 10, formatter: (value: number) => timeLabel(value) },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: 'm/s',
        nameTextStyle: { color: text, fontSize: 10 },
        axisLabel: { color: text, fontSize: 10 },
        splitLine: { lineStyle: { color: grid } }
      },
      {
        type: 'value',
        name: 'm/s²',
        nameTextStyle: { color: text, fontSize: 10 },
        axisLabel: { color: text, fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Target speed (m/s)',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: '#69b7ee' },
        itemStyle: { color: '#69b7ee' },
        data: sampleRows.map((row) => [
          row.time,
          typeof row.targetSpeed === 'number' ? row.targetSpeed : null
        ])
      },
      {
        name: 'Acceleration (m/s²)',
        type: 'line',
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 1.5, color: '#df8ca1' },
        itemStyle: { color: '#df8ca1' },
        data: sampleRows.map((row) => [
          row.time,
          typeof row.acceleration === 'number' ? row.acceleration : null
        ])
      }
    ]
  };
}
