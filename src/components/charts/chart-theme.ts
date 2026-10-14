import type { EChartsCoreOption } from 'echarts/core';

/** Colours and base options shared by the site's ECharts surfaces (matches the Statistics charts). */
export function chartTheme(dark: boolean) {
  const text = { color: dark ? '#bdbdbd' : '#4b5563', fontFamily: 'Arial, sans-serif' };
  const grid = dark ? '#363636' : '#e5e7eb';
  const tooltip = { backgroundColor: dark ? '#1e1e1e' : '#fff', borderColor: grid, textStyle: { ...text, fontSize: 12 } };
  return { text, grid, muted: dark ? '#8d929d' : '#6b7280', strong: dark ? '#e8eaed' : '#111827', shade: dark ? 'rgba(255,255,255,.025)' : 'rgba(17,24,39,.035)', tooltip };
}

export function baseChartOption(dark: boolean): EChartsCoreOption {
  const theme = chartTheme(dark);
  return { animationDuration: 250, aria: { enabled: true }, textStyle: theme.text };
}
