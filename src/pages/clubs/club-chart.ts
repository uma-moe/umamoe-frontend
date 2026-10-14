import type { EChartsCoreOption } from 'echarts/core';
import type { ClubChartMember, ClubChartMode } from '@/lib/clubs/club-progression';
import type { Theme } from '@/stores/theme';
import './club-chart.css';

function tooltip(labels: string[], members: ClubChartMember[], mode?: ClubChartMode) {
  return (params: unknown) => {
    const item = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined;
    const index = item?.dataIndex ?? 0, body = document.createElement('div');
    body.style.cssText = 'font-size:11px;line-height:16px;font-variant-numeric:tabular-nums';
    const title = document.createElement('div'); title.textContent = labels[index] ?? '';
    title.style.cssText = 'font-weight:600;margin-bottom:4px;color:rgba(255,255,255,.7)'; body.append(title);
    for (const member of [...members].filter(member => member.values[index] != null).sort((a, b) => b.values[index]! - a.values[index]!)) {
      const value = member.values[index]!, previous = member.values.slice(0, index).findLast(value => value !== null);
      const delta = previous == null ? 0 : value - previous;
      const line = document.createElement('div'), marker = document.createElement('span');
      line.style.cssText = 'white-space:normal;overflow-wrap:anywhere;padding:1px 0';
      marker.style.cssText = `display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:1px;border:1px solid ${member.color};vertical-align:middle`;
      // Text nodes preserve trainer names literally; chart labels never become HTML.
      line.append(marker, `${member.name}: ${mode === 'delta' && value > 0 ? '+' : ''}${value.toLocaleString()}${mode === 'cumulative' && delta ? ` (${delta > 0 ? '+' : ''}${delta.toLocaleString()})` : ''}`);
      body.append(line);
    }
    return body;
  };
}

function axes(labels: string[], theme: Theme) {
  const ticks = { color: theme === 'light' ? '#475569' : 'rgba(255,255,255,.7)', fontFamily: 'Arial, sans-serif', fontSize: 12, hideOverlap: true };
  const gridLine = { color: theme === 'light' ? 'rgba(15,23,42,.12)' : 'rgba(255,255,255,.1)' };
  return {
    animation: false,
    grid: { left: 0, right: 4, top: 12, bottom: 8, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { ...ticks, alignMaxLabel: 'right', showMaxLabel: true }, axisLine: { lineStyle: gridLine }, axisTick: { show: false }, splitLine: { show: true, lineStyle: gridLine } },
    yAxis: { type: 'value', scale: true, axisLabel: { ...ticks, formatter: (value: number) => new Intl.NumberFormat('en', { notation: 'compact', compactDisplay: 'short' }).format(value) }, axisLine: { show: false }, splitLine: { lineStyle: gridLine } },
    tooltip: { trigger: 'axis', className: 'club-chart-tooltip', renderMode: 'html', enterable: true, transitionDuration: 0, backgroundColor: 'rgba(18,18,18,.95)', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1, padding: [6, 8], textStyle: { fontFamily: 'inherit', fontSize: 11, color: '#fff' }, extraCssText: 'border-radius:6px;box-sizing:border-box;max-width:min(320px,calc(100vw - 16px));overflow:auto;overscroll-behavior:contain;pointer-events:auto;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:99999', axisPointer: { type: 'none' } }
  };
}

export function clubProgressionOption(history: Array<{ date: string; fan_count: number }>, theme: Theme = 'dark'): EChartsCoreOption {
  const labels = history.map(point => { const date = new Date(point.date); return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`; });
  const member: ClubChartMember = { viewerId: 0, name: 'Club Gain', color: '#64b5f6', values: history.map(point => point.fan_count), carriedForward: [], priorClub: [] };
  const option = axes(labels, theme);
  return { ...option, tooltip: { ...option.tooltip, formatter: tooltip(labels, [member]) }, series: [{ name: member.name, type: 'line', data: member.values, smooth: .4, symbolSize: 6, lineStyle: { color: member.color, width: 2 }, itemStyle: { color: '#121212', borderColor: member.color, borderWidth: 2 }, areaStyle: { color: 'rgba(100,181,246,.1)', opacity: 1 } }] };
}

export function memberProgressionOption(labels: string[], members: ClubChartMember[], mode: ClubChartMode, highlighted?: number, theme: Theme = 'dark'): EChartsCoreOption {
  const series: Record<string, unknown>[] = [];
  for (const member of members) {
    // One data series preserves tooltip values; contiguous runs render Angular's
    // dashed prior-club segments and invisible trailing carries with ECharts.
    series.push({ id: `member-${member.viewerId}`, name: member.name, type: 'line', data: member.values, showSymbol: false, symbolSize: 8, lineStyle: { opacity: 0 }, itemStyle: { color: member.color }, emphasis: { lineStyle: { opacity: 0 } } });
    let run: Array<number | null> = [], dashed: boolean | undefined;
    const flush = () => {
      if (run.length) series.push({ id: `run-${member.viewerId}-${series.length}`, name: member.name, type: 'line', data: run, showSymbol: false, smooth: .4, silent: true, tooltip: { show: false }, z: highlighted === member.viewerId ? 4 : 2, lineStyle: { width: highlighted === member.viewerId ? 4 : highlighted === undefined ? 2 : 1, color: highlighted === undefined || highlighted === member.viewerId ? member.color : theme === 'light' ? 'rgba(15,23,42,.2)' : 'rgba(255,255,255,.15)', type: dashed ? [6, 4] : 'solid' }, emphasis: { disabled: true } });
      run = []; dashed = undefined;
    };
    for (let i = 1; i < member.values.length; i++) {
      if (member.values[i - 1] === null || member.values[i] === null || member.carriedForward[i]) { flush(); continue; }
      const prior = member.priorClub[i - 1] || member.priorClub[i];
      if (dashed !== prior) { flush(); dashed = prior; run = Array(i - 1).fill(null); run.push(member.values[i - 1]!); }
      run.push(member.values[i]!);
    }
    flush();
  }
  const option = axes(labels, theme);
  return { ...option, tooltip: { ...option.tooltip, formatter: tooltip(labels, members, mode) }, series };
}
